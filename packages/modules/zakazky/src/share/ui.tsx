"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Skeleton,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { Copy, ExternalLink, Link2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_SCOPE, describeScope, type DiaryShare, type ShareScope } from "./model";

/** UI oblasti „share“ (sdílení zakázky). Klientský kód: žádné importy serverových částí. */
export const tabs: RecordTab[] = [];
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];

type ShareRow = {
  id: string;
  label: string | null;
  scope: ShareScope;
  status: "active" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

const STATUS: Record<ShareRow["status"], { label: string; color: string }> = {
  active: { label: "Platí", color: "green" },
  expired: { label: "Vypršel", color: "gray" },
  revoked: { label: "Zrušen", color: "red" },
};

const EXPIRY = [
  { value: "0", label: "Bez omezení" },
  { value: "30", label: "30 dní" },
  { value: "90", label: "90 dní" },
  { value: "365", label: "Rok" },
] as const;

type JobFile = { fileId: string; name: string; kind: string | null; mime: string };

function CreateShareDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const api = useEntityApi();
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<ShareScope>(DEFAULT_SCOPE);
  const [expiry, setExpiry] = useState<"0" | "30" | "90" | "365">("0");
  const [docs, setDocs] = useState<JobFile[]>([]);
  const [created, setCreated] = useState<{ url: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setLabel("");
    setScope(DEFAULT_SCOPE);
    setExpiry("0");
    api
      .activity("job", jobId)
      .then((a) =>
        setDocs(
          a.files
            .filter(
              (f) => f.kind !== "signature" && f.kind !== "photo" && !f.mime.startsWith("image/"),
            )
            .map((f) => ({ fileId: f.fileId, name: f.name, kind: f.kind, mime: f.mime })),
        ),
      )
      .catch(() => setDocs([]));
  }, [open, api, jobId]);

  const create = useCommandMutation<
    { jobId: string; label: string; scope: ShareScope; expiresInDays: number | null },
    { id: string; token: string; url: string }
  >("zakazky.share.create", { onSuccess: (r) => setCreated({ url: r.url }) });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      successToast("Odkaz zkopírován.");
    } catch {
      errorToast("Odkaz se nepodařilo zkopírovat, označte ho a zkopírujte ručně.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={created ? "Odkaz je hotový" : "Nový odkaz pro investora"}
        description={
          created
            ? "Odkaz se ukáže jen teď. Zkopírujte ho a pošlete investorovi."
            : "Investor uvidí vybrané části jen ke čtení, bez přihlášení. Ceny a náklady nikdy."
        }
      >
        {created ? (
          <div className="space-y-3 px-5 py-4">
            <Input
              readOnly
              aria-label="Odkaz pro investora"
              value={created.url}
              onFocus={(e) => e.currentTarget.select()}
              data-testid="share-url"
            />
            <div className="flex justify-end gap-2">
              <Button variant="primary" onClick={() => void copy(created.url)}>
                <Copy /> Zkopírovat odkaz
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Hotovo
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                jobId,
                label,
                scope,
                expiresInDays: expiry === "0" ? null : Number(expiry),
              });
            }}
          >
            <Field label="Pro koho (popisek)" htmlFor="sh-label">
              <Input
                id="sh-label"
                value={label}
                placeholder="např. Investor, Ing. Novák"
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <fieldset className="space-y-2.5">
              <legend className="mb-1.5 text-sm font-medium text-muted">Co investor uvidí</legend>
              <label className="flex items-center gap-2.5">
                <Checkbox
                  checked={scope.schedule}
                  onCheckedChange={(v) => setScope((s) => ({ ...s, schedule: !!v }))}
                  aria-label="Fáze a postup prací"
                />
                Fáze a postup prací
              </label>
              <label className="flex items-center gap-2.5">
                <Checkbox
                  checked={scope.photos}
                  onCheckedChange={(v) => setScope((s) => ({ ...s, photos: !!v }))}
                  aria-label="Fotky zakázky"
                />
                Fotky zakázky
              </label>
              <div className="space-y-1.5">
                <span className="text-sm text-muted">Stavební deník</span>
                <div>
                  <SegmentedControl<DiaryShare>
                    label="Stavební deník"
                    value={scope.diary}
                    onChange={(v) => setScope((s) => ({ ...s, diary: v }))}
                    options={[
                      { value: "none", label: "Ne" },
                      { value: "flagged", label: "Vybrané zápisy" },
                      { value: "all", label: "Všechny zápisy" },
                    ]}
                  />
                </div>
                {scope.diary === "flagged" && (
                  <p className="text-sm text-faint">
                    Ukážou se zápisy označené v deníku „Pro investora“.
                  </p>
                )}
              </div>
              {docs.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-sm text-muted">Dokumenty</span>
                  {docs.map((f) => (
                    <label key={f.fileId} className="flex items-center gap-2.5">
                      <Checkbox
                        checked={scope.documentIds.includes(f.fileId)}
                        onCheckedChange={(v) =>
                          setScope((s) => ({
                            ...s,
                            documentIds: v
                              ? [...s.documentIds, f.fileId]
                              : s.documentIds.filter((x) => x !== f.fileId),
                          }))
                        }
                        aria-label={f.name}
                      />
                      <span className="min-w-0 truncate">{f.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="space-y-1.5">
              <span className="text-sm text-muted">Platnost odkazu</span>
              <div>
                <SegmentedControl
                  label="Platnost odkazu"
                  value={expiry}
                  onChange={setExpiry}
                  options={EXPIRY.map((x) => ({ value: x.value, label: x.label }))}
                />
              </div>
            </div>
            {create.error && (
              <p role="alert" className="text-sm text-danger">
                {(create.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Zrušit
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={create.isPending}
                disabled={label.trim().length < 1}
              >
                Vytvořit odkaz
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Karta „Sdílení s investorem“ na Přehledu zakázky: seznam odkazů jen ke čtení, vytvoření, zrušení a náhled.
 * Samotný odkaz se ukáže jen při vytvoření (v databázi je jen otisk tokenu).
 */
export function ShareCard({ jobId }: { jobId: string }) {
  const q = useCommandQuery<ShareRow[]>("zakazky.share.list", { jobId });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ShareRow | null>(null);
  const revoke = useCommandMutation<{ id: string }>("zakazky.share.revoke", {
    onSuccess: () => successToast("Odkaz je zrušený."),
  });
  const rows = q.data ?? [];

  return (
    <section aria-label="Sdílení s investorem" className="rounded-lg border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Sdílení s investorem</h3>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <Link2 /> Nový odkaz
        </Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-10" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          Investor může sledovat postup, deník a fotky přes odkaz jen ke čtení. Ceny nevidí.
        </p>
      ) : (
        <ul className="divide-y divide-line" data-testid="share-list">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{r.label ?? "Odkaz"}</span>
                <Chip color={STATUS[r.status].color}>{STATUS[r.status].label}</Chip>
                {r.status === "active" && (
                  <>
                    <a
                      href={`/investor/nahled/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Náhled: ${r.label ?? "odkaz"}`}
                      title="Pohled investora"
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg pointer-coarse:size-11"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    <IconButton
                      label={`Zrušit odkaz ${r.label ?? ""}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevoking(r)}
                    >
                      <Trash2 />
                    </IconButton>
                  </>
                )}
              </div>
              <p className="text-sm text-muted">
                {describeScope(r.scope)} · vytvořeno {formatDate(r.createdAt.slice(0, 10))}
                {r.expiresAt && r.status === "active"
                  ? ` · platí do ${formatDate(r.expiresAt.slice(0, 10))}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <CreateShareDialog jobId={jobId} open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Zrušit odkaz pro investora?"
        description="Odkaz přestane okamžitě fungovat. Vrátit ho nejde, vytvoříte nový."
        confirmLabel="Zrušit odkaz"
        danger
        onConfirm={async () => {
          if (!revoking) return false;
          try {
            await revoke.mutateAsync({ id: revoking.id });
          } catch (e) {
            errorToast((e as Error).message);
            return false;
          }
        }}
      >
        {revoking?.label ?? ""}
      </ConfirmDialog>
    </section>
  );
}
