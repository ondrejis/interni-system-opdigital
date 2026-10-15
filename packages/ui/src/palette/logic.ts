/*
  Čistá logika Cmd+K (bez Reactu): seskupení nálezů, podtitulky, akce u nálezu, příkazy „Nový …“ a pořadí
  nejčastějších příkazů. Vykresluje ji `palette-host.tsx`.
*/

/** Nález hledání ze serveru (`SearchHit` z `@rebar/core/entities`; tvar je tu opsaný, aby UI nezávisel na serveru). */
export type PaletteHit = {
  entityType: string;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  label: string;
  labelMany: string;
  phone: string | null;
  email: string | null;
  driveFolderId: string | null;
  isPrivate: boolean;
};

/** Akce u nálezu bez otevření záznamu (HLE-06). */
export type HitAction =
  | { kind: "call"; value: string; href: string; label: string }
  | { kind: "copy"; value: string; label: string }
  | { kind: "mail"; value: string; href: string; label: string }
  | { kind: "drive"; href: string; label: string };

/** Telefon pro `tel:` (číslice a `+`). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Akce nálezu: zavolat, zkopírovat telefon, napsat e-mail, otevřít složku na Disku. */
export function hitActions(h: PaletteHit): HitAction[] {
  const out: HitAction[] = [];
  if (h.phone) {
    out.push({ kind: "call", value: h.phone, href: telHref(h.phone), label: `Zavolat ${h.phone}` });
    out.push({ kind: "copy", value: h.phone, label: `Zkopírovat telefon ${h.phone}` });
  }
  if (h.email)
    out.push({
      kind: "mail",
      value: h.email,
      href: `mailto:${h.email}`,
      label: `Napsat e-mail ${h.email}`,
    });
  if (h.driveFolderId)
    out.push({
      kind: "drive",
      href: `https://drive.google.com/drive/folders/${encodeURIComponent(h.driveFolderId)}`,
      label: "Otevřít Disk",
    });
  return out;
}

/** Podtitulek nálezu: podtitulek záznamu (firma, fáze…) a telefon, aby šel hned zavolat. */
export function hitSubtitle(h: PaletteHit): string {
  return [h.subtitle, h.phone].filter(Boolean).join(" · ");
}

/** Nálezy jednoho typu záznamu (skupina v paletě). */
export type HitGroup = { entityType: string; heading: string; hits: PaletteHit[] };

/** Nálezy seskupené podle typu záznamu; skupiny jdou v pořadí prvního nálezu (nejlepší shoda je nahoře). */
export function groupHits(hits: readonly PaletteHit[]): HitGroup[] {
  const groups = new Map<string, HitGroup>();
  for (const h of hits) {
    const g = groups.get(h.entityType) ?? {
      entityType: h.entityType,
      heading: h.labelMany,
      hits: [],
    };
    g.hits.push(h);
    groups.set(h.entityType, g);
  }
  return [...groups.values()];
}

/**
 * Pojmenování příkazů „Nový …“ podle klíče entity (HLE-05), když je modul sám nedeklaruje v `paletteActions`. Jen entity,
 * které se zakládají obecným formulářem (`?novy=1`); „Zapsat platbu“ a „Zapsat hodiny“ deklarují moduly samy
 * (platba se obecným formulářem zakládat nesmí).
 */
export const CREATE_COMMANDS: Record<string, { label: string; keywords: string }> = {
  deal: { label: "Nový obchod", keywords: "obchod příležitost lead nový přidat" },
  company: { label: "Nový klient", keywords: "klient firma organizace nový přidat" },
  person: { label: "Nový kontakt", keywords: "kontakt osoba člověk nový přidat" },
  job: { label: "Nová zakázka", keywords: "zakázka projekt nová přidat" },
  task: { label: "Nový úkol", keywords: "úkol todo hovor schůzka nový přidat" },
  note: { label: "Nová poznámka", keywords: "poznámka zápis nová přidat" },
};

/** Příkaz „Nový …“ pro entitu, nebo `null`, když se entita obecným příkazem nezakládá (řeší ji modul). */
export function createCommand(entityKey: string, _entityLabel: string) {
  return CREATE_COMMANDS[entityKey] ?? null;
}

/** Modulová akce pokrývá entitu, když míří na seznam entity (`/zakazky?novy=1` pokrývá `/zakazky`). */
export function coveredByModuleAction(listPath: string, hrefs: readonly (string | undefined)[]) {
  return hrefs.some(
    (h) => !!h && (h === listPath || h.startsWith(`${listPath}?`) || h.startsWith(`${listPath}/`)),
  );
}

/** Počty použití příkazů (id → počet). */
export type Usage = Record<string, number>;

/**
 * Nejčastější příkazy: podle počtu použití (sestupně), stejné počty podle pořadí v nabídce. Příkazy, které se ještě
 * nepoužily, doplní výchozí pořadí, takže nabídka není nikdy prázdná.
 */
export function topCommands<T extends { id: string }>(
  items: readonly T[],
  usage: Usage,
  n = 5,
): T[] {
  return items
    .map((item, i) => ({ item, i, c: usage[item.id] ?? 0 }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .slice(0, n)
    .map((x) => x.item);
}
