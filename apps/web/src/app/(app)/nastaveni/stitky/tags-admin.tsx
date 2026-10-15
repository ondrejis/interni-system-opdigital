"use client";

import { Button, Chip, Input, errorToast, successToast } from "@rebar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { TagInfo as Tag } from "@rebar/core/tags";
import {
  createTagAction,
  deleteTagAction,
  listTagsAction,
  updateTagAction,
} from "@/server/tags-actions";
import { ColorPicker } from "../_shared/config-ui";
import { unwrap } from "../_shared/action-query";

/** Správa štítků: přidání, přejmenování, barva, rozsah (entity) a archivace/smazání. */
export function TagsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tags"], queryFn: () => unwrap(listTagsAction({})) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["tags"] });
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("blue");
  const [scopes, setScopes] = useState<string[]>([]);
  const entities = q.data?.entities ?? [];
  const add = useMutation({
    mutationFn: () => unwrap(createTagAction({ label, color, scopes })),
    onSuccess: () => {
      setLabel("");
      successToast("Štítek přidán.");
      refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const upd = useMutation({
    mutationFn: (v: Parameters<typeof updateTagAction>[0]) => unwrap(updateTagAction(v)),
    onSuccess: refresh,
    onError: (e: Error) => errorToast(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => unwrap(deleteTagAction({ id })),
    onSuccess: (r) => {
      successToast(r.archived ? "Štítek se používá, proto je archivovaný." : "Štítek smazán.");
      refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });
  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  const tags = (q.data?.tags ?? []) as Tag[];
  return (
    <div className="space-y-6" data-testid="tags-admin">
      <form
        className="space-y-3 rounded-lg border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) add.mutate();
        }}
      >
        <h3 className="font-semibold">Nový štítek</h3>
        <Input
          aria-label="Název štítku"
          placeholder="Např. VIP, Doporučení, Reklamace"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-sm"
        />
        <ColorPicker value={color} onChange={setColor} />
        <ScopePicker
          entities={entities}
          value={scopes}
          onToggle={(k) => setScopes((s) => toggle(s, k))}
        />
        <Button type="submit" variant="primary" loading={add.isPending} disabled={!label.trim()}>
          Přidat štítek
        </Button>
      </form>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {tags.length === 0 && <li className="p-4 text-muted">Zatím žádné štítky.</li>}
        {tags.map((t) => {
          const used = Object.values(t.usage).reduce((a, b) => a + b, 0);
          return (
            <li key={t.id} className="space-y-2 p-3" data-testid={`tag-${t.value}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Chip color={t.color ?? "gray"}>{t.label}</Chip>
                <Input
                  aria-label={`Název štítku ${t.label}`}
                  defaultValue={t.label}
                  className="max-w-56"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== t.label) upd.mutate({ id: t.id, label: v });
                  }}
                />
                <span className="text-sm text-muted">
                  {used > 0 ? `Použito: ${used}` : "Nepoužito"}
                  {!t.active ? " · archivováno" : ""}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => upd.mutate({ id: t.id, active: !t.active })}
                  >
                    {t.active ? "Archivovat" : "Obnovit"}
                  </Button>
                  <Button variant="ghost" onClick={() => del.mutate(t.id)}>
                    Smazat
                  </Button>
                </div>
              </div>
              <ColorPicker
                value={t.color ?? "gray"}
                onChange={(c) => upd.mutate({ id: t.id, color: c })}
                label={`Barva štítku ${t.label}`}
              />
              <ScopePicker
                entities={entities}
                value={t.scopes}
                onToggle={(k) => upd.mutate({ id: t.id, scopes: toggle(t.scopes, k) })}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScopePicker({
  entities,
  value,
  onToggle,
}: {
  entities: { key: string; label: string }[];
  value: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-3 text-sm">
      <legend className="sr-only">Kde se štítek nabízí</legend>
      <span className="text-muted">Nabízí se u:</span>
      {entities.map((e) => (
        <label key={e.key} className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.includes(e.key)} onChange={() => onToggle(e.key)} />
          {e.label}
        </label>
      ))}
      <span className="text-faint">{value.length === 0 ? "(nic nezaškrtnuto = všude)" : ""}</span>
    </fieldset>
  );
}
