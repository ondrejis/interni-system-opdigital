"use server";

import { toResult, type ActionResult } from "@rebar/core/actions";
import { captureError } from "@rebar/core/observability";
import {
  saveTerminalSettings,
  submitTerminalCommand,
  terminalTileSchema,
} from "@rebar/core/terminal";
import { z } from "zod";
import { defineAction, getCtx } from "./request";
import { getServices } from "./services";
import { getTerminalState } from "./terminal";

/*
  Server actions mobilního terminálu řemeslníka: odeslání zápisu z (offline) fronty a uložení nastavení správcem.
*/

const submitInput = z.object({
  /** Identifikátor zápisu z telefonu; server podle něj pozná opakované odeslání. */
  opId: z.uuid(),
  command: z.string().min(1).max(80),
  input: z.unknown(),
});

export type TerminalOpResponse = ActionResult<{ result: unknown; duplicate: boolean }>;

/**
 * Provede zápis z terminálu nejvýš jednou. Příkaz musí patřit dlaždici, kterou tento uživatel v terminálu vidí (zapnutý
 * modul, oprávnění role, dlaždice nevypnutá správcem); jinak ho server odmítne bez ohledu na to, co zobrazuje UI. Vlastní
 * oprávnění k datům hlídá příkaz jako vždy. Opakované odeslání téhož `opId` vrátí původní výsledek.
 */
export async function submitTerminalOp(
  raw: z.input<typeof submitInput>,
): Promise<TerminalOpResponse> {
  try {
    const ctx = await getCtx();
    if (!ctx)
      return {
        ok: false,
        code: "unauthenticated",
        error: "Přihlášení vypršelo. Přihlaste se znovu, zápisy v telefonu zůstanou uložené.",
      };
    const { opId, command, input } = submitInput.parse(raw);
    const { tiles } = await getTerminalState(ctx);
    const { collected, moduleDeps } = getServices();
    const out = await submitTerminalCommand(
      ctx,
      { opId, command, input },
      { tiles, commands: collected.commands, deps: moduleDeps },
    );
    return { ok: true, data: { result: out.result, duplicate: out.duplicate } };
  } catch (err) {
    return toResult(err, (e, info) => captureError(e, { errorId: info.errorId }));
  }
}

const settingsInput = z.object({
  roles: z.array(z.string().min(1)).nullable(),
  tiles: z.array(terminalTileSchema).nullable(),
  attendance: z
    .object({ requireJob: z.boolean(), allowJobChange: z.boolean(), showHours: z.boolean() })
    .nullable(),
  diary: z.object({ requirePhoto: z.boolean() }).nullable(),
});

/** Uloží nastavení terminálu (Nastavení → Terminál řemeslníka). Vyžaduje `settings.manage`. */
export const saveTerminalSettingsAction = defineAction({
  permission: "settings.manage",
  input: settingsInput,
  handler: async (ctx, i) => {
    await saveTerminalSettings(ctx, getServices().settings, i);
    return { saved: true };
  },
});
