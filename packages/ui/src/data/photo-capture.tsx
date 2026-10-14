"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../components/button";
import { Combobox } from "../components/combobox";
import { Field } from "../components/input";
import { Dialog, DialogContent } from "../components/overlay";
import { successToast } from "../components/toast";
import { useEntityApi } from "./context";
import { compressImage } from "./image-compress";
import { useUploadQueue } from "./use-upload-queue";

const LAST = "photo-last-job";
type Last = { id: string; label: string } | null;
function readLast(): Last {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? "null") as Last;
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Fotky z terénu: vybrat zakázku (naposledy použitá je předvyplněná), vyfotit nebo vybrat z galerie, zmenšit a odeslat
 * na pozadí. Fotka se nejdřív uloží do zařízení, takže se neztratí ani bez signálu.
 */
export function PhotoDialog({
  open,
  onOpenChange,
  entity = "job",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entity?: string;
}) {
  const api = useEntityApi();
  const { queue, tasks } = useUploadQueue();
  const [target, setTarget] = useState<Last>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setTarget(readLast());
  }, [open]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    // FileList je živý objekt: pole se musí vytvořit hned, než se pole <input> vymaže (`value = ""`)
    const picked = [...list].filter((f) => f.type.startsWith("image/"));
    setFiles((cur) => [...cur, ...picked]);
  };

  async function send() {
    if (!target || !queue || !files.length) return;
    setBusy(true);
    try {
      try {
        localStorage.setItem(LAST, JSON.stringify(target));
      } catch {
        // předvyplnění zakázky je jen pohodlí
      }
      for (const f of files) {
        const blob = await compressImage(f);
        const base = f.name.replace(/\.[^.]+$/, "") || "foto";
        await queue.add({
          entity,
          recordId: target.id,
          kind: "photo",
          name: `${base}.${blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() ?? "jpg")}`,
          blob,
          takenAt: new Date(f.lastModified || Date.now()).toISOString(),
          label: target.label,
        });
      }
      successToast(
        files.length === 1 ? "Fotka se odesílá." : `Fotky se odesílají (${files.length}).`,
      );
      setFiles([]);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const pending = tasks.filter((t) => !t.failed).length;
  const failed = tasks.filter((t) => t.failed);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Přidat fotky" description="Uloží se k vybrané zakázce.">
        <div className="space-y-4 px-5 py-4" data-testid="photo-dialog">
          <Field label="Zakázka">
            <Combobox
              load={(s) => api.lookups.records(entity, s)}
              value={target?.id ?? null}
              selectedLabels={target ? { [target.id]: target.label } : {}}
              onChange={async (v) => {
                if (!v) return setTarget(null);
                const hit = (await api.lookups.records(entity, "")).find((o) => o.value === v);
                setTarget({ id: v as string, label: hit?.label ?? (v as string) });
              }}
              aria-label="Zakázka"
              placeholder="Vyberte zakázku"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent font-medium text-accent-fg">
              <Camera className="size-5" /> Vyfotit
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="Vyfotit"
                onChange={(e) => {
                  add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong font-medium">
              <ImagePlus className="size-5" /> Z galerie
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label="Vybrat z galerie"
                onChange={(e) => {
                  add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="grid grid-cols-4 gap-2" aria-label="Vybrané fotky">
              {previews.map((src, i) => (
                <li
                  key={src}
                  className="relative aspect-square overflow-hidden rounded-md border border-line"
                >
                  <img src={src} alt={`Fotka ${i + 1}`} className="size-full object-cover" />
                  <IconButton
                    label={`Odebrat fotku ${i + 1}`}
                    className="absolute right-0.5 top-0.5 bg-bg/80"
                    onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                  >
                    <X />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!target || files.length === 0}
            loading={busy}
            onClick={() => void send()}
          >
            Odeslat{files.length ? ` (${files.length})` : ""}
          </Button>
          {(pending > 0 || failed.length > 0) && (
            <section
              aria-label="Fronta nahrávání"
              className="space-y-1.5 border-t border-line pt-3"
            >
              {pending > 0 && (
                <p className="text-muted" data-testid="upload-pending">
                  Čeká na odeslání: {pending}
                </p>
              )}
              {failed.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-danger">
                    {t.name}: {t.error}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void queue?.retry(t.id)}>
                    Znovu
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void queue?.discard(t.id)}>
                    Zahodit
                  </Button>
                </div>
              ))}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Počet fotek, které čekají na odeslání (odznak ve spodní navigaci). */
export function usePendingUploads(): number {
  const { tasks } = useUploadQueue();
  return tasks.length;
}
