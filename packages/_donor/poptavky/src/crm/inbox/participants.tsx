"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Icon,
  IconButton,
  Input,
  Skeleton,
  errorToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import { ContactCombobox, type ContactHit } from "./forms";

type Participant = {
  id: string;
  personId: string;
  role: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  companyName: string | null;
};

/** Návrhy rolí na zakázce; role je volný text, návrhy jen urychlí zadání. */
export const PARTICIPANT_ROLES = [
  "Investor",
  "TDI",
  "Projektant",
  "Architekt",
  "Stavbyvedoucí",
  "Správce objektu",
] as const;

/** Tělo karty „Účastníci“ zakázky (viz `ParticipantsCard` v `components.tsx`). */
export function ParticipantsCardBody({ jobId }: { jobId: string }) {
  const api = useEntityApi();
  const { Link } = useNav();
  const can = useCan();
  const canWrite = can("zakazky.write");
  const list = useCommandQuery<Participant[]>("crm.participant.list", { jobId });
  const [pick, setPick] = useState<ContactHit | null>(null);
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState<{ id: string; role: string } | null>(null);
  const add = useCommandMutation<{ jobId: string; personId: string; role?: string }>(
    "crm.participant.add",
    {
      onSuccess: () => {
        setPick(null);
        setRole("");
      },
    },
  );
  const update = useCommandMutation<{ id: string; role?: string }>("crm.participant.update", {
    onSuccess: () => setEditing(null),
  });
  const remove = useCommandMutation<{ id: string }>("crm.participant.remove");

  return (
    <Card aria-label="Účastníci zakázky" data-testid="participants-card">
      <CardHeader title="Účastníci" count={list.data?.length ? list.data.length : undefined} />
      <CardBody>
        {list.isLoading ? (
          <Skeleton className="h-10" />
        ) : !list.data?.length ? (
          <p className="mb-2 text-sm text-muted">
            Zatím nikdo. Přidejte investora, TDI nebo projektanta.
          </p>
        ) : (
          <ul className="mb-3 divide-y divide-line-soft">
            {list.data.map((p) => {
              const href = api.hrefFor("person", p.personId);
              return (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {href ? (
                        <Link href={href} className="truncate font-medium hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{p.name}</span>
                      )}
                    </div>
                    <div className="truncate text-sm text-muted">
                      {[p.companyName, p.phone, p.email].filter(Boolean).join(" · ") ||
                        "Bez kontaktu"}
                    </div>
                  </div>
                  {editing?.id === p.id ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        update.mutate({ id: p.id, role: editing.role });
                      }}
                    >
                      <Input
                        autoFocus
                        aria-label="Role na zakázce"
                        list="participant-roles"
                        className="w-32"
                        value={editing.role}
                        onChange={(e) => setEditing({ id: p.id, role: e.target.value })}
                        maxLength={60}
                      />
                      <Button size="sm" variant="primary" type="submit" loading={update.isPending}>
                        Uložit
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      disabled={!canWrite}
                      className="chip hover:opacity-80 disabled:hover:opacity-100"
                      data-color={p.role ? "blue" : "gray"}
                      onClick={() => setEditing({ id: p.id, role: p.role ?? "" })}
                      aria-label={`Role: ${p.role || "bez role"}. Změnit.`}
                    >
                      {p.role || "bez role"}
                    </button>
                  )}
                  {canWrite && (
                    <IconButton
                      label={`Odebrat účastníka ${p.name}`}
                      onClick={() =>
                        remove.mutate({ id: p.id }, { onError: (e) => errorToast(e.message) })
                      }
                    >
                      <Icon name="x" />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <datalist id="participant-roles">
          {PARTICIPANT_ROLES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {canWrite && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (pick)
                add.mutate({
                  jobId,
                  personId: pick.id,
                  ...(role.trim() ? { role: role.trim() } : {}),
                });
            }}
          >
            <div className="min-w-0 flex-1">
              <ContactCombobox
                kind="person"
                value={pick?.id ?? null}
                selectedLabel={pick?.label}
                onChange={setPick}
                placeholder="Přidat osobu…"
                ariaLabel="Přidat účastníka"
              />
            </div>
            <Input
              aria-label="Role účastníka"
              list="participant-roles"
              className="sm:w-36"
              placeholder="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={60}
            />
            <Button type="submit" disabled={!pick} loading={add.isPending}>
              Přidat
            </Button>
          </form>
        )}
        {add.error && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {add.error.message}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
