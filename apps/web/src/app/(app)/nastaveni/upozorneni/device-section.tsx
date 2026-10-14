"use client";

import {
  Button,
  Chip,
  ConfirmDialog,
  FormSection,
  IconButton,
  Notice,
  Skeleton,
  errorToast,
  successToast,
} from "@rebar/ui";
import { Bell, BellOff, BellRing, Laptop, Smartphone, Tablet, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  type PushSupport,
} from "@/lib/push-client";
import {
  getTestNotificationStatus,
  listMyDevices,
  removeMyDevice,
  sendMyTestNotification,
} from "@/server/notification-actions";
import { REASON_LABEL, when } from "./labels";

type Device = {
  id: string;
  label: string;
  device: "mobile" | "tablet" | "desktop";
  current: boolean;
  createdAt: string;
  lastSentAt: string | null;
  failing: boolean;
};

const ICON = { mobile: Smartphone, tablet: Tablet, desktop: Laptop } as const;

type Platform = "ios" | "android" | "desktop";
const platformOf = (): Platform => {
  const ua = navigator.userAgent;
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
    return "ios";
  return /Android/.test(ua) ? "android" : "desktop";
};

/** Návod, jak zapnout upozornění, když je prohlížeč blokuje nebo je neumí. */
export function PushHelp({ platform, topic }: { platform: Platform; topic: "denied" | "install" }) {
  if (platform === "ios")
    return (
      <ol className="list-decimal space-y-1 pl-5" data-testid="push-help-ios">
        {topic === "install" && (
          <>
            <li>Otevřete tuto stránku v Safari (iPhone s iOS 16.4 nebo novějším).</li>
            <li>
              Klepněte na <strong>Sdílet</strong> (čtverec se šipkou dolů) a vyberte{" "}
              <strong>Přidat na plochu</strong>.
            </li>
            <li>
              Otevřete aplikaci z plochy (ne ze Safari) a vraťte se do Nastavení → Upozornění.
            </li>
            <li>
              Klepněte na <strong>Zapnout v tomto zařízení</strong> a povolte oznámení.
            </li>
          </>
        )}
        {topic === "denied" && (
          <>
            <li>
              Otevřete <strong>Nastavení</strong> telefonu, najděte aplikaci (ikona na ploše) →{" "}
              <strong>Oznámení</strong>.
            </li>
            <li>
              Zapněte <strong>Povolit oznámení</strong> a vraťte se sem.
            </li>
          </>
        )}
      </ol>
    );
  if (platform === "android")
    return (
      <ol className="list-decimal space-y-1 pl-5" data-testid="push-help-android">
        <li>
          Klepněte na ikonu <strong>zámku</strong> (nebo ⓘ) vlevo od adresy.
        </li>
        <li>
          Vyberte <strong>Oprávnění</strong> → <strong>Oznámení</strong> → <strong>Povolit</strong>.
        </li>
        <li>
          Zkontrolujte i <strong>Nastavení telefonu → Aplikace → Chrome → Oznámení</strong> (musí
          být povolená). Při úsporném režimu baterie mohou upozornění chodit se zpožděním.
        </li>
      </ol>
    );
  return (
    <ol className="list-decimal space-y-1 pl-5" data-testid="push-help-desktop">
      <li>
        Klikněte na ikonu <strong>zámku</strong> vlevo od adresy v prohlížeči.
      </li>
      <li>
        U položky <strong>Oznámení</strong> vyberte <strong>Povolit</strong> a stránku načtěte
        znovu.
      </li>
    </ol>
  );
}

/**
 * Upozornění v tomto zařízení a seznam všech zařízení s odběrem. Jasné stavy: server push nemá zapnutý, prohlížeč
 * push neumí, iPhone potřebuje „Přidat na plochu“, zablokováno v prohlížeči, zapnuto, vypnuto.
 */
