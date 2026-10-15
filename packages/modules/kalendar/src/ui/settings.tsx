"use client";

import { formatInstant } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Field,
  FormSection,
  Input,
  Notice,
  SettingsPage,
  Skeleton,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AccountState,
  CalendarDto,
  CalendarSettingsDto,
  ConnectStartResult,
  SettingsSaveInput,
  SyncResult,
  TestResult,
} from "../contract";
import { cssColor } from "./lib";

/*
  Nastavení → Google Kalendář (NAS-13): připojit/odpojit vlastní účet, vybrat zobrazované kalendáře a kalendář pro
  zápis, stav synchronizace a chyby; správce (`settings.manage`) tu zadá OAuth klienta.
*/

const STATUS: Record<string, { label: string; color: string }> = {
  ok: { label: "Připojeno", color: "green" },
  reauth: { label: "Vyžaduje nové připojení", color: "orange" },
  error: { label: "Chyba", color: "red" },
};

const RETURN: Record<string, { tone: "success" | "warning" | "error"; text: string }> = {
  ok: { tone: "success", text: "Google účet je připojený a kalendáře se synchronizují." },
  denied: { tone: "warning", text: "Souhlas v Googlu jste neudělili, účet zůstal nepřipojený." },
  error: {
    tone: "error",
    text: "Připojení se nepovedlo. Zkuste to znovu, nebo zkontrolujte nastavení OAuth klienta.",
  },
};

const fmt = (v: string | null) => (v ? formatInstant(v, { year: true }) : "zatím ne");

