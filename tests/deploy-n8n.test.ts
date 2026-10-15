/* eslint-disable @typescript-eslint/no-explicit-any -- tělo událostí a položek n8n je dynamické JSON */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { signatureHeader, verifySignature } from "@rebar/core/webhooks";
import { driveCallbackSchema, DRIVE_ID_PATTERN } from "../packages/modules/disk/src/contract";
import { leadIngestPayload } from "../packages/modules/reklama/src/contract";
import { parseLead } from "../packages/modules/reklama/src/meta/logic";

/*
  Šablony n8n workflow (`deploy/n8n/*.json`): jsou to data, která se importují do n8n, takže tu ověřujeme strukturu
  (propojení uzlů, žádná tajemství, placeholdery) a hlavně SKUTEČNOU logiku Code uzlů: vyndají se z JSON a spustí se
  s napodobeninou prostředí n8n (`$input`, `$`, `$env`, `this.helpers`). Neověřuje se běh v n8n ani volání Google/Meta API.
*/

const root = path.resolve(import.meta.dirname, "..");
const req = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

type N8nNode = {
  name: string;
  type: string;
  parameters: Record<string, any>;
  credentials?: Record<string, { id: string; name: string }>;
};
type Workflow = {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: { node: string }[][] }>;
};
const load = (file: string): Workflow =>
  JSON.parse(fs.readFileSync(path.join(root, "deploy/n8n", file), "utf8")) as Workflow;

type Item = { json: Record<string, any>; binary?: unknown };

