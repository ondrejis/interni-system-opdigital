import type { Executor } from "../db/client";
import { getEntityPolicy } from "../entities/policy";
import { loadActor } from "../rbac/actor";
import type { Actor } from "../rbac/types";
import { localParts } from "../time/dates";
import { getNotificationRuntime } from "./catalog";
import { insertDrafts, type Draft, type InsertResult } from "./pipeline";
import { actorHasAny, canSeeMoney, usersWithPermission, usersWithRole } from "./recipients";
import {
  clip,
  MAX_BODY,
  MAX_TITLE,
  renderBody,
  renderTitle,
  renderUrl,
  withoutMoneyUnless,
} from "./render";
import { planDelivery, resolveEvent, type PlanContext } from "./rules";
import { loadPrefs, loadRules } from "./store";
import type { AnyEventDef, NotifyInput, ParamValue } from "./types";

export type NotifyResult = InsertResult & {
  /** Kolik lidí událost mohla dostat podle pravidel (před kontrolou přístupu). */
  candidates: number;
  /** Příjemci bez práva na záznam nebo na událost; upozornění nedostali. */
  noAccess: number;
};

const EMPTY: NotifyResult = {
  created: 0,
  merged: 0,
  deduped: 0,
  dropped: 0,
  candidates: 0,
  noAccess: 0,
};

/**
 * Vyvolá událost z katalogu. Volá se uvnitř transakce změny, která událost způsobila: upozornění vznikne s ní
 * (nebo vůbec), doručení do zařízení řeší až worker po potvrzení transakce (outbox). Funkce nikdy neodesílá
 * a nepřipojuje se k žádné push službě, takže volající transakci nezdrží ani neshodí.
 *
 * Příjemce určují pravidla události (výchozí z katalogu, přepsaná klientem), obsah se skládá zvlášť pro každého
 * příjemce podle jeho oprávnění a předvoleb.
 */
export async function notify<D extends AnyEventDef>(
  db: Executor,
  def: D,
  input: NotifyInput<D>,
): Promise<NotifyResult> {
  const runtime = getNotificationRuntime();
  const rules = await loadRules(db);
  const eff = resolveEvent(def, runtime.config.events[def.key], rules.events[def.key]);
  if (!eff.enabled) return { ...EMPTY };

  const now = input.at ?? new Date();
  const record = input.record ?? null;
  const recordType = record?.type ?? def.entity ?? null;
  const recordId = record?.id ?? null;

  // 1) kdo by událost mohl dostat
  const ids = new Set<string>();
  const add = (list: Iterable<string | null | undefined>) => {
    for (const id of list) if (id) ids.add(id);
  };
  const audiences = (input.to ?? {}) as Record<string, readonly (string | null | undefined)[]>;
  for (const token of eff.recipients) {
    if (token.startsWith("perm:")) add(await usersWithPermission(db, token.slice(5)));
    else if (token.startsWith("role:")) add(await usersWithRole(db, token.slice(5)));
    else add(audiences[token] ?? []);
  }
  if (input.actorId) ids.delete(input.actorId);
  if (!ids.size) return { ...EMPTY };

  // 2) předvolby a časy
  const prefs = await loadPrefs(db, [...ids]);
  const planCtx: PlanContext = {
    now,
    timezone: runtime.timezone,
    config: runtime.config,
    rules: { quietHours: rules.quietHours, digestTimes: rules.digestTimes },
  };

  // 3) záznam, ke kterému událost patří (jedno načtení pro všechny příjemce)
  const policy = recordType ? getEntityPolicy(recordType) : undefined;
  const owners = policy && recordId ? await policy.owners(db, recordId) : undefined;

  const values: Record<string, ParamValue> = {
    ...(input.params as Record<string, ParamValue>),
    entityId: recordId,
  };
  const localDay = localParts(now, runtime.timezone).date;
  const dedupeBase =
    def.dedupe === "record"
      ? `${def.key}:${recordId ?? ""}`
      : def.dedupe === "day"
        ? `${def.key}:${recordId ?? ""}:${localDay}`
        : input.dedupe
          ? `${def.key}:${recordId ?? ""}`
          : null;
  const dedupeKey = dedupeBase
    ? input.dedupe
      ? `${dedupeBase}:${input.dedupe}`
      : dedupeBase
    : null;
  const collapseKey = recordId || def.mergeWindowSeconds ? `${def.key}:${recordId ?? ""}` : null;

  const drafts: Draft[] = [];
  let noAccess = 0;
  for (const userId of ids) {
    const actor = await loadActor(db, userId);
    if (!actor) continue; // neaktivní, smazaný
    if (!hasAccess(actor, def, policy?.read, owners, recordId)) {
      noAccess++;
      continue;
    }
    const money = canSeeMoney(actor);
    const forbidden = new Set<string>();
    for (const [name, p] of Object.entries(def.params)) {
      const s = p.sensitive;
      if (!s) continue;
      if (s === "money" ? !money : !actorHasAny(actor, s)) forbidden.add(name);
    }
    const title = withoutMoneyUnless(renderTitle(eff.title, values, forbidden), money) || def.label;
    const body = withoutMoneyUnless(renderBody(eff.body, values, forbidden), money);
    const url = input.url ?? renderUrl(def.template.url, values);
    drafts.push({
      userId,
      kind: def.key,
      severity: eff.severity,
      title: clip(title, MAX_TITLE),
      body: body ? clip(body, MAX_BODY) : null,
      url,
      entityType: recordType && recordId ? recordType : null,
      entityId: recordId,
      dedupeKey,
      collapseKey,
      mergeWindowSeconds: def.mergeWindowSeconds ?? 0,
      plan: planDelivery(eff, prefs.get(userId), planCtx),
    });
  }
  const inserted = await insertDrafts(db, drafts, now);
  return { ...inserted, candidates: ids.size, noAccess };
}

/** Má příjemce právo upozornění o tomto záznamu dostat? Záznam, který nesmí číst, se pro něj tváří neexistující. */
function hasAccess(
  actor: Actor,
  def: AnyEventDef,
  readPermission: string | undefined,
  owners: { ownerIds: (string | null)[] } | null | undefined,
  recordId: string | null,
): boolean {
  if (readPermission && recordId) {
    if (!owners) return false;
    if (!actorHasAny(actor, readPermission, owners)) return false;
  }
  if (def.access && !actorHasAny(actor, def.access)) return false;
  return true;
}
