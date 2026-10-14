"use client";

import {
  Button,
  Chip,
  Combobox,
  SegmentedControl,
  errorToast,
  successToast,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useMemo, useRef, useState } from "react";
import {
  IMPORT_FIELDS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  guessMapping,
  parseCsv,
  type ImportFieldKey,
} from "./csv";

type RowResult = {
  line: number;
  status: "ok" | "duplicate" | "error";
  message?: string;
  id?: string;
};
type ImportResult = {
  dryRun: boolean;
  results: RowResult[];
  created: number;
  duplicates: number;
  errors: number;
};

/** Přečte soubor jako text: UTF-8, a když to nejde (Excel ve Windows ukládá CSV ve windows-1250), tak windows-1250. */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1250").decode(buf);
  }
}

const STATUS: Record<RowResult["status"], { label: string; color: string }> = {
  ok: { label: "V pořádku", color: "green" },
  duplicate: { label: "Duplicita", color: "orange" },
  error: { label: "Chyba", color: "red" },
};

/**
 * Import poptávek z CSV: výběr souboru, mapování sloupců, náhled s kontrolou duplicit a výsledek s chybami po řádcích.
 * Soubor se čte v prohlížeči (limit 1 MB a 500 řádků), na server jdou jen namapované hodnoty; server každý řádek
 * zkontroluje a ošetří (e-mail, telefon, částka, vzorce v buňkách).
 */
