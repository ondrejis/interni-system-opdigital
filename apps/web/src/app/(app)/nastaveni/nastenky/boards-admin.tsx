"use client";

import type { DashboardSummary } from "@rebar/core/dashboards-shared";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  FormSection,
  IconButton,
  Input,
  Notice,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useNav,
} from "@rebar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import {
  cloneDashboardAction,
  dashboardCatalogAction,
  dashboardUserNamesAction,
  deleteDashboardAction,
  listAllDashboardsAction,
  setRoleDefaultAction,
  shareDashboardAction,
  updateDashboardAction,
} from "@/server/dashboard-actions";
import { lookupUsersAction } from "@/server/entity-actions";
import { unwrap } from "../_shared/action-query";
import { formatDateTime } from "../_shared/format";
import { SettingsTable, type TableColumn } from "../_shared/settings-table";
import {
  BOARD_KIND,
  authorText,
  boardKind,
  roleDefaults,
  sharedSummary,
  sharedWith,
  sortBoards,
  widgetCountText,
} from "./board-helpers";

type Role = { key: string; name: string };
type Data = { boards: DashboardSummary[]; roles: Role[]; userNames: Record<string, string> };

const QUERY_KEY = ["settings", "dashboards-admin"] as const;
const NO_ROLE = "__none";

async function load(): Promise<Data> {
  const boards = await unwrap(listAllDashboardsAction({}));
  const catalog = await unwrap(dashboardCatalogAction({}));
  const ids = [...new Set(boards.flatMap((b) => b.shared.users))];
  const users = ids.length ? await unwrap(dashboardUserNamesAction({ ids })) : [];
  return {
    boards,
    roles: catalog.roles,
    userNames: Object.fromEntries(users.map((u) => [u.id, u.name])),
  };
}

type Dialogs = { kind: "rename" | "share" | "default" | "delete"; board: DashboardSummary } | null;

