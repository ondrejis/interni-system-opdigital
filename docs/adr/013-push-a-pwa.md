# ADR 013: Push upozornění, PWA a nahrávání z terénu

- Stav: přijato (2026-10-08); část „Odesílání“ nahradil [ADR 024](024-katalog-upozorneni.md) (katalog událostí, outbox, fronta doručení)
- Kontext: zadání §7.10 (terénní UI), ADR 009 (fronta úloh), ADR 008 (tajemství)

## Kontext

Lidé v terénu mají telefon, slabý signál a rukavice. Potřebují vidět, co je dnes čeká, píchnout docházku, vyfotit stavbu
a dostat upozornění i do zavřené aplikace.

## Rozhodnutí

- **PWA**: `manifest` (název a barva z nastavení klienta), ikony generované serverem (`/pwa-icon/192`, bez nahraných souborů)
  a service worker `/sw.js`, který **nic nekešuje** (data jsou citlivá), jen přijímá push a otevírá aplikaci po ťuknutí.
- **Web Push** přes knihovnu `web-push` (nová závislost, jen v `@rebar/core`): šifrování zpráv (RFC 8291) a podpis VAPID by
  ruční implementace snadno zkazila. Klíče VAPID jsou v prostředí serveru (`pnpm vapid:generate`), bez nich se push nenabízí.
  Odběr se ukládá po zařízení (`push_subscription`).
- **Odesílání** z fronty úloh: `notification.pushed_at` + úloha `push.deliver` jednou za minutu. Upozornění se nejdřív „zabere“
  (`pushed_at`), takže se nikdy neposlá dvakrát; starší než hodina se neposílají (nové zařízení nedostane hromadu starých zpráv).
- **Adresu odběru dodává prohlížeč**, takže by šlo server donutit volat libovolnou adresu. Proto jen https a jen známé push služby
  (FCM, Mozilla, Apple, Windows); odkaz v upozornění musí být relativní.
- **Fotky z terénu**: zmenšení na klientu (1600 px, JPEG 0,8, respektuje EXIF), uložení do IndexedDB a odeslání na pozadí s
  opakováním (2 s … 30 min). Dočasná chyba (bez signálu, 5xx, 429) se opakuje, trvalá (nepovolený soubor) čeká na člověka.
- **Spodní navigace** jen na telefonu (Dnes, nejdůležitější moduly podle oprávnění, Foto, Více); dotykové plochy ≥ 44 px
  (`pointer: coarse`), větší písmo.
- Odběr kalendáře (ICS) používá tajný token v adrese a v databázi je jen jeho SHA-256 otisk; import cizích kalendářů je chráněný proti SSRF
  (https, kontrola adresy při připojení i přesměrování).

## Důsledky

- Na iPhonu fungují push upozornění až po „Přidat na plochu“ (iOS 16.4+); stránka Upozornění v telefonu to vysvětluje.
- Zpoždění push je až minuta (cron). Pro okamžité doručení by šlo přidat odeslání ihned po vytvoření upozornění.
- Offline režim aplikace (číst data bez signálu) není součástí; offline funguje jen odeslání fotek.
