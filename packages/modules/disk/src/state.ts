/*
  Čistá logika modulu „disk“ bez databáze: stavový automat požadavků, vypršení po 10 minutách, rozhodnutí, co udělat
  se složkou klienta při změně jeho stavu, a model tlačítka „Otevřít Disk“ (DRV-02, DRV-05). Používá server i UI.
*/
import type { ClientStatus, DriveState } from "@rebar/core/contracts";
import {
  DRIVE_TIMEOUT_MINUTES,
  type DriveFolderInfo,
  type DriveRequestKind,
  type DriveRequestState,
} from "./types";

/* ------------------------------------------------------------------ stavový automat požadavku */

/** Co se s požadavkem může stát: odeslán do n8n, odpověď n8n (ok/chyba), vypršel čas, doručení do n8n selhalo. */
export type RequestSignal = "delivered" | "ok" | "error" | "timeout" | "delivery_failed";

/** Požadavek ještě čeká na výsledek (tlačítko ukazuje „Vytváří se…“). */
export const isOpenState = (s: DriveRequestState): boolean => s === "pending" || s === "sent";
/** Požadavek skončil neúspěchem (tlačítko ukazuje „Zkusit znovu“). */
export const isFailedState = (s: DriveRequestState): s is "error" | "timeout" =>
  s === "error" || s === "timeout";

/**
 * Stavový automat požadavku:
 * `pending → sent` (událost doručena n8n), `pending|sent → done|error|timeout`, `error|timeout → done|error`
 * (pozdní odpověď n8n po vypršení času stále platí). `done` je konečný: pozdější signál ho nemění, takže opakovaná
 * nebo opožděná chyba nikdy nepřepíše hotovou složku.
 */
export function applyRequestSignal(
  state: DriveRequestState,
  signal: RequestSignal,
): { state: DriveRequestState; changed: boolean } {
  const next = ((): DriveRequestState => {
    if (state === "done") return "done";
    switch (signal) {
      case "delivered":
        return state === "pending" ? "sent" : state;
      case "ok":
        return "done";
      case "error":
      case "delivery_failed":
        // doručení do n8n selhalo, až když čekáme na odpověď: platí chyba; pozdní chyba po vypršení času ji upřesní
        return isOpenState(state) || state === "timeout" || state === "error" ? "error" : state;
      case "timeout":
        return isOpenState(state) ? "timeout" : state;
    }
  })();
  return { state: next, changed: next !== state };
}

/**
 * Vypršela lhůta na odpověď? Čas se počítá od odeslání události (`sentAt`); požadavek, který čeká na jiný
 * (`blockedBy`), ještě neodešel, a proto nevyprší.
 */
export function isOverdue(
  req: {
    state: DriveRequestState;
    requestedAt: Date;
    sentAt: Date | null;
    blockedBy: string | null;
  },
  now: Date = new Date(),
  minutes: number = DRIVE_TIMEOUT_MINUTES,
): boolean {
  if (!isOpenState(req.state) || req.blockedBy) return false;
  const since = (req.sentAt ?? req.requestedAt).getTime();
  return now.getTime() - since > minutes * 60_000;
}

/* ------------------------------------------------------------------ odvození stavu složky */

/** Fakta o jednom záznamu, ze kterých se odvozuje stav složky (načtená z tabulek disku). */
export type FolderFacts = {
  /** Existuje složka (`drive_folder` s prázdným podklíčem). */
  hasFolder: boolean;
  /** Je právě otevřený požadavek na založení složky (čeká nebo odešel). */
  createOpen: boolean;
  /** Poslední požadavek na založení složky, i hotový. */
  latestCreate: { state: DriveRequestState } | null;
};

/**
 * Stav složky záznamu pro uživatele: existující složka je vždy `ready` (i když se pozdější úprava nepovedla, nepřijdeš
 * o odkaz); bez složky rozhoduje poslední požadavek na založení.
 */
export function deriveFolderState(f: FolderFacts): DriveState {
  if (f.hasFolder) return "ready";
  if (f.createOpen) return "pending";
  const s = f.latestCreate?.state;
  if (!s) return "none";
  if (s === "error") return "error";
  if (s === "timeout") return "timeout";
  // `done` bez uložené složky nastane jen při chybě v odpovědi; zpracování callbacku to hlásí jako chybu
  return s === "done" ? "error" : "pending";
}

/* ------------------------------------------------------------------ co dělat při změně stavu klienta */