function Calendars({ calendars, canWrite }: { calendars: CalendarDto[]; canWrite: boolean }) {
  const toggle = useCommandMutation<{ calendarId: string; visible: boolean }>(
    "kalendar.toggleCalendar",
  );
  const target = useCommandMutation<{ calendarId: string }>("kalendar.setWriteTarget");
  const fail = (e: Error) => errorToast(e.message);
  return (
    <table className="w-full text-sm" data-testid="calendar-list">
      <thead className="text-left text-muted">
        <tr>
          <th className="px-4 py-2 font-medium">Zobrazit</th>
          <th className="py-2 pr-2 font-medium">Kalendář</th>
          <th className="py-2 pr-2 font-medium">Zapisovat sem</th>
          <th className="hidden py-2 pr-4 font-medium md:table-cell">Synchronizace</th>
        </tr>
      </thead>
      <tbody>
        {calendars.map((c) => (
          <tr key={c.id} className="border-t border-line align-top" data-testid="calendar-row">
            <td className="px-4 py-2">
              <Checkbox
                checked={c.visible}
                disabled={!canWrite}
                aria-label={`Zobrazit kalendář ${c.name}`}
                onCheckedChange={(v) =>
                  toggle.mutate({ calendarId: c.id, visible: !!v }, { onError: fail })
                }
              />
            </td>
            <td className="py-2 pr-2">
              <span
                className="mr-2 inline-block size-2.5 rounded-full align-middle"
                style={{ background: cssColor(c.color) }}
                aria-hidden
              />
              <span className="font-medium">{c.name}</span>
              {c.isPrimary && <span className="ml-1.5 text-muted">hlavní</span>}
              {!c.canWrite && <span className="ml-1.5 text-muted">jen ke čtení</span>}
              {c.lastError && <div className="text-danger">{c.lastError}</div>}
            </td>
            <td className="py-2 pr-2">
              <input
                type="radio"
                name="write-target"
                className="size-4 accent-[var(--accent)]"
                checked={c.isWriteTarget}
                disabled={!canWrite || !c.canWrite}
                aria-label={`Zapisovat nové schůzky do kalendáře ${c.name}`}
                onChange={() => target.mutate({ calendarId: c.id }, { onError: fail })}
              />
            </td>
            <td className="hidden py-2 pr-4 text-muted md:table-cell">
              {c.visible ? (
                <>
                  {fmt(c.lastSyncAt)} ·{" "}
                  {c.push ? "okamžité změny (push)" : "pravidelně každou minutu"}
                </>
              ) : (
                "nesynchronizuje se"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OAuthSettings() {
  const q = useCommandQuery<CalendarSettingsDto>("kalendar.settings.get", {});
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [priv, setPriv] = useState(true);
  useEffect(() => {
    if (q.data) {
      setClientId(q.data.clientId);
      setPriv(q.data.privateMeetingsToGoogle);
    }
  }, [q.data]);
  const save = useCommandMutation<SettingsSaveInput>("kalendar.settings.save", {
    onSuccess: () => {
      setSecret("");
      successToast("Nastavení uloženo.");
    },
  });
  const d = q.data;
  return (
    <FormSection
      title="Přístup k Google API (správce)"
      description="Jednorázově: OAuth klient z Google Cloud Console. Postup je v dokumentaci modulu Kalendář."
      badge={
        d ? (
          <Chip color={d.clientSecretSet && d.clientId ? "green" : "orange"}>
            {d.clientSecretSet && d.clientId ? "Vyplněno" : "Chybí"}
          </Chip>
        ) : null
      }
      footer={
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              clientId,
              ...(secret ? { clientSecret: secret } : {}),
              privateMeetingsToGoogle: priv,
            })
          }
        >
          Uložit
        </Button>
      }
    >
      {!d ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="space-y-3">
          <Field label="Client ID" htmlFor="gk-client-id">
            <Input
              id="gk-client-id"
              value={clientId}
              autoComplete="off"
              onChange={(e) => setClientId(e.target.value)}
            />
          </Field>
          <Field
            label="Client Secret"
            htmlFor="gk-secret"
            hint={
              d.clientSecretSet
                ? "Uloženo (šifrovaně). Prázdné pole ponechá stávající hodnotu."
                : "Uloží se šifrovaně a nikdy se nezobrazí."
            }
          >
            <Input
              id="gk-secret"
              type="password"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={priv}
              onCheckedChange={(v) => setPriv(!!v)}
              aria-label="Zapisovat soukromé schůzky do Googlu"
            />
            <span>
              Zapisovat soukromé schůzky do Googlu jako soukromé
              <span className="block text-sm text-muted">
                Druhý uživatel v nich uvidí jen „Obsazeno“. Vypnuto: soukromé schůzky zůstanou jen v
                OPSYS.
              </span>
            </span>
          </label>
          <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="text-muted">Authorized redirect URI</dt>
            <dd className="break-all font-mono text-xs" data-testid="redirect-uri">
              {d.redirectUri}
            </dd>
            <dt className="text-muted">Push (změny z Googlu hned)</dt>
            <dd>
              {d.pushAvailable
                ? "dostupný (https)"
                : "nedostupný: adresa aplikace není https, běží jen pravidelná synchronizace"}
            </dd>
          </dl>
          {save.error && (
            <p role="alert" className="text-sm text-danger">
              {save.error.message}
            </p>
          )}
        </div>
      )}
    </FormSection>
  );
}

/** Stránka Nastavení → Google Kalendář. */
export function GoogleCalendarSettings() {
  const can = useCan();
  const canWrite = can("kalendar.write");
  const q = useCommandQuery<AccountState>("kalendar.account", {});
  const [banner, setBanner] = useState<keyof typeof RETURN | null>(null);
  const [disconnect, setDisconnect] = useState(false);
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("google");
    if (g && g in RETURN) setBanner(g);
  }, []);

  const connect = useCommandMutation<{ returnTo?: string }, ConnectStartResult>(
    "kalendar.connect.start",
    {
      onSuccess: (r) => window.location.assign(r.url),
    },
  );
  const sync = useCommandMutation<Record<string, never>, SyncResult>("kalendar.sync", {
    onSuccess: (r) =>
      r.errors.length
        ? errorToast(`Synchronizace skončila s chybou: ${r.errors[0]}`)
        : successToast(r.changed ? `Synchronizováno, změn: ${r.changed}.` : "Vše je aktuální."),
  });
  const test = useCommandMutation<Record<string, never>, TestResult>("kalendar.test", {
    onSuccess: (r) => (r.ok ? successToast(r.message) : errorToast(r.message)),
  });
  const refresh = useCommandMutation<Record<string, never>>("kalendar.calendars.refresh", {
    onSuccess: () => successToast("Seznam kalendářů je aktuální."),
  });
  const drop = useCommandMutation<Record<string, never>>("kalendar.disconnect", {
    onSuccess: () => successToast("Google účet je odpojený."),
  });

  const s = q.data;
  const mine = s?.mine ?? null;
  const status = mine ? (STATUS[mine.status] ?? STATUS.error!) : null;

  return (
    <SettingsPage
      title="Google Kalendář"
      description="Napojení vlastního Google účtu, zobrazované kalendáře a kalendář pro zápis schůzek."
      icon={<CalendarDays />}
    >
      {banner && (
        <Notice tone={RETURN[banner]!.tone} className="mb-4">
          {RETURN[banner]!.text}
        </Notice>
      )}

      <FormSection
        title="Můj Google účet"
        badge={status ? <Chip color={status.color}>{status.label}</Chip> : <Chip>Nepřipojeno</Chip>}
        description="Každý si připojí svůj účet sám. Co vznikne v OPSYS, je do minuty v Googlu, a naopak."
      >
        {!s ? (
          <Skeleton className="h-16" />
        ) : mine ? (
          <div className="space-y-3">
            <p>
              <span className="font-medium" data-testid="google-email">
                {mine.googleEmail}
              </span>
              <span className="ml-2 text-sm text-muted">
                poslední synchronizace {fmt(mine.lastSyncAt)}
              </span>
            </p>
            {mine.lastError && (
              <Notice tone={mine.status === "reauth" ? "warning" : "error"} title="Poslední chyba">
                {mine.lastError}
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              {mine.status === "reauth" && (
                <Button
                  variant="primary"
                  loading={connect.isPending}
                  onClick={() => connect.mutate({})}
                >
                  Připojit znovu
                </Button>
              )}
              <Button loading={sync.isPending} disabled={!canWrite} onClick={() => sync.mutate({})}>
                Synchronizovat teď
              </Button>
              <Button loading={test.isPending} onClick={() => test.mutate({})}>
                Otestovat připojení
              </Button>
              <Button
                loading={refresh.isPending}
                disabled={!canWrite}
                onClick={() => refresh.mutate({})}
              >
                Načíst kalendáře znovu
              </Button>
              <Button
                variant="ghost"
                className="text-danger"
                disabled={!canWrite}
                onClick={() => setDisconnect(true)}
              >
                Odpojit účet
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted">
              Bez připojeného Googlu ukazuje kalendář jen úkoly a schůzky z OPSYS. Po připojení
              uvidíte události ze svých kalendářů a schůzky z OPSYS se budou zapisovat do Googlu.
            </p>
            {!s.configured && (
              <Notice tone="warning">
                Google Kalendář zatím není nastavený. Správce musí nejdřív zadat OAuth klienta
                (níže).
              </Notice>
            )}
            <Button
              variant="primary"
              loading={connect.isPending}
              disabled={!s.configured || !canWrite}
              onClick={() => connect.mutate({})}
              data-testid="connect-google"
            >
              Připojit Google účet
            </Button>
            {connect.error && (
              <p role="alert" className="text-sm text-danger">
                {connect.error.message}
              </p>
            )}
          </div>
        )}
      </FormSection>

      {mine && (
        <FormSection
          title="Kalendáře"
          description="Zobrazené kalendáře se synchronizují a ukazují v OPSYS. Nové schůzky se zapisují do vybraného kalendáře."
          flush
        >
          {mine.calendars.length ? (
            <Calendars calendars={mine.calendars} canWrite={canWrite} />
          ) : (
            <p className="px-4 py-3 text-muted">
              Účet zatím nemá žádné kalendáře. Zkuste „Načíst kalendáře znovu“.
            </p>
          )}
        </FormSection>
      )}

      {s && s.others.length > 0 && (
        <FormSection
          title="Kalendáře ostatních"
          description="Soukromé události druhého uživatele vidíte jen jako „Obsazeno“."
        >
          <ul className="space-y-1 text-sm">
            {s.others.map((o) => (
              <li key={o.userId}>
                <span className="font-medium">{o.userName}</span>
                <span className="text-muted">
                  {" "}
                  · {o.calendars.map((c) => c.name).join(", ") || "žádné kalendáře"}
                </span>
              </li>
            ))}
          </ul>
        </FormSection>
      )}

      {can("settings.manage") && <OAuthSettings />}

      <ConfirmDialog
        open={disconnect}
        onOpenChange={setDisconnect}
        title="Odpojit Google účet"
        description={mine?.googleEmail ?? ""}
        confirmLabel="Odpojit"
        danger
        onConfirm={() =>
          drop.mutateAsync({}).then(
            () => undefined,
            (e: Error) => {
              errorToast(e.message);
            },
          )
        }
      >
        Zastaví se synchronizace a z OPSYS zmizí zrcadlo událostí z Googlu. Události v Googlu
        zůstanou beze změny; schůzky z OPSYS zůstanou mezi úkoly.
      </ConfirmDialog>
    </SettingsPage>
  );
}
