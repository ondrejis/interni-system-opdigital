# @rebar/kontakty/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/ui` (soubor `packages/modules/kontakty/src/ui.tsx`). Exportů: 13, z toho s popisem 12.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`AresIntegrationPanel`](#aresintegrationpanel) | function | Panel ARES pro Nastavení → Integrace (slot `settings.integrations`, NAS-10): ARES je veřejné API bez klíče, takže není co nastavovat; tlačítko ověří dostupnost a změří dobu odpovědi proti limitu 2 s (NFR-04). |  |
| [`CompanyContacts`](#companycontacts) | function | Seznam kontaktů organizace s voláním, psaním a kopírováním; rozhodující nahoře (KON-02, KON-04). |  |
| [`CompanyPicker`](#companypicker) | function | Výběr organizace s hledáním na serveru (jméno, IČO, město). |  |
| [`ContactLinks`](#contactlinks) | function | Hlavní telefon a e-mail osoby nebo organizace s rychlým voláním, psaním a kopírováním. |  |
| [`EmailLink`](#emaillink) | function | E-mail: odkaz „napsat“ (`mailto:`) a tlačítko kopírovat. |  |
| [`MergeForm`](#mergeform) | function | Sloučení duplicity (ORG-07, KON-03; jen vlastník s `kontakty.merge`): vybere se druhý záznam a který z nich zůstane jako hlavní. Náhled ukáže, co se přepojí (kontakty, obchody, zakázky, úkoly, poznámky…) a doplní; sloučení se provede až po výslovném potvrzení, protože ho nejde vrátit. Zapíše se do historie obou záznamů. |  |
| [`PhoneLink`](#phonelink) | function | Telefon: odkaz „zavolat“ (`tel:`) a tlačítko kopírovat. |  |
| [`PointsCard`](#pointscard) | function | Karta „Kontaktní údaje“ na detailu osoby: čtení s voláním a kopírováním, úprava po kliknutí. |  |
| [`PointsEditor`](#pointseditor) | function | Editor kontaktních údajů: víc e-mailů a telefonů se štítkem a jedním hlavním od každého druhu (KON-01). Používá ho karta osoby i formulář rychlého založení (`draft` bez ukládání). |  |
| [`QuickContactDialog`](#quickcontactdialog) | function | Okno rychlého založení kontaktu pro obchody, zakázky a organizace (`@rebar/kontakty/ui`): po založení (nebo výběru existujícího) zavolá `onCreated` a okno zavře; propojení s obchodem či zakázkou dělá volající. |  |
| [`QuickContactForm`](#quickcontactform) | function | Formulář rychlého založení kontaktu (KON-05): jméno, organizace, pozice, víc e-mailů a telefonů, LinkedIn. Při shodě e-mailu nebo telefonu s existující osobou ukáže „Možná duplicita“ a nechá vybrat: použít existující, nebo založit přesto (KON-03). |  |
| [`copyText`](#copytext) | function | Zkopíruje text do schránky s potvrzením (KON-02). |  |
| [`ui`](#ui) | const |  |  |

### AresIntegrationPanel

function · `packages/modules/kontakty/src/ui/ares-panel.tsx`

Panel ARES pro Nastavení → Integrace (slot `settings.integrations`, NAS-10): ARES je veřejné API bez klíče, takže
není co nastavovat; tlačítko ověří dostupnost a změří dobu odpovědi proti limitu 2 s (NFR-04).

```ts
function AresIntegrationPanel(): import("react").JSX.Element
```

### CompanyContacts

function · `packages/modules/kontakty/src/ui/cards.tsx`

Seznam kontaktů organizace s voláním, psaním a kopírováním; rozhodující nahoře (KON-02, KON-04).

```ts
function CompanyContacts({ companyId, limit }: { companyId: string; limit?: number }): import("react").JSX.Element
```

### CompanyPicker

function · `packages/modules/kontakty/src/ui/quick-contact.tsx`

Výběr organizace s hledáním na serveru (jméno, IČO, město).

```ts
function CompanyPicker({ value, label, onChange, ...rest }: { value: string | null; label?: string | undefined; onChange: (id: string | null) => void; "aria-label"?: string; }): import("react").JSX.Element
```

### ContactLinks

function · `packages/modules/kontakty/src/ui/contact-links.tsx`

Hlavní telefon a e-mail osoby nebo organizace s rychlým voláním, psaním a kopírováním.

```ts
function ContactLinks({ phone, email }: { phone?: string | null; email?: string | null }): import("react").JSX.Element
```

### EmailLink

function · `packages/modules/kontakty/src/ui/contact-links.tsx`

E-mail: odkaz „napsat“ (`mailto:`) a tlačítko kopírovat.

```ts
function EmailLink({ value }: { value: string }): import("react").JSX.Element
```

### MergeForm

function · `packages/modules/kontakty/src/ui/merge-dialog.tsx`

Sloučení duplicity (ORG-07, KON-03; jen vlastník s `kontakty.merge`): vybere se druhý záznam a který z nich
zůstane jako hlavní. Náhled ukáže, co se přepojí (kontakty, obchody, zakázky, úkoly, poznámky…) a doplní;
sloučení se provede až po výslovném potvrzení, protože ho nejde vrátit. Zapíše se do historie obou záznamů.

```ts
function MergeForm({ entity, id, name, close, push, }: { entity: "company" | "person"; id: string; name: string; close: () => void; push: (href: string) => void; }): import("react").JSX.Element
```

### PhoneLink

function · `packages/modules/kontakty/src/ui/contact-links.tsx`

Telefon: odkaz „zavolat“ (`tel:`) a tlačítko kopírovat.

```ts
function PhoneLink({ value }: { value: string }): import("react").JSX.Element
```

### PointsCard

function · `packages/modules/kontakty/src/ui/points-card.tsx`

Karta „Kontaktní údaje“ na detailu osoby: čtení s voláním a kopírováním, úprava po kliknutí.

```ts
function PointsCard({ personId }: { personId: string }): import("react").JSX.Element
```

### PointsEditor

function · `packages/modules/kontakty/src/ui/points-card.tsx`

Editor kontaktních údajů: víc e-mailů a telefonů se štítkem a jedním hlavním od každého druhu (KON-01).
Používá ho karta osoby i formulář rychlého založení (`draft` bez ukládání).

```ts
function PointsEditor({ value, onChange, }: { value: Draft[]; onChange: (next: Draft[]) => void; }): import("react").JSX.Element
```

### QuickContactDialog

function · `packages/modules/kontakty/src/ui/quick-contact.tsx`

Okno rychlého založení kontaktu pro obchody, zakázky a organizace (`@rebar/kontakty/ui`): po založení (nebo
výběru existujícího) zavolá `onCreated` a okno zavře; propojení s obchodem či zakázkou dělá volající.

```ts
function QuickContactDialog({ open, onOpenChange, companyId, companyLabel, onCreated, }: { open: boolean; onOpenChange: (open: boolean) => void; companyId?: string | undefined; companyLabel?: string | undefined; onCreated?: (p: { personId: string; name: string; existing: boolean }) => void; }): import("react").JSX.Element
```

### QuickContactForm

function · `packages/modules/kontakty/src/ui/quick-contact.tsx`

Formulář rychlého založení kontaktu (KON-05): jméno, organizace, pozice, víc e-mailů a telefonů, LinkedIn.
Při shodě e-mailu nebo telefonu s existující osobou ukáže „Možná duplicita“ a nechá vybrat: použít existující,
nebo založit přesto (KON-03).

```ts
function QuickContactForm({ companyId, companyLabel, onCreated, onCancel, }: { companyId?: string | undefined; companyLabel?: string | undefined; /** Osoba založená, nebo vybraná jako existující (`existing: true`). */ onCreated: (p: { personId: string; name: string; existing: boolean }) => void; onCancel?: () => void; }): import("react").JSX.Element
```

### copyText

function · `packages/modules/kontakty/src/ui/contact-links.tsx`

Zkopíruje text do schránky s potvrzením (KON-02).

```ts
async function copyText(text: string, what: string): Promise<void>
```

### ui

const · `packages/modules/kontakty/src/ui.tsx`

_Bez popisu._

```ts
const ui: import("@rebar/ui").ModuleUi
```
