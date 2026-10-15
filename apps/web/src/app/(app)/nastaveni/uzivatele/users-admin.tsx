"use client";

import { formatInstant } from "@rebar/core/time";
import {
  Button,
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
  SettingsPage,
  cn,
  errorToast,
  successToast,
} from "@rebar/ui";
import {
  Copy,
  History,
  KeyRound,
  Pencil,
  LogOut,
  Mail,
  MailPlus,
  MoreHorizontal,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { runAction } from "@/lib/run-action";
import {
  inviteUserAction,
  revokeInvitationAction,
  revokeUserSessionAction,
  revokeUserSessionsAction,
  sendPasswordResetAction,
  setUserActiveAction,
  setUserRoleAction,
  updateUserFieldsAction,
  userSecurityAction,
} from "@/server/user-actions";

type User = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  active: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  shortName: string | null;
  avatarColor: string | null;
  ico: string | null;
  billingTool: string | null;
  sessionCount: number;
};
type Role = { id: string; name: string; key: string; isSystem: boolean };
type Invitation = { id: string; email: string; roleName: string; expiresAt: string };
type SecurityEvent = {
  id: string;
  label: string;
  summary: string | null;
  ip: string | null;
  actorName: string | null;
  occurredAt: string;
};
type DeviceRow = { id: string; label: string; ip: string | null; lastActiveAt: string };

const when = (iso: string | null) => (iso ? formatInstant(iso, { year: true }) : "nikdy");

/** Sloupce tabulky (od šířky `xl`); užší obrazovky skládají řádek do karty. */
const COLS = "@4xl:grid-cols-[minmax(0,1fr)_11rem_6.5rem_9rem_6rem_2rem]";

type Pending =
  | { kind: "role"; user: User; roleId: string }
  | { kind: "deactivate"; user: User }
  | { kind: "logout"; user: User }
  | null;

/** Role `external` (Externista) se zatím nepoužívá, takže se v UI nenabízí; stávajícímu uživateli zůstane. */
const selectableRoles = (roles: Role[], current?: string) =>
  roles.filter((r) => r.key !== "external" || r.id === current);

/** Jednorázový odkaz pro nové heslo, když nejsou nastavené e-maily; ukáže se správci jednou. */
type ResetLink = { user: User; url: string; expiresAt: string };

