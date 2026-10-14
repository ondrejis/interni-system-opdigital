import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { clearEntityPolicies, registerEntityPolicy } from "../entities/policy";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import { connectAppDb, uniqueEmail } from "../testing";
import { addComment, deleteComment, editComment, listComments, parseMentions } from "./comments";
import { listNotifications, markAllRead, markRead, unreadCount } from "./notifications";
import { completeTask, createTask, deleteTask, listMyTasks, listTasks, updateTask } from "./tasks";

const app = connectAppDb();
afterAll(() => app.close());

/** Fiktivní záznam: id → vlastníci. */
const jobs = new Map<string, string[]>();
beforeAll(() => {
  clearEntityPolicies();
  registerEntityPolicy({
    entityType: "test_job",
    read: "test_job.read",
    write: "test_job.write",
    owners: async (_db, id) => (jobs.has(id) ? { ownerIds: jobs.get(id)! } : null),
    url: (id) => `/zakazky/${id}`,
  });
});

async function person(perms: [string, "all" | "own"][] = [], name = "Test") {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "R" })
    .returning();
  if (perms.length)
    await app.db
      .insert(schema.rolePermission)
      .values(perms.map(([permission, scope]) => ({ roleId: role!.id, permission, scope })));
  const [user] = await app.db
    .insert(schema.user)
    .values({ name, email: uniqueEmail(), roleId: role!.id })
    .returning();
  const ctx = createCtx(app.db, (await loadActor(app.db, user!.id))!);
  return { id: user!.id, ctx, name };
}

function job(...owners: string[]) {
  const id = newId();
  jobs.set(id, owners);
  return id;
}

