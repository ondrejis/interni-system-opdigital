"use client";

import {
  EntityApiProvider,
  ModuleUiProvider,
  TerminalQueueProvider,
  TerminalShell,
  type QueuedOp,
  type SendResult,
  type TerminalNavItem,
} from "@rebar/ui";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { makeEntityApi } from "@/lib/entity-api";
import { MODULE_UI } from "@/modules-ui";
import { submitTerminalOp } from "@/server/terminal-actions";

type Props = {
  brand: { name: string; logoUrl: string | null };
  user: { id: string; name: string; roleName: string };
  terminalOnly: boolean;
  bottom: { key: string; label: string; icon: string }[];
  enabledModules: string[];
  permissions: string[];
  entityPaths: Record<string, string>;
  children: ReactNode;
};

/** Pokusy odeslat zápis z fronty přes server action; výsledek převádí na to, co fronta potřebuje vědět. */
async function send(op: QueuedOp): Promise<SendResult> {
  let r;
  try {
    r = await submitTerminalOp({ opId: op.opId, command: op.command, input: op.input });
  } catch (err) {
    // server action bez spojení vyhodí výjimku: zápis zůstane ve frontě a odešle se později
    return {
      kind: "retry",
      scope: "network",
      message: err instanceof Error ? err.message : "Bez připojení.",
    };
  }
  if (r.ok) return { kind: "ok", result: r.data.result, duplicate: r.data.duplicate };
  if (r.code === "unauthenticated") return { kind: "retry", scope: "network", message: r.error };
  if (r.code === "internal") return { kind: "retry", scope: "op", message: r.error };
  return { kind: "rejected", message: r.error };
}

export function TerminalFrame({
  brand,
  user,
  terminalOnly,
  bottom,
  enabledModules,
  permissions,
  entityPaths,
  children,
}: Props) {
  const pathname = usePathname();
  const api = useMemo(
    () => makeEntityApi({ id: user.id, name: user.name }, entityPaths),
    [user.id, user.name, entityPaths],
  );
  useEffect(() => {
    // Service worker nabídne při výpadku spojení stránku „Jste offline“ a umožní instalaci na plochu.
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  const nav: TerminalNavItem[] = [
    { id: "today", label: "Dnes", icon: "house", href: "/t" },
    ...bottom.map((t) => ({
      id: t.key,
      label: t.label,
      icon: t.icon,
      href: `/t/w/${t.key}`,
    })),
    { id: "more", label: "Více", icon: "more", href: "/t/vice" },
  ];
  return (
    <EntityApiProvider api={api}>
      <ModuleUiProvider all={MODULE_UI} enabled={enabledModules} permissions={permissions}>
        <TerminalQueueProvider userId={user.id} send={send}>
          <TerminalShell
            brand={brand}
            nav={nav}
            pathname={pathname}
            banner={
              terminalOnly ? null : (
                <p
                  data-testid="preview-banner"
                  className="bg-accent-soft px-4 py-2 text-center text-base text-accent"
                >
                  Náhled terminálu řemeslníka.{" "}
                  <a className="font-semibold underline" href="/">
                    Zpět do kanceláře
                  </a>
                </p>
              )
            }
          >
            {children}
          </TerminalShell>
        </TerminalQueueProvider>
      </ModuleUiProvider>
    </EntityApiProvider>
  );
}