export function ImportPage() {
  const api = useEntityApi();
  const { Link } = useNav();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [header, setHeader] = useState(true);
  const [mapping, setMapping] = useState<(ImportFieldKey | null)[]>([]);
  const [duplicates, setDuplicates] = useState<"skip" | "create">("skip");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const headers = useMemo(
    () => (header ? (rows[0] ?? []) : (rows[0] ?? []).map((_, i) => `Sloupec ${i + 1}`)),
    [rows, header],
  );
  const dataRows = useMemo(() => (header ? rows.slice(1) : rows), [rows, header]);
  const mapped = mapping.some((m) => m && ["name", "company", "email", "phone"].includes(m));

  async function pick(file: File | undefined) {
    setProblem(null);
    setResult(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES)
      return setProblem(
        `Soubor má ${(file.size / 1024 / 1024).toFixed(1)} MB, nejvíc jde nahrát 1 MB. Rozdělte ho na víc souborů.`,
      );
    try {
      const parsed = parseCsv(await readText(file));
      if (parsed.length < 1) return setProblem("Soubor je prázdný.");
      const body = parsed.length - (header ? 1 : 0);
      if (body > IMPORT_MAX_ROWS)
        return setProblem(
          `Soubor má ${body} řádků, najednou jde importovat nejvýš ${IMPORT_MAX_ROWS}. Rozdělte ho na víc souborů.`,
        );
      setFileName(file.name);
      setRows(parsed);
      setMapping(guessMapping(parsed[0] ?? []));
    } catch {
      setProblem("Soubor se nepodařilo přečíst.");
    }
  }

  function build() {
    return dataRows.map((cells, i) => {
      const r: Record<string, unknown> = { line: i + (header ? 2 : 1) };
      mapping.forEach((key, col) => {
        const v = (cells[col] ?? "").trim();
        if (key && v) r[key] = v;
      });
      return r;
    });
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await api.command<unknown, ImportResult>("crm.inbox.import", {
        rows: build(),
        duplicates,
        dryRun,
      });
      setResult(res);
      if (!dryRun) {
        successToast(`Naimportováno: ${res.created}.`);
        // po importu už je soubor zpracovaný; další import začne novým souborem
        setRows([]);
        setFileName(null);
      }
    } catch (e) {
      setProblem((e as Error).message);
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const options = IMPORT_FIELDS.map((f) => ({ value: f.key, label: f.label }));
  const shown = result?.results.filter((r) => r.status !== "ok" || r.message) ?? [];

  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      data-testid="inquiry-import"
    >
      <div className="max-w-4xl space-y-6">
        <section>
          <h2 className="mb-1 text-lg font-semibold">Import poptávek z CSV</h2>
          <p className="mb-3 text-muted">
            Nahrajte soubor z Excelu nebo z jiného systému (oddělovač středník, čárka nebo
            tabulátor). Nejdřív se zkontroluje, nic se neuloží. Najednou jde nahrát až{" "}
            {IMPORT_MAX_ROWS} řádků a 1 MB.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept=".csv,.txt,text/csv"
              className="sr-only"
              aria-label="Soubor CSV"
              data-testid="import-file"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button onClick={() => input.current?.click()}>Vybrat soubor</Button>
            <span className="text-muted">{fileName ?? "Žádný soubor nevybrán"}</span>
            {rows.length > 0 && (
              <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={header}
                  onChange={(e) => {
                    setHeader(e.target.checked);
                    setMapping(guessMapping(e.target.checked ? (rows[0] ?? []) : []));
                    setResult(null);
                  }}
                />
                První řádek je záhlaví
              </label>
            )}
          </div>
          {problem && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {problem}
            </p>
          )}
        </section>

        {rows.length > 0 && (
          <section data-testid="import-mapping">
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-faint">
              Sloupce ({dataRows.length} řádků)
            </h3>
            <div className="divide-y divide-line rounded-lg border border-line">
              {headers.map((h, col) => (
                <div
                  key={col}
                  className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem]"
                >
                  <div className="truncate font-medium">{h || `Sloupec ${col + 1}`}</div>
                  <div className="truncate text-sm text-muted">
                    {dataRows[0]?.[col] ? dataRows[0]![col] : "—"}
                  </div>
                  <Combobox
                    aria-label={`Sloupec ${h || col + 1}`}
                    options={options}
                    value={mapping[col] ?? null}
                    onChange={(v) => {
                      setMapping((m) =>
                        m.map((x, i) => (i === col ? ((v as ImportFieldKey | null) ?? null) : x)),
                      );
                      setResult(null);
                    }}
                    placeholder="Nepoužít"
                    clearable
                  />
                </div>
              ))}
            </div>
            {!mapped && (
              <p className="mt-2 text-sm text-warning">
                Namapujte aspoň jedno z polí jméno, firma, e-mail nebo telefon.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SegmentedControl
                label="Duplicity"
                value={duplicates}
                onChange={(v) => {
                  setDuplicates(v);
                  setResult(null);
                }}
                options={[
                  { value: "skip", label: "Přeskočit duplicity" },
                  { value: "create", label: "Založit i duplicity" },
                ]}
              />
              <div className="ml-auto flex gap-2">
                <Button
                  onClick={() => void run(true)}
                  disabled={!mapped || busy}
                  loading={busy && !result}
                >
                  Zkontrolovat
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void run(false)}
                  disabled={!mapped || busy || !result?.dryRun || result.created === 0}
                  loading={busy && !!result?.dryRun}
                >
                  Importovat {result?.dryRun ? result.created : ""}
                </Button>
              </div>
            </div>
          </section>
        )}

        {result && (
          <section data-testid="import-result">
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-faint">
              {result.dryRun ? "Náhled" : "Výsledek"}
            </h3>
            <p className="mb-2">
              {result.dryRun ? "Naimportuje se" : "Naimportováno"}:{" "}
              <strong>{result.created}</strong>, duplicit přeskočeno:{" "}
              <strong>{result.duplicates}</strong>, chyb: <strong>{result.errors}</strong>.
            </p>
            {shown.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Řádek</th>
                      <th className="px-3 py-1.5 font-medium">Stav</th>
                      <th className="px-3 py-1.5 font-medium">Poznámka</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map((r) => (
                      <tr key={r.line}>
                        <td className="px-3 py-1.5 tabular">{r.line}</td>
                        <td className="px-3 py-1.5">
                          <Chip color={STATUS[r.status].color}>{STATUS[r.status].label}</Chip>
                        </td>
                        <td className="px-3 py-1.5 text-muted">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!result.dryRun && (
              <p className="mt-3">
                <Link className="text-accent hover:underline" href="/poptavky">
                  Zobrazit poptávky ve schránce
                </Link>
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
