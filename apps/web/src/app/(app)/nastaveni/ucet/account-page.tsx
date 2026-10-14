"use client";

import { formatInstant } from "@rebar/core/time";
import {
  Avatar,
  Button,
  Chip,
  FormSection,
  Notice,
  PasswordField,
  PasswordStrength,
  SettingsPage,
  TextField,
  cn,
  useNav,
} from "@rebar/ui";
import {
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  Monitor,
  ShieldCheck,
  Smartphone,
  Tablet,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { runAction } from "@/lib/run-action";
import {
  changePasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateProfileAction,
} from "@/server/account-actions";

type Account = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
  phone: string | null;
};
type Session = {
  id: string;
  current: boolean;
  label: string;
  device: "mobile" | "tablet" | "desktop";
  ip: string | null;
  lastActiveAt: string;
};

const DEVICE_ICON: Record<Session["device"], LucideIcon> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Laptop,
};

const MIN = 12;
/** Kolik přihlášených zařízení se ukáže hned; zbytek po rozkliknutí. */
const VISIBLE_SESSIONS = 8;

const when = (iso: string) => formatInstant(iso);

/** Můj účet: profil, změna hesla, přihlášená zařízení, dvoufázové ověření (podrobnosti na stránce Zabezpečení účtu). */
export function AccountPage({ account, sessions }: { account: Account; sessions: Session[] }) {
  return (
    <SettingsPage
      title="Můj účet"
      description="Vaše údaje, heslo a zařízení, na kterých jste přihlášeni."
      icon={<UserRound />}
    >
      <ProfileSection account={account} />
      <PasswordSection />
      <SessionsSection sessions={sessions} />
      <TwoFactorSection account={account} />
    </SettingsPage>
  );
}

function ProfileSection({ account }: { account: Account }) {
  const router = useRouter();
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== account.name || phone.trim() !== (account.phone ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(
      updateProfileAction({ name, phone: phone || null }),
      "Profil uložen.",
    );
    setBusy(false);
    if (res) router.refresh();
  }

  return (
    <form onSubmit={save}>
      <FormSection
        title="Profil"
        icon={<UserRound />}
        description="Jméno a telefon uvidí kolegové u záznamů, v aktivitě a v docházce."
        footer={
          <>
            {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
            <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
              Uložit profil
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={name.trim() || account.name} size={48} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name.trim() || account.name}</p>
            <p className="text-sm text-muted">{account.roleName}</p>
          </div>
        </div>
        <div className="grid gap-x-4 gap-y-3 @lg:grid-cols-2">
          <TextField
            density="compact"
            label="Jméno a příjmení"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            density="compact"
            label="Telefon"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={30}
            placeholder="+420 777 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="@lg:col-span-2">
            <TextField
              density="compact"
              label="E-mail (přihlašovací jméno)"
              value={account.email}
              readOnly
              disabled
              hint="E-mail si sami neměníte, protože na něj chodí odkazy pro obnovu hesla. Chcete-li ho změnit, požádejte správce uživatelů."
            />
          </div>
        </div>
      </FormSection>
    </form>
  );
}

function PasswordSection() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const mismatch = again.length > 0 && next !== again;
  const ready = current.length > 0 && next.length >= MIN && next === again;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    const r = await changePasswordAction({ currentPassword: current, newPassword: next });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCurrent("");
    setNext("");
    setAgain("");
    await runAction(
      Promise.resolve(r),
      r.data.revokedSessions > 0
        ? `Heslo bylo změněno. Na ${r.data.revokedSessions} dalších zařízeních jste odhlášeni.`
        : "Heslo bylo změněno.",
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <FormSection
        title="Změna hesla"
        icon={<KeyRound />}
        description="Po změně vás odhlásíme ze všech ostatních zařízení. Na tomto zůstanete přihlášeni."
        footer={
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            Změnit heslo
          </Button>
        }
      >
        <div className="max-w-sm space-y-3">
          {error && <Notice tone="error">{error}</Notice>}
          <PasswordField
            density="compact"
            label="Současné heslo"
            icon={<LockKeyhole />}
            name="current-password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <PasswordField
            density="compact"
            label="Nové heslo"
            icon={<LockKeyhole />}
            name="new-password"
            autoComplete="new-password"
            required
            minLength={MIN}
            aria-describedby="pw-strength"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <PasswordStrength id="pw-strength" password={next} />
          <PasswordField
            density="compact"
            label="Potvrzení nového hesla"
            icon={<LockKeyhole />}
            name="confirm-password"
            autoComplete="new-password"
            required
            error={mismatch ? "Hesla se neshodují." : undefined}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </div>
      </FormSection>
    </form>
  );
}

