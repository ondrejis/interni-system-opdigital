"use client";

import {
  Button,
  Combobox,
  FormSection,
  InstallHint,
  SegmentedControl,
  SettingsPage,
} from "@rebar/ui";
import { Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyAppearance } from "@/lib/appearance";
import { runAction } from "@/lib/run-action";
import { updateAppearanceAction } from "@/server/account-actions";

type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";
type Values = { theme: Theme; density: Density; startPage: string | null };

/** Výchozí úvodní stránka (bez volby se jde na Přehled). */
const DEFAULT_START = "__default";

export function AppearanceForm({
  initial,
  startPages,
}: {
  initial: Values;
  startPages: { href: string; label: string }[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(updateAppearanceAction(value), "Vzhled uložen.");
    setBusy(false);
    if (!res) return;
    setSaved(res.data);
    applyAppearance(res.data);
    router.refresh();
  }

  return (
    <SettingsPage
      title="Vzhled"
      description="Motiv, hustota řádků a stránka, na kterou se dostanete po přihlášení. Nastavení platí jen pro váš účet a na všech vašich zařízeních."
      icon={<Palette />}
    >
      <form onSubmit={save}>
        <FormSection
          title="Zobrazení"
          icon={<Palette />}
          footer={
            <>
              {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
              <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
                Uložit vzhled
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <p className="text-base font-medium">Motiv</p>
              <SegmentedControl<Theme>
                label="Motiv"
                value={value.theme}
                onChange={(theme) => {
                  setValue({ ...value, theme });
                  applyAppearance({ theme, density: value.density }); // náhled hned
                }}
                options={[
                  { value: "light", label: "Světlý" },
                  { value: "dark", label: "Tmavý" },
                  { value: "system", label: "Podle systému" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-medium">Hustota řádků</p>
              <SegmentedControl<Density>
                label="Hustota řádků"
                value={value.density}
                onChange={(density) => {
                  setValue({ ...value, density });
                  applyAppearance({ theme: value.theme, density });
                }}
                options={[
                  { value: "comfortable", label: "Pohodlná" },
                  { value: "compact", label: "Kompaktní" },
                ]}
              />
              <p className="text-sm text-muted">
                Kompaktní hustota ukáže v seznamech a tabulkách víc řádků na obrazovku.
              </p>
            </div>
            <div className="max-w-sm space-y-1.5">
              <p className="text-base font-medium">Úvodní stránka po přihlášení</p>
              <Combobox
                aria-label="Úvodní stránka po přihlášení"
                options={[
                  { value: DEFAULT_START, label: "Výchozí (Přehled)" },
                  ...startPages.map((p) => ({ value: p.href, label: p.label })),
                ]}
                value={value.startPage ?? DEFAULT_START}
                onChange={(v) =>
                  setValue({ ...value, startPage: v && v !== DEFAULT_START ? (v as string) : null })
                }
              />
            </div>
            <InstallHint />
          </div>
        </FormSection>
      </form>
    </SettingsPage>
  );
}
