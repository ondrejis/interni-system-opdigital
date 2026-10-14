"use client";

import {
  BigButton,
  ButtonLink,
  InstallCard,
  QueuePanel,
  TouchChoice,
  useTerminalQueue,
} from "@rebar/ui";
import { Bell, Building2, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Theme = "light" | "system" | "dark";

/** Vzhled s velkými tlačítky (stejné uložení jako přepínač v kanceláři: `localStorage.theme`, atribut `data-theme`). */
function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      setTheme(t === "light" || t === "dark" ? t : "system");
    } catch {
      // zůstane „podle systému“
    }
  }, []);
  return (
    <TouchChoice
      label="Vzhled"
      value={theme}
      onChange={(v: Theme) => {
        setTheme(v);
        const root = document.documentElement;
        if (v === "system") root.removeAttribute("data-theme");
        else root.setAttribute("data-theme", v);
        try {
          if (v === "system") localStorage.removeItem("theme");
          else localStorage.setItem("theme", v);
        } catch {
          // soukromý režim: téma platí do zavření stránky
        }
      }}
      options={[
        { value: "light", label: "Světlý" },
        { value: "system", label: "Podle systému" },
        { value: "dark", label: "Tmavý" },
      ]}
    />
  );
}

/** Více: čekající zápisy, instalace na plochu, vlastní účet, vzhled a odhlášení. */
export function MoreScreen({
  user,
  terminalOnly,
}: {
  user: { name: string; roleName: string; email: string };
  terminalOnly: boolean;
}) {
  const router = useRouter();
  const { ops } = useTerminalQueue();
  const [confirm, setConfirm] = useState(false);

  async function logout() {
    await authClient.signOut();
    router.replace("/prihlaseni");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-base text-muted">
          {user.roleName} · {user.email}
        </p>
      </header>

      <QueuePanel />
      <InstallCard />

      <section aria-label="Účet" className="space-y-2">
        <h2 className="text-xl font-semibold">Účet</h2>
        <ButtonLink href="/nastaveni/ucet" className="w-full justify-start">
          <UserRound /> Můj účet
        </ButtonLink>
        <ButtonLink href="/nastaveni/upozorneni" className="w-full justify-start">
          <Bell /> Upozornění v telefonu
        </ButtonLink>
        <ButtonLink href="/nastaveni/zabezpeceni" className="w-full justify-start">
          <ShieldCheck /> Zabezpečení účtu
        </ButtonLink>
        {!terminalOnly && (
          <ButtonLink href="/" className="w-full justify-start">
            <Building2 /> Zpět do kanceláře
          </ButtonLink>
        )}
      </section>

      <section aria-label="Vzhled" className="space-y-2">
        <h2 className="text-xl font-semibold">Vzhled</h2>
        <ThemeChoice />
      </section>

      <section aria-label="Odhlášení">
        {confirm ? (
          <div className="space-y-2 rounded-xl border border-line bg-bg p-3">
            <p className="text-base">
              V telefonu čeká {ops.length} nevyslaných zápisů. Zůstanou uložené a odešlou se, až se
              znovu přihlásíte. Opravdu se odhlásit?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <BigButton onClick={() => setConfirm(false)}>Zůstat</BigButton>
              <BigButton variant="danger" onClick={() => void logout()}>
                Odhlásit se
              </BigButton>
            </div>
          </div>
        ) : (
          <BigButton onClick={() => (ops.length ? setConfirm(true) : void logout())}>
            <LogOut /> Odhlásit se
          </BigButton>
        )}
      </section>
    </div>
  );
}
