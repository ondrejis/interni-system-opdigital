"use client";

import { Icon, Skeleton, useCommandQuery } from "@rebar/ui";
import { InvoiceLine } from "./invoice-list";
import type { InvoicesOverview } from "./types";

/**
 * Sekce „Opakované faktury“ v záložce „Hosting a domény“ na kartě klienta (jen vlastník). Nic nevykreslí, když klient
 * žádný návrh ani fakturu nemá (a když oprávnění chybí, příkaz selže a sekce zůstane prázdná).
 */
export function ClientInvoicesSection({ companyId }: { companyId: string }) {
  const q = useCommandQuery<InvoicesOverview>("muj-prostor.invoices.overview", { companyId });
  if (q.isError) return null;
  if (!q.data) return <Skeleton className="h-16 w-full" />;
  const rows = q.data.rows.filter((r) => r.status !== "canceled");
  if (rows.length === 0) return null;
  return (
    <section className="card overflow-hidden" data-testid="client-invoices">
      <h3 className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
        <Icon name="receipt" className="size-4 text-faint" /> Opakované faktury
        <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
          {rows.length}
        </span>
      </h3>
      <ul className="border-t border-line-soft">
        {rows.map((r) => (
          <InvoiceLine key={r.id} row={r} showClient={false} />
        ))}
      </ul>
    </section>
  );
}
