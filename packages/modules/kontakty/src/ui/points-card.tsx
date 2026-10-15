"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Combobox,
  Input,
  Skeleton,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { useState } from "react";
import type { PointKind, PointLabel, PointRow } from "../contract";
import { EmailLink, PhoneLink } from "./contact-links";

export const POINT_LABELS: { value: PointLabel; label: string }[] = [
  { value: "work", label: "Práce" },
  { value: "mobile", label: "Mobil" },
  { value: "private", label: "Soukromý" },
];
const labelOf = (v: string | null) => POINT_LABELS.find((l) => l.value === v)?.label ?? "";

type Draft = {
  id?: string;
  kind: PointKind;
  value: string;
  label: PointLabel | null;
  isPrimary: boolean;
};

/**
 * Editor kontaktních údajů: víc e-mailů a telefonů se štítkem a jedním hlavním od každého druhu (KON-01).
 * Používá ho karta osoby i formulář rychlého založení (`draft` bez ukládání).
 */
export function PointsEditor({
  value,
  onChange,
}: {
  value: Draft[];
  onChange: (next: Draft[]) => void;
}) {
  const set = (i: number, patch: Partial<Draft>) =>
    onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const makePrimary = (i: number) =>
    onChange(value.map((x, j) => (x.kind === value[i]!.kind ? { ...x, isPrimary: j === i } : x)));
  return (
    <div className="space-y-2" data-testid="points-editor">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_auto_auto] items-center gap-2">
          <Input
            aria-label={p.kind === "email" ? "E-mail" : "Telefon"}
            placeholder={p.kind === "email" ? "E-mail" : "Telefon (+420 777 123 456)"}
            value={p.value}
            maxLength={200}
            onChange={(e) => set(i, { value: e.target.value })}
          />
          <Combobox
            aria-label="Štítek"
            options={POINT_LABELS}
            value={p.label}
            onChange={(v) => set(i, { label: (v as PointLabel | null) ?? null })}
            placeholder="Štítek"
            clearable
          />
          <label className="flex items-center gap-1 text-sm text-muted">
            <input
              type="radio"
              name={`primary-${p.kind}`}
              checked={p.isPrimary}
              onChange={() => makePrimary(i)}
              className="accent-[var(--accent)]"
            />
            Hlavní
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            Odebrat
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(["phone", "email"] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            onClick={() =>
              onChange([
                ...value,
                {
                  kind,
                  value: "",
                  label: null,
                  isPrimary: !value.some((x) => x.kind === kind),
                },
              ])
            }
          >
            {kind === "phone" ? "Přidat telefon" : "Přidat e-mail"}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Rozpracovaný kontaktní údaj ve formuláři. */
export type PointDraft = Draft;

/** Karta „Kontaktní údaje“ na detailu osoby: čtení s voláním a kopírováním, úprava po kliknutí. */
export function PointsCard({ personId }: { personId: string }) {
  const can = useCan();
  const q = useCommandQuery<PointRow[]>("kontakty.person.points", { personId });
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const save = useCommandMutation<
    {
      personId: string;
      points: {
        id?: string;
        kind: PointKind;
        value: string;
        label: PointLabel | null;
        isPrimary: boolean;
      }[];
    },
    PointRow[]
  >("kontakty.person.setPoints", {
    onSuccess: () => {
      setDraft(null);
      successToast("Kontaktní údaje jsou uložené.");
    },
    invalidate: [["command"], ["entity"]],
  });
  const rows = q.data ?? [];
  return (
    <Card aria-label="Kontaktní údaje" data-testid="person-points">
      <CardHeader
        title="Telefony a e-maily"
        count={rows.length || undefined}
        action={
          can("kontakty.write") && !draft ? (
            <Button
              size="sm"
              onClick={() =>
                setDraft(
                  rows.map((r) => ({
                    id: r.id,
                    kind: r.kind,
                    value: r.value,
                    label: r.label,
                    isPrimary: r.isPrimary,
                  })),
                )
              }
            >
              Upravit
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {q.isLoading ? (
          <Skeleton className="h-10" />
        ) : draft ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ personId, points: draft.filter((d) => d.value.trim()) });
            }}
          >
            <PointsEditor value={draft} onChange={setDraft} />
            {save.error && (
              <p role="alert" className="text-sm text-danger">
                {save.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Zrušit
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Uložit
              </Button>
            </div>
          </form>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Žádný telefon ani e-mail.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                {r.kind === "phone" ? <PhoneLink value={r.value} /> : <EmailLink value={r.value} />}
                <span className="flex items-center gap-1">
                  {r.isPrimary && <Chip color="green">Hlavní</Chip>}
                  {r.label && <Chip>{labelOf(r.label)}</Chip>}
                  {!r.valid && <Chip color="yellow">Neplatné číslo</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
