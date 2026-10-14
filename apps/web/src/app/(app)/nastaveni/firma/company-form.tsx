"use client";

import { Button, FormSection, Input, SettingsPage, TextField, brandStyle, cn } from "@rebar/ui";
import { Building2, ImagePlus, Palette, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { runAction } from "@/lib/run-action";
import { saveBrandingAction, saveCompanyAction } from "@/server/admin-actions";

type Branding = { name: string | null; accentColor: string | null; logoFileId: string | null };

type FieldDef = { key: string; label: string; placeholder?: string; wide?: boolean; type?: string };
const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Firma",
    fields: [
      { key: "name", label: "Název firmy", wide: true },
      { key: "ico", label: "IČO", placeholder: "8 číslic" },
      { key: "dic", label: "DIČ" },
    ],
  },
  {
    title: "Sídlo",
    fields: [
      { key: "street", label: "Ulice a č. p.", wide: true },
      { key: "city", label: "Město" },
      { key: "zip", label: "PSČ" },
    ],
  },
  {
    title: "Kontakt a platby",
    fields: [
      { key: "email", label: "E-mail", type: "email" },
      { key: "phone", label: "Telefon", type: "tel" },
      { key: "web", label: "Web" },
      { key: "bankAccount", label: "Bankovní účet", placeholder: "např. 123456789/0100" },
    ],
  },
];

