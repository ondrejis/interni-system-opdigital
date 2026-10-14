/**
 * Demo uživatelé podle rolí. Hesla jsou TESTOVACÍ hodnoty jen pro ukázkového klienta „demo“ (nejsou tajemství,
 * stejná jsou v `clients/demo/README.md`). Produkční klienti je nikdy nepoužívají.
 */
export const DEMO_PASSWORD = "Demo-heslo-2026";

export type DemoUserKey =
  "owner" | "office" | "accountant" | "foreman1" | "foreman2" | "worker1" | "worker2";

export type DemoUserDef = {
  key: DemoUserKey;
  name: string;
  email: string;
  /** Klíč role z `DEFAULT_ROLES`. */
  role: "owner" | "office" | "accountant" | "foreman" | "worker";
  jobTitle: string;
  /** Hodinový náklad firmy v haléřích (docházka ho přenáší do nákladů zakázek). */
  hourlyCostMinor: number;
  phone: string;
};

export const DEMO_USERS: readonly DemoUserDef[] = [
  {
    key: "owner",
    name: "Tomáš Veselý",
    email: "majitel@demo-firma.example",
    role: "owner",
    jobTitle: "Jednatel",
    hourlyCostMinor: 65000,
    phone: "+420 603 100 101",
  },
  {
    key: "office",
    name: "Lucie Marešová",
    email: "kancelar@demo-firma.example",
    role: "office",
    jobTitle: "Obchod a administrativa",
    hourlyCostMinor: 42000,
    phone: "+420 603 100 102",
  },
  {
    key: "accountant",
    name: "Eva Němcová",
    email: "ucetni@demo-firma.example",
    role: "accountant",
    jobTitle: "Účetní",
    hourlyCostMinor: 38000,
    phone: "+420 603 100 107",
  },
  {
    key: "foreman1",
    name: "Pavel Kratochvíl",
    email: "mistr@demo-firma.example",
    role: "foreman",
    jobTitle: "Stavbyvedoucí",
    hourlyCostMinor: 52000,
    phone: "+420 603 100 103",
  },
  {
    key: "foreman2",
    name: "Radek Zeman",
    email: "mistr2@demo-firma.example",
    role: "foreman",
    jobTitle: "Mistr, interiéry",
    hourlyCostMinor: 48000,
    phone: "+420 603 100 104",
  },
  {
    key: "worker1",
    name: "Jiří Dvořáček",
    email: "monter@demo-firma.example",
    role: "worker",
    jobTitle: "Zedník",
    hourlyCostMinor: 34000,
    phone: "+420 603 100 105",
  },
  {
    key: "worker2",
    name: "Martin Holub",
    email: "monter2@demo-firma.example",
    role: "worker",
    jobTitle: "Montér, pomocník",
    hourlyCostMinor: 29000,
    phone: "+420 603 100 106",
  },
];
