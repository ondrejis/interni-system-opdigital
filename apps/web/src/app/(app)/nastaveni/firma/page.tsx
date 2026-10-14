import { brandingSetting, companySetting } from "@rebar/core/settings";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Firma a vzhled" };

export default async function CompanyPage() {
  const ctx = await requireCan("settings.manage");
  const { settings, runtime } = getServices();
  const [company, branding] = await Promise.all([
    settings.getForAdmin(ctx, companySetting),
    settings.getForAdmin(ctx, brandingSetting),
  ]);
  return (
    <CompanyForm
      company={company.value as Record<string, string | null>}
      branding={
        branding.value as {
          name: string | null;
          accentColor: string | null;
          logoFileId: string | null;
        }
      }
      defaults={{
        name: runtime.config.branding.name,
        accentColor: runtime.config.branding.accentColor,
      }}
    />
  );
}
