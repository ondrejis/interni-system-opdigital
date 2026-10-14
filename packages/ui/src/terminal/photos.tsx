"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { compressImage } from "../data/image-compress";
import { useUploadQueue } from "../data/use-upload-queue";

/** Výběr fotek: vyfotit nebo z galerie, náhledy s odebráním. Soubory drží volající (`files`). */
export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const add = (list: FileList | null) => {
    if (!list?.length) return;
    // FileList je živý objekt: pole se musí vytvořit hned, než se pole <input> vymaže
    const picked = [...list].filter((f) => f.type.startsWith("image/"));
    onChange([...files, ...picked]);
  };
  return (
    <div className="space-y-3" data-testid="photo-picker">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-bg text-[17px] font-semibold active:bg-hover">
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
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-bg text-[17px] font-semibold active:bg-hover">
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
              className="relative aspect-square overflow-hidden rounded-xl border border-line"
            >
              <img src={src} alt={`Fotka ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Odebrat fotku ${i + 1}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 inline-flex size-12 items-center justify-center"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-bg/90">
                  <X className="size-4" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Odešle fotky k zakázce přes frontu nahrávání (uloží se do zařízení dřív, než se zkusí odeslat, takže se neztratí bez
 * signálu). Fotka je zmenšená a připojená k zakázce jako fotka z místa.
 */
export function useSendPhotos() {
  const { queue } = useUploadQueue();
  return useCallback(
    async (jobId: string, files: readonly File[], label: string) => {
      if (!queue) return;
      for (const f of files) {
        const blob = await compressImage(f);
        const base = f.name.replace(/\.[^.]+$/, "") || "foto";
        await queue.add({
          entity: "job",
          recordId: jobId,
          kind: "photo",
          name: `${base}.${blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() ?? "jpg")}`,
          blob,
          takenAt: new Date(f.lastModified || Date.now()).toISOString(),
          label,
        });
      }
    },
    [queue],
  );
}
