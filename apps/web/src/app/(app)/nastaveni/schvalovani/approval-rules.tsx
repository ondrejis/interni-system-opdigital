"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  FormSection,
  IconButton,
  MoneyInput,
  Notice,
  Skeleton,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Rule = {
  id: string;
  docType: string;
  minAmountMinor: number;
  approverPermission: string | null;
  approverId: string | null;
  approverName: string | null;
  active: boolean;
};
type Data = { rules: Rule[]; approvers: { id: string; name: string }[] };

const DOC_TYPES = [
  { key: "change", label: "Změny (vícepráce a méněpráce)" },
  { key: "statement", label: "Soupisy provedených prací" },
  { key: "order", label: "Objednávky" },
  { key: "received_invoice", label: "Přijaté faktury" },
] as const;

const PERM_LABEL: Record<string, string> = {
  "zakazky.approve": "Schvalovatel do limitu",
  "zakazky.approve_all": "Schvalovatel bez limitu",
};

const approverText = (r: Rule) =>
  r.approverId
    ? `Konkrétní osoba: ${r.approverName ?? "neznámý uživatel"}`
    : (PERM_LABEL[r.approverPermission ?? "zakazky.approve"] ?? r.approverPermission);

/** Hodnota výběru schvalovatele: oprávnění, nebo konkrétní uživatel. */
const toChoice = (r: Pick<Rule, "approverId" | "approverPermission">) =>
  r.approverId ? `user:${r.approverId}` : `perm:${r.approverPermission ?? "zakazky.approve"}`;

function RuleDialog({
  docType,
  rule,
  approvers,
  onClose,
}: {
  docType: string;
  rule: Rule | null;
  approvers: Data["approvers"];
  onClose: () => void;
}) {
  const [limit, setLimit] = useState<number | null>(rule ? rule.minAmountMinor : 0);
  const [choice, setChoice] = useState<string>(rule ? toChoice(rule) : "perm:zakazky.approve_all");
  const save = useCommandMutation<Record<string, unknown>>("zakazky.approval.rules.save", {
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={rule ? "Upravit pravidlo" : "Nové pravidlo"}
        description={DOC_TYPES.find((d) => d.key === docType)?.label ?? docType}
      >
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              ...(rule ? { id: rule.id } : {}),
              docType,
              minAmountMinor: limit ?? 0,
              active: rule?.active ?? true,
              ...(choice.startsWith("user:")
                ? { approverId: choice.slice(5) }
                : { approverPermission: choice.slice(5) }),
            });
          }}
        >
          <Field
            label="Od částky (bez DPH)"
            hint="Pravidlo platí pro doklady od této částky; vyšší pravidlo má přednost. Částky pod nejnižším limitem se schválí samy."
          >
            <MoneyInput aria-label="Od částky" value={limit} onChange={setLimit} />
          </Field>
          <Field label="Kdo schvaluje">
            <Combobox
              aria-label="Kdo schvaluje"
              value={choice}
              options={[
                {
                  value: "perm:zakazky.approve",
                  label: "Schvalovatel do limitu",
                  hint: "oprávnění „Schvaluje doklady do svého limitu“",
                },
                {
                  value: "perm:zakazky.approve_all",
                  label: "Schvalovatel bez limitu",
                  hint: "oprávnění „Schvaluje bez limitu“",
                },
                ...approvers.map((a) => ({
                  value: `user:${a.id}`,
                  label: a.name,
                  hint: "konkrétní osoba",
                })),
              ]}
              onChange={(v) => v && setChoice(v as string)}
            />
          </Field>
          {save.error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {save.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={limit === null}
            >
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pravidla schvalování po typech dokladů: od jaké částky a kdo schvaluje. */
export function ApprovalRules() {
  const q = useCommandQuery<Data>("zakazky.approval.rules.list", {});
  const save = useCommandMutation<Record<string, unknown>>("zakazky.approval.rules.save");
  const del = useCommandMutation<{ id: string }>("zakazky.approval.rules.delete");
  const [editing, setEditing] = useState<{ docType: string; rule: Rule | null } | null>(null);
  const [removing, setRemoving] = useState<Rule | null>(null);
  if (q.isLoading || !q.data) return <Skeleton className="h-48" />;
  const { rules, approvers } = q.data;
  return (
    <>
      <Notice tone="info" title="Jak to funguje">
        Doklad s částkou pod nejnižším limitem se schválí automaticky. Od limitu ho schvaluje ten,
        kdo má příslušné oprávnění. Schvalovatel nesmí schválit vlastní doklad, to smí jen
        schvalovatel bez limitu. Schválený doklad se zamkne; vrátit ho do konceptu smí jen
        schvalovatel bez limitu.
      </Notice>
      {DOC_TYPES.map((t) => {
        const own = rules.filter((r) => r.docType === t.key);
        return (
          <FormSection
            key={t.key}
            title={t.label}
            flush
            footer={
              <Button onClick={() => setEditing({ docType: t.key, rule: null })}>
                <Plus /> Přidat pravidlo
              </Button>
            }
          >
            {own.length === 0 ? (
              <p className="px-5 pb-4 text-base text-muted">
                Bez pravidla se doklady tohoto typu schvalují automaticky.
              </p>
            ) : (
              <ul
                className="divide-y divide-line border-t border-line"
                data-testid={`rules-${t.key}`}
              >
                {own.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <label className="flex min-w-48 flex-1 items-center gap-3">
                      <Checkbox
                        aria-label={`Pravidlo od ${formatMinor(r.minAmountMinor)} je zapnuté`}
                        checked={r.active}
                        onCheckedChange={(v) =>
                          save.mutate({
                            id: r.id,
                            docType: r.docType,
                            minAmountMinor: r.minAmountMinor,
                            active: !!v,
                            ...(r.approverId
                              ? { approverId: r.approverId }
                              : { approverPermission: r.approverPermission }),
                          })
                        }
                      />
                      <span>
                        <span className="font-medium">Od {formatMinor(r.minAmountMinor)}</span>
                        <span className="block text-sm text-muted">{approverText(r)}</span>
                      </span>
                    </label>
                    {!r.active && <Chip>Vypnuto</Chip>}
                    <div className="flex gap-1">
                      <IconButton
                        label={`Upravit pravidlo od ${formatMinor(r.minAmountMinor)}`}
                        variant="ghost"
                        onClick={() => setEditing({ docType: t.key, rule: r })}
                      >
                        <Pencil />
                      </IconButton>
                      <IconButton
                        label={`Smazat pravidlo od ${formatMinor(r.minAmountMinor)}`}
                        variant="ghost"
                        onClick={() => setRemoving(r)}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        );
      })}
      {(save.error || del.error) && (
        <p role="alert" className="text-sm text-danger">
          {(save.error ?? del.error)!.message}
        </p>
      )}
      {editing && (
        <RuleDialog
          key={editing.rule?.id ?? "new"}
          docType={editing.docType}
          rule={editing.rule}
          approvers={approvers}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Smazat pravidlo"
        description={removing ? `Od ${formatMinor(removing.minAmountMinor)}` : ""}
        confirmLabel="Smazat"
        danger
        onConfirm={() =>
          removing ? del.mutateAsync({ id: removing.id }).then(() => undefined) : undefined
        }
      >
        Doklady s touto částkou se pak budou schvalovat podle nižšího pravidla, nebo automaticky.
      </ConfirmDialog>
    </>
  );
}
