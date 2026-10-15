import { ZodError, type ZodType, type z } from "zod";
import "../zod-locale";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

export type ActionOptions<S extends ZodType, R> = {
  /** Oprávnění (stačí kterékoli z uvedených). Bez něj akce vyžaduje jen přihlášení. */
  permission?: string | readonly string[];
  input: S;
  handler: (ctx: Ctx, input: z.output<S>) => Promise<R>;
};

export type ActionRunnerOptions = {
  /** Z požadavku (cookie) vyrobí kontext s aktérem; vrací `null`, když není nikdo přihlášen. */
  resolveCtx: () => Promise<Ctx | null>;
  /** Neočekávaná chyba (do error trackingu a logu); `errorId` je kód, který uživatel dostane v hlášce. */
  onError?: (err: unknown, info: { errorId: string }) => void;
};

/**
 * Továrna na server actions: každá akce projde stejným řetězcem — kontext, kontrola oprávnění,
 * validace vstupu Zodem, handler, převod chyb na čitelnou hlášku. Oprávnění se kontroluje
 * vždy, bez ohledu na to, co UI zobrazuje.
 */
export function makeActionRunner({ resolveCtx, onError }: ActionRunnerOptions) {
  return function defineAction<S extends ZodType, R>(opts: ActionOptions<S, R>) {
    return async (raw: z.input<S>): Promise<ActionResult<R>> => {
      try {
        const ctx = await resolveCtx();
        if (!ctx) throw new PermissionError("Nejste přihlášeni.");
        if (opts.permission) {
          const keys = [opts.permission].flat();
          if (!keys.some((k) => safeCan(ctx, k))) throw new PermissionError();
        }
        const input = opts.input.parse(raw);
        const data = await opts.handler(ctx, input);
        return { ok: true, data };
      } catch (err) {
        return toResult(err, onError);
      }
    };
  };
}

function safeCan(ctx: Ctx, key: string) {
  try {
    assertCan(ctx, key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Očekávané chyby databáze, které uživatel způsobí sám (duplicita, vazba na jiný záznam, mimo rozsah…), dostanou
 * konkrétní větu. Kód je SQLSTATE z PostgreSQL (driver ho nese v `code`, Drizzle ho obaluje do `cause`).
 */
const DB_MESSAGES: Record<string, string> = {
  "23505": "Takový záznam už existuje (hodnota, která má být jedinečná, se opakuje).",
  "23503":
    "Záznam souvisí s jinými záznamy (je použitý jinde nebo odkazuje na smazanou položku), proto akci nejde provést.",
  "23502": "Chybí povinný údaj.",
  "23514": "Zadaná hodnota je mimo povolený rozsah.",
  "22001": "Zadaný text je příliš dlouhý.",
  "22003": "Zadané číslo je příliš velké nebo malé.",
  "22P02": "Zadaná hodnota má neplatný tvar.",
  "22007": "Zadané datum nebo čas je neplatné.",
  "22008": "Zadané datum nebo čas je neplatné.",
  "40001": "Záznam mezitím změnil někdo jiný. Načtěte ho znovu a zkuste to ještě jednou.",
  "40P01": "Záznam právě upravuje někdo jiný. Zkuste to za chvíli znovu.",
  "55P03": "Záznam právě upravuje někdo jiný. Zkuste to za chvíli znovu.",
};

/** SQLSTATE chyby databáze (i obalené), jinak `undefined`. */
export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^(22|23|40|55)[0-9A-Z]{3}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Krátký kód neočekávané chyby: uživatel ho napíše podpoře, v logu se podle něj chyba najde. */
function newErrorId(): string {
  return `E-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/**
 * `instanceof` s pojistkou na jméno třídy: vývojový server a balíčky workspace mohou mít tutéž třídu chyby ve více
 * kopiích (jiné vrstvy svazku), a očekávaná chyba by pak vypadala jako neočekávaná a uživatel by nedostal její větu.
 */
function isKnown<T extends Error>(
  err: unknown,
  cls: abstract new (...args: never[]) => T,
  name: string,
): err is T {
  return err instanceof cls || (err instanceof Error && err.name === name);
}

export function toResult(
  err: unknown,
  onError?: (err: unknown, info: { errorId: string }) => void,
): { ok: false; error: string; code: string } {
  if (isKnown(err, PermissionError, "PermissionError"))
    return { ok: false, error: err.message, code: err.code };
  if (isKnown(err, NotFoundError, "NotFoundError"))
    return { ok: false, error: err.message, code: err.code };
  if (isKnown(err, UserError, "UserError"))
    return { ok: false, error: err.message, code: err.code };
  // soukromý záznam nejde přiřadit uživateli bez `private.read`: UI podle kódu nabídne „Zveřejnit a přiřadit“
  if (err instanceof Error && (err as { code?: unknown }).code === "private_assign")
    return { ok: false, error: err.message, code: "private_assign" };
  if (err instanceof ZodError)
    return { ok: false, error: err.issues[0]?.message ?? "Neplatná data.", code: "invalid_input" };
  const dbMessage = DB_MESSAGES[pgErrorCode(err) ?? ""];
  if (dbMessage) return { ok: false, error: dbMessage, code: "user_error" };
  const errorId = newErrorId();
  onError?.(err, { errorId });
  return {
    ok: false,
    error: `Něco se nepovedlo. Zkuste to prosím znovu. (Kód chyby: ${errorId})`,
    code: "internal",
  };
}
