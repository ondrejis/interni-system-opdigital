"use client";

import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  FormSection,
  Input,
  Notice,
  SegmentedControl,
  SettingsPage,
  cn,
  type SegmentOption,
} from "@rebar/ui";
import { Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { runAction } from "@/lib/run-action";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
} from "@/server/admin-actions";

type Scope = "all" | "own";
type Level = "none" | Scope;
type Perm = {
  key: string;
  label: string;
  description: string | null;
  group: string;
  scoped: boolean;
};
type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  require2fa: boolean;
  userCount: number;
  permissions: Record<string, Scope>;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);

const levelOptions = (p: Perm): SegmentOption<Level>[] => [
  { value: "none", label: "Ne", tone: "neutral" },
  ...(p.scoped ? [{ value: "own" as const, label: "Jen moje" }] : []),
  { value: "all", label: p.scoped ? "Vše" : "Ano" },
];

/** Role a matice oprávnění: pro každé oprávnění „nic / jen moje / vše“. Systémová role (majitel) má vždy všechno a nejde měnit. */
export function RolesAdmin({ catalog, roles }: { catalog: Perm[]; roles: Role[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(roles[0]?.id);
  const [creating, setCreating] = useState(false);
  const role = roles.find((r) => r.id === selectedId) ?? roles[0];

  return (
    <SettingsPage
      width="xl"
      title="Role a oprávnění"
      description="Role určuje, co uživatel v systému vidí a smí. Každému účtu se přiřazuje jedna role."
      icon={<ShieldCheck />}
      actions={
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus /> Nová role
        </Button>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Role" className="min-w-0 @3xl:sticky @3xl:top-0">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 @3xl:mx-0 @3xl:flex-col @3xl:gap-1 @3xl:overflow-visible @3xl:px-0 @3xl:pb-0">
            {roles.map((r) => (
              <li key={r.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  aria-current={r.id === role?.id}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-150 @3xl:py-2.5",
                    r.id === role?.id
                      ? "border-[var(--accent-line)] bg-accent-soft"
                      : "border-line bg-bg hover:bg-hover",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  {r.isSystem && (
                    <Lock className="size-3.5 text-faint" aria-label="Systémová role" />
                  )}
                  <span className="rounded-full bg-hover px-1.5 text-sm text-muted tabular">
                    {r.userCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          {role && (
            <RoleEditor
              key={role.id}
              role={role}
              catalog={catalog}
              onChanged={() => router.refresh()}
              onDeleted={() => {
                setSelectedId(roles.find((r) => r.id !== role.id)?.id);
                router.refresh();
              }}
            />
          )}
        </div>
      </div>
      <CreateRole
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          setSelectedId(id);
          router.refresh();
        }}
      />
    </SettingsPage>
  );
}

function RoleEditor({
  role,
  catalog,
  onChanged,
  onDeleted,
}: {
  role: Role;
  catalog: Perm[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [require2fa, setRequire2fa] = useState(role.require2fa);
  const [levels, setLevels] = useState<Record<string, Level>>(() =>
    Object.fromEntries(catalog.map((p) => [p.key, role.permissions[p.key] ?? "none"])),
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const locked = role.isSystem;
  const groups = useMemo(
    () =>
      [...new Set(catalog.map((p) => p.group))].map((g) => ({
        name: g,
        perms: catalog.filter((p) => p.group === g),
      })),
    [catalog],
  );
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    require2fa !== role.require2fa ||
    catalog.some((p) => (levels[p.key] ?? "none") !== (role.permissions[p.key] ?? "none"));

  const changed = catalog.filter(
    (p) => (levels[p.key] ?? "none") !== (role.permissions[p.key] ?? "none"),
  );

  async function save() {
    setBusy(true);
    const meta = await runAction(
      updateRoleAction({ id: role.id, name, description: description || null, require2fa }),
    );
    const perms =
      meta &&
      (await runAction(
        setRolePermissionsAction({
          id: role.id,
          permissions: Object.fromEntries(
            Object.entries(levels).filter(([, v]) => v !== "none"),
          ) as Record<string, Scope>,
        }),
        "Role uložena.",
      ));
    setBusy(false);
    if (perms) onChanged();
    return !!perms;
  }

  async function remove() {
    const ok = await runAction(deleteRoleAction({ id: role.id }), "Role smazána.");
    if (ok) onDeleted();
    return !!ok;
  }

  return (
    <div className="space-y-6">
      {locked && (
        <Notice tone="info" title="Systémová role">
          Majitel má vždy všechna oprávnění a roli nejde změnit ani smazat.
        </Notice>
      )}

      <FormSection
        title="Základní údaje"
        description="Název a popis uvidí správci při přiřazování rolí."
      >
        <div className="grid gap-x-4 gap-y-3 @lg:grid-cols-2">
          <Field label="Název role" htmlFor="role-name">
            <Input
              id="role-name"
              value={name}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Popis" htmlFor="role-desc">
            <Input
              id="role-desc"
              value={description}
              disabled={locked}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <label
          className={cn(
            "mt-1 flex items-start gap-3 rounded-lg border border-line bg-subtle px-3 py-3",
            locked ? "cursor-default" : "cursor-pointer",
          )}
        >
          <Checkbox
            className="mt-0.5"
            checked={require2fa}
            disabled={locked}
            onCheckedChange={(v) => setRequire2fa(!!v)}
          />
          <span>
            <span className="block font-medium">Vyžadovat dvoufázové ověření (2FA)</span>
            <span className="block text-sm text-muted">
              Uživatelé v této roli musí mít zapnuté ověření kódem z aplikace, jinak se do systému
              nedostanou.
            </span>
          </span>
        </label>
      </FormSection>

      {groups.map((g) => (
        <FormSection
          key={g.name}
          aria-label={g.name}
          title={g.name}
          badge={
            <span className="text-sm text-muted tabular">
              {
                g.perms.filter((p) => (locked ? "all" : (levels[p.key] ?? "none")) !== "none")
                  .length
              }{" "}
              z {g.perms.length}
            </span>
          }
          flush
        >
          <ul className="divide-y divide-line border-t border-line">
            {g.perms.map((p) => (
              <li
                key={p.key}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <div>{p.label}</div>
                  {p.description && <div className="text-sm text-muted">{p.description}</div>}
                </div>
                <SegmentedControl
                  label={p.label}
                  disabled={locked}
                  value={locked ? "all" : (levels[p.key] ?? "none")}
                  onChange={(l) => setLevels((s) => ({ ...s, [p.key]: l }))}
                  options={levelOptions(p)}
                />
              </li>
            ))}
          </ul>
        </FormSection>
      ))}

      {!locked && (
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur md:-mx-6 md:-mb-6 md:px-6 lg:-mx-8 lg:-mb-8 lg:px-8">
          <Button
            variant="primary"
            loading={busy}
            disabled={!dirty}
            onClick={() => (changed.length ? setConfirmingSave(true) : void save())}
          >
            Uložit změny
          </Button>
          {dirty && <span className="text-sm text-muted">Neuložené změny</span>}
          {role.userCount > 0 ? <Chip>{role.userCount} uživatelů</Chip> : null}
          <Button variant="ghost" className="ml-auto text-danger" onClick={() => setRemoving(true)}>
            <Trash2 /> Smazat roli
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingSave}
        onOpenChange={setConfirmingSave}
        title="Změnit oprávnění role?"
        confirmLabel="Změnit oprávnění"
        onConfirm={save}
      >
        <p>
          Změna oprávnění role „<strong className="text-fg">{role.name}</strong>“ platí hned i pro
          přihlášené uživatele ({role.userCount}) a zapíše se do historie.
        </p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
          {changed.slice(0, 12).map((p) => (
            <li key={p.key}>
              {p.group}: {p.label} →{" "}
              {{ none: "bez přístupu", own: "jen moje", all: "vše" }[levels[p.key] ?? "none"]}
            </li>
          ))}
          {changed.length > 12 && <li>… a dalších {changed.length - 12}</li>}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Smazat roli?"
        confirmLabel="Smazat roli"
        danger
        onConfirm={remove}
      >
        <p>
          Role „<strong className="text-fg">{role.name}</strong>“ se nenávratně smaže.
          {role.userCount > 0 &&
            ` Role má přiřazeno ${role.userCount} uživatelů, nejdřív jim nastavte jinou.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function CreateRole({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(
      createRoleAction({ key: slug(name) || "role", name }),
      "Role vytvořena. Nastavte jí oprávnění.",
    );
    setBusy(false);
    if (res) {
      setName("");
      onOpenChange(false);
      onCreated(res.data.id);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nová role" description="Po vytvoření nastavíte, co role smí.">
        <form onSubmit={submit} className="px-5 py-4">
          <Field label="Název role" htmlFor="new-role">
            <Input
              id="new-role"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="např. Skladník"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={name.trim().length < 2}
            >
              Vytvořit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
