"use client";

import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Skeleton,
  Textarea,
  compressImage,
  errorToast,
  successToast,
  useCommandMutation,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { Camera, CloudSun, ImagePlus, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  weatherSummary,
  type DiaryIncident,
  type DiaryMachine,
  type DiaryMaterial,
  type DiaryWeather,
  type DiaryWorker,
} from "./diary-shared";

/** Jedna řádka zápisu se vždy dá doplnit bez myši: ID řádků se tvoří i bez `crypto.randomUUID` (nezabezpečené HTTP v LAN). */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type DiaryEntryData = {
  id: string;
  date: string;
  weather: string | null;
  temperature: number | null;
  weatherData: DiaryWeather | null;
  work: string | null;
  events: string | null;
  workers: DiaryWorker[];
  materialRows: DiaryMaterial[];
  machineRows: DiaryMachine[];
  incidents: DiaryIncident[];
  photoIds: string[];
  forInvestor: boolean;
  people: string | null;
  machines: string | null;
  materials: string | null;
  signed: { at: string; name: string | null; signatureFileId: string | null } | null;
  author: string | null;
  updatedAt: string;
};

export type Draft = {
  work: string;
  events: string;
  weatherData: DiaryWeather | null;
  /** Počasí je z formuláře (ručně nebo z načtení), nemá se nechávat na uloženém. */
  weatherTouched: boolean;
  workers: DiaryWorker[];
  materialRows: DiaryMaterial[];
  machineRows: DiaryMachine[];
  incidents: DiaryIncident[];
  photoIds: string[];
  forInvestor: boolean;
};

export const draftFrom = (e: DiaryEntryData | null): Draft => ({
  work: e?.work ?? "",
  events: e?.events ?? "",
  weatherData:
    e?.weatherData ??
    (e?.weather
      ? {
          code: null,
          label: e.weather,
          tempMin: e.temperature,
          tempMax: e.temperature,
          precipMm: null,
          windKmh: null,
          source: "manual",
        }
      : null),
  weatherTouched: false,
  workers: e?.workers ?? [],
  materialRows: e?.materialRows ?? [],
  machineRows: e?.machineRows ?? [],
  incidents: e?.incidents ?? [],
  photoIds: e?.photoIds ?? [],
  forInvestor: e?.forInvestor ?? false,
});

const WEATHER_CHOICES = [
  "Jasno",
  "Polojasno",
  "Zataženo",
  "Mlha",
  "Déšť",
  "Silný déšť",
  "Sníh",
  "Bouřka",
];

function RowShell({
  children,
  onRemove,
  label,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  label: string;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line p-2">
      <div className="grid min-w-0 flex-1 gap-2">{children}</div>
      <IconButton label={label} variant="ghost" size="sm" onClick={onRemove}>
        <Trash2 />
      </IconButton>
    </li>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="flex gap-1.5">{action}</div>
      </div>
      {children}
    </section>
  );
}

/* ---------- fotky ---------- */

type JobPhoto = { fileId: string; name: string; hasThumb: boolean };

