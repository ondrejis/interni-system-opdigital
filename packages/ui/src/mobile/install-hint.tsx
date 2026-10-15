"use client";

import { useEffect, useState } from "react";
import { Button } from "../components/button";
import { installState, type InstallState } from "./start";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * Pokyn „Přidat OPSYS na plochu“ (MOB-10) pro Nastavení → Vzhled nebo Profil. Android: tlačítko Nainstalovat;
 * iPhone Safari: návod Sdílet → Přidat na plochu; už nainstalováno nebo nepodporováno: nic (komponenta nevykreslí nic).
 */
export function InstallHint() {
  const [state, setState] = useState<InstallState>("unsupported");
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const read = (p: PromptEvent | null) =>
      setState(installState({ standalone, userAgent: navigator.userAgent, hasPrompt: !!p }));
    read(null);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
      read(e as PromptEvent);
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "installed" || state === "unsupported") return null;
  return (
    <div className="space-y-1.5" data-testid="install-hint">
      <p className="text-base font-medium">Aplikace na ploše telefonu</p>
      {state === "prompt" ? (
        <>
          <p className="text-sm text-muted">
            OPSYS jde přidat na plochu jako aplikaci. Naposledy načtená data pak uvidíte i při
            slabém signálu (jen ke čtení).
          </p>
          <Button
            type="button"
            onClick={async () => {
              await prompt?.prompt();
              setPrompt(null);
            }}
          >
            Nainstalovat
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">
          V Safari klepněte na Sdílet a zvolte „Přidat na plochu“. Aplikace se pak otevírá jako
          samostatná a naposledy načtená data jsou vidět i při slabém signálu (jen ke čtení).
        </p>
      )}
    </div>
  );
}
