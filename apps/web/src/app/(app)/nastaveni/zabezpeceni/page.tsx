import { getAccount, listSecurityEvents } from "@rebar/core/auth";
import { formatInstant } from "@rebar/core/time";
import { Chip, FormSection, SettingsPage } from "@rebar/ui";
import { History, ShieldCheck } from "lucide-react";
import { requireCtx } from "@/server/request";
import { TwoFactorSetup } from "./two-factor-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zabezpečení účtu" };

const BAD = new Set([
  "login_failed",
  "login_blocked",
  "two_factor_failed",
  "change_password_failed",
]);

export default async function SecurityPage() {
  const ctx = await requireCtx({ allowRestricted: true });
  const account = await getAccount(ctx);
  // omezená relace (2FA ještě není nastavené) historii nevidí; stačí jí nastavení
  const events = ctx.actor.restriction ? [] : await listSecurityEvents(ctx, { limit: 30 });
  return (
    <SettingsPage
      title="Zabezpečení účtu"
      description="Dvoufázové ověření je v systému povinné pro všechny a chrání váš účet i tehdy, když se někdo dozví heslo. Heslo, avatar a přihlášená zařízení spravujete v Profilu."
      icon={<ShieldCheck />}
    >
      <TwoFactorSetup enabled={account.twoFactorEnabled} required={account.twoFactorRequired} />
      {events.length > 0 && (
        <FormSection
          title="Poslední přihlášení a bezpečnostní události"
          icon={<History />}
          description="Přihlášení, neúspěšné pokusy, změny hesla a druhého faktoru u vašeho účtu. Vidíte jen svůj účet."
          flush
          data-testid="security-events"
        >
          <ul className="divide-y divide-line border-t border-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <Chip color={BAD.has(e.action) ? "red" : "gray"}>{e.label}</Chip>
                <span className="min-w-0 flex-1 basis-48 text-sm text-muted">
                  {e.summary}
                  {e.actorName && <> · provedl {e.actorName}</>}
                </span>
                <span className="text-sm text-muted tabular">
                  {e.ip ? `${e.ip} · ` : ""}
                  <time dateTime={e.occurredAt.toISOString()} suppressHydrationWarning>
                    {formatInstant(e.occurredAt.toISOString(), { year: true })}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        </FormSection>
      )}
    </SettingsPage>
  );
}