/** Uživatelé, pozvánky a jejich správa: role, aktivní/neaktivní, odhlášení ze zařízení, odkaz pro nové heslo. */
export function UsersAdmin({
  me,
  users,
  roles,
  invitations,
}: {
  me: string;
  users: User[];
  roles: Role[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [invite, setInvite] = useState(false);
  const [security, setSecurity] = useState<{
    user: User;
    events: SecurityEvent[];
    sessions: DeviceRow[];
  } | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [resetLink, setResetLink] = useState<ResetLink | null>(null);
  const refresh = () => router.refresh();

  async function openSecurity(u: User) {
    const r = await runAction(userSecurityAction({ userId: u.id }));
    if (r) setSecurity({ user: u, events: r.data.events, sessions: r.data.sessions });
  }

  async function sendReset(u: User) {
    const res = await runAction(sendPasswordResetAction({ userId: u.id }));
    if (!res) return;
    if (res.data.delivery === "link")
      setResetLink({ user: u, url: res.data.url, expiresAt: res.data.expiresAt });
    else successToast(`Odkaz pro nastavení hesla odeslán na ${u.email}.`);
    refresh();
  }

  return (
    <SettingsPage
      width="xl"
      title="Uživatelé"
      description="Kdo má do systému přístup a s jakou rolí. Nové lidi zvete e-mailem."
      icon={<Users />}
      actions={
        <Button variant="primary" onClick={() => setInvite(true)}>
          <UserPlus /> Pozvat uživatele
        </Button>
      }
    >
      <FormSection
        title="Účty"
        badge={<Chip>{users.length}</Chip>}
        description="Změna role odhlásí uživatele ze všech zařízení."
        flush
      >
        <div role="table" aria-label="Účty uživatelů" className="border-t border-line">
          <div
            role="row"
            className={cn(
              "hidden gap-x-4 border-b border-line bg-subtle px-5 py-2 text-sm font-medium text-muted @4xl:grid",
              COLS,
            )}
          >
            <span role="columnheader">Uživatel</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">2FA</span>
            <span role="columnheader">Poslední přihlášení</span>
            <span role="columnheader">Stav</span>
            <span role="columnheader" className="sr-only">
              Akce
            </span>
          </div>
          <div role="rowgroup" className="divide-y divide-line">
            {users.map((u) => (
              <div
                key={u.id}
                role="row"
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 @4xl:grid @4xl:gap-x-4",
                  COLS,
                )}
              >
                <div
                  role="cell"
                  className={cn(
                    "order-1 flex w-[calc(100%-3rem)] min-w-0 items-center gap-3 @4xl:order-none @4xl:w-auto",
                    !u.active && "opacity-60",
                  )}
                >
                  <UserAvatar
                    name={u.name}
                    shortName={u.shortName}
                    color={u.avatarColor}
                    size={32}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {u.name}
                      {u.id === me && (
                        <span className="ml-1.5 text-sm font-normal text-muted">(vy)</span>
                      )}
                    </div>
                    <div className="truncate text-sm text-muted">
                      {u.email}
                      {(u.ico || u.billingTool) && (
                        <>
                          {" · "}
                          {[u.ico && `IČO ${u.ico}`, u.billingTool].filter(Boolean).join(" · ")}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div role="cell" className="order-3 w-full @md:w-52 @4xl:order-none @4xl:w-auto">
                  <Combobox
                    aria-label={`Role: ${u.name}`}
                    options={selectableRoles(roles, u.roleId).map((r) => ({
                      value: r.id,
                      label: r.name,
                    }))}
                    value={u.roleId}
                    onChange={(v) => {
                      if (v && v !== u.roleId)
                        setPending({ kind: "role", user: u, roleId: v as string });
                    }}
                    disabled={u.id === me}
                  />
                </div>
                <div role="cell" className="order-4 @4xl:order-none">
                  {u.twoFactorEnabled ? (
                    <Chip color="green">2FA zapnuto</Chip>
                  ) : (
                    <Chip>2FA vypnuto</Chip>
                  )}
                </div>
                <div
                  role="cell"
                  className="order-5 text-sm text-muted tabular @4xl:order-none @4xl:whitespace-nowrap"
                >
                  <span className="@4xl:hidden">Přihlášení: </span>
                  {when(u.lastLoginAt)}
                </div>
                <div role="cell" className="order-4 @4xl:order-none">
                  {u.active ? (
                    <Chip color="green" dot>
                      Aktivní
                    </Chip>
                  ) : (
                    <Chip color="red" dot>
                      Neaktivní
                    </Chip>
                  )}
                </div>
                <div role="cell" className="order-2 @4xl:order-none">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton label={`Akce: ${u.name}`} variant="ghost" size="sm">
                        <MoreHorizontal />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(u)}>
                        <Pencil /> Upravit zkratku, IČO a nástroj
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void sendReset(u)}>
                        <KeyRound /> Poslat odkaz pro nové heslo
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPending({ kind: "logout", user: u })}>
                        <LogOut /> Odhlásit všude
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void openSecurity(u)}>
                        <History /> Zařízení a přihlášení
                      </DropdownMenuItem>
                      {u.id !== me && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            danger={u.active}
                            onSelect={async () => {
                              if (u.active) return setPending({ kind: "deactivate", user: u });
                              if (
                                await runAction(
                                  setUserActiveAction({ userId: u.id, active: true }),
                                  "Uživatel aktivován.",
                                )
                              )
                                refresh();
                            }}
                          >
                            {u.active ? <UserX /> : <UserCheck />}
                            {u.active ? "Deaktivovat" : "Znovu aktivovat"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Čekající pozvánky"
        badge={<Chip>{invitations.length}</Chip>}
        description="Pozvánka platí 48 hodin. Po přijetí se uživatel objeví mezi účty; účty bez pozvánky vzniknout nemohou."
        flush
      >
        {invitations.length === 0 ? (
          <div className="flex flex-col items-center gap-1 border-t border-line px-6 py-8 text-center">
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg bg-hover text-muted">
              <MailPlus className="size-4" aria-hidden />
            </span>
            <p className="font-medium">Žádné čekající pozvánky</p>
            <p className="text-muted">Nové kolegy pozvete tlačítkem „Pozvat uživatele“.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-hover text-muted">
                  <Mail className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate font-medium">{i.email}</div>
                  <div className="text-sm text-muted">
                    {i.roleName} · platí do {when(i.expiresAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (await runAction(revokeInvitationAction({ id: i.id }), "Pozvánka zrušena."))
                      refresh();
                  }}
                >
                  Zrušit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <InviteDialog
        open={invite}
        onOpenChange={setInvite}
        roles={selectableRoles(roles)}
        onDone={refresh}
      />
      <FieldsDialog user={editing} onClose={() => setEditing(null)} onDone={refresh} />

      <ConfirmDialog
        open={pending?.kind === "role"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Změnit roli?"
        confirmLabel="Změnit roli"
        onConfirm={async () => {
          if (pending?.kind !== "role") return;
          const ok = await runAction(
            setUserRoleAction({ userId: pending.user.id, roleId: pending.roleId }),
            "Role změněna.",
          );
          if (ok) refresh();
          return !!ok;
        }}
      >
        {pending?.kind === "role" && (
          <p>
            Změnit roli uživatele <strong className="text-fg">{pending.user.name}</strong> na „
            {roles.find((r) => r.id === pending.roleId)?.name}“? Bude odhlášen ze všech zařízení.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "deactivate"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Deaktivovat uživatele?"
        confirmLabel="Deaktivovat"
        danger
        onConfirm={async () => {
          if (pending?.kind !== "deactivate") return;
          const ok = await runAction(
            setUserActiveAction({ userId: pending.user.id, active: false }),
            "Uživatel deaktivován.",
          );
          if (ok) refresh();
          return !!ok;
        }}
      >
        {pending?.kind === "deactivate" && (
          <p>
            Uživatel <strong className="text-fg">{pending.user.name}</strong> se nebude moci
            přihlásit. Účet můžete kdykoli znovu aktivovat.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "logout"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Odhlásit všude?"
        confirmLabel="Odhlásit všude"
        onConfirm={async () => {
          if (pending?.kind !== "logout") return;
          const ok = await runAction(
            revokeUserSessionsAction({ userId: pending.user.id }),
            "Uživatel odhlášen ze všech zařízení.",
          );
          if (ok) refresh();
          return !!ok;
        }}
      >
        {pending?.kind === "logout" && (
          <p>
            <strong className="text-fg">{pending.user.name}</strong> bude odhlášen ze všech
            zařízení, přestane se mu věřit zařízení (kód se vyžádá znovu)
            {pending.user.id === me ? " (včetně tohoto)" : ""} a při příští návštěvě se musí znovu
            přihlásit.
          </p>
        )}
      </ConfirmDialog>

      <ResetLinkDialog link={resetLink} onClose={() => setResetLink(null)} />

      <Dialog open={!!security} onOpenChange={(o) => !o && setSecurity(null)}>
        <DialogContent
          title={`Zařízení a přihlášení: ${security?.user.name ?? ""}`}
          className="w-[min(44rem,calc(100vw-2rem))]"
        >
          <div className="space-y-4 p-4" data-testid="user-security">
            <section>
              <h4 className="mb-1 font-semibold">Přihlášená zařízení</h4>
              {security && security.sessions.length === 0 ? (
                <p className="text-sm text-muted">Žádné aktivní přihlášení.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {security?.sessions.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="font-medium">{d.label}</span>
                        <span className="block text-sm text-muted">
                          {d.ip ? `${d.ip} · ` : ""}naposledy {when(d.lastActiveAt)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!security) return;
                          const ok = await runAction(
                            revokeUserSessionAction({
                              userId: security.user.id,
                              sessionId: d.id,
                            }),
                            "Zařízení odhlášeno.",
                          );
                          if (ok) {
                            setSecurity({
                              ...security,
                              sessions: security.sessions.filter((x) => x.id !== d.id),
                            });
                            refresh();
                          }
                        }}
                      >
                        Odhlásit
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4 className="mb-1 font-semibold">Bezpečnostní události</h4>
              {security && security.events.length === 0 ? (
                <EmptyState title="Zatím žádné události" />
              ) : (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-muted">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Kdy</th>
                        <th className="px-2 py-1.5 font-medium">Událost</th>
                        <th className="px-2 py-1.5 font-medium">Adresa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {security?.events.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap px-2 py-2 tabular">
                            {when(e.occurredAt)}
                          </td>
                          <td className="px-2 py-2">
                            <Chip color={/Neúspěšn|zablokov|Chybn/.test(e.label) ? "red" : "gray"}>
                              {e.label}
                            </Chip>
                            {e.actorName && (
                              <span className="ml-1.5 text-muted">provedl {e.actorName}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-muted">{e.ip ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  roles,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: Role[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId)
      return void (await runAction(
        Promise.resolve({ ok: false as const, error: "Vyberte roli.", code: "invalid_input" }),
      ));
    setBusy(true);
    const res = await runAction(
      inviteUserAction({ email, roleId }),
      `Pozvánka odeslána na ${email.trim()}.`,
    );
    setBusy(false);
    if (res) {
      setEmail("");
      setRoleId(null);
      onOpenChange(false);
      onDone();
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Pozvat uživatele"
        description="Pozvánka platí 48 hodin a přijde e-mailem. Uživatel si nastaví heslo a povinné dvoufázové ověření."
      >
        <form onSubmit={submit} className="px-5 py-4">
          <Field label="E-mail" htmlFor="inv-email">
            <Input
              id="inv-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Role">
            <Combobox
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              value={roleId}
              onChange={(v) => setRoleId(v as string | null)}
              placeholder="Vyberte roli…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Odeslat pozvánku
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetLinkDialog({ link, onClose }: { link: ResetLink | null; onClose: () => void }) {
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      successToast("Odkaz zkopírován.");
    } catch {
      errorToast("Zkopírování se nepovedlo. Označte odkaz a zkopírujte ho ručně.");
    }
  }
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Odkaz pro nové heslo"
        description={link ? `Pro ${link.user.name} (${link.user.email})` : undefined}
      >
        <div className="space-y-3 px-5 py-4">
          <Notice tone="info">
            Odesílání e-mailů není nastavené, proto odkaz nikam nepošleme. Předejte ho uživateli
            osobně nebo telefonem. Heslo si zvolí sám, vy ho neuvidíte.
          </Notice>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label="Odkaz pro nastavení hesla"
              value={link?.url ?? ""}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" onClick={() => void copy()}>
              <Copy /> Zkopírovat
            </Button>
          </div>
          <p className="text-sm text-muted">
            Platí hodinu a jde použít jen jednou. Po nastavení hesla se uživatel odhlásí ze všech
            zařízení. Odkaz už se nezobrazí; když ho ztratíte, vytvořte nový a ten starý přestane
            platit.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="primary" onClick={onClose}>
              Hotovo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Zkratka, IČO a fakturační nástroj uživatele (jen majitel). */
function FieldsDialog({
  user,
  onClose,
  onDone,
}: {
  user: User | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Údaje uživatele: ${user?.name ?? ""}`}
        description="Zkratka se ukazuje v rozpisech plateb a u avatarů. IČO a nástroj se používají při vyrovnání mezi fakturujícími."
      >
        {user && <FieldsForm key={user.id} user={user} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function FieldsForm({
  user,
  onClose,
  onDone,
}: {
  user: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const [shortName, setShortName] = useState(user.shortName ?? "");
  const [ico, setIco] = useState(user.ico ?? "");
  const [tool, setTool] = useState(user.billingTool ?? "");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(
      updateUserFieldsAction({ userId: user.id, shortName, ico, billingTool: tool }),
      "Údaje uloženy.",
    );
    setBusy(false);
    if (res) {
      onDone();
      onClose();
    }
  }
  return (
    <form onSubmit={submit} className="px-5 py-4">
      <Field label="Zkratka (2 až 4 znaky)" htmlFor="uf-short">
        <Input
          id="uf-short"
          maxLength={4}
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
        />
      </Field>
      <Field label="IČO (na které fakturuje)" htmlFor="uf-ico">
        <Input
          id="uf-ico"
          inputMode="numeric"
          maxLength={12}
          value={ico}
          onChange={(e) => setIco(e.target.value)}
        />
      </Field>
      <Field label="Fakturační nástroj (volný text)" htmlFor="uf-tool">
        <Input
          id="uf-tool"
          maxLength={80}
          placeholder="Fakturoid, iDoklad, Excel…"
          value={tool}
          onChange={(e) => setTool(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Uložit
        </Button>
      </div>
    </form>
  );
}
