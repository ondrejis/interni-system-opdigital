import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "zakazky",
  name: "Zakázky",
  description:
    "Zakázky typu web, marketing a systémy: fáze, tým, šablony s úkoly a platbami, stav a termíny; zakládají se z vyhraných obchodů nebo ručně.",
  icon: "briefcase",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Zakázky",
      href: "/zakazky",
      icon: "briefcase",
      permission: "zakazky.read",
      group: "Realizace",
      order: 10,
    },
  ],
  permissions: [
    { key: "zakazky.read", label: "Vidí zakázky" },
    { key: "zakazky.create", label: "Zakládá zakázky" },
    { key: "zakazky.write", label: "Upravuje zakázky" },
    {
      key: "zakazky.delete",
      label: "Maže zakázky",
      description: "Do koše; obnovit smí každý své",
    },
    { key: "zakazky.export", label: "Exportuje zakázky" },
    { key: "zakazky.templates", label: "Spravuje šablony zakázek" },
    {
      key: "zakazky.finance",
      label: "Vidí hodnotu a finance zakázek",
      description: "Přechodné oprávnění z původního jádra; ceny zakázek řídí `finance.read`",
    },
  ],
  entities: ["job", "job_template"],
  seed: {
    series: [{ key: "zakazky.cislo", pattern: "Z-{YYYY}-{NNN}" }],
  },
});
