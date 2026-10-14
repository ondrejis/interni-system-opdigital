import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORE_NOTIFICATION_EVENTS,
  collectNotificationEvents,
  validateEventDefs,
} from "@rebar/core/notifications";
import { ALL_MODULES } from "../apps/web/src/modules";

const root = path.resolve(import.meta.dirname, "..");
const doc = fs.readFileSync(path.join(root, "docs/NOTIFICATIONS.md"), "utf8");

const events = [...CORE_NOTIFICATION_EVENTS, ...collectNotificationEvents(ALL_MODULES)].filter(
  (e) => !e.internal,
);

describe("katalog upozornění a dokumentace", () => {
  it("všechny události (jádro i moduly) jsou platné a mají unikátní klíč", () => {
    expect(
      validateEventDefs([...CORE_NOTIFICATION_EVENTS, ...collectNotificationEvents(ALL_MODULES)]),
    ).toEqual([]);
  });

  it("tabulka událostí v docs/NOTIFICATIONS.md odpovídá katalogu v kódu (po přidání události ji doplň)", () => {
    const block = /<!-- katalog:start -->([\s\S]*?)<!-- katalog:end -->/.exec(doc)?.[1] ?? "";
    const documented = [...block.matchAll(/^\| `([a-z0-9_.]+)`\s*\|/gm)].map((m) => m[1]!).sort();
    expect(documented).toEqual(events.map((e) => e.key).sort());
  });

  it("každá událost má český popis, skupinu a odkaz začínající lomítkem", () => {
    for (const e of events) {
      expect(e.label.length, e.key).toBeGreaterThan(2);
      expect(e.description.length, e.key).toBeGreaterThan(10);
      expect(e.group.length, e.key).toBeGreaterThan(1);
      expect(e.template.url.startsWith("/"), e.key).toBe(true);
    }
  });

  it("peníze v textech jsou označené: parametr s „cost“, „amount“, „price“ nebo „total“ v názvu je citlivý", () => {
    const bad = events.flatMap((e) =>
      Object.entries(e.params)
        .filter(([name, p]) => /amount|price|cost|total/i.test(name) && !p.sensitive)
        .map(([name]) => `${e.key}.${name}`),
    );
    expect(bad).toEqual([]);
  });
});
