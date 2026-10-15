import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "ukoly",
  name: "Úkoly a poznámky",
  description:
    "Úkoly (včetně hovorů, schůzek a termínů) s rychlým zadáním, podúkoly a poznámky s formátovaným textem navázané na obchody, klienty, kontakty a zakázky.",
  icon: "check-square",
  nav: [
    {
      label: "Moje úkoly",
      href: "/ukoly",
      icon: "check-square",
      permission: "ukoly.read",
      group: "Práce",
      order: 10,
      bottom: true,
    },
  ],
  pages: [
    { path: "/ukoly", title: "Moje úkoly", permission: "ukoly.read" },
    { path: "/ukoly/typy", title: "Typy aktivit", permission: "ukoly.types" },
    // samostatné poznámky: bez položky v navigaci (R-23), otevírá se z Cmd+K
    { path: "/poznamky/samostatne", title: "Poznámky", permission: "ukoly.read" },
  ],
  entities: ["task", "note", "task_type"],
  permissions: [
    {
      key: "ukoly.read",
      label: "Vidí úkoly a poznámky",
      description: "Rozsah „jen moje“ = jen přidělené a vlastní",
    },
    { key: "ukoly.create", label: "Zakládá úkoly a poznámky" },
    { key: "ukoly.write", label: "Upravuje úkoly a poznámky" },
    {
      key: "ukoly.delete",
      label: "Maže úkoly a poznámky",
      description: "Do koše; obnovit smí každý své",
    },
    { key: "ukoly.types", label: "Spravuje typy úkolů" },
  ],
});
