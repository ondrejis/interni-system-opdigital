import { defaultVatRateBp, getDefaultVatCode, listAllVatRates } from "@rebar/core/config-data";
import { SettingsPage } from "@rebar/ui";
import { Percent } from "lucide-react";
import { requireCan } from "@/server/request";
import { VatAdmin } from "./vat-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sazby DPH" };

export default async function VatPage() {
  const ctx = await requireCan("settings.manage");
  const today = new Date().toISOString().slice(0, 10);
  const [rates, code, defaultBp] = await Promise.all([
    listAllVatRates(ctx.db),
    getDefaultVatCode(ctx.db),
    defaultVatRateBp(ctx.db, today),
  ]);
  const valid = (r: { validFrom: string; validTo: string | null }) =>
    r.validFrom <= today && (!r.validTo || r.validTo >= today);
  // výchozí je zvolená sazba, je-li dnes platná; jinak nejvyšší platná (stejně jako v dokladech)
  const effectiveDefault =
    rates.find((r) => valid(r) && r.code === code)?.code ??
    rates.find((r) => valid(r) && r.rateBp === defaultBp)?.code ??
    null;
  return (
    <SettingsPage
      width="lg"
      title="Sazby DPH"
      description="Sazby, ze kterých se vybírá u položek faktur, objednávek a rozpočtu."
      icon={<Percent />}
    >
      <VatAdmin
        defaultCode={effectiveDefault}
        explicitDefault={code}
        rates={rates.map((r) => ({
          id: r.id,
          code: r.code,
          label: r.label,
          rateBp: r.rateBp,
          validFrom: r.validFrom,
          validTo: r.validTo,
          status: valid(r) ? "valid" : r.validFrom > today ? "future" : "expired",
        }))}
        today={today}
      />
    </SettingsPage>
  );
}