/** Fakta o složce klienta v okamžiku změny stavu. */
export type ClientFolderFacts = {
  /** Složka klienta existuje, nebo se právě zakládá (otevřený požadavek). */
  known: boolean;
  /**
   * Složka je (nebo bude, po otevřených požadavcích) v Archivu. Počítá s frontou: otevřený požadavek na archivaci
   * znamená „bude archivovaná“, otevřená obnova „bude obnovená“.
   */
  archived: boolean;
};

/** Co se má udělat se složkou klienta. */
export type ClientFolderAction = "create" | "archive" | "restore" | "none";

/**
 * Pravidla DRV-02 pro změnu stavu klienta (`client.status_changed`):
 * - nový stav Lead nebo Aktivní a složka není → založit (u Aktivního i pro návrat bez složky);
 * - Bývalý → přesunout do Archivu (jen existující složku);
 * - návrat z Bývalého (nebo jakýkoli jiný stav, když je složka archivní) → vrátit z Archivu;
 * - Pozastavený a zrušený stav → nic.
 * Soukromý klient složku sám nezakládá (R-13): `isPrivate` zakáže jen `create`; složka založená ručně se archivuje
 * a obnovuje jako každá jiná.
 */
export function planClientFolder(input: {
  /** Nový stav klienta (`null` = stav zrušen). Předchozí stav nerozhoduje, rozhoduje stav složky. */
  to: ClientStatus | null;
  isPrivate: boolean;
  folder: ClientFolderFacts;
}): ClientFolderAction {
  const { to, isPrivate, folder } = input;
  if (to === null) return "none";
  if (to === "former") return folder.known && !folder.archived ? "archive" : "none";
  if (folder.archived) return "restore";
  if (folder.known) return "none";
  if (isPrivate) return "none";
  // Pozastavený klient bez složky: nic (složka vznikne s Lead nebo Aktivním)
  return to === "lead" || to === "active" ? "create" : "none";
}

/* ------------------------------------------------------------------ tlačítko „Otevřít Disk“ */

/** Druh tlačítka (DRV-05). */
export type DriveButtonKind = "open" | "wait" | "retry" | "create";

/** Co má tlačítko zobrazit a udělat. */
export type DriveButtonModel = {
  kind: DriveButtonKind;
  /** „Otevřít Disk“, „Vytváří se…“, „Zkusit znovu“, „Vytvořit složku“. */
  label: string;
  /** Odkaz (jen `open`): otevře se v nové kartě. */
  href: string | null;
  /** Tlačítko nejde stisknout (probíhá zakládání, nebo chybí oprávnění). */
  disabled: boolean;
  /** Před založením složky musí uživatel potvrdit varování o soukromém záznamu. */
  needsPrivateWarning: boolean;
  /** Vedle tlačítka je upozornění na neúspěšnou úpravu existující složky (nabídka „Zkusit znovu“). */
  showIssue: boolean;
};

/** Popisky tlačítka podle spec 00 („Tlačítko Otevřít Disk“). */
export const DRIVE_BUTTON_LABEL: Record<DriveButtonKind, string> = {
  open: "Otevřít Disk",
  wait: "Vytváří se…",
  retry: "Zkusit znovu",
  create: "Vytvořit složku",
};

/**
 * Model tlačítka podle stavu složky: existující složka → „Otevřít Disk“; zakládá se → „Vytváří se…“ (neaktivní);
 * chyba nebo 10 minut bez odpovědi → „Zkusit znovu“; klient složku zatím nemá → „Vytvořit složku“.
 * Bez oprávnění `disk.write` se akce (zkusit znovu, vytvořit) nabízí jako neaktivní.
 */
export function driveButtonModel(
  info: Pick<DriveFolderInfo, "state" | "url" | "isPrivate" | "issue">,
  canWrite: boolean,
): DriveButtonModel {
  const base = { href: null, needsPrivateWarning: false, showIssue: false } as const;
  switch (info.state) {
    case "ready":
      return {
        ...base,
        kind: "open",
        label: DRIVE_BUTTON_LABEL.open,
        href: info.url,
        disabled: !info.url,
        showIssue: info.issue !== null,
      };
    case "pending":
      return { ...base, kind: "wait", label: DRIVE_BUTTON_LABEL.wait, disabled: true };
    case "error":
    case "timeout":
      return { ...base, kind: "retry", label: DRIVE_BUTTON_LABEL.retry, disabled: !canWrite };
    case "none":
      return {
        ...base,
        kind: "create",
        label: DRIVE_BUTTON_LABEL.create,
        disabled: !canWrite,
        needsPrivateWarning: info.isPrivate,
      };
  }
}

/** Druhy požadavků, které zakládají kořenovou složku záznamu. */
export const CREATE_KINDS: readonly DriveRequestKind[] = ["client.create", "project.create"];
