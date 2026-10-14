import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { clearEntityPolicies, registerEntityPolicy } from "../entities/policy";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { connectAppDb, uniqueEmail } from "../testing";
import {
  attachFile,
  detachAttachment,
  generateThumbnail,
  listAttachments,
  openFile,
  purgeOrphanFiles,
  uploadFile,
} from "./service";
import { LocalDiskStorage } from "./storage";

const app = connectAppDb();
afterAll(() => app.close());

let storage: LocalDiskStorage;
let root: string;
const deps = () => ({ storage });
const jobs = new Map<string, string[]>();

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "files-int-"));
  storage = new LocalDiskStorage(root);
  clearEntityPolicies();
  registerEntityPolicy({
    entityType: "test_job",
    read: "test_job.read",
    write: "test_job.write",
    owners: async (_db, id) => (jobs.has(id) ? { ownerIds: jobs.get(id)! } : null),
  });
});

async function person(perms: [string, "all" | "own"][] = []) {
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
    .values({ name: "T", email: uniqueEmail(), roleId: role!.id })
    .returning();
  return { id: user!.id, ctx: createCtx(app.db, (await loadActor(app.db, user!.id))!) };
}
const job = (...owners: string[]) => {
  const id = newId();
  jobs.set(id, owners);
  return id;
};
const photo = (w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } })
    .jpeg()
    .toBuffer();
const readAll = async (s: AsyncIterable<unknown>) => {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

describe("nahrávání", () => {
  it("fotka k zakázce: uloží se zmenšená, v DB jsou rozměry, hash a příloha, zapíše se audit", async () => {
    const worker = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    const id = job(worker.id);
    const { file, attachmentId } = await uploadFile(worker.ctx, deps(), {
      name: "IMG_0001.JPG",
      data: await photo(4000, 3000),
      attachTo: {
        entityType: "test_job",
        entityId: id,
        kind: "photo",
        takenAt: new Date("2026-10-08T07:30:00Z"),
        geo: { lat: 49.7, lng: 13.4 },
      },
    });
    expect(file).toMatchObject({
      name: "IMG_0001.JPG",
      mime: "image/jpeg",
      kind: "image",
      uploadedBy: worker.id,
    });
    expect(Math.max(file.width!, file.height!)).toBe(2560);
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(attachmentId).toBeTruthy();
    expect(await storage.exists(file.storageKey)).toBe(true);
    expect(file.storageKey).not.toContain("IMG"); // název souboru není v cestě

    const list = await listAttachments(worker.ctx, "test_job", id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "photo", geo: { lat: 49.7, lng: 13.4 } });
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, file.id));
    expect(audit[0]).toMatchObject({ action: "create", entityType: "file", actorId: worker.id });
  });

  it("do cizí zakázky se nahrát nedá; bez práva zápisu také ne; špatný soubor se odmítne a nic nezůstane v úložišti", async () => {
    const other = await person();
    const own = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    const readOnly = await person([["test_job.read", "all"]]);
    const theirs = job(other.id);
    const mine = job(own.id);
    await expect(
      uploadFile(own.ctx, deps(), {
        name: "a.jpg",
        data: await photo(),
        attachTo: { entityType: "test_job", entityId: theirs },
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      uploadFile(readOnly.ctx, deps(), {
        name: "a.jpg",
        data: await photo(),
        attachTo: { entityType: "test_job", entityId: mine },
      }),
    ).rejects.toThrow(PermissionError);

    const before = (await fs.readdir(root, { recursive: true })).length;
    await expect(
      uploadFile(own.ctx, deps(), {
        name: "virus.exe",
        data: Buffer.from([0x4d, 0x5a, 0, 0]),
        attachTo: { entityType: "test_job", entityId: mine },
      }),
    ).rejects.toThrow(UserError);
    await expect(
      uploadFile(own.ctx, deps(), {
        name: "rozbite.jpg",
        data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50, 1)]),
        attachTo: { entityType: "test_job", entityId: mine },
      }),
    ).rejects.toThrow(/poškozený/);
    // oprávnění selže až po zápisu do úložiště → soubor se musí uklidit
    await expect(
      uploadFile(own.ctx, deps(), {
        name: "a.jpg",
        data: await photo(),
        attachTo: { entityType: "test_job", entityId: theirs },
      }),
    ).rejects.toThrow();
    expect((await fs.readdir(root, { recursive: true })).length).toBe(before);
  });
});

