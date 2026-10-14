import { and, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getLookup } from "@rebar/core/config-data";
import { createRecord, resolveEntity } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { can, inTx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { findContactDuplicates, normalizeEmail, normalizePhone } from "../deals/duplicates";
import { inquiry } from "../../schema";
import { IMPORT_MAX_ROWS, PHONE_RE, defuseCell, parseMoneyMinor, stripControlChars } from "./csv";

/** Jeden řádek importu: hodnoty z namapovaných sloupců jako text a číslo řádku v souboru (pro hlášení chyb). */
const importRow = z.object({
  line: z.number().int().min(1),
  name: z.string().max(400).optional(),
  email: z.string().max(400).optional(),
  phone: z.string().max(100).optional(),
  company: z.string().max(400).optional(),
  title: z.string().max(400).optional(),
  message: z.string().max(10_000).optional(),
  source: z.string().max(100).optional(),
  sourceChannel: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  value: z.string().max(60).optional(),
});
/** Jeden řádek importu před kontrolou (hodnoty z namapovaných sloupců jako text). */
export type ImportRow = z.input<typeof importRow>;

export const importInput = z.object({
  rows: z
    .array(importRow)
    .min(1, "Soubor neobsahuje žádný řádek.")
    .max(IMPORT_MAX_ROWS, `Najednou jde importovat nejvýš ${IMPORT_MAX_ROWS} řádků.`),
  /** `skip` = řádky, které už jsou v systému (stejný e-mail nebo telefon), se přeskočí; `create` = založí se i tak. */
  duplicates: z.enum(["skip", "create"]).default("skip"),
  /** Jen zkontroluje a vrátí výsledek po řádcích, nic nezapíše. */
  dryRun: z.boolean().default(false),
});

/** Výsledek kontroly nebo zápisu jednoho řádku importu. */
export type ImportRowResult = {
  line: number;
  status: "ok" | "duplicate" | "error";
  /** Věta pro uživatele (důvod chyby nebo duplicity, upozornění u hotového řádku). */
  message?: string;
  /** Id založené poptávky (jen při skutečném importu). */
  id?: string;
};
/** Souhrn importu a výsledky po řádcích. */
export type ImportResult = {
  dryRun: boolean;
  results: ImportRowResult[];
  created: number;
  duplicates: number;
  errors: number;
};

type Clean = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title: string;
  message?: string;
  source?: string;
  sourceChannel?: string;
  campaign?: string;
  valueMinor?: number;
};

/** Zkontroluje a očistí jeden řádek (ochrana před CSV injection, tvar e-mailu, telefonu a částky). Chybu vrací jako větu. */
export function cleanRow(r: ImportRow, sources: ReadonlySet<string>): Clean | string {
  const text = (v: string | undefined, max: number) => {
    const t = defuseCell(v ?? "");
    return t ? t.slice(0, max) : undefined;
  };
  const name = text(r.name, 200);
  const company = text(r.company, 200);
  const emailRaw = (r.email ?? "").trim();
  const phoneRaw = stripControlChars(r.phone ?? "", false).trim();
  if (!name && !company && !emailRaw && !phoneRaw)
    return "Řádek nemá jméno, firmu, e-mail ani telefon.";
  let email: string | undefined;
  if (emailRaw) {
    const parsed = z.email().safeParse(emailRaw);
    if (!parsed.success) return `E-mail „${emailRaw.slice(0, 60)}“ nemá správný tvar.`;
    email = parsed.data.toLowerCase();
  }
  let phone: string | undefined;
  if (phoneRaw) {
    if (!PHONE_RE.test(phoneRaw)) return `Telefon „${phoneRaw.slice(0, 40)}“ nemá správný tvar.`;
    phone = phoneRaw.slice(0, 40);
  }
  let valueMinor: number | undefined;
  if (r.value && r.value.trim()) {
    const m = parseMoneyMinor(r.value);
    if (m === null) return `Odhad hodnoty „${r.value.slice(0, 30)}“ není částka.`;
    valueMinor = m;
  }
  const srcRaw = (r.source ?? "").trim().toLowerCase();
  const message = text(r.message, 5000);
  const title = text(r.title, 200) ?? `Poptávka: ${company ?? name ?? email ?? phone}`;
  const sourceChannel = text(r.sourceChannel, 160);
  const campaign = text(r.campaign, 120);
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(company ? { company } : {}),
    title,
    ...(message ? { message } : {}),
    // zdroj mimo číselník se ignoruje, výchozí je „jiný“ (ruční import)
    source: sources.has(srcRaw) ? srcRaw : "other",
    ...(sourceChannel ? { sourceChannel } : {}),
    ...(campaign ? { campaign } : {}),
    ...(valueMinor !== undefined ? { valueMinor } : {}),
  };
}

