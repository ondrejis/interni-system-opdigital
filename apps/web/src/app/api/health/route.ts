import { safeEqual } from "@rebar/core/http";
import { getHealth } from "@rebar/core/health";
import path from "node:path";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Stav systému pro monitoring. Chráněno tokenem (`Authorization: Bearer <HEALTH_TOKEN>`). */
export async function GET(req: Request) {
  const { env, db } = getServices();
  const token = env.HEALTH_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !safeEqual(given, token))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const report = await getHealth({
    db,
    dataDir: path.resolve(env.FILES_DIR),
    version: env.APP_VERSION,
    backupStatusFile: env.BACKUP_STATUS_FILE,
  });
  return Response.json(report, {
    status: report.status === "fail" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
