# ADR 008: Audit a nakládání s tajemstvími

- Stav: přijato (2026-10-08)
- Kontext: `docs/AUDIT.md` D7, D8, S3, S5, S8

## Rozhodnutí

- **Auditní záznam se zapisuje ve stejné transakci jako změna** (`recordAudit`, `auditChange` uvnitř `inTx`). Selže-li zápis, vrátí se i změna; změna bez stopy nevznikne.
- Záznam je strukturovaný: aktér (`user` / `system` / `agency`), akce, entita, `changes` jako `[{field, old, new}]`, `requestId`, IP. Tajná pole (heslo, token, klíč, záložní kódy) se maskují v `diffRecords` i v `recordAudit`.
- Aplikační DB role má na `audit_log` jen `INSERT` a `SELECT`. Hlídá to test proti skutečné DB.
- **Poznámky a komentáře nejsou audit.** Komentáře jsou samostatná tabulka s úpravami, mazáním a zmínkami.
- **Tajemství v databázi** (heslo SMTP…) jsou zašifrovaná AES-256-GCM samostatným klíčem `APP_ENCRYPTION_KEY` (ne odvozeným z tajemství přihlašování), s identifikátorem klíče pro rotaci. Do auditu ani do administrace se nedostanou v čitelné podobě.
- **E-maily s tajným odkazem** (pozvánka, reset hesla): v `email_log` je jen příjemce, šablona, předmět a stav — žádné tělo. Ve frontě úloh jsou proměnné šablony jen zašifrované a dokončená úloha se po 10 minutách maže. Pozvánka a reset hesla neukazují odkaz v administraci; **výjimka:** jednorázový odkaz pro nové heslo, který správce vyžádá u uživatele **bez nastaveného SMTP**, se správci jednou zobrazí k předání (platí hodinu, v auditu je jen jeho vznik).
- **Pozvánka** platí 48 hodin, v DB je jen otisk tokenu (SHA-256), přijmout ji jde jednou (i souběžně).

## Důsledky

- Rotace klíče: nový klíč první v `APP_ENCRYPTION_KEYS`, starý dál dešifruje; data se přešifrují při dalším uložení.
- Administrace nemůže zobrazit obsah odeslaných e-mailů (záměrně).
