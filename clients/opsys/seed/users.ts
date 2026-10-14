/**
 * Uživatelé demo dat podle rolí. Heslo je TESTOVACÍ hodnota jen pro lokální vývoj a demo data (není tajemství, produkční
 * instance demo data nikdy nenasazuje). Skutečný vlastník se zakládá z `OWNER_*` v `pnpm db:seed`.
 */
export const DEMO_PASSWORD = "Opsys-demo-2026";

export type DemoUserKey = "owner" | "partner" | "externista";

export type DemoUserDef = {
  key: DemoUserKey;
  name: string;
  email: string;
  /** Klíč role ze seedu klienta (`seed/index.ts`). */
  role: "owner" | "partner" | "externista";
  jobTitle: string;
  /** Hodinový náklad v haléřích. */
  hourlyCostMinor: number;
  phone: string;
};

export const DEMO_USERS: readonly DemoUserDef[] = [
  {
    key: "owner",
    name: "Demo Majitel",
    email: "majitel@demo.opsys.example",
    role: "owner",
    jobTitle: "Jednatel",
    hourlyCostMinor: 80000,
    phone: "+420 603 100 101",
  },
  {
    key: "partner",
    name: "Demo Partner",
    email: "partner@demo.opsys.example",
    role: "partner",
    jobTitle: "Obchod a konzultace",
    hourlyCostMinor: 80000,
    phone: "+420 603 100 102",
  },
  {
    key: "externista",
    name: "Demo Externista",
    email: "externista@demo.opsys.example",
    role: "externista",
    jobTitle: "Externí spolupracovník",
    hourlyCostMinor: 50000,
    phone: "+420 603 100 103",
  },
];
