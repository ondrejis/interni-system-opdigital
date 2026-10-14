"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { errorToast, successToast } from "../components/toast";
import {
  createTerminalQueue,
  indexedDbOpStore,
  type QueuedOp,
  type SendResult,
  type SubmitOutcome,
  type TerminalQueue,
} from "./queue";

type Ctx = {
  queue: TerminalQueue | null;
  ops: QueuedOp[];
  online: boolean;
};
const QueueCtx = createContext<Ctx>({ queue: null, ops: [], online: true });

/** Odešle jeden zápis na server (server action aplikace); chyby převádí na `SendResult`. */
export type SendOp = (op: QueuedOp) => Promise<SendResult>;

/** Jedna fronta pro celý terminál; po každém potvrzeném zápisu zneplatní data, ať se obrazovky obnoví. */
export function TerminalQueueProvider({
  userId,
  send,
  children,
}: {
  userId: string;
  send: SendOp;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [online, setOnline] = useState(true);
  const queue = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createTerminalQueue({ owner: userId, store: indexedDbOpStore(), send }),
    // `send` je stabilní server action
    [userId],
  );

  useEffect(() => {
    if (!queue) return;
    const offSub = queue.subscribe(setOps);
    const offSent = queue.onSent(() => {
      void qc.invalidateQueries({ queryKey: ["command"] });
      void qc.invalidateQueries({ queryKey: ["entity"] });
    });
    const flush = () => void queue.flush(true);
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void queue.flush();
    };
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void queue.flush(), 30_000);
    void queue.flush();
    return () => {
      offSub();
      offSent();
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queue, qc]);

  return <QueueCtx.Provider value={{ queue, ops, online }}>{children}</QueueCtx.Provider>;
}

/** Fronta zápisů terminálu: odeslání zápisu (s ochranou proti ztrátě i duplicitě) a stav čekajících zápisů. */
export function useTerminalQueue() {
  const { queue, ops, online } = useContext(QueueCtx);
  return {
    online,
    ops,
    pending: ops.filter((o) => o.state === "pending"),
    conflicts: ops.filter((o) => o.state === "conflict"),
    queue,
    /**
     * Uloží a odešle zápis. Vrací výsledek; `report` ukáže člověku srozumitelné oznámení (potvrzeno, čeká na signál,
     * konflikt s českou hláškou).
     */
    async submit(p: Parameters<TerminalQueue["submit"]>[0]): Promise<SubmitOutcome> {
      if (!queue) return { status: "conflict", message: "Fronta zápisů není k dispozici." };
      return queue.submit(p);
    },
  };
}

/** Oznámení podle výsledku zápisu. Vrací `true`, když je zápis uložený (odeslaný, nebo bezpečně čeká na signál). */
export function reportOutcome(out: SubmitOutcome, done: string): boolean {
  if (out.status === "sent") {
    successToast(done);
    return true;
  }
  if (out.status === "queued") {
    successToast(`${done.replace(/\.$/, "")} – uloženo v telefonu, odešle se po připojení.`);
    return true;
  }
  errorToast(`${out.message} Zápis zůstal v telefonu (Více → Čekající zápisy).`);
  return false;
}