describe("stažení a oprávnění", () => {
  it("soubor otevře ten, kdo vidí záznam; cizí ne; nahrávající vždy; správce souborů vždy", async () => {
    const owner = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    const stranger = await person([["test_job.read", "own"]]);
    const all = await person([["test_job.read", "all"]]);
    const admin = await person([["files.manage", "all"]]);
    const id = job(owner.id);
    const data = await photo();
    const { file } = await uploadFile(owner.ctx, deps(), {
      name: "a.jpg",
      data,
      attachTo: { entityType: "test_job", entityId: id },
    });

    const opened = await openFile(owner.ctx, deps(), file.id);
    expect(opened).toMatchObject({ name: "a.jpg", mime: "image/jpeg" });
    expect((await readAll(opened.stream)).length).toBe(file.size);
    await expect(openFile(all.ctx, deps(), file.id)).resolves.toBeDefined();
    await expect(openFile(admin.ctx, deps(), file.id)).resolves.toBeDefined();
    await expect(openFile(stranger.ctx, deps(), file.id)).rejects.toThrow(NotFoundError);
    await expect(openFile(stranger.ctx, deps(), newId())).rejects.toThrow(NotFoundError);
  });

  it("volný soubor vidí jen nahrávající (a správce), po připojení k záznamu i ostatní s přístupem", async () => {
    const up = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    const viewer = await person([["test_job.read", "all"]]);
    const { file } = await uploadFile(up.ctx, deps(), {
      name: "volny.pdf",
      data: Buffer.from("%PDF-1.7 test"),
    });
    await expect(openFile(viewer.ctx, deps(), file.id)).rejects.toThrow(NotFoundError);
    await openFile(up.ctx, deps(), file.id);

    const id = job(up.id);
    await attachFile(up.ctx, file.id, { entityType: "test_job", entityId: id, kind: "document" });
    await expect(openFile(viewer.ctx, deps(), file.id)).resolves.toBeDefined();

    const stranger = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    await expect(
      attachFile(stranger.ctx, file.id, { entityType: "test_job", entityId: job(stranger.id) }),
    ).rejects.toThrow(NotFoundError); // cizí soubor
  });

  it("odpojení přílohy: bez práva zápisu nejde, po odpojení soubor přestane být vidět ostatním", async () => {
    const owner = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    const viewer = await person([["test_job.read", "all"]]);
    const id = job(owner.id);
    const { file, attachmentId } = await uploadFile(
      viewer.ctx.actor.userId === owner.id ? owner.ctx : owner.ctx,
      deps(),
      {
        name: "a.pdf",
        data: Buffer.from("%PDF-1.7 x"),
        attachTo: { entityType: "test_job", entityId: id },
      },
    );
    await expect(detachAttachment(viewer.ctx, attachmentId!)).rejects.toThrow(PermissionError);
    await detachAttachment(owner.ctx, attachmentId!);
    expect(await listAttachments(owner.ctx, "test_job", id)).toHaveLength(0);
    await expect(openFile(viewer.ctx, deps(), file.id)).rejects.toThrow(NotFoundError);
  });
});

describe("náhledy a úklid", () => {
  it("náhled se vyrobí jednou a lze ho otevřít; neobrázek náhled nemá", async () => {
    const up = await person();
    const { file } = await uploadFile(up.ctx, deps(), {
      name: "foto.jpg",
      data: await photo(1600, 1200),
    });
    expect(await generateThumbnail(app.db, deps(), file.id)).toBe(true);
    expect(await generateThumbnail(app.db, deps(), file.id)).toBe(false);
    const thumb = await openFile(up.ctx, deps(), file.id, { thumb: true });
    expect(thumb.mime).toBe("image/webp");
    const meta = await sharp(await readAll(thumb.stream)).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(320);

    const { file: pdf } = await uploadFile(up.ctx, deps(), {
      name: "a.pdf",
      data: Buffer.from("%PDF-1.7 x"),
    });
    expect(await generateThumbnail(app.db, deps(), pdf.id)).toBe(false);
  });

  it("úklid smaže volné soubory starší než limit i s náhledem, připojené nechá", async () => {
    const up = await person([
      ["test_job.read", "own"],
      ["test_job.write", "own"],
    ]);
    const id = job(up.id);
    const { file: orphan } = await uploadFile(up.ctx, deps(), {
      name: "sirotek.jpg",
      data: await photo(),
    });
    await generateThumbnail(app.db, deps(), orphan.id);
    const { file: kept } = await uploadFile(up.ctx, deps(), {
      name: "drzi.jpg",
      data: await photo(),
      attachTo: { entityType: "test_job", entityId: id },
    });
    const { file: fresh } = await uploadFile(up.ctx, deps(), {
      name: "cerstvy.jpg",
      data: await photo(),
    });

    const old = new Date(Date.now() - 48 * 3_600_000);
    await app.db.update(schema.file).set({ createdAt: old }).where(eq(schema.file.id, orphan.id));
    await app.db.update(schema.file).set({ createdAt: old }).where(eq(schema.file.id, kept.id));

    const removed = await purgeOrphanFiles(app.db, deps(), 24);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await storage.exists(orphan.storageKey)).toBe(false);
    expect(await storage.exists(storage_thumb(orphan))).toBe(false);
    expect(await storage.exists(kept.storageKey)).toBe(true);
    expect(await storage.exists(fresh.storageKey)).toBe(true);
    const [row] = await app.db.select().from(schema.file).where(eq(schema.file.id, orphan.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});

function storage_thumb(f: { id: string }) {
  const clean = f.id.replace(/-/g, "");
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${f.id}.thumb`;
}
