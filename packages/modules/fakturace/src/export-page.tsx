"use client";

import { addDaysIso, todayIso } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Field,
  FormSection,
  Notice,
  SegmentedControl,
  errorToast,
  successToast,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import { Download, FileCode2, FolderArchive, Percent, Table2 } from "lucide-react";
import { useState } from "react";

type Adapter = { key: string; label: string; description: string };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const nameFrom = (res: Response, fallback: string) => {
  const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") ?? "");
  return m ? decodeURIComponent(m[1]!) : fallback;
};

/** První a poslední den předchozího měsíce. */
function lastMonth(): [string, string] {
  const firstThis = `${todayIso().slice(0, 8)}01`;
  const last = addDaysIso(firstThis, -1);
  return [`${last.slice(0, 8)}01`, last];
}

export function ExportPage() {
  const api = useEntityApi();
  const adapters = useCommandQuery<Adapter[]>("fakturace.exportAdapters", {});
  const [[initFrom, initTo]] = useState(lastMonth);
  const [from, setFrom] = useState<string | null>(initFrom);
  const [to, setTo] = useState<string | null>(initTo);
  const [adapter, setAdapter] = useState("xlsx");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [files, setFiles] = useState(true);
  const [withIsdoc, setWithIsdoc] = useState(false);
  const [withVat, setWithVat] = useState(false);
  const [basis, setBasis] = useState<"issue" | "duzp">("issue");
  const [isdocKind, setIsdocKind] = useState<"issued" | "received" | "all">("all");
  const [vatFormat, setVatFormat] = useState<"xlsx" | "csv">("xlsx");
  const [busy, setBusy] = useState<null | "zip" | "list" | "isdoc" | "dph">(null);
  const [error, setError] = useState<string | null>(null);

  const setPeriod = (p: [string, string]) => {
    setFrom(p[0]);
    setTo(p[1]);
  };
  const thisMonth = (): [string, string] => [`${todayIso().slice(0, 8)}01`, todayIso()];

  /** Stažení souboru z endpointu (POST s obdobím); chybu serveru ukáže v hlášce. */
  async function fetchDownload(
    key: "zip" | "isdoc" | "dph",
    url: string,
    payload: Record<string, unknown>,
    fallbackName: string,
    done: (res: Response) => string,
  ) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to, basis, ...payload }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "Export se nepodařil.");
      }
      download(await res.blob(), nameFrom(res, fallbackName));
      successToast(done(res));
    } catch (e) {
      setError((e as Error).message);
      errorToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counts = (res: Response) =>
    `${res.headers.get("x-export-issued") ?? "0"} vydaných a ${res.headers.get("x-export-received") ?? "0"} přijatých faktur`;

  const zip = () =>
    fetchDownload(
      "zip",
      "/api/fakturace/export",
      { format, receivedFiles: files, isdoc: withIsdoc, vatReport: withVat },
      "ucetni-balik.zip",
      (res) => `Balík je stažený: ${counts(res)}.`,
    );
  const isdoc = () =>
    fetchDownload(
      "isdoc",
      "/api/fakturace/isdoc",
      { kind: isdocKind },
      "isdoc.zip",
      (res) => `ISDOC je stažený: ${counts(res)}.`,
    );
  const vat = () =>
    fetchDownload(
      "dph",
      "/api/fakturace/dph",
      { format: vatFormat },
      `dph-podklady.${vatFormat}`,
      (res) => `Podklady DPH jsou stažené: ${counts(res)}.`,
    );

  async function list() {
    setBusy("list");
    setError(null);
    try {
      const r = await api.command<
        { adapter: string; from: string | null; to: string | null },
        {
          filename: string;
          mime: string;
          content: string;
          encoding: "utf8" | "base64";
          count: number;
        }
      >("fakturace.export", { adapter, from, to });
      const data =
        r.encoding === "base64"
          ? Uint8Array.from(atob(r.content), (c) => c.charCodeAt(0))
          : r.content;
      download(new Blob([data], { type: r.mime }), r.filename);
      successToast(`Exportováno dokladů: ${r.count}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const invalid = !from || !to || to < from;
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <FormSection
          title="Období"
          description="Platí pro balík, ISDOC a podklady DPH. Vidíte jen doklady, ke kterým máte přístup."
        >
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <Field label="Od">
              <DatePicker value={from} onChange={setFrom} clearable={false} />
            </Field>
            <Field label="Do">
              <DatePicker value={to} onChange={setTo} clearable={false} />
            </Field>
            <div className="mb-3 flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setPeriod(lastMonth())}>
                Minulý měsíc
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPeriod(thisMonth())}>
                Tento měsíc
              </Button>
            </div>
          </div>
          <Field
            label="Období podle"
            hint="Pro podklady k přiznání DPH zvolte DUZP (datum zdanitelného plnění). Přehled vydaných faktur dole se řídí datem vystavení."
          >
            <SegmentedControl
              label="Období podle"
              value={basis}
              onChange={setBasis}
              options={[
                { value: "issue", label: "Data vystavení" },
                { value: "duzp", label: "DUZP" },
              ]}
            />
          </Field>
          {from && to && to < from && <Notice tone="error">Konec období je před začátkem.</Notice>}
        </FormSection>

        <FormSection
          title="Balík pro účetní"
          icon={<FolderArchive />}
          description="ZIP s PDF vydaných faktur, skeny schválených přijatých faktur a souhrnem, kde je u každého dokladu označeno, zda je uhrazený."
          footer={
            <Button
              variant="primary"
              loading={busy === "zip"}
              disabled={invalid}
              onClick={() => void zip()}
              data-testid="export-zip"
            >
              <Download /> Stáhnout balík (ZIP)
            </Button>
          }
        >
          <Field label="Souhrn jako">
            <SegmentedControl
              label="Formát souhrnu"
              value={format}
              onChange={setFormat}
              options={[
                { value: "xlsx", label: "Excel (XLSX)" },
                { value: "csv", label: "CSV" },
              ]}
            />
          </Field>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={files} onCheckedChange={(v) => setFiles(!!v)} /> Přibalit skeny
              přijatých faktur
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={withIsdoc} onCheckedChange={(v) => setWithIsdoc(!!v)} /> Přibalit
              ISDOC (složka isdoc)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={withVat} onCheckedChange={(v) => setWithVat(!!v)} /> Přibalit
              podklady DPH (dph-podklady)
            </label>
          </div>
          <p className="mt-3 text-sm text-muted">
            Vydané faktury včetně dobropisů a uvolnění zádržného; přijaté faktury ve stavu schváleno
            a uhrazeno. U dokladů s přenesenou daňovou povinností je to ve sloupci Režim DPH.
          </p>
        </FormSection>

        <FormSection
          title="ISDOC"
          icon={<FileCode2 />}
          description="Elektronické faktury ve formátu ISDOC 6.0.2 pro import do účetních programů. ZIP s jedním souborem na doklad."
          footer={
            <Button
              variant="secondary"
              loading={busy === "isdoc"}
              disabled={invalid}
              onClick={() => void isdoc()}
              data-testid="export-isdoc"
            >
              <Download /> Stáhnout ISDOC (ZIP)
            </Button>
          }
        >
          <Field label="Doklady">
            <SegmentedControl
              label="Doklady v ISDOC"
              value={isdocKind}
              onChange={setIsdocKind}
              options={[
                { value: "all", label: "Vydané i přijaté" },
                { value: "issued", label: "Vydané" },
                { value: "received", label: "Přijaté" },
              ]}
            />
          </Field>
          <p className="text-sm text-muted">
            Vydané faktury včetně dobropisů a zálohových, přijaté ve stavu schváleno a uhrazeno.
            Jednu fakturu stáhnete ve formátu ISDOC z jejího detailu.
          </p>
        </FormSection>

        <FormSection
          title="Podklady pro DPH"
          icon={<Percent />}
          description="Vydané a přijaté doklady rozdělené podle sazeb DPH (21 %, 12 %, 0 %, přenesená daňová povinnost zvlášť) a souhrn po sazbách."
          footer={
            <Button
              variant="secondary"
              loading={busy === "dph"}
              disabled={invalid}
              onClick={() => void vat()}
              data-testid="export-dph"
            >
              <Download /> Stáhnout podklady
            </Button>
          }
        >
          <Field label="Formát">
            <SegmentedControl
              label="Formát podkladů DPH"
              value={vatFormat}
              onChange={setVatFormat}
              options={[
                { value: "xlsx", label: "Excel (XLSX)" },
                { value: "csv", label: "CSV" },
              ]}
            />
          </Field>
          <p className="text-sm text-muted">
            Jsou to součty z dokladů, ne přiznání: účetní ještě posoudí nárok na odpočet. Zálohové
            faktury se nezahrnují, protože nejsou daňovým dokladem.
          </p>
        </FormSection>

        <FormSection
          title="Přehled vydaných faktur"
          icon={<Table2 />}
          description="Jen tabulka vystavených faktur, bez PDF."
          footer={
            <Button
              variant="secondary"
              loading={busy === "list"}
              disabled={invalid}
              onClick={() => void list()}
              data-testid="export-list"
            >
              <Download /> Stáhnout přehled
            </Button>
          }
        >
          <Field
            label="Formát"
            hint="Pohoda, Money S3 a další účetní formáty doplníme podle požadavku klienta."
          >
            <Combobox
              aria-label="Formát přehledu"
              options={(adapters.data ?? []).map((a) => ({
                value: a.key,
                label: a.label,
                hint: a.description,
              }))}
              value={adapter}
              onChange={(v) => v && setAdapter(v as string)}
            />
          </Field>
        </FormSection>

        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </div>
  );
}
