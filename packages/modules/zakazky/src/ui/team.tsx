"use client";

import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  EmptyState,
  IconButton,
  Skeleton,
  SegmentedControl,
  errorToast,
  useCommandMutation,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { Trash2, Users } from "lucide-react";
import { useState } from "react";
import type { JobDetail, MemberView } from "../contract";
import { MEMBER_ROLE_LABELS, type MemberRole } from "../shared";
import { useJobDetail } from "./hooks";
import { LoadError, UserCombobox } from "./parts";

/** Přidání, změna role a odebrání členů týmu zakázky (vlastník je v týmu vždy, mezi členy se nevypisuje). */
export function TeamEditor({
  jobId,
  members,
  canEdit,
}: {
  jobId: string;
  members: readonly MemberView[];
  canEdit: boolean;
}) {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>("member");
  const add = useCommandMutation<{ jobId: string; userId: string; role: MemberRole }>(
    "zakazky.team.add",
  );
  const remove = useCommandMutation<{ jobId: string; userId: string }>("zakazky.team.remove");
  const labels = Object.fromEntries(members.map((m) => [m.userId, m.name]));

  return (
    <div className="space-y-3" data-testid="job-team">
      {members.length === 0 ? (
        <p className="text-sm text-muted">
          Zatím tu nikdo další není. Člen týmu zakázku vidí i s oprávněním „jen moje“.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-1.5">
              <Avatar name={m.name} size={22} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {canEdit ? (
                <select
                  aria-label={`Role: ${m.name}`}
                  className="h-7 rounded-md border border-line-strong bg-bg px-1.5 text-sm"
                  value={m.role}
                  onChange={(e) =>
                    add.mutate(
                      { jobId, userId: m.userId, role: e.target.value as MemberRole },
                      { onError: (err) => errorToast(err.message) },
                    )
                  }
                >
                  {(Object.keys(MEMBER_ROLE_LABELS) as MemberRole[]).map((r) => (
                    <option key={r} value={r}>
                      {MEMBER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-muted">{MEMBER_ROLE_LABELS[m.role]}</span>
              )}
              {canEdit && (
                <IconButton
                  label={`Odebrat ${m.name} z týmu`}
                  size="sm"
                  onClick={() =>
                    remove.mutate(
                      { jobId, userId: m.userId },
                      { onError: (err) => errorToast(err.message) },
                    )
                  }
                >
                  <Trash2 />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-44">
            <UserCombobox
              value={user}
              onChange={setUser}
              labels={labels}
              placeholder="Přidat člena…"
              aria-label="Přidat člena týmu"
            />
          </div>
          <SegmentedControl
            label="Role nového člena"
            value={role}
            onChange={setRole}
            options={[
              { value: "member", label: MEMBER_ROLE_LABELS.member },
              { value: "lead", label: MEMBER_ROLE_LABELS.lead },
            ]}
          />
          <Button
            variant="primary"
            disabled={!user}
            loading={add.isPending}
            onClick={() =>
              user &&
              add.mutate(
                { jobId, userId: user, role },
                { onSuccess: () => setUser(null), onError: (err) => errorToast(err.message) },
              )
            }
          >
            Přidat
          </Button>
        </div>
      )}
    </div>
  );
}

/** Karta Tým na Přehledu zakázky (pravý panel). */
export function TeamCard({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const q = useJobDetail(jobId);
  return (
    <Card aria-label="Tým zakázky">
      <CardHeader title="Tým" icon={<Users />} count={q.data?.members.length} />
      <CardBody>
        {q.isLoading ? (
          <Skeleton className="h-12" />
        ) : q.error || !q.data ? (
          <LoadError
            message={q.error?.message ?? "Zakázka nenalezena."}
            onRetry={() => void q.refetch()}
          />
        ) : (
          <TeamEditor jobId={jobId} members={q.data.members} canEdit={canEdit} />
        )}
      </CardBody>
    </Card>
  );
}

/** Další kontakty na zakázce (investor, TDI…): přidání a odebrání osob s rolí. */
export function ParticipantsCard({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const api = useEntityApi();
  const { Link } = useNav();
  const q = useJobDetail(jobId);
  const [person, setPerson] = useState<string | null>(null);
  const add = useCommandMutation<{ jobId: string; personId: string; role?: string | null }>(
    "zakazky.participants.add",
  );
  const remove = useCommandMutation<{ jobId: string; personId: string }>(
    "zakazky.participants.remove",
  );
  const list: JobDetail["participants"] = q.data?.participants ?? [];
  if (!q.data) return null;
  if (!list.length && !canEdit) return null;
  return (
    <Card aria-label="Další kontakty">
      <CardHeader title="Kontakty na zakázce" count={list.length} />
      <CardBody>
        {list.length === 0 ? (
          <EmptyState
            title="Zatím žádné kontakty"
            description="Přidejte osobu, se kterou se zakázka řeší."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.map((p) => {
              const href = api.hrefFor("person", p.personId);
              return (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {p.personName ?? "Kontakt"}
                      </Link>
                    ) : (
                      (p.personName ?? "Kontakt")
                    )}
                    {p.role && <span className="ml-2 text-sm text-muted">{p.role}</span>}
                  </span>
                  {canEdit && (
                    <IconButton
                      label={`Odebrat kontakt ${p.personName ?? ""} ze zakázky`}
                      size="sm"
                      onClick={() =>
                        remove.mutate(
                          { jobId, personId: p.personId },
                          { onError: (e) => errorToast(e.message) },
                        )
                      }
                    >
                      <Trash2 />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <div className="min-w-0 flex-1">
              <PersonCombobox value={person} onChange={setPerson} />
            </div>
            <Button
              variant="primary"
              disabled={!person}
              loading={add.isPending}
              onClick={() =>
                person &&
                add.mutate(
                  { jobId, personId: person },
                  { onSuccess: () => setPerson(null), onError: (e) => errorToast(e.message) },
                )
              }
            >
              Přidat
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PersonCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const api = useEntityApi();
  return (
    <Combobox
      load={(q) => api.lookups.records("person", q)}
      value={value}
      onChange={(v) => onChange((v as string | null) ?? null)}
      placeholder="Přidat kontakt…"
      searchPlaceholder="Najít kontakt…"
      aria-label="Přidat kontakt na zakázku"
    />
  );
}
