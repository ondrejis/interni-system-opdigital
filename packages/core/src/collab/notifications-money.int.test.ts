import { afterAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { connectAppDb, uniqueEmail } from "../testing";
import { createNotifications, listNotifications, stripMoney } from "./notifications";

const app = connectAppDb();
afterAll(() => app.close());

async function person(perms: string[]) {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "R" })
    .returning();
  if (perms.length)
    await app.db
      .insert(schema.rolePermission)
      .values(perms.map((permission) => ({ roleId: role!.id, permission, scope: "all" as const })));
  const [user] = await app.db
    .insert(schema.user)
    .values({ name: "Test", email: uniqueEmail(), roleId: role!.id })
    .returning();
  return { id: user!.id, ctx: createCtx(app.db, (await loadActor(app.db, user!.id))!) };
}

describe("peníze v textu upozornění", () => {
  it("stripMoney vynechá částku a oddělovač před ní", () => {
    expect(stripMoney("VP-1 Odsávání nad boxem: +52 000 Kč")).toBe("VP-1 Odsávání nad boxem");
    expect(stripMoney("K fakturaci 7 326 200 Kč")).toBe("K fakturaci");
    expect(stripMoney("OBJ-2026-049 Sádrokarton, podhledy, 29 240,50 Kč")).toBe(
      "OBJ-2026-049 Sádrokarton, podhledy",
    );
    expect(stripMoney("Zahájena realizace")).toBe("Zahájena realizace");
  });

  it("částku dostane jen ten, kdo má zakázkovou ekonomiku nebo faktury; ostatní čistý text", async () => {
    const boss = await person(["finance.read"]);
    const billing = await person(["finance.read"]);
    const worker = await person(["zakazky.read"]);
    const body = "VP-1 Zesílení desky: +206 000 Kč";
    await createNotifications(
      app.db,
      [boss, billing, worker].map((p) => ({
        userId: p.id,
        kind: "job.change.approved",
        title: "Z-1: schválená vícepráce",
        body,
      })),
    );
    expect((await listNotifications(boss.ctx))[0]!.body).toBe(body);
    expect((await listNotifications(billing.ctx))[0]!.body).toBe(body);
    const mine = (await listNotifications(worker.ctx))[0]!;
    expect(mine.body).toBe("VP-1 Zesílení desky");
    // uložený řádek už částku nenese (push čte z databáze)
    const stored = await app.db.select().from(schema.notification);
    expect(stored.find((n) => n.userId === worker.id)!.body).toBe("VP-1 Zesílení desky");
  });

  it("starší upozornění s částkou se při čtení bez oprávnění očistí", async () => {
    const worker = await person(["zakazky.read"]);
    await app.db.insert(schema.notification).values({
      userId: worker.id,
      kind: "job.statement.approved",
      title: "Z-2: soupis č. 1 je schválený",
      body: "K fakturaci 393 960 Kč",
    });
    const list = await listNotifications(worker.ctx);
    expect(list[0]!.body).toBe("K fakturaci");
  });
});