describe("komentáře", () => {
  it("komentář smí přidat a číst ten, kdo záznam vidí; zapíše se audit", async () => {
    const a = await person([["test_job.read", "all"]]);
    const id = job();
    const c = await addComment(a.ctx, { entityType: "test_job", entityId: id, body: "  První  " });
    expect(c.body).toBe("První");
    const list = await listComments(a.ctx, "test_job", id);
    expect(list.map((x) => x.body)).toEqual(["První"]);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, c.id));
    expect(audit[0]).toMatchObject({ action: "create", entityType: "comment", actorId: a.id });
  });

  it("u rozsahu own záznam cizího vlastníka neexistuje; bez oprávnění ani typ záznamu nejde", async () => {
    const other = await person();
    const own = await person([["test_job.read", "own"]]);
    const mine = job(own.id);
    const theirs = job(other.id);
    await expect(
      addComment(own.ctx, { entityType: "test_job", entityId: mine, body: "ok" }),
    ).resolves.toBeDefined();
    await expect(
      addComment(own.ctx, { entityType: "test_job", entityId: theirs, body: "ne" }),
    ).rejects.toThrow(NotFoundError);
    await expect(listComments(own.ctx, "test_job", theirs)).rejects.toThrow(NotFoundError);
    await expect(
      addComment(own.ctx, { entityType: "neznamy", entityId: mine, body: "x" }),
    ).rejects.toThrow(PermissionError);
    const none = await person();
    await expect(
      addComment(none.ctx, { entityType: "test_job", entityId: mine, body: "x" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("zmínka vytvoří upozornění s odkazem; neplatné a vlastní zmínky se ignorují", async () => {
    const author = await person([["test_job.read", "all"]], "Autor");
    const target = await person([["test_job.read", "all"]], "Cíl");
    const outsider = await person([], "Bez práva");
    const inactive = await person([], "Neaktivní");
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, inactive.id));
    const id = job();
    const body = `Ahoj @[Cíl](${target.id}), @[Já](${author.id}) a @[Neaktivní](${inactive.id}) a @[Nikdo](${newId()}) a @[Bez práva](${outsider.id})`;
    const c = await addComment(author.ctx, { entityType: "test_job", entityId: id, body });
    expect(c.mentions).toEqual([target.id, outsider.id]);
    const inbox = await listNotifications(target.ctx);
    expect(inbox[0]).toMatchObject({ kind: "comment.mention", url: `/zakazky/${id}` });
    // kdo záznam nesmí číst, o zmínce se nedozví (obsah komentáře by prozradil, o co jde)
    expect(await listNotifications(outsider.ctx)).toHaveLength(0);
    expect(inbox[0]!.title).toContain("Autor");
    expect(inbox[0]!.body).toContain("@Cíl");
    expect(await listNotifications(author.ctx)).toHaveLength(0);
    expect(parseMentions(body)).toHaveLength(5);
  });

  it("upravit jde jen vlastní; smazat cizí jen s comments.moderate", async () => {
    const a = await person([["test_job.read", "all"]]);
    const b = await person([["test_job.read", "all"]]);
    const mod = await person([
      ["test_job.read", "all"],
      ["comments.moderate", "all"],
    ]);
    const id = job();
    const c = await addComment(a.ctx, { entityType: "test_job", entityId: id, body: "původní" });
    await expect(editComment(b.ctx, c.id, "cizí")).rejects.toThrow(PermissionError);
    await editComment(a.ctx, c.id, "upravený");
    expect((await listComments(a.ctx, "test_job", id))[0]).toMatchObject({ body: "upravený" });
    expect((await listComments(a.ctx, "test_job", id))[0]!.editedAt).toBeInstanceOf(Date);
    await expect(deleteComment(b.ctx, c.id)).rejects.toThrow(PermissionError);
    await deleteComment(mod.ctx, c.id);
    expect(await listComments(a.ctx, "test_job", id)).toHaveLength(0);
    const [row] = await app.db.select().from(schema.comment).where(eq(schema.comment.id, c.id));
    expect(row?.deletedAt).toBeInstanceOf(Date); // měkké smazání
  });

  it("prázdný komentář se odmítne", async () => {
    const a = await person([["test_job.read", "all"]]);
    await expect(
      addComment(a.ctx, { entityType: "test_job", entityId: job(), body: "   " }),
    ).rejects.toThrow(/Napište komentář/);
  });
});

describe("úkoly", () => {
  it("úkol si smí zadat každý sám sobě, ostatním jen s tasks.assign", async () => {
    const worker = await person();
    const boss = await person([["tasks.assign", "all"]]);
    const t = await createTask(worker.ctx, { title: "Objednat materiál" });
    expect(t.assigneeId).toBe(worker.id);
    await expect(
      createTask(worker.ctx, { title: "Cizí úkol", assigneeId: boss.id }),
    ).rejects.toThrow(UserError);
    const assigned = await createTask(boss.ctx, {
      title: "Zkontrolovat zakázku",
      assigneeId: worker.id,
      dueDate: "2026-12-01",
      priority: "high",
    });
    expect(assigned.createdBy).toBe(boss.id);
    const inbox = await listNotifications(worker.ctx);
    expect(inbox[0]).toMatchObject({ kind: "task.assigned" });
    expect(inbox[0]!.body).toContain("Termín: 1. 12. 2026");
  });

  it("viditelnost: bez tasks.read jen přidělené a zadané, s rozsahem all všechny", async () => {
    const a = await person();
    const b = await person([["tasks.assign", "all"]]);
    const all = await person([["tasks.read", "all"]]);
    const tag = `Úkol ${newId()}`;
    await createTask(a.ctx, { title: `${tag} A` });
    await createTask(b.ctx, { title: `${tag} B pro A`, assigneeId: a.id });
    await createTask(b.ctx, { title: `${tag} B sám` });
    const names = async (ctx: Ctx) =>
      (await listTasks(ctx))
        .map((t) => t.title)
        .filter((t) => t.startsWith(tag))
        .sort();
    expect(await names(a.ctx)).toEqual([`${tag} A`, `${tag} B pro A`]);
    expect(await names(b.ctx)).toEqual([`${tag} B pro A`, `${tag} B sám`]);
    expect(await names(all.ctx)).toHaveLength(3);
  });

  it("cizí úkol nejde otevřít, splnit ani smazat; Moje úkoly jsou otevřené a seřazené podle termínu", async () => {
    const a = await person();
    const b = await person();
    const t = await createTask(a.ctx, { title: "Můj" });
    await expect(completeTask(b.ctx, t.id)).rejects.toThrow(NotFoundError);
    await expect(updateTask(b.ctx, t.id, { title: "Nový název" })).rejects.toThrow(NotFoundError);
    await expect(deleteTask(b.ctx, t.id)).rejects.toThrow(NotFoundError);

    const later = await createTask(a.ctx, { title: "Později", dueDate: "2027-01-02" });
    const sooner = await createTask(a.ctx, { title: "Dřív", dueDate: "2027-01-01" });
    const mine = (await listMyTasks(a.ctx)).map((x) => x.title);
    expect(mine.indexOf("Dřív")).toBeLessThan(mine.indexOf("Později"));
    await completeTask(a.ctx, later.id);
    expect((await listMyTasks(a.ctx)).map((x) => x.id)).not.toContain(later.id);
    await completeTask(a.ctx, later.id, false);
    expect((await listMyTasks(a.ctx)).map((x) => x.id)).toContain(later.id);
    void sooner;
  });

  it("splnění upozorní zadavatele; změna přiřazení upozorní nového řešitele; audit zná změny", async () => {
    const boss = await person([["tasks.assign", "all"]]);
    const w1 = await person();
    const w2 = await person();
    const t = await createTask(boss.ctx, { title: "Práce", assigneeId: w1.id });
    await completeTask(w1.ctx, t.id);
    expect((await listNotifications(boss.ctx)).map((n) => n.kind)).toContain("task.done");

    await updateTask(boss.ctx, t.id, { assigneeId: w2.id, dueDate: "2027-03-03" });
    expect((await listNotifications(w2.ctx))[0]).toMatchObject({ kind: "task.assigned" });
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, t.id));
    const update = audit.find(
      (a) => a.action === "update" && a.changes.some((c) => c.field === "assigneeId"),
    );
    expect(update?.changes.find((c) => c.field === "assigneeId")).toMatchObject({
      old: w1.id,
      new: w2.id,
    });
  });

  it("úkol navázaný na záznam vyžaduje přístup k záznamu; smazání je měkké", async () => {
    const own = await person([["test_job.read", "own"]]);
    const other = await person();
    const mine = job(own.id);
    const theirs = job(other.id);
    await expect(
      createTask(own.ctx, { title: "K zakázce", entityType: "test_job", entityId: theirs }),
    ).rejects.toThrow(NotFoundError);
    const t = await createTask(own.ctx, {
      title: "K mé zakázce",
      entityType: "test_job",
      entityId: mine,
    });
    expect(
      (await listTasks(own.ctx, { entityType: "test_job", entityId: mine })).map((x) => x.id),
    ).toEqual([t.id]);
    await deleteTask(own.ctx, t.id);
    expect(await listTasks(own.ctx, { entityType: "test_job", entityId: mine })).toHaveLength(0);
    const [row] = await app.db.select().from(schema.task).where(eq(schema.task.id, t.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it("neplatný vstup: krátký název, vazba bez typu", async () => {
    const a = await person();
    await expect(createTask(a.ctx, { title: "x" })).rejects.toThrow(
      /Napište, co je potřeba udělat/,
    );
    await expect(createTask(a.ctx, { title: "Platný", entityId: newId() })).rejects.toThrow(
      /typ i id/,
    );
  });
});

describe("upozornění", () => {
  it("inbox je jen vlastní; čtení cizího id nic nezmění; nepřečtené se počítají", async () => {
    const boss = await person([["tasks.assign", "all"]]);
    const a = await person();
    const b = await person();
    await createTask(boss.ctx, { title: "Pro A 1", assigneeId: a.id });
    await createTask(boss.ctx, { title: "Pro A 2", assigneeId: a.id });
    await createTask(boss.ctx, { title: "Pro B", assigneeId: b.id });
    expect(await unreadCount(a.ctx)).toBe(2);
    expect(await unreadCount(b.ctx)).toBe(1);

    const [first] = await listNotifications(a.ctx);
    await markRead(b.ctx, [first!.id]); // cizí id
    expect(await unreadCount(a.ctx)).toBe(2);
    await markRead(a.ctx, [first!.id]);
    expect(await unreadCount(a.ctx)).toBe(1);
    expect(await listNotifications(a.ctx, { unreadOnly: true })).toHaveLength(1);
    await markAllRead(a.ctx);
    expect(await unreadCount(a.ctx)).toBe(0);
    expect(await unreadCount(b.ctx)).toBe(1);
  });
});
