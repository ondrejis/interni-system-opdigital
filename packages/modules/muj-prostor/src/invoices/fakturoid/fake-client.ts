import { addDaysIso } from "@rebar/core/time";
import {
  FakturoidError,
  type FakturoidClient,
  type FakturoidInvoice,
  type FakturoidInvoiceInput,
  type FakturoidSubject,
  type FakturoidSubjectInput,
} from "./client";

/** Zaznamenané volání (pro asserce v testech). */
export type FakeCall = { method: keyof FakturoidClient; args: unknown[] };

/** Fake Fakturoid: stav v paměti, deterministická čísla, vstřikování chyb. Pro testy a vývoj bez reálného účtu. */
export type FakeFakturoid = FakturoidClient & {
  readonly subjects: FakturoidSubject[];
  readonly invoices: (FakturoidInvoice & { input: FakturoidInvoiceInput })[];
  readonly calls: FakeCall[];
  /** Další volání uvedené metody selže zadanou chybou (jednou). */
  failNext(method: keyof FakturoidClient, error?: FakturoidError): void;
  /** Příští `createInvoice` faktuře založí, ale volajícímu vrátí časový limit (ztracená odpověď). */
  loseNextCreateResponse(): void;
  reset(): void;
};

/** Řada čísel faktur je společná pro celý proces (jako řada ve Fakturoidu), takže `reset` čísla neopakuje. */
let numberSeq = 0;

/** Vytvoří fake klienta. `invoiceYear` jde do čísla faktury (`2027-0001`). */
export function createFakeFakturoid(opts: { invoiceYear?: number } = {}): FakeFakturoid {
  const year = opts.invoiceYear ?? 2027;
  const subjects: FakturoidSubject[] = [];
  const invoices: (FakturoidInvoice & { input: FakturoidInvoiceInput })[] = [];
  const calls: FakeCall[] = [];
  const failures = new Map<keyof FakturoidClient, FakturoidError>();
  let loseNext = false;
  let seq = 1000;

  const enter = (method: keyof FakturoidClient, ...args: unknown[]) => {
    calls.push({ method, args });
    const f = failures.get(method);
    if (f) {
      failures.delete(method);
      throw f;
    }
  };
  const strip = ({ input: _i, ...rest }: FakturoidInvoice & { input: FakturoidInvoiceInput }) =>
    rest;

  return {
    subjects,
    invoices,
    calls,
    failNext(method, error) {
      failures.set(
        method,
        error ?? new FakturoidError("unavailable", "Fakturoid je dočasně nedostupný.", 503),
      );
    },
    loseNextCreateResponse() {
      loseNext = true;
    },
    reset() {
      subjects.length = 0;
      invoices.length = 0;
      calls.length = 0;
      failures.clear();
      loseNext = false;
      seq = 1000;
    },
    async testConnection() {
      enter("testConnection");
      return { account: "fake", name: "Fake účet" };
    },
    async findSubjectByCustomId(customId) {
      enter("findSubjectByCustomId", customId);
      const s = subjects.find(
        (x) => (x as FakturoidSubject & { customId?: string }).customId === customId,
      );
      return s ? { id: s.id, name: s.name, registrationNo: s.registrationNo } : null;
    },
    async findSubjectByRegistrationNo(ico) {
      enter("findSubjectByRegistrationNo", ico);
      return subjects.find((s) => s.registrationNo === ico) ?? null;
    },
    async createSubject(input: FakturoidSubjectInput) {
      enter("createSubject", input);
      const s = {
        id: String(++seq),
        name: input.name,
        registrationNo: input.registrationNo ?? null,
        customId: input.customId,
      };
      subjects.push(s);
      return { id: s.id, name: s.name, registrationNo: s.registrationNo };
    },
    async findInvoiceByCustomId(customId) {
      enter("findInvoiceByCustomId", customId);
      const i = invoices.find((x) => x.customId === customId);
      return i ? strip(i) : null;
    },
    async createInvoice(input) {
      enter("createInvoice", input);
      const id = String(++seq);
      const total = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const inv = {
        id,
        number: `${year}-${String(++numberSeq).padStart(4, "0")}`,
        htmlUrl: `https://app.fakturoid.cz/fake/invoices/${id}`,
        issuedOn: input.issuedOn,
        dueOn: addDaysIso(input.issuedOn, 14),
        total,
        customId: input.customId,
        input,
      };
      invoices.push(inv);
      if (loseNext) {
        loseNext = false;
        throw new FakturoidError("timeout", "Fakturoid neodpověděl včas.");
      }
      return strip(inv);
    },
    async getInvoice(id) {
      enter("getInvoice", id);
      const i = invoices.find((x) => x.id === id);
      return i ? strip(i) : null;
    },
  };
}