const PRESETS = ["#2563eb", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea", "#475569"];
const HEX = /^#[0-9a-f]{6}$/i;

/** Údaje o firmě (na dokladech a v e-mailech) a vzhled aplikace (název, barva, logo). Název a barva z konfigurace klienta jsou výchozí. */
export function CompanyForm({
  company,
  branding,
  defaults,
}: {
  company: Record<string, string | null>;
  branding: Branding;
  defaults: { name: string; accentColor: string };
}) {
  const router = useRouter();
  const [c, setC] = useState(company);
  const [b, setB] = useState(branding);
  const [busy, setBusy] = useState<"company" | "branding" | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy("company");
    const res = await runAction(
      saveCompanyAction({
        name: c.name ?? "",
        ico: c.ico ?? null,
        dic: c.dic ?? null,
        street: c.street ?? null,
        city: c.city ?? null,
        zip: c.zip ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        web: c.web ?? null,
        bankAccount: c.bankAccount ?? null,
      }),
      "Údaje o firmě uloženy.",
    );
    setBusy(null);
    if (res) router.refresh();
  }

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    setBusy("branding");
    const res = await runAction(saveBrandingAction(b), "Vzhled uložen.");
    setBusy(null);
    if (res) router.refresh();
  }

  async function uploadLogo(f: File) {
    const form = new FormData();
    form.set("file", f);
    const r = await fetch("/api/files", { method: "POST", body: form });
    const body = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!r.ok || !body.id)
      return void (await runAction(
        Promise.resolve({
          ok: false as const,
          error: body.error ?? "Logo se nepodařilo nahrát.",
          code: "upload",
        }),
      ));
    setB((s) => ({ ...s, logoFileId: body.id! }));
  }

  const color = HEX.test(b.accentColor ?? defaults.accentColor)
    ? (b.accentColor ?? defaults.accentColor)
    : defaults.accentColor;
  const shownName = b.name?.trim() || defaults.name;
  const badColor = !!b.accentColor && !HEX.test(b.accentColor);
  const companyDirty = JSON.stringify(c) !== JSON.stringify(company);
  const brandingDirty = JSON.stringify(b) !== JSON.stringify(branding);
  // náhled má vlastní hodnoty odvozené z barvy (kořenové se z ní počítají jen na <html>)
  const previewStyle = {
    ...brandStyle(color),
    "--accent-soft": `color-mix(in oklab, ${color} 12%, var(--bg))`,
    "--accent-hover": `color-mix(in oklab, ${color} 88%, black)`,
  } as React.CSSProperties;

  return (
    <SettingsPage
      width="lg"
      title="Firma a vzhled"
      description="Údaje, které se objeví na dokladech, a vzhled aplikace pro vaše uživatele."
      icon={<Building2 />}
    >
      <form onSubmit={saveCompany}>
        <FormSection
          title="Údaje o firmě"
          description="Objeví se na dokladech, v PDF a v e-mailech."
          icon={<Building2 />}
          footer={
            <>
              {companyDirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
              <Button type="submit" variant="primary" loading={busy === "company"}>
                Uložit údaje
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="min-w-0">
                <legend className="mb-3 text-xs font-medium uppercase tracking-wide text-faint">
                  {g.title}
                </legend>
                <div className="grid gap-x-4 gap-y-3 @lg:grid-cols-2">
                  {g.fields.map((f) => (
                    <div key={f.key} className={cn(f.wide && "@lg:col-span-2")}>
                      <TextField
                        density="compact"
                        label={f.label}
                        id={`co-${f.key}`}
                        {...(f.type ? { type: f.type } : {})}
                        value={c[f.key] ?? ""}
                        placeholder={f.placeholder ?? ""}
                        onChange={(e) => setC((s) => ({ ...s, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </FormSection>
      </form>

      <form onSubmit={saveBranding}>
        <FormSection
          title="Vzhled aplikace"
          description={`Název a barva, kterou uživatelé vidí. Prázdné pole = výchozí z nastavení systému (${defaults.name}).`}
          icon={<Palette />}
          footer={
            <>
              {brandingDirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
              <Button type="submit" variant="primary" loading={busy === "branding"}>
                Uložit vzhled
              </Button>
            </>
          }
        >
          <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-4">
              <TextField
                density="compact"
                label="Název systému"
                id="br-name"
                value={b.name ?? ""}
                placeholder={defaults.name}
                onChange={(e) => setB((s) => ({ ...s, name: e.target.value || null }))}
              />
              <div className="space-y-1.5">
                <label htmlFor="br-color" className="text-sm font-medium text-fg">
                  Barva
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Výběr barvy"
                    type="color"
                    value={color}
                    onChange={(e) => setB((s) => ({ ...s, accentColor: e.target.value }))}
                    className="size-8 cursor-pointer rounded-md border border-line-strong bg-bg p-0.5"
                  />
                  <Input
                    id="br-color"
                    className="w-28 font-mono"
                    value={b.accentColor ?? ""}
                    placeholder={defaults.accentColor}
                    aria-invalid={badColor || undefined}
                    onChange={(e) => setB((s) => ({ ...s, accentColor: e.target.value || null }))}
                  />
                  <div
                    className="flex items-center gap-1.5"
                    role="group"
                    aria-label="Doporučené barvy"
                  >
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        title={p}
                        aria-label={`Barva ${p}`}
                        aria-pressed={color.toLowerCase() === p}
                        onClick={() => setB((s) => ({ ...s, accentColor: p }))}
                        className="size-6 cursor-pointer rounded-full border border-black/10 ring-offset-2 ring-offset-bg transition-shadow aria-pressed:ring-2 aria-pressed:ring-fg"
                        style={{ background: p }}
                      />
                    ))}
                  </div>
                </div>
                <p className={cn("text-sm", badColor ? "text-danger" : "text-muted")}>
                  {badColor ? "Barva musí být ve tvaru #RRGGBB." : "Ve tvaru #RRGGBB."}
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-fg">Logo</span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-subtle p-1.5 text-faint">
                    {b.logoFileId ? (
                      <img
                        src={`/api/files/${b.logoFileId}`}
                        alt="Logo"
                        className="size-full object-contain"
                      />
                    ) : (
                      <ImagePlus className="size-5" aria-hidden />
                    )}
                  </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => file.current?.click()}>
                        {b.logoFileId ? "Změnit logo" : "Nahrát logo"}
                      </Button>
                      {b.logoFileId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setB((s) => ({ ...s, logoFileId: null }))}
                        >
                          <Trash2 /> Odebrat
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      PNG, JPEG nebo WebP. Bez loga se ukáže monogram.
                    </p>
                  </div>
                  <input
                    ref={file}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Náhled</p>
              <div
                style={previewStyle}
                aria-hidden
                className="overflow-hidden rounded-xl border border-line bg-subtle"
              >
                <div className="flex items-center gap-2 border-b border-line bg-bg px-3 py-2">
                  {b.logoFileId ? (
                    <img
                      src={`/api/files/${b.logoFileId}`}
                      alt=""
                      className="size-6 rounded object-contain"
                    />
                  ) : (
                    <span className="flex size-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-fg">
                      {shownName.trim().slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate text-base font-semibold">{shownName}</span>
                </div>
                <div className="space-y-1.5 p-3">
                  <div className="flex items-center gap-2 rounded-md bg-accent-soft px-2 py-1.5">
                    <span className="size-3 rounded-sm bg-accent" />
                    <span className="h-2 w-20 rounded-full bg-accent/40" />
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className="size-3 rounded-sm bg-active" />
                    <span className="h-2 w-14 rounded-full bg-active" />
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className="size-3 rounded-sm bg-active" />
                    <span className="h-2 w-24 rounded-full bg-active" />
                  </div>
                  <div className="pt-2">
                    <span className="inline-flex h-7 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg">
                      Uložit
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FormSection>
      </form>
    </SettingsPage>
  );
}
