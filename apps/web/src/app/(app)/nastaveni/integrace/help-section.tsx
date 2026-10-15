import { FormSection } from "@rebar/ui";
import { BookOpen } from "lucide-react";

const VERIFY_SNIPPET = `// n8n, uzel Code (JavaScript): ověření podpisu příchozího webhooku z OPSYS
// Uzel Webhook musí mít v Options zapnuto „Raw Body“.
const crypto = require('crypto');
const secret = $env.OPSYS_WEBHOOK_SECRET;          // whsec_… z OPSYS
const header = $input.first().json.headers['x-opsys-signature'];   // t=…,v1=…
const raw = Buffer.from($input.first().binary.data.data, 'base64').toString('utf8');

const t = Number(/t=(\\d+)/.exec(header)?.[1]);
const sigs = [...header.matchAll(/v1=([0-9a-f]{64})/gi)].map((m) => m[1].toLowerCase());
const expected = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');

if (!t || Math.abs(Date.now() / 1000 - t) > 300) throw new Error('Podpis je starý (víc než 5 minut)');
if (!sigs.includes(expected)) throw new Error('Neplatný podpis');
return [{ json: JSON.parse(raw) }];`;

const SIGN_SNIPPET = `// n8n, uzel Code (JavaScript): podepsání požadavku do OPSYS
const crypto = require('crypto');
const secret = $env.OPSYS_INGEST_SECRET;           // tajemství příchozích požadavků
const body = JSON.stringify({ eventId: $json.eventId, status: 'ok', folders: $json.folders });
const t = Math.floor(Date.now() / 1000);
const v1 = crypto.createHmac('sha256', secret).update(t + '.' + body).digest('hex');
return [{ json: { body, signature: 't=' + t + ',v1=' + v1 } }];
// Uzel HTTP Request: POST na adresu zdroje, Body Content Type = Raw (application/json), Body = {{ $json.body }},
// hlavička X-Opsys-Signature = {{ $json.signature }}. Tělo musí být přesně ten podepsaný řetězec.`;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-subtle p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  );
}

/** Návod pro n8n: jak ověřit podpis odchozích webhooků a jak podepsat příchozí požadavky. */
export function HelpSection({ baseUrl, sources }: { baseUrl: string; sources: string[] }) {
  return (
    <FormSection
      title="Jak to propojit s n8n"
      description="Stručný návod k podpisům. Podpis je HMAC-SHA256 s časovou značkou, shodný v obou směrech."
      icon={<BookOpen />}
    >
      <div className="space-y-5 text-base" data-testid="integration-help">
        <section>
          <h4 className="font-semibold">Webhooky z OPSYS do n8n</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
            <li>V n8n vytvořte workflow s uzlem Webhook (POST) a jeho Production URL vložte do nového webhooku výše.</li>
            <li>Tajemství <code>whsec_…</code>, které se po vytvoření zobrazí jednou, uložte do n8n.</li>
            <li>
              Každý požadavek nese hlavičky <code>X-Opsys-Event</code> (název události),{" "}
              <code>X-Opsys-Delivery</code> (ID doručení) a <code>X-Opsys-Signature</code> ve tvaru{" "}
              <code>t=&lt;unix&gt;,v1=&lt;hex&gt;</code>.
            </li>
            <li>
              Podpis <code>v1</code> je hex HMAC-SHA256 z řetězce <code>t + &quot;.&quot; + tělo</code> s tajemstvím jako klíčem; tělo je
              přesně přijatý text (před parsováním JSON). Požadavek, jehož <code>t</code> se od hodin n8n liší o víc než 5 minut,
              odmítněte.
            </li>
            <li>
              Tělo je JSON <code>{`{ id, event, occurredAt, actor, entity, data, previous? }`}</code>; <code>entity.isPrivate</code> říká,
              zda jde o soukromý záznam. Odpovězte stavem 2xx, jinak se doručení opakuje (po 1 min, 5 min, 15 min, 30 min, 1 h).
            </li>
          </ol>
          <Code>{VERIFY_SNIPPET}</Code>
        </section>
        <section>
          <h4 className="font-semibold">Požadavky z n8n do OPSYS</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
            <li>
              Vygenerujte tajemství příchozích požadavků a vložte ho do n8n. Volejte{" "}
              <code>POST {baseUrl}/api/ingest/&lt;zdroj&gt;</code>
              {sources.length > 0 && <> (zdroje: {sources.join(", ")})</>}
              {" "}s hlavičkou <code>Content-Type: application/json</code>.
            </li>
            <li>
              Hlavička <code>X-Opsys-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, kde hex je HMAC-SHA256(tajemství, <code>t + &quot;.&quot; + tělo</code>) a{" "}
              <code>t</code> je aktuální čas v sekundách (tolerance ±5 minut).
            </li>
            <li>
              Odpovědi: <code>200</code> přijato (<code>duplicate: true</code> = už zpracováno dřív, nic se nestalo),{" "}
              <code>401</code> špatný nebo prošlý podpis, <code>404</code> neznámý zdroj, <code>422</code> neplatná data,{" "}
              <code>500</code> zpracování selhalo (n8n smí požadavek zopakovat, stejné ID se zpracuje znovu).
            </li>
          </ol>
          <Code>{SIGN_SNIPPET}</Code>
        </section>
      </div>
    </FormSection>
  );
}
