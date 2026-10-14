import type { RoleDef } from "../rbac/seed";

/**
 * Výchozí role pro stavební a řemeslné firmy (zadání §2). Klient je může v seedu upravit nebo nahradit;
 * po prvním založení je dál spravuje v administraci. Rozsah `own` = jen vlastní a přidělené záznamy.
 */
export const DEFAULT_ROLES: readonly RoleDef[] = [
  { key: "owner", name: "Majitel / vedení", description: "Vidí a smí všechno", isSystem: true },
  {
    key: "office",
    name: "Kancelář",
    description: "Obchod, příprava, administrativa",
    permissions: {
      "kontakty.read": "all",
      "kontakty.write": "all",
      "poptavky.read": "all",
      "poptavky.write": "all",
      "poptavky.convert": "all",
      "zakazky.read": "all",
      "zakazky.write": "all",
      "zakazky.economics": "all",
      "zakazky.budget": "all",
      "zakazky.approve": "all",
      "zakazky.share": "all",
      "realizace.read": "all",
      "realizace.write": "all",
      "fakturace.read": "all",
      "fakturace.write": "all",
      "fakturace.export": "all",
      "dochazka.own": "all",
      "dochazka.read": "all",
      "dochazka.approve": "all",
      "sklad.read": "all",
      "sklad.issue": "all",
      "sklad.write": "all",
      "sklad.inventory": "all",
      "stroje.read": "all",
      "stroje.log": "all",
      "stroje.write": "all",
      "kalendar.read": "all",
      "kalendar.write": "all",
      "kalendar.resources": "all",
      "tasks.read": "all",
      "tasks.assign": "all",
      "dashboards.write": "all",
      "exports.schedule": "all",
    },
  },
  {
    key: "foreman",
    name: "Mistr / stavbyvedoucí",
    description: "Své zakázky, tým, docházka a materiál na stavbě",
    permissions: {
      "kontakty.read": "all",
      "zakazky.read": "own",
      "zakazky.write": "own",
      "zakazky.approve": "own",
      "realizace.read": "own",
      "realizace.write": "own",
      "dochazka.own": "all",
      "dochazka.read": "own",
      "dochazka.approve": "own",
      "sklad.read": "all",
      "sklad.issue": "all",
      "stroje.read": "all",
      "stroje.log": "all",
      "kalendar.read": "all",
      "kalendar.write": "own",
      "tasks.assign": "all",
      "dashboards.write": "all",
    },
  },
  {
    key: "worker",
    name: "Montér / pracovník v terénu",
    description: "Své zakázky, docházka, fotky a deník z terénu",
    permissions: {
      "zakazky.read": "own",
      "realizace.read": "own",
      "realizace.write": "own",
      "dochazka.own": "all",
      "sklad.read": "all",
      "sklad.issue": "own",
      "stroje.read": "all",
      "stroje.log": "all",
      "kalendar.read": "own",
    },
  },
];

/**
 * Účetní: doklady a podklady pro účetnictví bez zakázkové ekonomiky. Není součástí `DEFAULT_ROLES` (ne každý klient
 * ji má); klient ji do seedu přidá (`roles: [...DEFAULT_ROLES, ACCOUNTANT_ROLE]`) a výchozí nástěnka „Účetní“ se jí pak založí.
 */
export const ACCOUNTANT_ROLE: RoleDef = {
  key: "accountant",
  name: "Účetní",
  description: "Faktury, splatnosti a podklady pro účetnictví",
  permissions: {
    "kontakty.read": "all",
    "zakazky.read": "all",
    "fakturace.read": "all",
    "fakturace.export": "all",
    "dashboards.write": "all",
    "exports.schedule": "all",
  },
};
