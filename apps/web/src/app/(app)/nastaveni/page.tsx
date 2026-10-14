import { redirect } from "next/navigation";
import { requireCtx } from "@/server/request";
import { allowedSections } from "./sections";

export default async function SettingsIndex() {
  const ctx = await requireCtx();
  redirect(allowedSections(ctx)[0]!.href);
}