/** Existující poptávka se stejným e-mailem nebo telefonem (nesmazaná, v jakémkoli stavu). */
async function existingInquiry(ctx: Ctx, email?: string, phone?: string) {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  if (!e && !p) return null;
  const digits = sql`right(regexp_replace(coalesce(${inquiry.contactPhone}, ''), '\\D', '', 'g'), 9)`;
  const [hit] = await ctx.db
    .select({ id: inquiry.id, title: inquiry.title })
    .from(inquiry)
    .where(
      and(
        isNull(inquiry.deletedAt),
        or(
          e ? sql`lower(trim(${inquiry.contactEmail})) = ${e}` : undefined,
          p ? sql`${digits} = ${p}` : undefined,
        ),
      ),
    )
    .limit(1);
  return hit ?? null;
}

/**
 * Import poptávek z CSV (soubor čte a mapuje prohlížeč, server přijme řádky po sloupcích). Každý řádek se zkontroluje zvlášť:
 * nesprávný tvar e-mailu, telefonu nebo částky, duplicita v souboru i v systému (existující poptávka se stejným e-mailem nebo
 * telefonem). Platné řádky se zapíšou, vadné se vrátí s větou a číslem řádku; jeden špatný řádek ostatní nezastaví.
 * Poznámka k existujícím kontaktům (firma či osoba se stejným e-mailem) doprovází výsledek jako upozornění. `dryRun`
 * vrátí totéž bez zápisu (náhled před importem).
 */
export const importCommand = defineCommand({
  name: "crm.inbox.import",
  permission: "poptavky.write",
  input: importInput,
  handler: async (ctx, input, deps): Promise<ImportResult> => {
    const sources = new Set((await getLookup(ctx.db, "inquiry.source")).map((s) => s.value));
    const inquiryDef = deps.registry.get("inquiry");
    if (!inquiryDef) throw new UserError("Modul poptávek není zapnutý.");
    const E = await resolveEntity(ctx.db, inquiryDef);
    const seenEmail = new Map<string, number>();
    const seenPhone = new Map<string, number>();
    const results: ImportRowResult[] = [];
    let created = 0;

    for (const raw of input.rows) {
      const clean = cleanRow(raw, sources);
      if (typeof clean === "string") {
        results.push({ line: raw.line, status: "error", message: clean });
        continue;
      }
      const e = normalizeEmail(clean.email);
      const p = normalizePhone(clean.phone);
      const inFile = (e && seenEmail.get(e)) || (p && seenPhone.get(p)) || 0;
      let dupe: string | null = inFile ? `Stejný kontakt je už na řádku ${inFile} souboru.` : null;
      if (!dupe) {
        const ex = await existingInquiry(ctx, clean.email, clean.phone);
        if (ex) dupe = `Poptávka „${ex.title}“ se stejným e-mailem nebo telefonem už existuje.`;
      }
      if (e) seenEmail.set(e, seenEmail.get(e) ?? raw.line);
      if (p) seenPhone.set(p, seenPhone.get(p) ?? raw.line);
      if (dupe && input.duplicates === "skip") {
        results.push({ line: raw.line, status: "duplicate", message: dupe });
        continue;
      }
      // upozornění na existující kontakt (nebrání importu, při kvalifikaci se nabídne jeho použití)
      let note = dupe ?? undefined;
      if (can(ctx, "kontakty.read")) {
        const found = await findContactDuplicates(ctx, { email: clean.email, phone: clean.phone });
        const hit = found.companies[0]?.name ?? found.persons[0]?.name;
        if (hit) note = [note, `V kontaktech už je „${hit}“.`].filter(Boolean).join(" ");
      }
      if (input.dryRun) {
        results.push({ line: raw.line, status: "ok", ...(note ? { message: note } : {}) });
        created += 1;
        continue;
      }
      try {
        // vlastní transakce (bod uložení): chyba jednoho řádku neshodí ostatní
        const row = await inTx(ctx, (c) =>
          createRecord(c, deps.registry, E, {
            title: clean.title,
            ...(clean.name ? { contactName: clean.name } : {}),
            ...(clean.email ? { contactEmail: clean.email } : {}),
            ...(clean.phone ? { contactPhone: clean.phone } : {}),
            ...(clean.company ? { companyName: clean.company } : {}),
            ...(clean.message ? { message: clean.message } : {}),
            ...(clean.source ? { source: clean.source } : {}),
            ...(clean.sourceChannel ? { sourceChannel: clean.sourceChannel } : {}),
            ...(clean.campaign ? { campaign: clean.campaign } : {}),
            ...(clean.valueMinor !== undefined ? { value: clean.valueMinor } : {}),
          }),
        );
        results.push({
          line: raw.line,
          status: "ok",
          id: row.row.id,
          ...(note ? { message: note } : {}),
        });
        created += 1;
      } catch (err) {
        results.push({
          line: raw.line,
          status: "error",
          message: err instanceof UserError ? err.message : "Řádek se nepodařilo uložit.",
        });
      }
    }
    return {
      dryRun: input.dryRun,
      results,
      created,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      errors: results.filter((r) => r.status === "error").length,
    };
  },
});
