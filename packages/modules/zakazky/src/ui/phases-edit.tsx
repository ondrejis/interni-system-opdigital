"use client";

import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  useCommandMutation,
} from "@rebar/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PhaseView } from "../contract";
import { MAX_PHASES, PHASE_ROLES, PHASE_ROLE_LABELS, type PhaseRole } from "../shared";

type Draft = {
  key: string;
  id?: string;
  name: string;
  role: PhaseRole | null;
  plannedStart: string | null;
  plannedEnd: string | null;
};

let seq = 0;
const key = () => `d${++seq}`;

/**
 * Okno úpravy fází jedné zakázky: názvy, pořadí, zvláštní role (vyhodnocení úvodní fáze, retainer) a plánovaná data.
 * Odebrání fáze, která už byla použitá, zachová úkoly (přejdou do „Bez fáze“); řeší to server (`zakazky.phases.edit`).
 */
export function PhasesEditDialog({
  jobId,
  phases,
  open,
  onOpenChange,
}: {
  jobId: string;
  phases: readonly PhaseView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() =>
    [...phases]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        key: key(),
        id: p.id,
        name: p.name,
        role: p.role,
        plannedStart: p.plannedStart,
        plannedEnd: p.plannedEnd,
      })),
  );
  const [error, setError] = useState<string | null>(null);
  const save = useCommandMutation<{
    jobId: string;
    phases: {
      id?: string;
      name: string;
      role: PhaseRole | null;
      plannedStart: string | null;
      plannedEnd: string | null;
    }[];
  }>("zakazky.phases.edit");

  const roles = rows.map((r) => r.role).filter(Boolean);
  const dupRole = new Set(roles).size !== roles.length;
  const invalid = rows.length === 0 || rows.some((r) => !r.name.trim()) || dupRole;
  const set = (i: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const to = i + dir;
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[to]] = [next[to]!, next[i]!];
      return next;
    });

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        jobId,
        phases: rows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          name: r.name.trim(),
          role: r.role,
          plannedStart: r.plannedStart,
          plannedEnd: r.plannedEnd,
        })),
      });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent
        title="Fáze zakázky"
        description="Změna se týká jen této zakázky, šablona zůstává beze změny."
        className="top-[8vh] w-[min(46rem,calc(100vw-2rem))]"
        data-testid="phases-dialog"
      >
        <div className="max-h-[62vh] space-y-2 overflow-y-auto px-5 py-4">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="grid items-center gap-2 rounded-lg border border-line p-2 md:grid-cols-[minmax(0,1fr)_11rem_9rem_9rem_auto]"
              data-testid="phase-row"
            >
              <Input
                aria-label={`Název fáze ${i + 1}`}
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                maxLength={160}
              />
              <select
                aria-label={`Zvláštní role fáze ${i + 1}`}
                className="h-8 rounded-md border border-line-strong bg-bg px-2 text-base"
                value={r.role ?? ""}
                onChange={(e) => set(i, { role: (e.target.value || null) as PhaseRole | null })}
              >
                <option value="">Běžná fáze</option>
                {PHASE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {PHASE_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <DatePicker
                value={r.plannedStart}
                onChange={(v) => set(i, { plannedStart: v })}
                placeholder="Začátek"
              />
              <DatePicker
                value={r.plannedEnd}
                onChange={(v) => set(i, { plannedEnd: v })}
                placeholder="Konec"
              />
              <div className="flex justify-end">
                <IconButton
                  label={`Posunout fázi ${r.name || i + 1} nahoru`}
                  size="sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={`Posunout fázi ${r.name || i + 1} dolů`}
                  size="sm"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  label={`Odebrat fázi ${r.name || i + 1}`}
                  size="sm"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            disabled={rows.length >= MAX_PHASES}
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { key: key(), name: "", role: null, plannedStart: null, plannedEnd: null },
              ])
            }
          >
            <Plus /> Přidat fázi
          </Button>
          {dupRole && (
            <p role="alert" className="text-sm text-danger">
              Každou zvláštní roli smí mít nejvýš jedna fáze.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={invalid}
            onClick={() => void submit()}
          >
            Uložit fáze
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
