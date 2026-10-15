import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { clearEntityPolicies, registerEntityPolicy } from "../entities/policy";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { NotFoundError, PermissionError } from "../rbac/errors";
import { connectAppDb, uniqueEmail } from "../testing";
import { addComment, deleteComment, editComment, listComments, parseMentions } from "./comments";
import {
  createNotifications,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "./notifications";

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

describe("upozornění", () => {
  it("inbox je jen vlastní; čtení cizího id nic nezmění; nepřečtené se počítají", async () => {
    const a = await person();
    const b = await person();
    await createNotifications(app.db, [
      { userId: a.id, kind: "test.note", title: "Pro A 1" },
      { userId: a.id, kind: "test.note", title: "Pro A 2" },
      { userId: b.id, kind: "test.note", title: "Pro B" },
    ]);
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