/** Spustí Code uzel s napodobeninou prostředí n8n. */
async function runNode(
  wf: Workflow,
  name: string,
  items: Item[],
  opts: { env?: Record<string, string>; refs?: Record<string, Item[]>; raw?: string } = {},
): Promise<Item[]> {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Uzel ${name} neexistuje`);
  const fn = new AsyncFunction("require", "$input", "$", "$env", String(node.parameters.jsCode));
  const ref = (n: string) => {
    const list = opts.refs?.[n];
    if (!list) throw new Error(`Chybí reference na uzel ${n}`);
    return { first: () => list[0], all: () => list };
  };
  const self = {
    helpers: { getBinaryDataBuffer: async () => Buffer.from(opts.raw ?? "", "utf8") },
  };
  return (await fn.call(
    self,
    req,
    { all: () => items, first: () => items[0] },
    ref,
    opts.env ?? {},
  )) as Item[];
}

describe("šablony n8n: struktura", () => {
  for (const file of ["drive-folders.json", "meta-leads.json"]) {
    const wf = load(file);
    const text = fs.readFileSync(path.join(root, "deploy/n8n", file), "utf8");

    it(`${file}: platné propojení uzlů, unikátní názvy, každý Code uzel je platný JavaScript`, () => {
      const names = wf.nodes.map((n) => n.name);
      expect(new Set(names).size).toBe(names.length);
      for (const [from, c] of Object.entries(wf.connections)) {
        expect(names, from).toContain(from);
        for (const out of c.main)
          for (const to of out) expect(names, `${from} → ${to.node}`).toContain(to.node);
      }
      for (const n of wf.nodes)
        if (n.parameters.jsCode)
          expect(
            () => new AsyncFunction("require", "$input", "$", "$env", String(n.parameters.jsCode)),
            n.name,
          ).not.toThrow();
    });

    it(`${file}: bez tajemství a ID účtů, jen placeholdery; přihlášení nejsou přiřazená`, () => {
      expect(text).not.toMatch(/whsec_[A-Za-z0-9]{8,}/);
      expect(text).not.toMatch(/\b[0-9a-f]{40,}\b/i);
      expect(text).not.toMatch(/EAA[A-Za-z0-9]{20,}|ya29\.|AIza[0-9A-Za-z_-]{20,}/);
      expect(text).toContain("<<DOPLNIT");
      for (const n of wf.nodes)
        for (const c of Object.values(n.credentials ?? {})) {
          expect(c.id).toBe("");
          expect(c.name).toContain("DOPLNIT");
        }
      expect(text.toLowerCase()).not.toContain("rebar");
    });
  }
});

describe("drive-folders: ověření podpisu a plán složek", () => {
  const wf = load("drive-folders.json");
  const WEBHOOK = "whsec_testovaci-tajemstvi-webhooku";
  const INGEST = "testovaci-tajemstvi-ingestu";
  const env = {
    OPSYS_WEBHOOK_SECRET: WEBHOOK,
    OPSYS_INGEST_SECRET: INGEST,
    OPSYS_DRIVE_CLIENTS_FOLDER_ID: "root_klienti_01",
    OPSYS_DRIVE_ARCHIVE_FOLDER_ID: "root_archiv_01",
  };
  const callback = "https://opsys.example.test/api/ingest/drive";

  const baseData = (kind: string, structure: Record<string, any>, folderId: string | null) => ({
    id: "11111111-1111-4111-8111-111111111111",
    event: kind,
    occurredAt: "2026-10-14T10:00:00.000Z",
    actor: { kind: "user", id: null },
    entity: { type: "company", id: "c1", isPrivate: false },
    data: {
      requestId: "22222222-2222-4222-8222-222222222222",
      client: { id: "c1", name: "Novák s.r.o.", ico: "12345678", folderId },
      structure: {
        version: 1,
        kind,
        clientsRoot: "Klienti",
        archiveRoot: "Archiv",
        known: { clientFolderId: folderId, serviceFolderIds: {}, archived: false },
        ...structure,
      },
      callbackUrl: callback,
    },
  });

  /** Webhook → Konfigurace → Ověřit podpis; vrací výsledek ověření. */
  async function receive(body: string, header: string | null) {
    const hook: Item = {
      json: { headers: header ? { "x-opsys-signature": header } : {}, body: {} },
      binary: {},
    };
    const [conf] = await runNode(wf, "Konfigurace", [hook], { env });
    return (await runNode(wf, "Ověřit podpis", [conf!], { raw: body }))[0]!.json;
  }

  it("platný podpis projde; chybějící, cizí, pozměněné tělo a prošlý čas se odmítnou", async () => {
    const body = JSON.stringify(baseData("drive.client.create", {}, null));
    expect((await receive(body, signatureHeader(WEBHOOK, body))).ok).toBe(true);
    expect((await receive(body, null)).reason).toBe("missing");
    expect((await receive(body, signatureHeader("jine-tajemstvi", body))).reason).toBe("mismatch");
    expect((await receive(body + " ", signatureHeader(WEBHOOK, body))).reason).toBe("mismatch");
    expect(
      (await receive(body, signatureHeader(WEBHOOK, body, Date.now() - 3600_000))).reason,
    ).toBe("expired");
    expect((await receive(body, "nesmysl")).reason).toBe("malformed");
  });

  it("bez nastaveného tajemství workflow srozumitelně selže (placeholder se nikdy nepoužije jako klíč)", async () => {
    const hook: Item = { json: { headers: {}, body: {} }, binary: {} };
    const [conf] = await runNode(wf, "Konfigurace", [hook], { env: {} });
    await expect(runNode(wf, "Ověřit podpis", [conf!], { raw: "{}" })).rejects.toThrow(
      /není nastavené/,
    );
  });

  /** Plán → smyčka „Další úroveň / Zapsat ID“ s napodobeninou Disku → Výsledek → Podepsat callback. */
  async function runTree(event: object, create: (j: Record<string, any>) => Record<string, any>) {
    const [conf] = await runNode(
      wf,
      "Konfigurace",
      [{ json: { headers: {}, body: {} }, binary: {} }],
      { env },
    );
    const verified: Item = { json: { ok: true, reason: "", event, cfg: conf!.json.cfg } };
    const [plan] = await runNode(wf, "Plán", [verified]);
    let planItem = plan!;
    if (planItem.json.op === "lookup") {
      // napodobenina Disku: výsledek hledání složky služby se předává přes `lookupResult`
      const found = (create({ lookup: true }) as { files?: unknown[] }) ?? {};
      const [next] = await runNode(wf, "Doplnit složku služby", [{ json: found }], {
        refs: { Plán: [planItem] },
      });
      planItem = next!;
    }
    let state = planItem.json.state;
    const created: string[] = [];
    for (let i = 0; i < 20; i++) {
      const items = await runNode(wf, "Další úroveň", [{ json: { state } }]);
      if (items[0]!.json.done) {
        state = items[0]!.json.state;
        break;
      }
      const results = items.map((it) => {
        created.push(`${it.json.parentId}/${it.json.name}`);
        return { json: create(it.json) };
      });
      const [upd] = await runNode(wf, "Zapsat ID", results, { refs: { "Další úroveň": items } });
      state = upd!.json.state;
    }
    const [result] = await runNode(wf, "Výsledek: strom", [{ json: { state } }]);
    const [signed] = await runNode(wf, "Podepsat callback", [result!]);
    return {
      state,
      created,
      signed: signed!.json as { url: string; body: string; signature: string },
    };
  }

  const fakeCreate = (j: Record<string, any>) => ({
    id: `fid_${String(j.name).replace(/[^A-Za-z0-9]/g, "")}`,
    name: j.name,
  });

  it("client.create: založí strom po úrovních a pošle platný podepsaný callback s ID složek", async () => {
    const event = baseData(
      "drive.client.create",
      {
        clientFolder: {
          name: "Novák s.r.o.",
          children: [
            { name: "00 Klient", children: [{ name: "Smlouvy", children: [] }] },
            { name: "10 Web", service: "web", children: [] },
            { name: "20 Marketing", service: "marketing", children: [] },
          ],
        },
      },
      null,
    );
    const { created, signed } = await runTree(event, fakeCreate);
    expect(created[0]).toBe("root_klienti_01/Novák s.r.o.");
    expect(created).toContain("fid_Novksro/00 Klient");
    expect(created).toHaveLength(5);
    expect(created.findIndex((c) => c.endsWith("/Smlouvy"))).toBeGreaterThan(
      created.findIndex((c) => c.endsWith("/00 Klient")),
    );

    const parsed = driveCallbackSchema.parse(JSON.parse(signed.body));
    expect(parsed).toMatchObject({ eventId: "22222222-2222-4222-8222-222222222222", status: "ok" });
    expect(parsed.folders?.root).toMatch(DRIVE_ID_PATTERN);
    expect(Object.keys(parsed.folders?.services ?? {}).sort()).toEqual(["marketing", "web"]);
    expect(signed.url).toBe(callback);
    // podpis callbacku ověří stejná funkce jako v OPSYS (tajemství příchozích požadavků)
    expect(
      verifySignature({ secrets: [INGEST], header: signed.signature, body: signed.body }).ok,
    ).toBe(true);
    expect(
      verifySignature({ secrets: [WEBHOOK], header: signed.signature, body: signed.body }).ok,
    ).toBe(false);
  });

  it("client.add_service: služby se zakládají v klientské složce a vrací se jen jejich ID", async () => {
    const event = baseData(
      "drive.client.add_service",
      {
        clientFolder: { name: "Novák s.r.o." },
        services: [
          {
            service: "systemy",
            name: "30 Systémy",
            children: [{ name: "Podklady", children: [] }],
          },
        ],
      },
      "klient_folder_1",
    );
    const { created, signed } = await runTree(event, fakeCreate);
    expect(created[0]).toBe("klient_folder_1/30 Systémy");
    const parsed = driveCallbackSchema.parse(JSON.parse(signed.body));
    expect(parsed.folders?.services?.systemy).toMatch(DRIVE_ID_PATTERN);
    expect(parsed.folders?.root).toBeUndefined();
  });

  it("project.create: složka služby známá = zakázka se založí přímo v ní, ID zakázky je v callbacku", async () => {
    const event = baseData(
      "drive.project.create",
      {
        clientFolder: { name: "Novák s.r.o." },
        serviceFolder: { service: "web", name: "10 Web", folderId: "svc_folder_web" },
        jobFolder: {
          name: "2026-10 Nový web",
          children: [
            { name: "Podklady", children: [] },
            { name: "Výstupy", children: [] },
          ],
        },
      },
      "klient_folder_1",
    );
    const { created, signed } = await runTree(event, fakeCreate);
    expect(created[0]).toBe("svc_folder_web/2026-10 Nový web");
    expect(created).toHaveLength(3);
    const parsed = driveCallbackSchema.parse(JSON.parse(signed.body));
    expect(parsed.status).toBe("ok");
    expect(parsed.folders?.project).toMatch(DRIVE_ID_PATTERN);
    expect(parsed.folders?.services).toBeUndefined();
  });

  it("project.create: neznámou složku služby workflow najde, jinak založí (najít, nebo založit)", async () => {
    const structure = {
      clientFolder: { name: "Novák s.r.o." },
      serviceFolder: { service: "web", name: "10 Web", folderId: null },
      jobFolder: { name: "2026-10 Nový web", children: [] },
    };
    const event = baseData("drive.project.create", structure, "klient_folder_1");
    const found = await runTree(event, (j) =>
      j.lookup ? { files: [{ id: "nalezena_web", name: "10 Web" }] } : fakeCreate(j),
    );
    expect(found.created).toEqual(["nalezena_web/2026-10 Nový web"]);
    expect(driveCallbackSchema.parse(JSON.parse(found.signed.body)).status).toBe("ok");

    const missing = await runTree(event, (j) => (j.lookup ? { files: [] } : fakeCreate(j)));
    expect(missing.created).toEqual(["klient_folder_1/10 Web", "fid_10Web/2026-10 Nový web"]);
    const parsed = driveCallbackSchema.parse(JSON.parse(missing.signed.body));
    expect(parsed.folders?.services?.web).toBe("fid_10Web");
    expect(parsed.folders?.project).toBeDefined();
  });

  it("chyba Disku při zakládání: nic dalšího se nezakládá a callback má status error s důvodem", async () => {
    const event = baseData(
      "drive.client.create",
      {
        clientFolder: {
          name: "Novák s.r.o.",
          children: [{ name: "10 Web", service: "web", children: [] }],
        },
      },
      null,
    );
    const { created, signed } = await runTree(event, () => ({
      error: { message: "Insufficient permissions" },
    }));
    expect(created).toHaveLength(1);
    const parsed = driveCallbackSchema.parse(JSON.parse(signed.body));
    expect(parsed.status).toBe("error");
    expect(parsed.error).toMatch(/Insufficient permissions/);
  });

  it("rename, archive a restore: jedna operace na ID složky a callback s ID", async () => {
    const cases: [string, string, string, string][] = [
      ["drive.client.rename", "root", "klient_folder_1", "Nový název"],
      ["drive.client.archive", "archive", "klient_folder_1", "Novák s.r.o."],
      ["drive.client.restore", "root", "klient_folder_1", "Novák s.r.o."],
    ];
    for (const [kind, key] of cases) {
      const event = baseData(kind, { clientFolder: { name: "Nový název" } }, "klient_folder_1");
      const [conf] = await runNode(
        wf,
        "Konfigurace",
        [{ json: { headers: {}, body: {} }, binary: {} }],
        { env },
      );
      const [plan] = await runNode(wf, "Plán", [
        { json: { ok: true, reason: "", event, cfg: conf!.json.cfg } },
      ]);
      const state = plan!.json.state;
      if (kind === "drive.client.rename")
        expect(state.update).toEqual({ fileId: "klient_folder_1", name: "Nový název" });
      if (kind === "drive.client.archive")
        expect(state.move).toMatchObject({ add: "root_archiv_01", remove: "root_klienti_01" });
      if (kind === "drive.client.restore")
        expect(state.move).toMatchObject({ add: "root_klienti_01", remove: "root_archiv_01" });
      const [res] = await runNode(
        wf,
        "Výsledek: jednoduchý",
        [{ json: { id: "klient_folder_1" } }],
        { refs: { Plán: [plan!] } },
      );
      const parsed = driveCallbackSchema.parse(res!.json.callback);
      expect(parsed.status).toBe("ok");
      expect((parsed.folders as Record<string, string>)[key]).toBe("klient_folder_1");
      const [bad] = await runNode(
        wf,
        "Výsledek: jednoduchý",
        [{ json: { error: { message: "Not found" } } }],
        { refs: { Plán: [plan!] } },
      );
      expect(driveCallbackSchema.parse(bad!.json.callback)).toMatchObject({ status: "error" });
    }
  });

  it("zkušební událost webhook.test se přijme a workflow skončí bez akce a bez callbacku", async () => {
    const [conf] = await runNode(
      wf,
      "Konfigurace",
      [{ json: { headers: {}, body: {} }, binary: {} }],
      {
        env,
      },
    );
    const test = { id: "x", event: "webhook.test", data: {} };
    expect(
      await runNode(wf, "Plán", [
        { json: { ok: true, reason: "", event: test, cfg: conf!.json.cfg } },
      ]),
    ).toEqual([]);
  });

  it("neznámá událost a chybějící složka klienta skončí callbackem s chybou, ne pádem", async () => {
    for (const event of [
      baseData("drive.client.neco", {}, "x1"),
      baseData("drive.client.rename", { clientFolder: { name: "A" } }, null),
    ]) {
      const { signed } = await runTree(event, fakeCreate);
      expect(driveCallbackSchema.parse(JSON.parse(signed.body)).status).toBe("error");
    }
  });
});

describe("meta-leads: normalizace a podpis", () => {
  const wf = load("meta-leads.json");
  const INGEST = "testovaci-tajemstvi-ingestu";

  it("ukázkový lead projde schématem ingestu `leads` a OPSYS z něj rozpozná kontakt", async () => {
    const [sample] = await runNode(wf, "Ukázkový lead", [{ json: {} }]);
    const [norm] = await runNode(wf, "Normalizovat lead", [sample!]);
    const body = leadIngestPayload.parse(norm!.json.body);
    expect(body.leadgenId).toMatch(/^TEST-/);
    expect(parseLead(body)).toMatchObject({
      name: "Test Testovič",
      email: "test@example.test",
      companyName: "Test s.r.o.",
    });
  });

  it("lead ve tvaru triggeru Meta (id, form_id, field_data) i bez formId (chyba)", async () => {
    const [norm] = await runNode(wf, "Normalizovat lead", [
      {
        json: {
          id: 123456789,
          form_id: 987,
          campaign_name: "Jaro",
          field_data: [{ name: "email", values: ["a@example.test"] }],
        },
      },
    ]);
    expect(leadIngestPayload.parse(norm!.json.body)).toMatchObject({
      leadgenId: "123456789",
      formId: "987",
      campaignName: "Jaro",
    });
    await expect(runNode(wf, "Normalizovat lead", [{ json: { id: 1 } }])).rejects.toThrow(/formId/);
  });

  it("podpis těla ověří stejná funkce jako OPSYS; bez nastavení (env) selže, ne podepíše placeholderem", async () => {
    const [norm] = await runNode(wf, "Normalizovat lead", [
      {
        json: {
          id: "1",
          form_id: "2",
          field_data: [{ name: "email", values: ["a@example.test"] }],
        },
      },
    ]);
    const env = { OPSYS_INGEST_SECRET: INGEST, OPSYS_BASE_URL: "https://opsys.example.test/" };
    const [signed] = await runNode(wf, "Podepsat", [norm!], { env });
    const j = signed!.json as { url: string; body: string; signature: string };
    expect(j.url).toBe("https://opsys.example.test/api/ingest/leads");
    expect(verifySignature({ secrets: [INGEST], header: j.signature, body: j.body }).ok).toBe(true);
    expect(JSON.parse(j.body)).toEqual(norm!.json.body);
    await expect(runNode(wf, "Podepsat", [norm!], { env: {} })).rejects.toThrow(/není nastavené/);
  });
});
