"use client";

import { formatClock } from "@rebar/core/time";
import { Download, RotateCcw, Share, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePendingUploads } from "../data/photo-capture";
import { useUploadQueue } from "../data/use-upload-queue";
import { BigButton, TerminalEmpty } from "./kit";
import { useTerminalQueue } from "./queue-context";

const time = (ms: number) => formatClock(ms);

/**
 * Čekající zápisy a nahrávané fotky. Nic se tu neztratí tiše: potvrzený zápis zmizí sám, konflikt zůstane i s českým
 * důvodem, dokud ho člověk nezkusí znovu nebo výslovně nezahodí.
 */
export function QueuePanel() {
  const { ops, queue, online } = useTerminalQueue();
  const { queue: photoQueue, tasks } = useUploadQueue();
  const photos = usePendingUploads();
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section
      id="fronta"
      aria-label="Čekající zápisy"
      data-testid="queue-panel"
      className="space-y-3"
    >
      <h2 className="text-xl font-semibold">Čekající zápisy</h2>
      {!online && (
        <p className="rounded-xl bg-hover p-3 text-base text-muted">
          Jste bez připojení. Zápisy se uloží v telefonu a odešlou se, jakmile se připojení vrátí.
        </p>
      )}
      {ops.length === 0 && photos === 0 ? (
        <TerminalEmpty>Všechno je odeslané.</TerminalEmpty>
      ) : (
        <ul className="space-y-2">
          {ops.map((o) => (
            <li
              key={o.opId}
              data-testid="queue-item"
              data-state={o.state}
              className="rounded-xl border border-line bg-bg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-medium">{o.label}</span>
                <span className="shrink-0 text-sm text-muted">{time(o.createdAt)}</span>
              </div>
              {o.state === "conflict" ? (
                <p role="alert" className="mt-1 text-base text-danger">
                  {o.error ?? "Zápis server odmítl."}
                </p>
              ) : (
                <p className="mt-1 text-base text-warning">
                  Čeká na odeslání{o.error ? `: ${o.error}` : ""}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                {o.state === "conflict" && (
                  <BigButton
                    block={false}
                    className="h-12 flex-1 text-base"
                    onClick={() => void queue?.retry(o.opId)}
                  >
                    <RotateCcw /> Zkusit znovu
                  </BigButton>
                )}
                {confirm === o.opId ? (
                  <BigButton
                    block={false}
                    variant="danger"
                    className="h-12 flex-1 text-base"
                    onClick={() => {
                      setConfirm(null);
                      void queue?.discard(o.opId);
                    }}
                  >
                    <Trash2 /> Opravdu zahodit
                  </BigButton>
                ) : (
                  <BigButton
                    block={false}
                    className="h-12 flex-1 text-base"
                    onClick={() => setConfirm(o.opId)}
                  >
                    <Trash2 /> Zahodit
                  </BigButton>
                )}
              </div>
            </li>
          ))}
          {tasks.map((t) => (
            <li
              key={t.id}
              data-testid="queue-photo"
              className="rounded-xl border border-line bg-bg p-3"
            >
              <div className="font-medium">Fotka: {t.label}</div>
              {t.failed ? (
                <>
                  <p role="alert" className="mt-1 text-base text-danger">
                    {t.error ?? "Fotku se nepodařilo odeslat."}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <BigButton
                      block={false}
                      className="h-12 flex-1 text-base"
                      onClick={() => void photoQueue?.retry(t.id)}
                    >
                      <RotateCcw /> Zkusit znovu
                    </BigButton>
                    <BigButton
                      block={false}
                      className="h-12 flex-1 text-base"
                      onClick={() => void photoQueue?.discard(t.id)}
                    >
                      <Trash2 /> Zahodit
                    </BigButton>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-base text-warning">Čeká na odeslání</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Instalace na plochu: v prohlížečích s podporou tlačítko, na iPhonu postup přes „Sdílet“. */
export function InstallCard() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [state, setState] = useState<"unknown" | "installed" | "ios" | "other">("unknown");
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setState(standalone ? "installed" : ios ? "ios" : "other");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (state === "unknown") return null;
  return (
    <section aria-label="Aplikace na ploše" className="space-y-3" data-testid="install-card">
      <h2 className="text-xl font-semibold">Aplikace na ploše</h2>
      {state === "installed" ? (
        <TerminalEmpty>Aplikace je nainstalovaná na ploše telefonu.</TerminalEmpty>
      ) : event ? (
        <BigButton
          onClick={async () => {
            await event.prompt();
            await event.userChoice.catch(() => undefined);
            setEvent(null);
          }}
        >
          <Download /> Přidat na plochu
        </BigButton>
      ) : state === "ios" ? (
        <p className="flex items-start gap-2 rounded-xl bg-subtle p-3 text-base text-muted">
          <Share className="mt-0.5 size-5 shrink-0" />
          <span>
            V Safari ťukněte na Sdílet a zvolte „Přidat na plochu“. Terminál se pak otevírá jako
            aplikace.
          </span>
        </p>
      ) : (
        <p className="rounded-xl bg-subtle p-3 text-base text-muted">
          V nabídce prohlížeče zvolte „Přidat na plochu“ nebo „Nainstalovat aplikaci“. Terminál se
          pak otevírá jako aplikace.
        </p>
      )}
    </section>
  );
}