/** Nastavení → Nástěnky: všechny nástěnky v systému, jejich sdílení a výchozí nástěnky rolí. */
export function BoardsAdmin({ canClone }: { canClone: boolean }) {
  const qc = useQueryClient();
  const { Link, push } = useNav();
  const q = useQuery({ queryKey: QUERY_KEY, queryFn: load, staleTime: 0 });
  const [dialog, setDialog] = useState<Dialogs>(null);
  const reload = useCallback(() => void qc.invalidateQueries({ queryKey: QUERY_KEY }), [qc]);

  const roleNames = useMemo(
    () => new Map((q.data?.roles ?? []).map((r) => [r.key, r.name])),
    [q.data?.roles],
  );
  const userNames = useMemo(
    () => new Map(Object.entries(q.data?.userNames ?? {})),
    [q.data?.userNames],
  );

  if (q.isLoading)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Načítám nástěnky">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <Notice tone="error" title="Nástěnky se nepodařilo načíst">
        <p>{q.error?.message ?? "Zkuste to prosím znovu."}</p>
        <Button className="mt-2" size="sm" onClick={() => void q.refetch()}>
          Zkusit znovu
        </Button>
      </Notice>
    );

  const { boards, roles } = q.data;
  const sorted = sortBoards(boards);

  async function clone(b: DashboardSummary) {
    const r = await cloneDashboardAction({ id: b.id });
    if (!r.ok) {
      errorToast(
        /nenalezena/i.test(r.error)
          ? "Tuhle nástěnku nejde klonovat, protože k ní nemáte přístup. Nejdřív ji sdílejte s sebou nebo se svou rolí."
          : r.error,
      );
      return;
    }
    successToast("Nástěnka naklonována. Najdete ji mezi svými nástěnkami.");
    reload();
  }

  const columns: TableColumn<DashboardSummary>[] = [
    {
      key: "name",
      header: "Název",
      primary: true,
      className: "@3xl:min-w-44",
      cell: (b) => (
        <Link
          href={`/prehled?board=${b.id}`}
          className="rounded-sm text-fg underline-offset-2 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-line)]"
        >
          {b.name}
        </Link>
      ),
    },
    {
      key: "author",
      header: "Autor",
      cell: (b) => (
        <span className={cn("block truncate", !b.ownerName && "text-muted")}>{authorText(b)}</span>
      ),
    },
    {
      key: "widgets",
      header: "Widgetů",
      cell: (b) => (
        <span className="tabular whitespace-nowrap">{widgetCountText(b.widgetCount)}</span>
      ),
    },
    {
      key: "kind",
      header: "Druh",
      cell: (b) => {
        const k = boardKind(b);
        const role = b.defaultForRole
          ? (roleNames.get(b.defaultForRole) ?? b.defaultForRole)
          : null;
        return (
          <span className="flex flex-wrap gap-1.5">
            <Chip color={BOARD_KIND[k].color}>{BOARD_KIND[k].label}</Chip>
            {role && <span className="text-sm text-muted">{role}</span>}
          </span>
        );
      },
    },
    {
      key: "shared",
      header: "Sdílená s",
      cell: (b) => {
        const names = sharedWith(b, roleNames, userNames);
        return (
          <span className="block truncate" title={names.join(", ")}>
            {sharedSummary(names)}
          </span>
        );
      },
    },
    {
      key: "updated",
      header: "Naposledy změněno",
      cell: (b) => <span className="tabular whitespace-nowrap">{formatDateTime(b.updatedAt)}</span>,
    },
  ];

  return (
    <>
      <RoleDefaults
        boards={boards}
        roles={roles}
        onChange={(b) => setDialog({ kind: "default", board: b })}
      />

      <FormSection
        title="Všechny nástěnky"
        description="Osobní nástěnky, sdílené nástěnky i sady, které systém založil při instalaci."
        flush
      >
        {sorted.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState
              icon={<LayoutDashboard />}
              title="Zatím žádné nástěnky"
              description="Nástěnky zakládají uživatelé na úvodní stránce tlačítkem pro novou nástěnku."
            />
          </div>
        ) : (
          <div className="border-t border-line">
            <SettingsTable
              label="Všechny nástěnky"
              testId="boards-table"
              columns={columns}
              rows={sorted}
              rowKey={(b) => b.id}
              actionsLabel="Akce"
              actions={(b) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton label={`Akce: ${b.name}`} variant="ghost" size="sm">
                      <MoreHorizontal />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => push(`/prehled?board=${b.id}`)}>
                      <ExternalLink /> Otevřít
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "rename", board: b })}>
                      <Pencil /> Přejmenovat
                    </DropdownMenuItem>
                    {canClone && (
                      <DropdownMenuItem onSelect={() => void clone(b)}>
                        <Copy /> Klonovat
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "share", board: b })}>
                      <Share2 /> Sdílet
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "default", board: b })}>
                      <Users /> Nastavit jako výchozí pro roli
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      danger
                      onSelect={() => setDialog({ kind: "delete", board: b })}
                    >
                      <Trash2 /> Smazat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            />
          </div>
        )}
      </FormSection>

      {dialog?.kind === "rename" && (
        <RenameDialog board={dialog.board} onClose={() => setDialog(null)} onDone={reload} />
      )}
      {dialog?.kind === "share" && (
        <ShareDialog
          board={dialog.board}
          roles={roles}
          userNames={userNames}
          onClose={() => setDialog(null)}
          onDone={reload}
        />
      )}
      {dialog?.kind === "default" && (
        <DefaultDialog
          board={dialog.board}
          roles={roles}
          onClose={() => setDialog(null)}
          onDone={reload}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Smazat nástěnku"
        description={dialog?.kind === "delete" ? dialog.board.name : ""}
        confirmLabel="Smazat nástěnku"
        danger
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          const r = await deleteDashboardAction({ id: dialog.board.id });
          if (!r.ok) {
            errorToast(r.error);
            return false;
          }
          successToast("Nástěnka smazána.");
          reload();
        }}
      >
        Nástěnka zmizí všem, kdo ji používají. Vrátit se to nedá.
      </ConfirmDialog>
    </>
  );
}

