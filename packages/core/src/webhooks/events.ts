import { WEBHOOK_EVENTS } from "../contracts/events";

/*
  Výběr událostí, které endpoint odebírá. Seznam `webhook_endpoint.events` obsahuje přesné názvy (`deal.won`) nebo
  skupiny s hvězdičkou na konci (`deal.*`, `drive.*`). Endpoint dostane jen to, co si výslovně vybral: události
  `drive.*` tedy nikdy nepřijdou endpointu, který si zvolil jen obchody (D §2.2).
*/

/** Skupina událostí v nabídce (předpona před první tečkou). */
export type WebhookEventGroup = {
  /** Předpona (`deal`) a zároveň vzor celé skupiny (`deal.*`). */
  prefix: string;
  label: string;
  description?: string;
  events: { name: string; label: string }[];
};

const LABELS: Record<string, string> = {
  "deal.created": "Nový obchod",
  "deal.stage_changed": "Změna fáze obchodu",
  "deal.won": "Obchod vyhrán",
  "deal.lost": "Obchod prohrán",
  "client.status_changed": "Změna stavu klienta",
  "project.created": "Nová zakázka",
  "project.phase_changed": "Změna fáze zakázky",
  "project.completed": "Zakázka dokončena",
  "task.created": "Nový úkol",
  "task.completed": "Úkol dokončen",
  "payment.created": "Nová platba",
  "payment.paid": "Platba zaplacena",
  "drive.client.create": "Založit složky klienta",
  "drive.client.add_service": "Přidat službu klienta (složky)",
  "drive.client.rename": "Přejmenovat složky klienta",
  "drive.client.archive": "Archivovat složky klienta",
  "drive.client.restore": "Obnovit složky klienta z archivu",
  "drive.project.create": "Založit složky zakázky",
};

const GROUPS: Record<string, { label: string; description?: string }> = {
  deal: { label: "Obchody" },
  client: { label: "Klienti" },
  project: { label: "Zakázky" },
  task: { label: "Úkoly" },
  payment: { label: "Platby" },
  drive: {
    label: "Google Disk (složky)",
    description: "Pro workflow v n8n, které zakládá složky. Ostatní webhooky tyto události nedostávají.",
  },
};

/** Události nabízené v Nastavení, seskupené podle předpony, v pořadí katalogu `WEBHOOK_EVENTS`. */
export function webhookEventGroups(): WebhookEventGroup[] {
  const out: WebhookEventGroup[] = [];
  for (const name of WEBHOOK_EVENTS) {
    const prefix = name.split(".")[0]!;
    let group = out.find((g) => g.prefix === prefix);
    if (!group) {
      const meta = GROUPS[prefix];
      group = {
        prefix,
        label: meta?.label ?? prefix,
        ...(meta?.description ? { description: meta.description } : {}),
        events: [],
      };
      out.push(group);
    }
    group.events.push({ name, label: LABELS[name] ?? name });
  }
  return out;
}

/** Čitelný název události (pro seznamy doručení); neznámý název se vrací beze změny. */
export function webhookEventLabel(name: string): string {
  return name === "webhook.test" ? "Zkušební webhook" : (LABELS[name] ?? name);
}

/** Zda je vzor platný: přesný název z katalogu, nebo `skupina.*` odpovídající aspoň jedné události katalogu. */
export function isValidEventPattern(pattern: string): boolean {
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1); // včetně tečky
    return WEBHOOK_EVENTS.some((e) => e.startsWith(prefix));
  }
  return (WEBHOOK_EVENTS as readonly string[]).includes(pattern);
}

/** Zda některý ze vzorů (přesný název nebo `skupina.*`) odpovídá názvu události. */
export function matchesEvent(patterns: readonly string[], name: string): boolean {
  return patterns.some((p) => (p.endsWith(".*") ? name.startsWith(p.slice(0, -1)) : p === name));
}
