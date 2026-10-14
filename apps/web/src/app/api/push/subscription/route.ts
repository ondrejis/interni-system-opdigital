import { countSubscriptions, removeSubscription, replaceSubscription } from "@rebar/core/push";
import { z } from "zod";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const unauthorized = () =>
  Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });

/** Stav push upozornění přihlášeného: je zapnutý server, veřejný klíč a počet jeho zařízení. */
export async function GET(req: Request) {
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId) return unauthorized();
    const s = getServices();
    return Response.json({
      enabled: !!s.vapidPublicKey,
      publicKey: s.vapidPublicKey,
      devices: await countSubscriptions(ctx),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const subscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  /** Původní adresa odběru, který prohlížeč obnovil (`pushsubscriptionchange`): starý odběr se nahradí novým. */
  oldEndpoint: z.string().max(1000).nullish(),
});

/** Uloží odběr tohoto zařízení; váže se na aktuální relaci, ať jde po odhlášení zrušit. */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId) return unauthorized();
    const s = getServices();
    if (!s.vapidPublicKey)
      return Response.json(
        { error: "Push upozornění nejsou zapnutá.", code: "user_error" },
        { status: 422 },
      );
    const body = subscription.parse(await req.json().catch(() => null));
    const session = await s.auth.api.getSession({ headers: req.headers }).catch(() => null);
    await replaceSubscription(ctx, body.oldEndpoint ?? null, {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers.get("user-agent"),
      sessionId: session?.session.id ?? null,
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId) return unauthorized();
    const body = z
      .object({ endpoint: z.string().max(1000) })
      .parse(await req.json().catch(() => null));
    await removeSubscription(ctx, body.endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
