import type {
  ClientSnap,
  ClientStatus,
  DealSnap,
  MarketingStage,
  PaymentSnap,
  ProjectSnap,
  ServiceType,
  TaskSnap,
} from "./types";

/** Data událostí pro složky na Google Disku (`drive.*`); odesílají se n8n a v odpovědi se volá callback. */
export type DriveEventData = {
  requestId: string;
  client: { id: string; name: string; ico: string | null; folderId?: string | null };
  project?: {
    id: string;
    code: string;
    name: string;
    type: ServiceType;
    startDate: string | null;
    folderId?: string | null;
  };
  /** Strom složek z Nastavení → Google Disk. */
  structure: Record<string, unknown>;
  callbackUrl: string;
};

/**
 * Katalog doménových událostí OPSYS (D §2.2). Klíč je název události, hodnota payload `data`. Přidávat smí jen architekt;
 * události označené ve `WEBHOOK_EVENTS` odcházejí i jako webhooky (podepsané, viz C2).
 */
export type DomainEventMap = {
  "deal.created": { deal: DealSnap };
  "deal.stage_changed": {
    deal: DealSnap;
    fromStageId: string | null;
    toStageId: string;
    secondsInPrevious: number | null;
  };
  "deal.won": { deal: DealSnap; jobIds: string[] };
  "deal.lost": { deal: DealSnap; reason: string | null; note: string | null };
  "client.status_changed": {
    client: ClientSnap;
    from: ClientStatus | null;
    to: ClientStatus | null;
    reason?: string;
    endedOn?: string;
  };
  "client.renamed": { clientId: string; from: string; to: string };
  "client.service_added": { clientId: string; service: ServiceType };
  "project.created": { project: ProjectSnap };
  "project.phase_changed": {
    project: ProjectSnap;
    fromPhaseId: string | null;
    toPhaseId: string | null;
  };
  "project.phase_completed": {
    jobId: string;
    phaseId: string;
    name: string;
    role: "intro_evaluation" | "retainer" | null;
    type: ServiceType;
    marketingStage: MarketingStage | null;
    isLast: boolean;
  };
  "project.completed": {
    project: ProjectSnap;
    reason: "finished" | "retainer_ended" | "cancelled";
  };
  "task.created": { task: TaskSnap };
  "task.completed": { task: TaskSnap };
  /** Interní (bez webhooku): hrany změny úkolu pro kalendář (čas, řešitel, typ, smazání). */
  "task.changed": {
    taskId: string;
    before: Partial<TaskSnap> | null;
    after: Partial<TaskSnap> | null;
  };
  "payment.created": { payment: PaymentSnap };
  "payment.paid": { payment: PaymentSnap };
  "payment.status_changed": { paymentId: string; from: string; to: string };
  "visibility.changed": {
    entityType: string;
    id: string;
    isPrivate: boolean;
    cascaded: number;
  };
  "drive.client.create": DriveEventData;
  "drive.client.add_service": DriveEventData;
  "drive.client.rename": DriveEventData;
  "drive.client.archive": DriveEventData;
  "drive.client.restore": DriveEventData;
  "drive.project.create": DriveEventData;
};

/** Název doménové události. */
export type DomainEventName = keyof DomainEventMap;

/** Kdo událost způsobil. */
export type DomainActor = {
  kind: "user" | "system" | "n8n" | "google" | "meta" | "job";
  id: string | null;
  label?: string;
};

/** Záznam, ke kterému se událost vztahuje (`isPrivate` rozhoduje o webhookách a realtime). */
export type DomainEventEntity = { type: string; id: string; isPrivate: boolean };

/** Událost tak, jak ji dostane `eventHandlers` modulu (a jak se serializuje do webhooku). */
export type DomainEvent<K extends DomainEventName = DomainEventName> = {
  id: string;
  name: K;
  occurredAt: string;
  actor: DomainActor;
  entity: DomainEventEntity;
  data: DomainEventMap[K];
  previous?: unknown;
};

/** Události, které odcházejí i jako webhooky (ostatní jsou jen interní mezi moduly). `drive.*` jen endpointům `drive.*`. */
export const WEBHOOK_EVENTS: readonly DomainEventName[] = [
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "client.status_changed",
  "project.created",
  "project.phase_changed",
  "project.completed",
  "task.created",
  "task.completed",
  "payment.created",
  "payment.paid",
  "drive.client.create",
  "drive.client.add_service",
  "drive.client.rename",
  "drive.client.archive",
  "drive.client.restore",
  "drive.project.create",
];
