import { generateVapidKeys } from "@rebar/core/push";

/**
 * Vygeneruje klíče VAPID pro push upozornění. Veřejný klíč smí do prohlížeče, soukromý patří jen do prostředí serveru
 * (`.env`, nikdy do repozitáře ani do chatu). Výstup na standardním výstupu jsou řádky pro `.env`; vysvětlení jde na chybový výstup.
 * Klíče se po nasazení nemění: nový pár znamená, že všechna zařízení musí upozornění v Nastavení → Upozornění zapnout znovu.
 */
const keys = await generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:info@vase-domena.cz");
console.error(
  "\nVložte řádky do .env serveru (VAPID_SUBJECT nahraďte e-mailem správce nebo adresou https), restartujte službu app i worker.\n" +
    "Soukromý klíč nikomu neposílejte. Postup a řešení potíží: docs/NOTIFICATIONS.md.",
);