function SessionsSection({ sessions }: { sessions: Session[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const others = sessions.filter((s) => !s.current).length;
  // aktuální zařízení je vždy první, ostatní od nejnovější aktivity
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  const visible = showAll ? ordered : ordered.slice(0, VISIBLE_SESSIONS);

  async function signOutHere() {
    setBusy("current");
    await authClient.signOut();
    router.replace("/prihlaseni");
    router.refresh();
  }

  async function revoke(s: Session) {
    if (s.current) return signOutHere();
    setBusy(s.id);
    const res = await runAction(revokeSessionAction({ id: s.id }), "Zařízení bylo odhlášeno.");
    setBusy(null);
    if (res) router.refresh();
  }

  async function revokeOthers() {
    setBusy("others");
    const res = await runAction(revokeOtherSessionsAction({}), "Ostatní zařízení byla odhlášena.");
    setBusy(null);
    if (res) router.refresh();
  }

  return (
    <FormSection
      title="Přihlášená zařízení"
      icon={<Monitor />}
      badge={<Chip>{sessions.length}</Chip>}
      description="Tady vidíte, kde jste přihlášeni. Zařízení, které nepoznáváte, odhlaste a změňte si heslo."
      flush
      data-testid="sessions"
      footer={
        <Button
          type="button"
          variant="danger"
          loading={busy === "others"}
          disabled={others === 0}
          onClick={revokeOthers}
        >
          <LogOut /> Odhlásit všechna ostatní zařízení
        </Button>
      }
    >
      <ul className="divide-y divide-line border-t border-line">
        {visible.map((s) => {
          const I = DEVICE_ICON[s.device];
          return (
            <li
              key={s.id}
              data-current={s.current ? "true" : undefined}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  s.current ? "bg-accent-soft text-accent" : "bg-hover text-muted",
                )}
              >
                <I className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{s.label}</span>
                  {s.current && (
                    <Chip color="green" dot>
                      Toto zařízení
                    </Chip>
                  )}
                </div>
                <div className="text-sm text-muted">
                  Naposledy aktivní{" "}
                  <time dateTime={s.lastActiveAt} suppressHydrationWarning>
                    {when(s.lastActiveAt)}
                  </time>
                  {s.ip && <> · adresa {s.ip}</>}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={busy === (s.current ? "current" : s.id)}
                onClick={() => void revoke(s)}
              >
                {s.current ? "Odhlásit se" : "Odhlásit toto zařízení"}
              </Button>
            </li>
          );
        })}
      </ul>
      {sessions.length > VISIBLE_SESSIONS && (
        <div className="border-t border-line px-5 py-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Zobrazit méně" : `Zobrazit všech ${sessions.length}`}
          </Button>
        </div>
      )}
    </FormSection>
  );
}

function TwoFactorSection({ account }: { account: Account }) {
  const { Link } = useNav();
  return (
    <FormSection
      title="Dvoufázové ověření"
      icon={<ShieldCheck />}
      description={
        account.twoFactorEnabled
          ? "Kromě hesla zadáváte při přihlášení kód z aplikace."
          : account.twoFactorRequired
            ? "Pro vaši roli je povinné, ale zatím ho nemáte nastavené."
            : "Doporučujeme zapnout; účet pak chrání i tehdy, když se někdo dozví heslo."
      }
      badge={
        account.twoFactorEnabled ? (
          <Chip color="green" dot>
            Zapnuto
          </Chip>
        ) : (
          <Chip>Vypnuto</Chip>
        )
      }
      footer={
        <Link
          href="/nastaveni/zabezpeceni"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-bg px-3 text-base font-medium transition-colors hover:bg-hover"
        >
          <ShieldCheck className="size-4" aria-hidden /> Spravovat dvoufázové ověření
        </Link>
      }
    />
  );
}
