/*
  Rozhraní adaptéru Fakturoidu (API v3, MPR-3). Aplikace volá jen `FakturoidClient`; reálná implementace je
  `http-client.ts` (fetch), pro testy a vývoj `fake-client.ts`. Peníze se do Fakturoidu posílají v korunách,
  v OPSYS jsou v haléřích (převod dělá volající).
*/

/** Přihlašovací údaje k účtu Fakturoidu (OAuth 2, client credentials). Ukládají se šifrovaně, nikdy do repa. */
export type FakturoidConfig = {
  /** Název účtu v adrese (`app.fakturoid.cz/<account>`). */
  account: string;
  clientId: string;
  clientSecret: string;
  /** Kontakt do hlavičky `User-Agent` (Fakturoid ho vyžaduje: `OPSYS (kontakt@firma.cz)`). */
  contactEmail: string;
};

/** Odběratel ve Fakturoidu. */
export type FakturoidSubject = { id: string; name: string; registrationNo: string | null };

/** Údaje pro založení odběratele. */
export type FakturoidSubjectInput = {
  name: string;
  registrationNo?: string | null;
  vatNo?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  /** Kód země (CZ). */
  country?: string | null;
  email?: string | null;
  customId: string;
};

/** Řádek faktury; cena v korunách bez DPH (agentura není plátce, `vatRate` je 0). */
export type FakturoidLine = {
  name: string;
  quantity: number;
  unitName?: string;
  unitPrice: number;
  vatRate: number;
};

/** Údaje pro vytvoření faktury. */
export type FakturoidInvoiceInput = {
  subjectId: string;
  /** Klíč idempotence (`custom_id`). */
  customId: string;
  lines: FakturoidLine[];
  issuedOn: string;
  currency: "CZK";
  note?: string | null;
  privateNote?: string | null;
};

/** Faktura ve Fakturoidu. */
export type FakturoidInvoice = {
  id: string;
  number: string;
  /** Odkaz na fakturu v aplikaci Fakturoidu. */
  htmlUrl: string;
  issuedOn: string;
  dueOn: string | null;
  /** Celkem v korunách. */
  total: number;
  customId: string | null;
};

/** Druhy chyb Fakturoidu (pro rozhodnutí, zda opakovat, a pro srozumitelnou hlášku). */
export type FakturoidErrorCode =
  | "auth"
  | "forbidden"
  | "payment_required"
  | "not_found"
  | "validation"
  | "rate_limit"
  | "unavailable"
  | "timeout"
  | "network"
  | "unknown";

/** Chyba volání Fakturoidu; `message` je česky a smí se ukázat uživateli (neobsahuje tajné hodnoty). */
export class FakturoidError extends Error {
  readonly code: FakturoidErrorCode;
  readonly status: number | null;
  constructor(code: FakturoidErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "FakturoidError";
    this.code = code;
    this.status = status;
  }
}

/** Adaptér Fakturoidu: jen operace, které OPSYS potřebuje. */
export interface FakturoidClient {
  /** Ověří přihlášení a účet; vrací název účtu. */
  testConnection(): Promise<{ account: string; name: string }>;
  findSubjectByCustomId(customId: string): Promise<FakturoidSubject | null>;
  /** Odběratel s přesně tímto IČO (osm číslic). */
  findSubjectByRegistrationNo(ico: string): Promise<FakturoidSubject | null>;
  createSubject(input: FakturoidSubjectInput): Promise<FakturoidSubject>;
  findInvoiceByCustomId(customId: string): Promise<FakturoidInvoice | null>;
  createInvoice(input: FakturoidInvoiceInput): Promise<FakturoidInvoice>;
  getInvoice(id: string): Promise<FakturoidInvoice | null>;
}