export function DeviceSection({
  pushEnabled,
  publicKey,
}: {
  pushEnabled: boolean;
  publicKey: string | null;
}) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{
    text: string;
    tone: "info" | "success" | "warning" | "error";
  } | null>(null);
  const [remove, setRemove] = useState<Device | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const refresh = useCallback(async () => {
    setSupport(pushSupport());
    setPlatform(platformOf());
    const sub = await currentSubscription().catch(() => null);
    setEndpoint(sub?.endpoint ?? null);
    const r = await listMyDevices({ endpoint: sub?.endpoint ?? null });
    if (alive.current && r.ok) setDevices(r.data);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      await enablePush(publicKey);
      successToast("Upozornění v tomto zařízení jsou zapnutá.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      successToast("Upozornění v tomto zařízení jsou vypnutá.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setTest({ text: "Zařazuji zkušební upozornění…", tone: "info" });
    try {
      const r = await sendMyTestNotification({});
      if (!r.ok) throw new Error(r.error);
      const id = r.data.deliveryId;
      if (!id) throw new Error("Zkušební upozornění se nepodařilo zařadit.");
      setTest({ text: "Zařazeno do fronty, čekám na odeslání…", tone: "info" });
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        if (!alive.current) return;
        const s = await getTestNotificationStatus({ id });
        if (!s.ok || !s.data) continue;
        const d = s.data;
        if (d.status === "sent") {
          setTest({
            text: `Odesláno na ${d.devices ?? 1} ${d.devices === 1 ? "zařízení" : "zařízení"}. Mělo by se objevit během několika sekund.`,
            tone: "success",
          });
          return;
        }
        if (d.status === "skipped" || d.status === "failed") {
          setTest({
            text: `Neodesláno: ${REASON_LABEL[d.reason ?? ""] ?? d.error ?? "neznámý důvod"}.`,
            tone: d.status === "failed" ? "error" : "warning",
          });
          return;
        }
        if (d.status === "retry")
          setTest({
            text: "Push služba je dočasně nedostupná, systém to zkusí znovu.",
            tone: "warning",
          });
      }
      setTest({
        text: "Upozornění stále čeká ve frontě. Zkontrolujte, že běží služba worker (správce: docs/NOTIFICATIONS.md, oddíl „Push nechodí“).",
        tone: "warning",
      });
    } catch (e) {
      setTest(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  if (!pushEnabled)
    return (
      <FormSection title="Upozornění v telefonu" icon={<BellOff />}>
        <p className="text-muted" data-testid="push-disabled">
          Push upozornění tento systém zatím nemá zapnutá. Správce je zapne v nastavení serveru.
          Zvoneček v aplikaci (Inbox) funguje i tak.
        </p>
      </FormSection>
    );

  if (!support || devices === null)
    return (
      <FormSection title="Upozornění v tomto zařízení" icon={<Bell />} aria-busy="true">
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-8 w-48" />
        </div>
      </FormSection>
    );

  const subscribed = !!endpoint && devices.some((d) => d.current);
  const denied = support.state === "ready" && support.permission === "denied";

  return (
    <div className="space-y-6">
      {support.state === "unsupported" ? (
        <FormSection
          title="Upozornění v tomto zařízení"
          icon={<BellOff />}
          badge={<Chip>Nepodporováno</Chip>}
        >
          {support.reason === "ios-needs-install" ? (
            <div className="space-y-3" data-testid="push-needs-install">
              <Notice tone="info" title="Na iPhonu a iPadu nejdřív přidejte aplikaci na plochu">
                Apple povoluje upozornění jen aplikacím přidaným na plochu (iOS 16.4 a novější).
                Postup:
              </Notice>
              <PushHelp platform="ios" topic="install" />
            </div>
          ) : (
            <p className="text-muted" data-testid="push-unsupported">
              Tento prohlížeč upozornění v telefonu nepodporuje. Použijte aktuální Chrome, Edge,
              Firefox nebo Safari. Zvoneček v aplikaci funguje v každém prohlížeči.
            </p>
          )}
        </FormSection>
      ) : (
        <FormSection
          title="Upozornění v tomto zařízení"
          icon={<BellRing />}
          description="Pozvánky, termíny, schvalování a další upozornění vám přijdou i do zavřené aplikace. Zapíná se zvlášť v každém zařízení."
          badge={
            denied ? (
              <Chip color="red" dot>
                Zablokováno v prohlížeči
              </Chip>
            ) : subscribed ? (
              <Chip color="green" dot>
                Zapnuto
              </Chip>
            ) : (
              <Chip dot>Vypnuto</Chip>
            )
          }
          footer={
            denied ? undefined : (
              <>
                {subscribed && (
                  <Button variant="ghost" loading={busy} onClick={() => void sendTest()}>
                    Pošli mi zkušební upozornění
                  </Button>
                )}
                {subscribed ? (
                  <Button variant="secondary" loading={busy} onClick={() => void disable()}>
                    Vypnout v tomto zařízení
                  </Button>
                ) : (
                  <Button variant="primary" loading={busy} onClick={() => void enable()}>
                    Zapnout v tomto zařízení
                  </Button>
                )}
              </>
            )
          }
        >
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-base" data-testid="push-state">
              <Smartphone className="size-4 text-faint" aria-hidden />
              <span>
                V tomto zařízení:{" "}
                <strong>{subscribed ? "zapnuto" : denied ? "zablokováno" : "vypnuto"}</strong>
                <span className="text-muted"> · zařízení celkem: {devices.length}</span>
              </span>
            </p>
            {denied && (
              <Notice tone="warning" title="Upozornění jsou v prohlížeči zablokovaná">
                <PushHelp platform={platform} topic="denied" />
              </Notice>
            )}
            {!denied && platform === "android" && !subscribed && (
              <p className="text-sm text-muted">
                Po klepnutí na Zapnout prohlížeč požádá o povolení oznámení; vyberte Povolit.
              </p>
            )}
            {test && <Notice tone={test.tone}>{test.text}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </FormSection>
      )}

      <FormSection
        title="Moje zařízení"
        icon={<Smartphone />}
        description="Zařízení, kam vám chodí upozornění. Nepoužívané zařízení tu odhlaste."
        flush
      >
        {devices.length === 0 ? (
          <p className="px-5 pb-5 text-muted" data-testid="devices-empty">
            Zatím žádné zařízení nemá upozornění zapnutá.
          </p>
        ) : (
          <ul className="divide-y divide-line border-t border-line" data-testid="devices-list">
            {devices.map((d) => {
              const I = ICON[d.device];
              return (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <I className="size-5 shrink-0 text-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {d.label}
                      {d.current && <Chip color="blue">Toto zařízení</Chip>}
                      {d.failing && <Chip color="orange">Poslední odeslání selhalo</Chip>}
                    </p>
                    <p className="text-sm text-muted">
                      Zapnuto {when(d.createdAt)}
                      {d.lastSentAt
                        ? ` · naposledy odesláno ${when(d.lastSentAt)}`
                        : " · zatím nic neodesláno"}
                    </p>
                  </div>
                  <IconButton
                    label={`Odhlásit zařízení ${d.label}`}
                    variant="ghost"
                    onClick={() => setRemove(d)}
                  >
                    <Trash2 />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>

      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Odhlásit zařízení?"
        description={
          remove
            ? `${remove.label} přestane dostávat upozornění. Znovu je zapnete v Nastavení → Upozornění v tom zařízení.`
            : ""
        }
        confirmLabel="Odhlásit"
        danger
        onConfirm={async () => {
          if (!remove) return;
          const r = await removeMyDevice({ id: remove.id });
          if (!r.ok) errorToast(r.error);
          else {
            if (remove.current) await disablePush().catch(() => {});
            successToast("Zařízení bylo odhlášeno.");
          }
          setRemove(null);
          await refresh();
        }}
      />
    </div>
  );
}
