import { smtpSetting } from "@rebar/core/settings";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { EmailForm } from "./email-form";

export const metadata = { title: "E-maily" };

export default async function EmailPage() {
  const ctx = await requireCan("settings.manage");
  const smtp = await getServices().settings.getForAdmin(ctx, smtpSetting);
  const v = smtp.value as {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
  };
  return (
    <EmailForm
      initial={{
        enabled: v.enabled,
        host: v.host,
        port: v.port,
        secure: v.secure,
        user: v.user,
        from: v.from,
      }}
      passwordSet={smtp.secretsSet.includes("password")}
    />
  );
}
