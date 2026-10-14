"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rebar/core/db";
import { enqueueDocumentMail, logDocumentMail, verifySmtp } from "@rebar/core/mail";
import { UserError } from "@rebar/core/rbac";
import { smtpSetting } from "@rebar/core/settings";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Nastavení odesílání e-mailů (SMTP): uložení, ověření spojení a zkušební e-mail. Jen pro správce (`settings.manage`).
  Heslo se ukládá zašifrované a zpět do prohlížeče se nikdy nevrací; prázdné pole při uložení znamená „ponechat“.
*/

const smtpInput = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(200),
  password: z.string().max(500).optional(),
  from: z.string().trim().max(200),
});

export const saveSmtpAction = defineAction({
  permission: "settings.manage",
  input: smtpInput,
  handler: async (ctx, i) => {
    if (i.enabled && !i.host)
      throw new UserError("Pro zapnutí odesílání vyplňte adresu SMTP serveru.");
    if (i.enabled && !i.from && !i.user)
      throw new UserError("Vyplňte adresu odesílatele (nebo přihlašovací jméno, které je e-mail).");
    const { password, ...rest } = i;
    await getServices().settings.set(ctx, smtpSetting, {
      ...rest,
      ...(password ? { password } : {}),
    });
  },
});

/** Zda je heslo uložené (samotné heslo se nevrací). */
export const verifySmtpAction = defineAction({
  permission: "settings.manage",
  input: smtpInput.omit({ enabled: true, from: true }),
  handler: async (ctx, i) => {
    if (!i.host) throw new UserError("Vyplňte adresu SMTP serveru.");
    const stored = await getServices().settings.get(ctx.db, smtpSetting);
    const r = await verifySmtp({
      host: i.host,
      port: i.port,
      secure: i.secure,
      user: i.user,
      password: i.password || stored.password,
      from: "",
    });
    if (!r.ok) throw new UserError(`Spojení se serverem se nepodařilo: ${r.error}`);
    return { ok: true as const };
  },
});

/** Zkušební e-mail na adresu přihlášeného správce; odešle ho worker (stav je vidět v logu odeslaných e-mailů). */
export const sendTestMailAction = defineAction({
  permission: "settings.manage",
  input: z.object({}),
  handler: async (ctx) => {
    const s = getServices();
    const smtp = await s.settings.get(ctx.db, smtpSetting);
    if (!smtp.enabled || !smtp.host)
      throw new UserError("Nejdřív zapněte odesílání a uložte nastavení serveru.");
    const [me] = await ctx.db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.actor.userId ?? ""));
    if (!me?.email) throw new UserError("Váš účet nemá e-mail.");
    const brand = (await s.getBranding()).name;
    const mail = {
      to: me.email,
      subject: `Zkušební e-mail — ${brand}`,
      body: `Dobrý den,\n\ntento zkušební e-mail potvrzuje, že odesílání ze systému ${brand} funguje.\n\n${brand}`,
    };
    const logId = await logDocumentMail(ctx.db, mail);
    await enqueueDocumentMail(
      { db: ctx.db, queue: s.queue, cipher: s.cipher, storage: s.storage },
      logId,
      mail,
    );
    return { to: me.email };
  },
});
