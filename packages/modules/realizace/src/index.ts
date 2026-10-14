import { defineModule } from "@rebar/core/manifest";
import { REALIZACE_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "realizace",
  name: "Realizace",
  description:
    "Harmonogram v pracovních dnech s Ganttem, stavební deník s předvyplněním, předávací protokol s podpisem a vady.",
  icon: "hard-hat",
  dependsOn: ["zakazky"],
  nav: [
    {
      label: "Průběh zakázek",
      href: "/realizace",
      icon: "gantt",
      permission: "realizace.read",
      parent: "/zakazky",
    },
    {
      label: "Vady",
      href: "/realizace/vady",
      icon: "alert-triangle",
      permission: "realizace.read",
      parent: "/zakazky",
    },
  ],
  pages: [{ path: "/realizace", title: "Průběh zakázek", permission: "realizace.read" }],
  permissions: [
    { key: "realizace.read", label: "Vidí realizaci" },
    {
      key: "realizace.write",
      label: "Zapisuje realizaci",
      description: "Deník, předávací protokol, vady",
    },
  ],
  entities: ["defect"],
  notifications: REALIZACE_NOTIFICATIONS,
  terminalWidgets: [
    {
      key: "realizace.diary",
      label: "Deník",
      description: "Rychlý zápis do stavebního deníku dne s fotkami z místa.",
      icon: "clipboard-list",
      permission: "realizace.write",
      commands: ["realizace.terminal.note"],
      page: true,
    },
    {
      key: "realizace.report",
      label: "Závada a poznámka",
      description: "Hlášení závady nebo poznámka k dnešnímu dni na stavbě, s fotkou.",
      icon: "alert-triangle",
      permission: "realizace.write",
      commands: ["realizace.terminal.defect", "realizace.terminal.note"],
      page: true,
    },
  ],
  seed: {
    pipelines: [
      {
        entityType: "defect",
        key: "default",
        name: "Vady",
        stages: [
          { name: "Nahlášená", color: "red" },
          { name: "V řešení", color: "orange" },
          { name: "Opraveno", color: "green", kind: "done" },
          { name: "Uznáno bez opravy", color: "gray", kind: "done" },
          { name: "Zamítnuto", color: "gray", kind: "lost" },
        ],
      },
    ],
    lookups: [
      {
        key: "defect.severity",
        name: "Závažnost vady",
        items: [
          { value: "minor", label: "Drobná", color: "gray" },
          { value: "normal", label: "Běžná", color: "orange" },
          { value: "major", label: "Závažná", color: "red" },
        ],
      },
    ],
    series: [{ key: "realizace.predani", pattern: "PP-{YYYY}-{NNN}" }],
  },
});
