import { Chip, Icon, Notice, SettingsPage } from "@rebar/ui";
import { Blocks } from "lucide-react";
import Link from "next/link";
import { ALL_MODULES } from "@/modules";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moduly" };

/**
 * Přehled modulů: co systém umí, které moduly má tento klient zapnuté, jaká oprávnění přidávají a kde je najít.
 * Zapínání a vypínání za běhu tu záměrně není (viz ADR 019): sestava modulů je v konfiguraci klienta.
 */
export default async function ModulesPage() {
  await requireCan("settings.manage");
  const { runtime } = getServices();
  const enabled = new Set<string>(runtime.modules.map((m) => m.id));
  const nameOf = new Map<string, string>(ALL_MODULES.map((m) => [m.id, m.name]));
  const modules = [
    ...ALL_MODULES.filter((m) => enabled.has(m.id)),
    ...ALL_MODULES.filter((m) => !enabled.has(m.id)),
  ];
  return (
    <SettingsPage
      width="lg"
      title="Moduly"
      description="Části systému, které má vaše firma zapnuté. Zapnuté moduly se objeví v menu a jejich oprávnění v rolích."
      icon={<Blocks />}
    >
      <Notice tone="info" title="Jak zapnout nebo vypnout modul">
        Sestavu modulů určuje konfigurace vašeho systému (seznam <code>modules</code> v souboru{" "}
        <code>clients/{runtime.config.slug}/config.ts</code>), ne přepínač za běhu. Modul totiž
        přidává tabulky do databáze, menu i oprávnění, proto se mění nasazením nové verze. Napište
        dodavateli systému, který modul chcete přidat nebo odebrat, a on to nasadí. Odebraný modul
        svá data neztrácí, jen se přestane zobrazovat.
      </Notice>
      <ul className="grid gap-4 @3xl:grid-cols-2" data-testid="module-list">
        {modules.map((m) => {
          const on = enabled.has(m.id);
          return (
            <li
              key={m.id}
              data-testid={`module-${m.id}`}
              className="flex flex-col gap-3 rounded-xl border border-line bg-bg p-5"
            >
              <header className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-hover text-muted [&_svg]:size-4">
                  <Icon name={m.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">{m.name}</h3>
                  <p className="mt-0.5 text-base text-muted">{m.description}</p>
                </div>
                <Chip color={on ? "green" : "gray"}>{on ? "Zapnuto" : "Vypnuto"}</Chip>
              </header>
              {(m.dependsOn?.length ?? 0) > 0 && (
                <p className="text-sm text-muted">
                  Vyžaduje: {m.dependsOn!.map((d) => nameOf.get(d) ?? d).join(", ")}
                </p>
              )}
              {on && (
                <>
                  <div>
                    <h4 className="mb-1.5 text-sm font-medium uppercase tracking-wide text-faint">
                      Kde ho najdete
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ...m.nav.map((n) => ({ href: n.href, label: n.label })),
                        ...(m.pages ?? [])
                          .filter((p) => !m.nav.some((n) => n.href === p.path))
                          .map((p) => ({ href: p.path, label: p.title })),
                      ].map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          className="rounded-md border border-line px-2 py-1 text-sm text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
                        >
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-1.5 text-sm font-medium uppercase tracking-wide text-faint">
                      Oprávnění pro role ({m.permissions.length})
                    </h4>
                    <ul className="space-y-0.5 text-sm text-muted">
                      {m.permissions.map((p) => (
                        <li key={p.key}>{p.label}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </SettingsPage>
  );
}
