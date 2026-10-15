import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import {
  createCompanyQuick,
  createPersonQuick,
  findCompanyByIco,
  findCompanyByName,
  findContactDuplicates,
  splitFullName,
} from "@rebar/kontakty/api";
import type { CreatedDeal, QuickAddInput } from "../contract";
import { createDeal } from "./transitions";

/**
 * Rychlé založení (D §1.2 `quickAdd`): firma, kontakt a obchod v jedné transakci přes API kontaktů. Firma zadaná
 * jménem se hledá podle IČO, potom přesného názvu a teprve potom se založí (bez `client_status`: klientem se stane
 * výhrou). Kontakt zadaný jménem se hledá podle e-mailu a telefonu (duplicita = použije se existující osoba) a jinak
 * se založí u firmy. `created` říká, co vzniklo nově.
 */
export async function quickAdd(
  ctx: Ctx,
  deps: ModuleDeps,
  input: QuickAddInput & { services?: QuickAddInput["services"] },
): Promise<CreatedDeal> {
  return inTx(ctx, async (c) => {
    const created = { company: false, person: false };
    let companyId: string | null = null;
    let companyName: string | null = null;
    if (input.company) {
      if ("id" in input.company) companyId = input.company.id;
      else {
        companyName = input.company.name;
        const hit =
          (input.company.ico ? await findCompanyByIco(c, input.company.ico) : null) ??
          (await findCompanyByName(c, input.company.name));
        if (hit) companyId = hit.id;
        else {
          companyId = (
            await createCompanyQuick(c, {
              name: input.company.name,
              ...(input.company.ico ? { ico: input.company.ico } : {}),
              ...(input.ownerId ? { ownerId: input.ownerId } : {}),
            })
          ).id;
          created.company = true;
        }
      }
    }
    let personId: string | null = null;
    if (input.person) {
      if ("id" in input.person) personId = input.person.id;
      else {
        const dup = await findContactDuplicates(c, {
          ...(input.person.email ? { emails: [input.person.email] } : {}),
          ...(input.person.phone ? { phones: [input.person.phone] } : {}),
        });
        if (dup[0]) personId = dup[0].personId;
        else {
          const { firstName, lastName } = splitFullName(input.person.name);
          personId = (
            await createPersonQuick(c, {
              ...(firstName ? { firstName } : {}),
              lastName,
              ...(companyId ? { companyId } : {}),
              ...(input.person.email ? { email: input.person.email } : {}),
              ...(input.person.phone ? { phone: input.person.phone } : {}),
              ...(input.ownerId ? { ownerId: input.ownerId } : {}),
            })
          ).id;
          created.person = true;
        }
      }
    }
    const title = input.title?.trim() || companyName || null;
    if (!title) throw new UserError("Vyplňte název obchodu.");
    const out = await createDeal(c, deps, {
      title,
      companyId,
      personId,
      ownerId: input.ownerId ?? null,
      valueMinor: input.valueMinor ?? null,
      services: input.services ?? [],
      expectedCloseDate: input.expectedCloseDate ?? null,
      source: input.source ?? "manual",
      sourceDetail: input.sourceDetail ?? null,
      ...(input.stageId ? { stageId: input.stageId } : {}),
    });
    return { ...out, companyId, personId, created };
  });
}