function PhotoPicker({
  jobId,
  open,
  onOpenChange,
  selected,
  onToggle,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: string[];
  onToggle: (fileId: string) => void;
}) {
  const api = useEntityApi();
  const [photos, setPhotos] = useState<JobPhoto[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setPhotos(null);
    api
      .activity("job", jobId)
      .then((a) =>
        setPhotos(
          a.files
            .filter((f) => f.mime.startsWith("image/") && f.kind !== "signature")
            .map((f) => ({ fileId: f.fileId, name: f.name, hasThumb: f.hasThumb })),
        ),
      )
      .catch(() => setPhotos([]));
  }, [open, api, jobId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Fotky zakázky"
        description="Označte fotky, které patří k dnešnímu zápisu."
      >
        <div className="space-y-3 px-5 py-4">
          {photos === null ? (
            <Skeleton className="h-24" />
          ) : photos.length === 0 ? (
            <p className="text-muted">
              K zakázce zatím nejsou žádné fotky. Vyfoťte první tlačítkem Vyfotit.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="photo-picker">
              {photos.map((p) => {
                const on = selected.includes(p.fileId);
                return (
                  <li key={p.fileId}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? "Odebrat" : "Přidat"} fotku ${p.name}`}
                      onClick={() => onToggle(p.fileId)}
                      className={
                        "relative block aspect-square w-full overflow-hidden rounded-md border-2 " +
                        (on ? "border-accent" : "border-line")
                      }
                    >
                      <img
                        src={`/api/files/${p.fileId}${p.hasThumb ? "?thumb=1" : ""}`}
                        alt={p.name}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {on && (
                        <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 text-xs text-accent-fg">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Hotovo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- editor ---------- */

/**
 * Formulář zápisu dne. Počasí se doplní samo (server si ho vezme z veřejné služby), pracovníci, stroje a materiál se
 * dají načíst z docházky, strojů a skladu. Materiál s cenou za jednotku vytvoří náklad zakázky. Na telefonu jsou
 * pole velká a tlačítko Uložit zůstává při dolním okraji, takže jde psát jednou rukou.
 */
export function DiaryEditor({
  jobId,
  date,
  entry,
  canPrice,
  onCancel,
  onSaved,
}: {
  jobId: string;
  date: string;
  entry: DiaryEntryData | null;
  canPrice: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const [d, setD] = useState<Draft>(() => draftFrom(entry));
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "failed">("idle");
  const [prefilling, setPrefilling] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const isNew = !entry;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  const save = useCommandMutation<Record<string, unknown>, { id: string }>("realizace.diary.save", {
    onSuccess: () => {
      successToast("Zápis uložen.");
      onSaved();
    },
  });

  async function loadWeather() {
    setWeatherState("loading");
    try {
      const r = await api.command<
        { jobId: string; date: string },
        { weather: DiaryWeather | null; reason: string }
      >("realizace.diary.weather", { jobId, date });
      if (r.weather) {
        setD((s) => ({ ...s, weatherData: r.weather, weatherTouched: true }));
        setWeatherState("idle");
      } else setWeatherState("failed");
    } catch {
      setWeatherState("failed");
    }
  }

  async function prefill(overwrite: boolean) {
    setPrefilling(true);
    try {
      const p = await api.command<
        { jobId: string; date: string },
        {
          work: string;
          workers: DiaryWorker[];
          machineRows: DiaryMachine[];
          materialRows: DiaryMaterial[];
        }
      >("realizace.diary.prefill", { jobId, date });
      setD((s) => ({
        ...s,
        work: s.work || p.work,
        workers: overwrite || !s.workers.length ? p.workers : s.workers,
        machineRows: overwrite || !s.machineRows.length ? p.machineRows : s.machineRows,
        materialRows:
          overwrite || !s.materialRows.length
            ? p.materialRows
            : [
                ...s.materialRows,
                ...p.materialRows.filter(
                  (m) => !s.materialRows.some((x) => x.source === "sklad" && x.name === m.name),
                ),
              ],
      }));
      if (!p.workers.length && !p.machineRows.length && !p.materialRows.length)
        successToast("Pro tento den nejsou v docházce, strojích ani skladu žádná data.");
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setPrefilling(false);
    }
  }

  // nový zápis: počasí a podklady z ostatních modulů se načtou hned po otevření
  useEffect(() => {
    if (!isNew) return;
    void loadWeather();
    void prefill(false);
    // jen při otevření formuláře
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setUploading(true);
    try {
      const ids: string[] = [];
      for (const f of list) {
        const blob = await compressImage(f);
        const file = blob instanceof File ? blob : new File([blob], f.name, { type: blob.type });
        const up = await api.uploadFile("job", jobId, file, {
          kind: "photo",
          takenAt: new Date(f.lastModified || Date.now()).toISOString(),
        });
        ids.push(up.id);
      }
      setD((s) => ({ ...s, photoIds: [...s.photoIds, ...ids] }));
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    save.mutate({
      jobId,
      date,
      work: d.work || null,
      events: d.events || null,
      ...(d.weatherTouched || isNew
        ? d.weatherData
          ? { weatherData: d.weatherData }
          : { autoWeather: false }
        : {}),
      workers: d.workers,
      materialRows: d.materialRows.map((m) => ({
        id: m.id,
        name: m.name,
        qty: m.qty,
        unit: m.unit,
        supplier: m.supplier,
        unitPriceMinor: m.unitPriceMinor,
        source: m.source,
      })),
      machineRows: d.machineRows,
      incidents: d.incidents.map((x) => ({
        id: x.id,
        kind: x.kind,
        text: x.text,
        defectId: x.defectId,
      })),
      photoIds: d.photoIds,
      forInvestor: d.forInvestor,
    });
  }

  const w = d.weatherData;
  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-lg border border-line p-4"
      data-testid="diary-form"
    >
      {/* počasí */}
      <Group
        title="Počasí"
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={weatherState === "loading"}
            onClick={() => void loadWeather()}
          >
            <RefreshCw /> Načíst znovu
          </Button>
        }
      >
        {weatherState === "loading" ? (
          <Skeleton className="h-8" />
        ) : (
          <div className="flex flex-wrap items-center gap-2" data-testid="diary-weather">
            {w ? (
              <Chip color={w.source === "open-meteo" ? "blue" : "gray"}>
                <CloudSun className="mr-1 size-3.5" />
                {weatherSummary(w)}
                {w.precipMm ? ` · srážky ${String(w.precipMm).replace(".", ",")} mm` : ""}
                {w.windKmh ? ` · vítr ${Math.round(w.windKmh)} km/h` : ""}
              </Chip>
            ) : (
              <span className="text-sm text-muted">
                {weatherState === "failed"
                  ? "Počasí se nepodařilo načíst, doplňte ho ručně."
                  : "Počasí zatím není."}
              </span>
            )}
            <div className="w-40">
              <Combobox
                options={WEATHER_CHOICES.map((x) => ({ value: x, label: x }))}
                value={w?.source === "manual" ? w.label : null}
                placeholder="Doplnit ručně"
                aria-label="Počasí ručně"
                onChange={(v) =>
                  v &&
                  setD((s) => ({
                    ...s,
                    weatherTouched: true,
                    weatherData: {
                      code: null,
                      label: v as string,
                      tempMin: s.weatherData?.tempMin ?? null,
                      tempMax: s.weatherData?.tempMax ?? null,
                      precipMm: null,
                      windKmh: null,
                      source: "manual",
                    },
                  }))
                }
              />
            </div>
            {w?.source === "manual" && (
              <Input
                aria-label="Teplota °C"
                inputMode="numeric"
                placeholder="°C"
                className="w-20"
                value={w.tempMax ?? ""}
                onChange={(e) => {
                  const t = e.target.value.replace(/[^\d-]/g, "");
                  const n = t === "" || t === "-" ? null : Number(t);
                  setD((s) => ({
                    ...s,
                    weatherTouched: true,
                    weatherData: s.weatherData && { ...s.weatherData, tempMin: n, tempMax: n },
                  }));
                }}
              />
            )}
          </div>
        )}
      </Group>

      <Field label="Provedené práce" htmlFor="di-work">
        <Textarea
          id="di-work"
          autoFocus
          value={d.work}
          onChange={(e) => set("work", e.target.value)}
          className="min-h-28"
          placeholder="Co se dnes dělalo"
        />
      </Field>

      {/* pracovníci */}
      <Group
        title="Pracovníci"
        action={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={prefilling}
              onClick={() => void prefill(true)}
            >
              <Users /> Z docházky
            </Button>
            <Combobox
              load={api.lookups.users}
              value={null}
              searchPlaceholder="Najít pracovníka…"
              aria-label="Přidat pracovníka"
              trigger={
                <Button type="button" size="sm" variant="ghost">
                  <Plus /> Přidat
                </Button>
              }
              onChange={async (v) => {
                if (!v) return;
                const hit = (await api.lookups.users("")).find((o) => o.value === v);
                setD((s) =>
                  s.workers.some((x) => x.userId === v)
                    ? s
                    : {
                        ...s,
                        workers: [
                          ...s.workers,
                          {
                            userId: v as string,
                            name: hit?.label ?? "Pracovník",
                            hours: null,
                            source: "manual",
                          },
                        ],
                      },
                );
              }}
            />
          </>
        }
      >
        {d.workers.length === 0 ? (
          <p className="text-sm text-muted">
            Nikdo zatím není zapsaný. Načtěte docházku, nebo přidejte lidi.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="diary-workers">
            {d.workers.map((x, n) => (
              <RowShell
                key={`${x.userId ?? x.name}-${n}`}
                label={`Odebrat pracovníka ${x.name}`}
                onRemove={() =>
                  set(
                    "workers",
                    d.workers.filter((_, j) => j !== n),
                  )
                }
              >
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <Input
                    aria-label={`Jméno pracovníka ${n + 1}`}
                    value={x.name}
                    onChange={(e) =>
                      set(
                        "workers",
                        d.workers.map((y, j) => (j === n ? { ...y, name: e.target.value } : y)),
                      )
                    }
                  />
                  <Input
                    aria-label={`Hodiny: ${x.name}`}
                    inputMode="decimal"
                    placeholder="hodin"
                    value={x.hours ?? ""}
                    onChange={(e) => {
                      const t = e.target.value.replace(",", ".");
                      set(
                        "workers",
                        d.workers.map((y, j) =>
                          j === n
                            ? {
                                ...y,
                                hours: t === "" || Number.isNaN(Number(t)) ? null : Number(t),
                              }
                            : y,
                        ),
                      );
                    }}
                  />
                </div>
                {x.source === "attendance" && (
                  <span className="text-xs text-faint">z docházky</span>
                )}
              </RowShell>
            ))}
          </ul>
        )}
      </Group>

      {/* materiál */}
      <Group
        title="Materiál"
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              set("materialRows", [
                ...d.materialRows,
                {
                  id: uid(),
                  name: "",
                  qty: "1",
                  unit: "ks",
                  supplier: null,
                  unitPriceMinor: null,
                  source: "manual",
                  costRef: null,
                },
              ])
            }
          >
            <Plus /> Přidat materiál
          </Button>
        }
      >
        {d.materialRows.length === 0 ? (
          <p className="text-sm text-muted">
            Žádný materiál. Výdej ze skladu se načte tlačítkem Z docházky.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="diary-materials">
            {d.materialRows.map((m, n) => {
              const patch = (p: Partial<DiaryMaterial>) =>
                set(
                  "materialRows",
                  d.materialRows.map((y, j) => (j === n ? { ...y, ...p } : y)),
                );
              return (
                <RowShell
                  key={m.id}
                  label={`Odebrat materiál ${m.name || n + 1}`}
                  onRemove={() =>
                    set(
                      "materialRows",
                      d.materialRows.filter((_, j) => j !== n),
                    )
                  }
                >
                  <Input
                    aria-label={`Název materiálu ${n + 1}`}
                    placeholder="Název materiálu"
                    value={m.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                  <div className="grid grid-cols-[5.5rem_4.5rem_1fr] gap-2">
                    <Input
                      aria-label={`Množství ${n + 1}`}
                      inputMode="decimal"
                      value={m.qty}
                      onChange={(e) => patch({ qty: e.target.value })}
                    />
                    <Input
                      aria-label={`Jednotka ${n + 1}`}
                      value={m.unit}
                      onChange={(e) => patch({ unit: e.target.value })}
                    />
                    <Input
                      aria-label={`Dodavatel ${n + 1}`}
                      placeholder="Dodavatel"
                      value={m.supplier ?? ""}
                      onChange={(e) => patch({ supplier: e.target.value || null })}
                    />
                  </div>
                  {canPrice && m.source !== "sklad" && (
                    <MoneyInput
                      aria-label={`Cena za jednotku ${n + 1}`}
                      placeholder="Cena / j. bez DPH (vytvoří náklad)"
                      value={m.unitPriceMinor}
                      onChange={(v) => patch({ unitPriceMinor: v })}
                    />
                  )}
                  {m.source === "sklad" && (
                    <span className="text-xs text-faint">
                      ze skladu, náklad se počítá ve skladu
                    </span>
                  )}
                </RowShell>
              );
            })}
          </ul>
        )}
      </Group>

      {/* stroje */}
      <Group
        title="Stroje"
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              set("machineRows", [
                ...d.machineRows,
                { name: "", hours: null, note: null, source: "manual" },
              ])
            }
          >
            <Plus /> Přidat stroj
          </Button>
        }
      >
        {d.machineRows.length > 0 && (
          <ul className="space-y-2" data-testid="diary-machines">
            {d.machineRows.map((m, n) => (
              <RowShell
                key={`${m.name}-${n}`}
                label={`Odebrat stroj ${m.name || n + 1}`}
                onRemove={() =>
                  set(
                    "machineRows",
                    d.machineRows.filter((_, j) => j !== n),
                  )
                }
              >
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <Input
                    aria-label={`Název stroje ${n + 1}`}
                    value={m.name}
                    onChange={(e) =>
                      set(
                        "machineRows",
                        d.machineRows.map((y, j) => (j === n ? { ...y, name: e.target.value } : y)),
                      )
                    }
                  />
                  <Input
                    aria-label={`Hodiny stroje ${n + 1}`}
                    inputMode="decimal"
                    placeholder="hodin"
                    value={m.hours ?? ""}
                    onChange={(e) => {
                      const t = e.target.value.replace(",", ".");
                      set(
                        "machineRows",
                        d.machineRows.map((y, j) =>
                          j === n
                            ? {
                                ...y,
                                hours: t === "" || Number.isNaN(Number(t)) ? null : Number(t),
                              }
                            : y,
                        ),
                      );
                    }}
                  />
                </div>
              </RowShell>
            ))}
          </ul>
        )}
      </Group>

      {/* fotky */}
      <Group
        title="Fotky"
        action={
          <>
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={uploading}
              onClick={() => camera.current?.click()}
            >
              <Camera /> Vyfotit
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPhotosOpen(true)}>
              <ImagePlus /> Z fotek zakázky
            </Button>
          </>
        }
      >
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          aria-label="Vyfotit nebo vybrat fotky"
          data-testid="diary-photo-input"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {d.photoIds.length > 0 && (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="diary-photos">
            {d.photoIds.map((id, n) => (
              <li
                key={id}
                className="relative aspect-square overflow-hidden rounded-md border border-line"
              >
                <img
                  src={`/api/files/${id}?thumb=1`}
                  alt={`Fotka ${n + 1}`}
                  className="size-full object-cover"
                />
                <IconButton
                  label={`Odebrat fotku ${n + 1}`}
                  size="sm"
                  className="absolute right-0.5 top-0.5 bg-bg/80"
                  onClick={() =>
                    set(
                      "photoIds",
                      d.photoIds.filter((x) => x !== id),
                    )
                  }
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Group>
      <PhotoPicker
        jobId={jobId}
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        selected={d.photoIds}
        onToggle={(fileId) =>
          set(
            "photoIds",
            d.photoIds.includes(fileId)
              ? d.photoIds.filter((x) => x !== fileId)
              : [...d.photoIds, fileId],
          )
        }
      />

      {/* nehody a vady */}
      <Group
        title="Nehody a vady"
        action={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                set("incidents", [
                  ...d.incidents,
                  { id: uid(), kind: "incident", text: "", defectId: null },
                ])
              }
            >
              <Plus /> Nehoda
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                set("incidents", [
                  ...d.incidents,
                  { id: uid(), kind: "defect", text: "", defectId: null },
                ])
              }
            >
              <Plus /> Vada
            </Button>
          </>
        }
      >
        {d.incidents.length > 0 && (
          <ul className="space-y-2" data-testid="diary-incidents">
            {d.incidents.map((x, n) => (
              <RowShell
                key={x.id}
                label={`Odebrat ${x.kind === "defect" ? "vadu" : "nehodu"} ${n + 1}`}
                onRemove={() =>
                  set(
                    "incidents",
                    d.incidents.filter((_, j) => j !== n),
                  )
                }
              >
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Chip color={x.kind === "defect" ? "red" : "orange"}>
                    {x.kind === "defect" ? "Vada" : "Nehoda"}
                  </Chip>
                  {x.defectId ? (
                    <Link
                      href={`/realizace/vady/${x.defectId}`}
                      className="text-accent hover:underline"
                    >
                      otevřít vadu zakázky
                    </Link>
                  ) : x.kind === "defect" ? (
                    <span>po uložení se založí vada zakázky</span>
                  ) : null}
                </div>
                <Textarea
                  aria-label={`Popis ${n + 1}`}
                  value={x.text}
                  className="min-h-16"
                  disabled={!!x.defectId}
                  onChange={(e) =>
                    set(
                      "incidents",
                      d.incidents.map((y, j) => (j === n ? { ...y, text: e.target.value } : y)),
                    )
                  }
                />
              </RowShell>
            ))}
          </ul>
        )}
      </Group>

      <Field label="Události dne (návštěvy, zdržení, poznámky)" htmlFor="di-events">
        <Textarea
          id="di-events"
          value={d.events}
          onChange={(e) => set("events", e.target.value)}
          className="min-h-16"
        />
      </Field>

      <label className="flex items-center gap-2.5">
        <Checkbox
          checked={d.forInvestor}
          onCheckedChange={(v) => set("forInvestor", !!v)}
          aria-label="Pro investora"
        />
        Zobrazit v odkazu pro investora
      </label>

      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {(save.error as Error).message}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 rounded-b-lg border-t border-line bg-bg px-4 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Uložit zápis
        </Button>
      </div>
    </form>
  );
}
