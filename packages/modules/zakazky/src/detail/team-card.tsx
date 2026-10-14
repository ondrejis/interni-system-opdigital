"use client";

import {
  Avatar,
  Button,
  Combobox,
  IconButton,
  Input,
  Skeleton,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import { Trash2 } from "lucide-react";
import { useState } from "react";

type Team = {
  managerId: string | null;
  members: { userId: string; role: string | null; name: string }[];
};

function RoleCell({
  role,
  canEdit,
  onSave,
}: {
  role: string | null;
  canEdit: boolean;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(role ?? "");
  if (!canEdit) return <span className="text-sm text-muted">{role ?? ""}</span>;
  if (editing)
    return (
      <Input
        autoFocus
        aria-label="Role v týmu"
        className="h-7 w-32"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if ((value.trim() || null) !== role) onSave(value.trim() || null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(role ?? "");
            setEditing(false);
          }
        }}
      />
    );
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded px-1 text-sm text-muted hover:bg-hover"
      aria-label={role ? `Změnit roli (${role})` : "Doplnit roli"}
    >
      {role ?? "doplnit roli"}
    </button>
  );
}

/** Tým zakázky v pravém panelu Přehledu: kdo je na zakázce, v jaké roli; přidání, změna role a odebrání na místě. */
export function TeamCard({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const api = useEntityApi();
  const q = useCommandQuery<Team>("zakazky.team.list", { jobId });
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const add = useCommandMutation<{ jobId: string; userId: string; role: string | null }>(
    "zakazky.team.add",
    {
      onSuccess: () => {
        setUser(null);
        setRole("");
      },
    },
  );
  const remove = useCommandMutation<{ jobId: string; userId: string }>("zakazky.team.remove");

  return (
    <section aria-label="Tým zakázky" className="rounded-lg border border-line p-4">
      <h3 className="mb-2 text-sm font-semibold">Tým</h3>
      {q.isLoading ? (
        <Skeleton className="h-12" />
      ) : !q.data?.members.length ? (
        <p className="text-sm text-muted">
          Zatím tu nikdo není. Člen týmu zakázku vidí i s oprávněním „jen moje“.
        </p>
      ) : (
        <ul className="divide-y divide-line" data-testid="job-team">
          {q.data.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-1.5">
              <Avatar name={m.name} size={22} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <RoleCell
                role={m.role}
                canEdit={canEdit}
                onSave={(v) => add.mutate({ jobId, userId: m.userId, role: v })}
              />
              {canEdit && (
                <IconButton
                  label={`Odebrat ${m.name} z týmu`}
                  variant="ghost"
                  size="sm"
                  onClick={() => remove.mutate({ jobId, userId: m.userId })}
                >
                  <Trash2 />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <Combobox
              load={api.lookups.users}
              value={user}
              onChange={(v) => setUser(v as string | null)}
              placeholder="Přidat člena…"
              searchPlaceholder="Najít uživatele…"
            />
          </div>
          <Input
            aria-label="Role v týmu"
            placeholder="Role (mistr)"
            className="w-28"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={!user}
            loading={add.isPending}
            onClick={() => user && add.mutate({ jobId, userId: user, role: role || null })}
          >
            Přidat
          </Button>
        </div>
      )}
      {(add.error || remove.error) && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {((add.error ?? remove.error) as Error).message}
        </p>
      )}
    </section>
  );
}
