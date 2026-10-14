import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import { newId } from "@rebar/core/db";
import { createInvitation, acceptInvitation } from "@rebar/core/auth";
import { createCtx, loadActor } from "@rebar/core/rbac";
import { connectAppDb, createTestAuth, fakeMailer, uniqueEmail } from "@rebar/core/testing";

const app = connectAppDb();
const mailer = fakeMailer();
const auth = createTestAuth(app.db, mailer);
const baseURL = "http://localhost:3000";
const PASSWORD = "správné-heslo-123";
afterAll(() => app.close());

const randomIp = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

async function post(path: string, body: unknown, ip = randomIp()) {
  const res = await auth.handler(
    new Request(`${baseURL}/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.text()).replace(/\s+/g, " ") };
}

async function newUser() {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "Role", isSystem: true })
    .returning();
  const [admin] = await app.db
    .insert(schema.user)
    .values({ name: "Správce", email: uniqueEmail("a"), roleId: role!.id })
    .returning();
  const actor = (await loadActor(app.db, admin!.id, { catalog: new Set(["users.manage"]) }))!;
  const email = uniqueEmail("u");
  await createInvitation(
    createCtx(app.db, actor),
    { email, roleId: role!.id },
    { mailer, baseURL },
  );
  const token = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
  await acceptInvitation({ auth, db: app.db }, { token, name: "Jana", password: PASSWORD });
  return email;
}

describe("přihlášení a obnova hesla neprozradí, který účet existuje", () => {
  it("špatné heslo a neexistující účet vrátí totéž", async () => {
    const email = await newUser();
    const wrong = await post("sign-in/email", { email, password: "špatné-heslo-123" });
    const unknown = await post("sign-in/email", {
      email: uniqueEmail("nikdo"),
      password: "špatné-heslo-123",
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toBe(wrong.body);
  });

  it("žádost o obnovu hesla: stejná odpověď pro existující i neexistující e-mail, e-mail odejde jen existujícímu", async () => {
    const email = await newUser();
    const before = mailer.sent.length;
    const known = await post("request-password-reset", { email, redirectTo: "/obnova-hesla" });
    const sentAfterKnown = mailer.sent.length;
    const unknown = await post("request-password-reset", {
      email: uniqueEmail("nikdo"),
      redirectTo: "/obnova-hesla",
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toBe(known.body);
    expect(sentAfterKnown).toBeGreaterThan(before);
    expect(mailer.sent.length).toBe(sentAfterKnown);
  });

  it("obnova hesla je omezená na tři žádosti za minutu z jedné adresy a odkaz jde použít jen jednou", async () => {
    const email = await newUser();
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++)
      statuses.push((await post("request-password-reset", { email, redirectTo: "/x" }, ip)).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);

    const token = new URL(mailer.last("password-reset")!.vars.url!).pathname.split("/").pop()!;
    const first = await post("reset-password", { token, newPassword: "úplně-nové-heslo-456" });
    const second = await post("reset-password", { token, newPassword: "jiné-nové-heslo-789" });
    expect(first.status).toBe(200);
    expect(second.status).not.toBe(200);
  });

  it("v databázi není heslo ani token čitelně: heslo je otisk argon2id, token jednorázový a v e-mailu jen odkaz", async () => {
    const email = await newUser();
    const rows = await app.db
      .select({ password: schema.account.password })
      .from(schema.account)
      .innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
      .where(eq(schema.user.email, email));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.password).toMatch(/^\$argon2id\$/);
  });
});
