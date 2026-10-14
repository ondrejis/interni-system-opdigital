"use client";

import {
  Button,
  Checkbox,
  Combobox,
  Field,
  FormSection,
  Input,
  Notice,
  Skeleton,
  Textarea,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { FileText, Mail, Receipt, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DEFAULT_MAIL_TEMPLATES,
  EXAMPLE_VARIABLES,
  MAIL_VARIABLES,
  renderMailText,
} from "./dispatch/templates";

type OfferTemplate = {
  introText: string;
  termsText: string;
  footerText: string;
  footerContact: boolean;
  validityDays: number;
};

type Settings = {
  dueDays: number;
  introText: string;
  footerText: string;
  showQr: boolean;
  vatPayer: boolean | null;
  reverseChargeCpa: string;
  termsText: string;
  notesText: string;
  footerContact: boolean;
  mailCc: string;
  mailInvoiceSubject: string;
  mailInvoiceBody: string;
  mailReminderSubject: string;
  mailReminderBody: string;
  offer: OfferTemplate;
};

function Variables() {
  return (
    <details className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-muted">
        Proměnné, které lze v textu použít
      </summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {MAIL_VARIABLES.map((v) => (
          <div key={v.key} className="flex items-baseline gap-2">
            <dt>
              <code className="rounded bg-hover px-1 py-0.5 text-xs">{`{${v.key}}`}</code>
            </dt>
            <dd className="text-muted">{v.label}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function MailPreview({ subject, body }: { subject: string; body: string }) {
  const r = renderMailText({ subject, body }, EXAMPLE_VARIABLES);
  return (
    <div className="rounded-lg border border-line p-3" data-testid="template-preview">
      <p className="text-sm text-muted">Náhled s ukázkovými údaji</p>
      <p className="mt-1 break-words font-medium">{r.subject}</p>
      <hr className="my-2 border-line" />
      <p className="whitespace-pre-wrap break-words">{r.body}</p>
    </div>
  );
}

export function SettingsPage() {
  const nav = useNav();
  const q = useCommandQuery<Settings>("fakturace.settings.get", {});
  const [s, setS] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<"invoice" | "reminder" | null>(null);
  useEffect(() => {
    if (q.data && !s) setS(q.data);
  }, [q.data, s]);
  const save = useCommandMutation<Settings>("fakturace.settings.save", {
    onSuccess: () => successToast("Nastavení fakturace uloženo."),
  });
  if (q.isError)
    return (
      <div className="p-4 md:p-6">
        <Notice tone="error">{(q.error as Error).message}</Notice>
      </div>
    );
  if (!s)
    return (
      <div className="p-4 md:p-6">
        <Skeleton className="h-40" />
      </div>
    );
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const setOffer = (patch: Partial<OfferTemplate>) =>
    setS({ ...s, offer: { ...s.offer, ...patch } });
  const num = (v: string) => Number(v.replace(/\D/g, ""));

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <form
        className="mx-auto max-w-3xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(s);
        }}
      >
        <FormSection
          title="Splatnost a daně"
          icon={<Receipt />}
          description="Výchozí chování nově vystavených faktur."
        >
          <div className="grid gap-x-3 sm:grid-cols-3">
            <Field label="Splatnost ve dnech" htmlFor="fs-due">
              <Input
                id="fs-due"
                inputMode="numeric"
                value={String(s.dueDays)}
                onChange={(e) => set({ dueDays: num(e.target.value) })}
              />
            </Field>
            <Field label="Plátce DPH" hint="Výchozí je podle DIČ firmy.">
              <Combobox
                options={[
                  { value: "auto", label: "Podle DIČ" },
                  { value: "yes", label: "Plátce DPH" },
                  { value: "no", label: "Neplátce DPH" },
                ]}
                value={s.vatPayer === null ? "auto" : s.vatPayer ? "yes" : "no"}
                onChange={(v) => set({ vatPayer: v === "auto" ? null : v === "yes" })}
              />
            </Field>
            <Field
              label="Kód CZ-CPA (PDP)"
              htmlFor="fs-cpa"
              hint="Tiskne se u přenesené daňové povinnosti, např. 41–43."
            >
              <Input
                id="fs-cpa"
                value={s.reverseChargeCpa ?? ""}
                onChange={(e) => set({ reverseChargeCpa: e.target.value })}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Šablona faktury (PDF)"
          icon={<FileText />}
          description="Texty, které se tisknou na každou fakturu, zálohu a dobropis."
        >
          <Field label="Úvodní text nad položkami" htmlFor="fs-intro">
            <Textarea
              id="fs-intro"
              value={s.introText}
              onChange={(e) => set({ introText: e.target.value })}
            />
          </Field>
          <Field
            label="Poznámka pod položkami"
            htmlFor="fs-notes"
            hint="Tiskne se, když doklad nemá vlastní poznámku."
          >
            <Textarea
              id="fs-notes"
              value={s.notesText}
              onChange={(e) => set({ notesText: e.target.value })}
            />
          </Field>
          <Field
            label="Platební podmínky"
            htmlFor="fs-terms"
            hint="Např. penále za prodlení, způsob úhrady, reklamace."
          >
            <Textarea
              id="fs-terms"
              value={s.termsText}
              onChange={(e) => set({ termsText: e.target.value })}
            />
          </Field>
          <Field
            label="Patička dokladu"
            htmlFor="fs-footer"
            hint="Např. zápis v obchodním rejstříku. Prázdné = název firmy."
          >
            <Input
              id="fs-footer"
              value={s.footerText}
              onChange={(e) => set({ footerText: e.target.value })}
            />
          </Field>
          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={s.footerContact}
              onCheckedChange={(v) => set({ footerContact: !!v })}
            />{" "}
            Přidat do patičky kontakt firmy (e-mail, telefon, web z údajů o firmě)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={s.showQr} onCheckedChange={(v) => set({ showQr: !!v })} /> Tisknout
            QR platbu (vyžaduje číslo účtu v údajích o firmě)
          </label>
        </FormSection>

        <FormSection
          title="Šablona nabídky (PDF)"
          icon={<ScrollText />}
          description="Texty na PDF nabídky zakázky."
        >
          <Field label="Úvodní text nabídky" htmlFor="fo-intro">
            <Textarea
              id="fo-intro"
              value={s.offer.introText}
              onChange={(e) => setOffer({ introText: e.target.value })}
            />
          </Field>
          <Field
            label="Podmínky nabídky"
            htmlFor="fo-terms"
            hint="Platební podmínky, záruka, způsob provedení, co cena nezahrnuje."
          >
            <Textarea
              id="fo-terms"
              className="min-h-24"
              value={s.offer.termsText}
              onChange={(e) => setOffer({ termsText: e.target.value })}
            />
          </Field>
          <div className="grid gap-x-3 sm:grid-cols-[1fr_10rem]">
            <Field label="Patička nabídky" htmlFor="fo-footer">
              <Input
                id="fo-footer"
                value={s.offer.footerText}
                onChange={(e) => setOffer({ footerText: e.target.value })}
              />
            </Field>
            <Field label="Platnost (dnů)" htmlFor="fo-days" hint="0 = netiskne se">
              <Input
                id="fo-days"
                inputMode="numeric"
                value={String(s.offer.validityDays)}
                onChange={(e) => setOffer({ validityDays: num(e.target.value) })}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={s.offer.footerContact}
              onCheckedChange={(v) => setOffer({ footerContact: !!v })}
            />{" "}
            Přidat do patičky kontakt firmy
          </label>
        </FormSection>

        <FormSection
          title="E-maily s doklady"
          icon={<Mail />}
          description="Text e-mailu s fakturou a upomínkou. Při odesílání ho lze ještě upravit."
        >
          <div className="space-y-3">
            <Notice tone="info">
              Server pro odesílání (SMTP) se nastavuje v{" "}
              <a
                href="/nastaveni/email"
                className="font-medium underline underline-offset-2"
                onClick={(e) => {
                  e.preventDefault();
                  nav.push("/nastaveni/email");
                }}
              >
                Nastavení → E-maily
              </a>
              . Odesílatelem je název vaší firmy, odpovědi chodí na e-mail z údajů o firmě.
            </Notice>
            <Variables />
            <Field
              label="Výchozí kopie"
              htmlFor="fs-cc"
              hint="Až 5 adres oddělených čárkou, dostanou kopii každého odeslaného dokladu."
            >
              <Input
                id="fs-cc"
                value={s.mailCc}
                onChange={(e) => set({ mailCc: e.target.value })}
                placeholder="účetní@firma.cz"
              />
            </Field>
            <p className="text-sm font-medium text-muted">Faktura</p>
            <Field label="Předmět" htmlFor="fs-mis">
              <Input
                id="fs-mis"
                value={s.mailInvoiceSubject}
                onChange={(e) => set({ mailInvoiceSubject: e.target.value })}
              />
            </Field>
            <Field label="Text e-mailu" htmlFor="fs-mib">
              <Textarea
                id="fs-mib"
                className="min-h-40"
                value={s.mailInvoiceBody}
                onChange={(e) => set({ mailInvoiceBody: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview(preview === "invoice" ? null : "invoice")}
              >
                {preview === "invoice" ? "Skrýt náhled" : "Náhled"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  set({
                    mailInvoiceSubject: DEFAULT_MAIL_TEMPLATES.invoiceSubject,
                    mailInvoiceBody: DEFAULT_MAIL_TEMPLATES.invoiceBody,
                  })
                }
              >
                Obnovit výchozí text
              </Button>
            </div>
            {preview === "invoice" && (
              <MailPreview subject={s.mailInvoiceSubject} body={s.mailInvoiceBody} />
            )}
            <p className="pt-2 text-sm font-medium text-muted">Upomínka po splatnosti</p>
            <Field label="Předmět" htmlFor="fs-mrs">
              <Input
                id="fs-mrs"
                value={s.mailReminderSubject}
                onChange={(e) => set({ mailReminderSubject: e.target.value })}
              />
            </Field>
            <Field label="Text e-mailu" htmlFor="fs-mrb">
              <Textarea
                id="fs-mrb"
                className="min-h-40"
                value={s.mailReminderBody}
                onChange={(e) => set({ mailReminderBody: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview(preview === "reminder" ? null : "reminder")}
              >
                {preview === "reminder" ? "Skrýt náhled" : "Náhled"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  set({
                    mailReminderSubject: DEFAULT_MAIL_TEMPLATES.reminderSubject,
                    mailReminderBody: DEFAULT_MAIL_TEMPLATES.reminderBody,
                  })
                }
              >
                Obnovit výchozí text
              </Button>
            </div>
            {preview === "reminder" && (
              <MailPreview subject={s.mailReminderSubject} body={s.mailReminderBody} />
            )}
          </div>
        </FormSection>

        {save.error && <Notice tone="error">{(save.error as Error).message}</Notice>}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            data-testid="save-settings"
          >
            Uložit nastavení
          </Button>
        </div>
      </form>
    </div>
  );
}
