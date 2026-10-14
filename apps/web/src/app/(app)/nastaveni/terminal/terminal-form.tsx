"use client";

import { Button, Checkbox, FormSection, Icon, Input, Notice, SettingsPage, cn } from "@rebar/ui";
import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runAction } from "@/lib/run-action";
import { saveTerminalSettingsAction } from "@/server/terminal-actions";
import { MoveButtons, moved } from "../_shared/config-ui";

export type TileRow = {
  key: string;
  /** Vlastní název; prázdný = výchozí název dlaždice. */
  label: string;
  defaultLabel: string;
  description: string;
  icon: string;
  enabled: boolean;
  page: boolean;
};
type Attendance = { requireJob: boolean; allowJobChange: boolean; showHours: boolean };
type Diary = { requirePhoto: boolean };
type RoleChoice = { key: string; name: string; locked: boolean };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (rows: readonly TileRow[]) =>
  rows.map((r) => ({ key: r.key, enabled: r.enabled, label: r.label.trim() }));

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-3 py-1.5", disabled && "opacity-60")}>
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(!!v)}
      />
      <span className="min-w-0">
        <span className="block text-base font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function TerminalSettingsForm({
  enabled,
  roles,
  tiles: initialTiles,
  selectedRoles,
  attendance: initialAttendance,
  diary: initialDiary,
  defaults,
  problems,
}: {
  enabled: boolean;
  roles: RoleChoice[];
  tiles: TileRow[];
  selectedRoles: string[];
  attendance: Attendance;
  diary: Diary;
  defaults: { roles: string[]; tiles: TileRow[]; attendance: Attendance; diary: Diary };
  problems: string[];
}) {
  const router = useRouter();
  const [tiles, setTiles] = useState(initialTiles);
  const [rolesSel, setRolesSel] = useState(selectedRoles);
  const [attendance, setAttendance] = useState(initialAttendance);
  const [diary, setDiary] = useState(initialDiary);
  const [busy, setBusy] = useState(false);

  const dirty =
    !sameJson(norm(tiles), norm(initialTiles)) ||
    !sameJson([...rolesSel].sort(), [...selectedRoles].sort()) ||
    !sameJson(attendance, initialAttendance) ||
    !sameJson(diary, initialDiary);

  async function save(reset = false) {
    setBusy(true);
    // hodnota shodná s výchozí z konfigurace se neukládá: pozdější změna konfigurace se pak projeví i tady
    const payload = reset
      ? { roles: null, tiles: null, attendance: null, diary: null }
      : {
          roles: sameJson([...rolesSel].sort(), [...defaults.roles].sort()) ? null : rolesSel,
          tiles: sameJson(norm(tiles), norm(defaults.tiles))
            ? null
            : tiles.map((t) => ({
                widget: t.key,
                enabled: t.enabled,
                ...(t.label.trim() ? { label: t.label.trim() } : {}),
              })),
          attendance: sameJson(attendance, defaults.attendance) ? null : attendance,
          diary: sameJson(diary, defaults.diary) ? null : diary,
        };
    const res = await runAction(
      saveTerminalSettingsAction(payload),
      reset ? "Obnoveno výchozí nastavení." : "Nastavení terminálu uloženo.",
    );
    setBusy(false);
    if (res) router.refresh();
  }

  function reset() {
    setTiles(defaults.tiles);
    setRolesSel(defaults.roles);
    setAttendance(defaults.attendance);
    setDiary(defaults.diary);
    void save(true);
  }

  return (
    <SettingsPage
      width="lg"
      title="Terminál řemeslníka"
      description="Mobilní obrazovka pro lidi na stavbě: jen to, co potřebují v terénu. Tady určíte, kdo ji používá, které dlaždice vidí a v jakém pořadí."
      icon={<Smartphone />}
      actions={
        <Button variant="secondary" onClick={reset} disabled={busy}>
          Obnovit výchozí
        </Button>
      }
    >
      {!enabled && (
        <Notice tone="warning" title="Terminál je v konfiguraci klienta vypnutý">
          Nastavení se uloží, ale terminál se nezobrazí, dokud ho dodavatel v konfiguraci nezapne.
        </Notice>
      )}
      {problems.map((p) => (
        <Notice key={p} tone="warning" title="Uložené nastavení je poškozené">
          {p}
        </Notice>
      ))}

      <FormSection
        title="Dlaždice"
        description="Zapněte, přejmenujte a seřaďte dlaždice. Řemeslník uvidí jen ty, na které má oprávnění a jejichž modul má firma zapnutý."
        footer={
          <>
            {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
            <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>
              Uložit
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-line" data-testid="terminal-tiles">
          {tiles.map((t, i) => (
            <li
              key={t.key}
              className="flex flex-wrap items-center gap-3 py-3"
              data-testid="tile-row"
            >
              <Checkbox
                aria-label={`Zobrazit dlaždici: ${t.label || t.defaultLabel}`}
                checked={t.enabled}
                onCheckedChange={(v) =>
                  setTiles((cur) => cur.map((x) => (x === t ? { ...x, enabled: !!v } : x)))
                }
              />
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon name={t.icon} className="size-4" />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <Input
                  aria-label={`Název dlaždice ${t.defaultLabel}`}
                  value={t.label}
                  maxLength={40}
                  placeholder={t.defaultLabel}
                  onChange={(e) =>
                    setTiles((cur) =>
                      cur.map((x) => (x === t ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
                <p className="mt-1 text-sm text-muted">{t.description}</p>
              </div>
              <div className="flex shrink-0 items-center">
                <MoveButtons
                  index={i}
                  count={tiles.length}
                  name={t.label || t.defaultLabel}
                  onMove={(d) => setTiles((cur) => moved(cur, i, d))}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Do spodní lišty telefonu se dostanou první tři zapnuté dlaždice s vlastní obrazovkou.
        </p>
      </FormSection>

      <FormSection
        title="Kdo používá jen terminál"
        description="Tyto role se po přihlášení dostanou rovnou do terminálu a do kancelářského rozhraní nevstoupí. Ostatní uživatelé si terminál mohou otevřít jako náhled."
      >
        <ul className="space-y-1">
          {roles.map((r) => (
            <li key={r.key}>
              <Toggle
                label={r.name}
                hint={r.locked ? "Spravuje systém, nelze omezit jen na terminál." : undefined}
                disabled={r.locked}
                checked={rolesSel.includes(r.key)}
                onChange={(v) =>
                  setRolesSel((cur) => (v ? [...cur, r.key] : cur.filter((k) => k !== r.key)))
                }
              />
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection title="Docházka v terminálu">
        <Toggle
          label="Příchod vyžaduje zakázku"
          hint="Bez vybrané zakázky nejde příchod zapsat."
          checked={attendance.requireJob}
          onChange={(v) => setAttendance((a) => ({ ...a, requireJob: v }))}
        />
        <Toggle
          label="Zakázku lze při příchodu měnit"
          hint="Vypnuto: použije se jediná zakázka řemeslníka nebo naposledy použitá; výběr se nabídne jen když není jasná."
          checked={attendance.allowJobChange}
          onChange={(v) => setAttendance((a) => ({ ...a, allowJobChange: v }))}
        />
        <Toggle
          label="Ukázat odpracované hodiny"
          hint="Dnes a tento týden, jen hodiny. Sazby a mzdy se v terminálu nikdy nezobrazují."
          checked={attendance.showHours}
          onChange={(v) => setAttendance((a) => ({ ...a, showHours: v }))}
        />
      </FormSection>

      <FormSection title="Deník v terminálu">
        <Toggle
          label="Zápis do deníku vyžaduje fotku"
          hint="Řemeslník musí přidat aspoň jednu fotku z místa."
          checked={diary.requirePhoto}
          onChange={(v) => setDiary({ requirePhoto: v })}
        />
      </FormSection>
    </SettingsPage>
  );
}
