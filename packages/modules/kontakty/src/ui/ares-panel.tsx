"use client";

import { Button, Card, CardBody, CardHeader, Chip, useCommandMutation } from "@rebar/ui";
import type { AresTestResult } from "../contract";

/**
 * Panel ARES pro Nastavení → Integrace (slot `settings.integrations`, NAS-10): ARES je veřejné API bez klíče, takže
 * není co nastavovat; tlačítko ověří dostupnost a změří dobu odpovědi proti limitu 2 s (NFR-04).
 */
export function AresIntegrationPanel() {
  const test = useCommandMutation<Record<string, never>, AresTestResult>("kontakty.ares.test", {
    invalidate: [],
  });
  const r = test.data;
  return (
    <Card data-testid="ares-panel">
      <CardHeader
        title="ARES (Ministerstvo financí)"
        action={
          <Button size="sm" loading={test.isPending} onClick={() => test.mutate({})}>
            Otestovat ARES
          </Button>
        }
      />
      <CardBody>
        <p className="text-sm text-muted">
          Doplnění organizace podle IČO (název, sídlo, DIČ, právní forma). Veřejné API bez klíče;
          odpovědi se drží 24 hodin. Když ARES neodpovídá, organizaci jde uložit ručně.
        </p>
        {test.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {test.error.message}
          </p>
        )}
        {r && (
          <p className="mt-2 flex items-center gap-2 text-sm" data-testid="ares-test-result">
            <Chip color={r.ok && r.withinBudget ? "green" : r.ok ? "yellow" : "red"}>
              {r.ok ? (r.withinBudget ? "V pořádku" : "Pomalé") : "Nedostupné"}
            </Chip>
            {r.message}
            {r.sample ? ` Vzorek: ${r.sample}.` : ""}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