/* ---------- souhrn výchozích nástěnek podle rolí ---------- */

function RoleDefaults({
  boards,
  roles,
  onChange,
}: {
  boards: DashboardSummary[];
  roles: Role[];
  onChange: (b: DashboardSummary) => void;
}) {
  const { Link } = useNav();
  const rows = roleDefaults(boards, roles);
  return (
    <FormSection
      title="Výchozí nástěnky podle rolí"
      description="Nástěnka, kterou uživatel dané role dostane bez vlastního nastavení. Bez výchozí nástěnky vidí klasický Přehled."
      icon={<Home />}
    >
      {rows.length === 0 ? (
        <p className="text-base text-muted">V systému zatím nejsou žádné role.</p>
      ) : (
        <ul className="divide-y divide-line" data-testid="role-defaults">
          {rows.map((r) => (
            <li
              key={r.roleKey}
              className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 @xl:flex-row @xl:items-center @xl:gap-4"
            >
              <span className="font-medium @xl:w-48 @xl:shrink-0">{r.roleName}</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                {r.boards.length === 0 ? (
                  <span className="text-muted">Klasický Přehled</span>
                ) : (
                  r.boards.map((b) => (
                    <span key={b.id} className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/prehled?board=${b.id}`}
                        className="rounded-sm underline-offset-2 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-line)]"
                      >
                        {b.name}
                      </Link>
                      {b.isHome && <Chip color="blue">Úvodní stránka</Chip>}
                    </span>
                  ))
                )}
              </div>
              {r.boards.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start @xl:self-auto"
                  aria-label={`Změnit výchozí nástěnku role ${r.roleName}`}
                  onClick={() => {
                    const b = boards.find((x) => x.id === r.boards[0]!.id);
                    if (b) onChange(b);
                  }}
                >
                  Změnit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

/* ---------- dialogy ---------- */

function DialogFooter({
  onClose,
  submitLabel,
  busy,
  disabled,
}: {
  onClose: () => void;
  submitLabel: string;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
        Zrušit
      </Button>
      <Button type="submit" variant="primary" loading={busy} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mb-3 text-sm text-danger">
      {message}
    </p>
  ) : null;
}

function RenameDialog({
  board,
  onClose,
  onDone,
}: {
  board: DashboardSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(board.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Přejmenovat nástěnku" description={board.name}>
        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const r = await updateDashboardAction({ id: board.id, name: name.trim() });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            successToast("Nástěnka přejmenována.");
            onDone();
            onClose();
          }}
        >
          <Field label="Název nástěnky">
            <Input
              value={name}
              maxLength={60}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <DialogFooter
            onClose={onClose}
            submitLabel="Uložit"
            busy={busy}
            disabled={!name.trim() || name.trim() === board.name}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  board,
  roles,
  userNames,
  onClose,
  onDone,
}: {
  board: DashboardSummary;
  roles: Role[];
  userNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [roleKeys, setRoleKeys] = useState<string[]>(board.shared.roles);
  const [userIds, setUserIds] = useState<string[]>(board.shared.users);
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(userNames));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rolesLabel = useId();

  const lookup = useCallback(async (query: string) => {
    const r = await lookupUsersAction({ q: query });
    if (!r.ok) return [];
    setLabels((prev) => ({
      ...prev,
      ...Object.fromEntries(r.data.map((u) => [u.value, u.label])),
    }));
    return r.data;
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title="Sdílení nástěnky"
        description={`${board.name}. Sdílení nahradí dosavadní nastavení.`}
      >
        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const r = await shareDashboardAction({ id: board.id, roles: roleKeys, users: userIds });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            successToast("Sdílení uloženo.");
            onDone();
            onClose();
          }}
        >
          <div className="mb-3">
            <p id={rolesLabel} className="mb-1.5 text-sm font-medium text-muted">
              Role
            </p>
            {roles.length === 0 ? (
              <p className="text-sm text-faint">V systému nejsou žádné role.</p>
            ) : (
              <div
                role="group"
                aria-labelledby={rolesLabel}
                className="grid gap-x-3 gap-y-1 @sm:grid-cols-2"
              >
                {roles.map((r) => (
                  <label
                    key={r.key}
                    className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1 hover:bg-hover pointer-coarse:min-h-11"
                  >
                    <Checkbox
                      checked={roleKeys.includes(r.key)}
                      onCheckedChange={(v) =>
                        setRoleKeys((prev) =>
                          v ? [...prev, r.key] : prev.filter((k) => k !== r.key),
                        )
                      }
                    />
                    <span className="min-w-0 truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-muted">Uživatelé</p>
            <Combobox
              aria-label="Přidat uživatele"
              placeholder="Přidat uživatele…"
              searchPlaceholder="Hledat podle jména…"
              emptyText="Nikdo nenalezen"
              multiple
              load={lookup}
              value={userIds}
              selectedLabels={labels}
              onChange={(v) => setUserIds(Array.isArray(v) ? v : v ? [v] : [])}
              trigger={
                <button
                  type="button"
                  aria-label="Přidat uživatele"
                  className="flex h-8 w-full items-center rounded-md border border-line-strong bg-bg px-2.5 text-left text-base text-faint hover:border-faint"
                >
                  Přidat uživatele…
                </button>
              }
            />
            {userIds.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Vybraní uživatelé">
                {userIds.map((id) => (
                  <li key={id}>
                    <Chip className="gap-1">
                      {labels[id] ?? "Neznámý uživatel"}
                      <button
                        type="button"
                        aria-label={`Odebrat ${labels[id] ?? "uživatele"}`}
                        className="-mr-1 inline-flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-hover"
                        onClick={() => setUserIds((prev) => prev.filter((x) => x !== id))}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FormError message={error} />
          <DialogFooter onClose={onClose} submitLabel="Uložit sdílení" busy={busy} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DefaultDialog({
  board,
  roles,
  onClose,
  onDone,
}: {
  board: DashboardSummary;
  roles: Role[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [roleKey, setRoleKey] = useState<string>(board.defaultForRole ?? NO_ROLE);
  const [home, setHome] = useState(board.isHome);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const none = roleKey === NO_ROLE;
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title="Výchozí nástěnka pro roli"
        description={`${board.name}. Uživatelé této role ji uvidí mezi svými nástěnkami.`}
      >
        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const r = await setRoleDefaultAction({
              id: board.id,
              roleKey: none ? null : roleKey,
              home: !none && home,
            });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            successToast(none ? "Nástěnka už není výchozí." : "Výchozí nástěnka nastavena.");
            onDone();
            onClose();
          }}
        >
          <Field label="Role">
            <Combobox
              aria-label="Role"
              value={roleKey}
              options={[
                { value: NO_ROLE, label: "Žádná", hint: "běžná nástěnka" },
                ...roles.map((r) => ({ value: r.key, label: r.name })),
              ]}
              onChange={(v) => v && setRoleKey(v as string)}
            />
          </Field>
          <label
            className={cn(
              "mb-3 flex cursor-pointer items-start gap-2 rounded-md py-1 pointer-coarse:min-h-11",
              none && "cursor-default opacity-50",
            )}
          >
            <Checkbox
              className="mt-0.5"
              checked={!none && home}
              disabled={none}
              onCheckedChange={(v) => setHome(!!v)}
            />
            <span>
              Otevírat na úvodní stránce místo klasického Přehledu
              <span className="mt-1.5 block text-sm text-faint">
                Pro jednu roli může být na úvodní stránce jen jedna nástěnka, dosavadní se přepne.
              </span>
            </span>
          </label>
          <FormError message={error} />
          <DialogFooter onClose={onClose} submitLabel="Uložit" busy={busy} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
