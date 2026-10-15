import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { inTx } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { createCompany, findCompanyByIco, findCompanyByName } from "./companies";
import { findPersonDuplicates } from "./duplicates";
import { normalizeEmail, normalizeIco, normalizePhoneE164, splitFullName } from "./normalize";
import { createPerson } from "./persons";
import { listPoints, setPersonPoints, type PointInput } from "./points";
import { person } from "./schema";

/** Vstup `upsertContactFromLead`: jméno a údaje z formuláře (Meta lead, web). */
export type LeadContactInput = {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  companyName?: string | undefined;
  ico?: string | undefined;
};

/** Výsledek: osoba a organizace (nebo `null`) a co z toho vzniklo nově. */
export type LeadContactResult = {
  personId: string;
  companyId: string | null;
  created: { person: boolean; company: boolean };
};

/**
 * Najde nebo založí kontakt a organizaci z leadu (REK, OBC). Organizace: podle IČO, jinak podle přesného názvu,
 * jinak se založí (jen z názvu nebo IČO) a **nemá `client_status`** (R-15: lead z reklamy nedělá klienta). Osoba:
 * podle e-mailu nebo telefonu (E.164, nezávisle na mezerách a předvolbě); nalezené osobě se doplní chybějící údaje
 * z leadu a chybějící organizace, jinak se založí. Volat v transakci volajícího (`inTx`), aby lead a obchod vznikly
 * atomicky; nic dalšího nekontroluje (oprávnění je na volajícím příkazu).
 */
export async function upsertContactFromLead(
  ctx: Ctx,
  input: LeadContactInput,
): Promise<LeadContactResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhoneE164(input.phone);
  const ico = normalizeIco(input.ico);
  const companyName = input.companyName?.trim();

  return inTx(ctx, async (c) => {
    let companyId: string | null = null;
    let companyCreated = false;
    if (ico) {
      const hit = await findCompanyByIco(c, ico);
      if (hit) companyId = hit.id;
    }
    if (!companyId && companyName) {
      const hit = await findCompanyByName(c, companyName);
      if (hit) companyId = hit.id;
    }
    if (!companyId && (companyName || ico)) {
      const made = await createCompany(c, {
        name: companyName || `Organizace ${ico}`,
        ico: ico ?? null,
      });
      companyId = made.id;
      companyCreated = true;
    }

    const leadPoints: PointInput[] = [
      ...(email ? [{ kind: "email" as const, value: input.email!.trim() }] : []),
      ...(phone ? [{ kind: "phone" as const, value: input.phone!.trim() }] : []),
    ];
    const dup = await findPersonDuplicates(c, {
      emails: email ? [email] : [],
      phones: phone ? [phone] : [],
    });
    if (dup.length) {
      const personId = dup[0]!.personId;
      // doplnit, co o osobě ještě nevíme (nový e-mail, telefon, organizace)
      const have = await listPoints(c.db, personId);
      const missing = leadPoints.filter(
        (p) =>
          !have.some(
            (h) =>
              h.kind === p.kind &&
              h.valueNorm === (p.kind === "email" ? email : phone),
          ),
      );
      if (missing.length)
        await setPersonPoints(
          c,
          personId,
          [...have.map((h) => ({ id: h.id, kind: h.kind, value: h.value, label: h.label, isPrimary: h.isPrimary })), ...missing],
          { audit: true },
        );
      if (companyId) {
        const [p] = await c.db
          .select({ primaryCompanyId: person.primaryCompanyId })
          .from(person)
          .where(and(eq(person.id, personId), isNull(person.deletedAt)));
        if (p && !p.primaryCompanyId) {
          await c.db
            .update(person)
            .set({ primaryCompanyId: companyId, updatedBy: c.actor.userId })
            .where(eq(person.id, personId));
          await recordAudit(c, {
            action: "update",
            entityType: "person",
            entityId: personId,
            summary: "Doplněna organizace z leadu",
            changes: [{ field: "Organizace", old: null, new: companyName ?? ico ?? null }],
          });
        }
      }
      return {
        personId,
        companyId: companyId ?? null,
        created: { person: false, company: companyCreated },
      };
    }

    const { firstName, lastName } = splitFullName(name || email || phone || "Neznámý kontakt");
    const made = await createPerson(c, {
      firstName,
      lastName: lastName || "Neznámý kontakt",
      companyId,
      points: leadPoints,
    });
    return { personId: made.id, companyId, created: { person: true, company: companyCreated } };
  });
}
