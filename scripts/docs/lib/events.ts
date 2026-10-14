import ts from "typescript";
import {
  forEachNode,
  getProp,
  leadingJsdoc,
  parseFile,
  propName,
  sourceFiles,
  stringLiteral,
  summary,
} from "./corpus";

/** Upozornění (`createNotifications`), která kód vytváří: druh (`kind`) a soubory, kde vznikají. */
export type NotificationKind = { kind: string; files: string[] };

/**
 * Druhy upozornění: objektové literály, které mají zároveň `userId`, `kind` (řetězcový literál) a `title`.
 * Je to tvar `NewNotification`, takže jiný kód ho prakticky nevytváří.
 */
export function notificationKinds(): NotificationKind[] {
  const map = new Map<string, Set<string>>();
  for (const file of sourceFiles()) {
    const sf = parseFile(file);
    forEachNode(sf, (n) => {
      if (!ts.isObjectLiteralExpression(n)) return;
      const names = new Set(
        n.properties.map((p) =>
          ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)
            ? propName(p.name)
            : undefined,
        ),
      );
      if (!names.has("userId") || !names.has("kind") || !names.has("title")) return;
      const kind = stringLiteral(getProp(n, "kind"));
      if (!kind) return;
      const set = map.get(kind) ?? new Set<string>();
      set.add(file);
      map.set(kind, set);
    });
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([kind, files]) => ({ kind, files: [...files].sort() }));
}

/** Událost pro rozšíření klienta (`EventMap`) a místa, odkud se oznamuje. */
export type ExtensionEvent = { name: string; type: string; doc: string; emittedIn: string[] };

export function extensionEvents(): ExtensionEvent[] {
  const file = "packages/core/src/extensions/types.ts";
  const sf = parseFile(file);
  const events: ExtensionEvent[] = [];
  forEachNode(sf, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === "EventMap") {
      for (const m of n.members) {
        if (!ts.isPropertySignature(m)) continue;
        const name = propName(m.name);
        if (name)
          events.push({
            name,
            type: m.type ? m.type.getText(sf).replace(/\s+/g, " ") : "",
            doc: summary(leadingJsdoc(sf, m)),
            emittedIn: [],
          });
      }
    }
  });
  const byName = new Map(events.map((e) => [e.name, e]));
  for (const f of sourceFiles()) {
    const s = parseFile(f);
    forEachNode(s, (n) => {
      if (!ts.isCallExpression(n)) return;
      const callee = ts.isIdentifier(n.expression)
        ? n.expression.text
        : ts.isPropertyAccessExpression(n.expression)
          ? n.expression.name.text
          : "";
      if (callee !== "emit" && callee !== "emitEvent") return;
      const name = stringLiteral(n.arguments[0]);
      const ev = name ? byName.get(name) : undefined;
      if (ev && !ev.emittedIn.includes(f)) ev.emittedIn.push(f);
    });
  }
  for (const e of events) e.emittedIn.sort();
  return events;
}
