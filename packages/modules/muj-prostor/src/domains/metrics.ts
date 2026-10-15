import { and, count, eq, isNull, sql } from "drizzle-orm";
import { clampLimit } from "@rebar/core/dashboards";
import { defineDashboardMetric } from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { addDaysIso, diffDaysIso } from "@rebar/core/time";
import { RECURRING_KIND_LABELS } from "../labels";
import { recurringService, webDomain } from "../schema";
import { criticalDomainSql } from "./data";

/** Dní dopředu ve widgetu „Expirace“ (výchozí 60, spec 13). */
export const EXPIRATION_DAYS_DEFAULT = 60;

/**
 * Metriky widgetů „Expirace“ a „Kritické domény“ (v2, DOM-03). Žádné e-maily ani notifikace: čísla se jen ukazují
 * na nástěnce. Jen pro vlastníka (oprávnění `muj-prostor.domains`, u Expirace i `muj-prostor.hosting`).
 */
export const domainMetrics = [
  defineDashboardMetric({
    key: "muj-prostor.expirations",
    label: "Expirace domén a obnovy hostingu",
    description:
      "Domény a aktivní služby hostingu a údržby, kterým do zadaného počtu dní vyprší doména nebo má přijít obnova (včetně těch, které už vypršely nebo jsou po termínu). Hodnota je počet dní do data; záporná = po termínu.",
    format: "number",
    shape: "series",
    permissions: ["muj-prostor.domains", "muj-prostor.hosting"],
    params: [
      {
        key: "days",
        label: "Dní dopředu",
        type: "number",
        default: EXPIRATION_DAYS_DEFAULT,
      },
    ],
    compute: async (ctx, input, deps) => {
      if (!can(ctx, "muj-prostor.domains") || !can(ctx, "muj-prostor.hosting"))
        return {
          kind: "series",
          categories: [],
          series: [{ key: "daysLeft", label: "Dní do expirace", values: [] }],
        };
      const days = Math.min(
        365,
        Math.max(1, Math.trunc(Number(input.params.days ?? EXPIRATION_DAYS_DEFAULT)) || 1),
      );
      const limit = clampLimit(input.limit);
      const until = addDaysIso(input.today, days);
      const [domains, services] = await Promise.all([
        ctx.db
          .select({ id: webDomain.id, domain: webDomain.domain, expiresOn: webDomain.expiresOn })
          .from(webDomain)
          .where(
            and(
              isNull(webDomain.deletedAt),
              sql`${webDomain.expiresOn} is not null and ${webDomain.expiresOn} <= ${until}::date`,
            ),
          )
          .orderBy(sql`${webDomain.expiresOn} asc`)
          .limit(limit),
        ctx.db
          .select({
            id: recurringService.id,
            name: recurringService.name,
            kind: recurringService.kind,
            nextRenewal: recurringService.nextRenewal,
          })
          .from(recurringService)
          .where(
            and(
              isNull(recurringService.deletedAt),
              eq(recurringService.status, "active"),
              sql`${recurringService.nextRenewal} is not null and ${recurringService.nextRenewal} <= ${until}::date`,
            ),
          )
          .orderBy(sql`${recurringService.nextRenewal} asc`)
          .limit(limit),
      ]);
      const domainUrl = deps.registry.get("web_domain")?.url;
      const serviceUrl = deps.registry.get("recurring_service")?.url;
      const items = [
        ...domains.map((d) => ({
          key: `domain:${d.id}`,
          label: d.domain,
          href: domainUrl?.(d.id),
          daysLeft: diffDaysIso(input.today, d.expiresOn!),
        })),
        ...services.map((s) => ({
          key: `service:${s.id}`,
          label: `${RECURRING_KIND_LABELS[s.kind]}: ${s.name}`,
          href: serviceUrl?.(s.id),
          daysLeft: diffDaysIso(input.today, s.nextRenewal!),
        })),
      ]
        .sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label, "cs"))
        .slice(0, limit);
      return {
        kind: "series",
        categories: items.map((i) => ({
          key: i.key,
          label: i.label,
          ...(i.href ? { href: i.href } : {}),
        })),
        series: [
          { key: "daysLeft", label: "Dní do expirace", values: items.map((i) => i.daysLeft) },
        ],
      };
    },
  }),
  defineDashboardMetric({
    key: "muj-prostor.domains_critical",
    label: "Kritické domény",
    description:
      "Počet domén, kterým zbývá méně dní, než je jejich hranice `warn_days` (výchozí 30), nebo už vypršely.",
    format: "number",
    shape: "scalar",
    permissions: ["muj-prostor.domains"],
    compute: async (ctx, input) => {
      if (!can(ctx, "muj-prostor.domains")) return { kind: "scalar", value: 0 };
      const [r] = await ctx.db
        .select({ n: count() })
        .from(webDomain)
        .where(and(isNull(webDomain.deletedAt), criticalDomainSql(input.today)));
      return { kind: "scalar", value: Number(r?.n ?? 0) };
    },
  }),
];
