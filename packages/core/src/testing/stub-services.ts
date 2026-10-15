import type { ContributionMap, ServiceMap } from "../contracts/services";
import { newId } from "../db/ids";
import type { ServiceRegistry } from "../modules/server";

/** Jedno volání zaznamenané stub službou. */
export type StubCall = { service: keyof ServiceMap; method: string; args: unknown[] };

/** Které služby jsou „zapnuté“: `true` = výchozí stub, objekt = výchozí stub s přepsanými metodami. */
export type StubServicesInput = { [K in keyof ServiceMap]?: true | Partial<ServiceMap[K]> } & {
  /** Příspěvky pro `services.all(...)` (např. `clientCard`). */
  contributions?: { [K in keyof ContributionMap]?: readonly ContributionMap[K][] };
};

const DEFAULTS: { [K in keyof ServiceMap]: ServiceMap[K] } = {
  clients: {
    setStatus: async () => ({ changed: true, clientSince: null }),
    addServices: async () => {},
  },
  disk: {
    requestFolder: async () => ({ requestId: null, skipped: "disabled" }),
    folderState: async (_ctx, _type, ids) =>
      Object.fromEntries(ids.map((id) => [id, { state: "none", folderId: null, url: null }])),
  },
  tasks: {
    createFromTemplate: async (_ctx, input) => ({ taskIds: input.items.map(() => newId()) }),
    overdueJobIds: async () => [],
    openCounts: async () => ({ open: 0, overdue: 0 }),
    logDoneActivity: async () => ({ id: newId() }),
    createMeeting: async () => ({ taskId: newId() }),
    createPrivateNote: async () => ({ id: newId() }),
    openCountsByPhase: async (_ctx, input) =>
      Object.fromEntries(input.phaseIds.map((id) => [id, 0])),
    estimateByJob: async () => ({ estimateMin: 0, tasks: 0 }),
    completeOpenInPhases: async () => ({ completed: 0 }),
    listForTemplate: async () => [],
  },
  finance: {
    initJobFinance: async (_ctx, input) => ({
      paymentIds: input.templatePayments.map(() => newId()),
    }),
    defaultSplit: async () => [],
    createStandalonePayment: async () => ({ id: newId() }),
    incomeSince: async (_ctx, input) => Object.fromEntries(input.companyIds.map((id) => [id, 0])),
    unpaidCount: async () => 0,
    allocatedByUser: async () => ({}),
  },
  emailTemplates: {
    importText: async () => {
      const id = newId();
      return { id, href: `/sablony-emailu/${id}` };
    },
    exportText: async () => null,
    remove: async () => {},
  },
};

/**
 * Zaznamenávající fake služeb ostatních modulů pro unit a integrační testy modulu bez druhého modulu
 * (`deps.services`). Zapnuté jsou jen uvedené služby (`optional` ostatních vrací `undefined`); každé volání se
 * zapíše do `calls`. Použití: `const { services, calls } = createStubServices({ tasks: true })`.
 */
export function createStubServices(input: StubServicesInput = {}): {
  services: ServiceRegistry;
  calls: StubCall[];
} {
  const calls: StubCall[] = [];
  const built = new Map<string, unknown>();
  const optional = <K extends keyof ServiceMap>(key: K): ServiceMap[K] | undefined => {
    const spec = input[key];
    if (!spec) return undefined;
    if (built.has(key)) return built.get(key) as ServiceMap[K];
    const impl = { ...DEFAULTS[key], ...(spec === true ? {} : spec) } as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const recorded = Object.fromEntries(
      Object.entries(impl).map(([method, fn]) => [
        method,
        (...args: unknown[]) => {
          calls.push({ service: key, method, args });
          return fn(...args);
        },
      ]),
    ) as ServiceMap[K];
    built.set(key, recorded);
    return recorded;
  };
  const services: ServiceRegistry = {
    optional,
    get(key) {
      const s = optional(key);
      if (!s) throw new Error(`Služba „${key}“ není v testu zapnutá (createStubServices).`);
      return s;
    },
    all: (key) => input.contributions?.[key] ?? [],
  };
  return { services, calls };
}
