"use client";

import type { DashboardSummary } from "@rebar/core/dashboards-shared";
import { useState } from "react";
import { Button } from "../components/button";
import { Combobox } from "../components/combobox";
import { Field } from "../components/input";
import { Dialog, DialogContent } from "../components/overlay";
import { errorToast, successToast } from "../components/toast";
import { useEntityApi } from "../data/context";
import { useDashboardApi, type SourceCatalog } from "./api";

/**
 * Sdílení nástěnky s rolemi a konkrétními lidmi. Každý, komu je sdílená, vidí v widgetech jen data, na která má sám
 * oprávnění; sdílení tedy neodemyká žádná data.
 */
export function ShareDialog({
  summary,
  catalog,
  onClose,
  onSaved,
}: {
  summary: DashboardSummary;
  catalog: SourceCatalog | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useDashboardApi();
  const entityApi = useEntityApi();
  const [roles, setRoles] = useState<string[]>(summary.shared.roles);
  const [users, setUsers] = useState<string[]>(summary.shared.users);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.share(summary.id, { roles, users });
      successToast("Sdílení je uložené.");
      onSaved();
      onClose();
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Sdílet nástěnku „${summary.name}“`}
        description="Každý uvidí jen ta data, na která má oprávnění."
      >
        <div className="px-5 py-4" data-testid="share-dialog">
          <Field label="Role" htmlFor="share-roles">
            <Combobox
              multiple
              value={roles}
              onChange={(v) => setRoles((v as string[]) ?? [])}
              options={(catalog?.roles ?? []).map((r) => ({ value: r.key, label: r.name }))}
              placeholder="Vyberte role"
              aria-label="Role"
            />
          </Field>
          <Field label="Konkrétní lidé" htmlFor="share-users">
            <Combobox
              multiple
              value={users}
              selectedLabels={labels}
              onChange={(v) => setUsers((v as string[]) ?? [])}
              load={async (q) => {
                const r = await entityApi.lookups.users(q);
                setLabels((l) => ({
                  ...l,
                  ...Object.fromEntries(r.map((o) => [o.value, o.label])),
                }));
                return r;
              }}
              placeholder="Vyberte lidi"
              searchPlaceholder="Hledat jméno…"
              aria-label="Konkrétní lidé"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              Uložit sdílení
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
