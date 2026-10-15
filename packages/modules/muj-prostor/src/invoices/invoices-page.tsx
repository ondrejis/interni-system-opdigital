"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  EmptyState,
  Icon,
  Skeleton,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import { Kpi } from "../shared-ui";
import { InvoiceLine } from "./invoice-list";
import type { InvoicesOverview, PrepareResult } from "./types";

/**
 * Stránka „Opakované faktury“ (FAK-01 až FAK-03, v3): souhrn, stav Fakturoidu, tlačítko „Připravit návrhy teď“, seznam
 * návrhů se stavy a akcemi a služby, kterým nejde návrh připravit (chybí cena). Jen vlastník.
 */
export function InvoicesPage() {
  const { Link } = useNav();
  const q = useCommandQuery<InvoicesOverview>(
    "muj-prostor.invoices.overview",
    {},
    { refetchInterval: 30_000 },
  );
  const prepare = useCommandMutation<Record<string, never>, PrepareResult>(
    "muj-prostor.invoices.prepare",
  );
  const data = q.data;

  if (q.isError && !data)
    return (
      <EmptyState
        title="Opakované faktury se nepodařilo načíst"
        description={q.error.message}
        action={<Button onClick={() => void q.refetch()}>Zkusit znovu</Button>}
      />
    );
  if (!data) return <Skeleton className="m-4 h-40" />;
  const s = data.summary;
  const active = data.rows.filter((r) => r.status !== "canceled");
  const canceled = data.rows.filter((r) => r.status === "canceled");

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="invoices-page"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Koncepty k rozhodnutí"
          value={s.draftCount}
          hint={s.draftCount ? formatMinor(s.draftTotalMinor) : undefined}
          tone={s.draftCount ? "warning" : undefined}
          testId="kpi-drafts"
        />
        <Kpi
          label="Čeká na dokončení"
          value={s.pendingCount}
          tone={s.pendingCount ? "danger" : undefined}
          testId="kpi-pending"
        />
        <Kpi label="Vytvořeno ve Fakturoidu" value={s.sentCount} testId="kpi-sent" />
        <Kpi
          label="Bez platby ve financích"
          value={s.withoutPaymentCount}
          tone={s.withoutPaymentCount ? "danger" : undefined}
          testId="kpi-nopay"
        />
      </div>

      {!data.fakturoid.configured && (
        <div className="card flex flex-wrap items-center gap-3 p-3" data-testid="fakturoid-missing">
          <Icon name="alert-triangle" className="size-4 text-warning" />
          <p className="min-w-0 flex-1">
            Fakturoid není nastavený, faktury jde jen připravit. Přístup vyplníte v Nastavení →
            Integrace.
          </p>
          <Link href="/nastaveni/integrace" className="underline">
            Otevřít Integrace
          </Link>
        </div>
      )}
      {data.fakturoid.mode === "fake" && (
        <p className="text-sm text-warning" data-testid="fakturoid-fake">
          Vývojový režim: faktury se vytvářejí jen v paměti, do Fakturoidu nic nejde.
        </p>
      )}

      <section className="card overflow-hidden">
        <h3 className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
          <Icon name="receipt" className="size-4 text-faint" /> Návrhy a faktury
          <Button
            size="sm"
            className="ml-auto"
            loading={prepare.isPending}
            onClick={() =>
              prepare.mutate(
                {},
                {
                  onSuccess: (r) =>
                    successToast(
                      r.created
                        ? `Připraveno návrhů: ${r.created}.`
                        : "Žádný nový návrh není potřeba.",
                    ),
                  onError: (e) => errorToast(e.message),
                },
              )
            }
            data-testid="invoices-prepare"
          >
            <Icon name="rotate-ccw" /> Připravit návrhy teď
          </Button>
          <Link href="/muj-prostor/faktury/vse" className="text-sm font-normal underline">
            Všechny záznamy
          </Link>
        </h3>
        {active.length === 0 ? (
          <p
            className="border-t border-line-soft px-3 py-3 text-muted"
            data-testid="invoices-empty"
          >
            Žádné návrhy. U hostingu nebo údržby zapněte „Připravovat fakturu“, návrh se objeví 14
            dní před obnovou.
          </p>
        ) : (
          <ul className="border-t border-line-soft">
            {active.map((r) => (
              <InvoiceLine key={r.id} row={r} />
            ))}
          </ul>
        )}
      </section>

      {data.blocked.length > 0 && (
        <section className="card overflow-hidden" data-testid="invoices-blocked">
          <h3 className="px-3 py-2 text-sm font-semibold">
            Služby bez ceny (návrh nejde připravit)
          </h3>
          <ul className="border-t border-line-soft">
            {data.blocked.map((b) => (
              <li
                key={b.serviceId}
                className="border-t border-line-soft px-3 py-2 first:border-t-0"
              >
                <Link href={`/muj-prostor/hosting/vse/${b.serviceId}`} className="underline">
                  {b.name}
                </Link>
                <span className="text-muted">
                  {b.companyName ? ` · ${b.companyName}` : ""}: doplňte cenu
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canceled.length > 0 && (
        <section className="card overflow-hidden">
          <h3 className="px-3 py-2 text-sm font-semibold">Zrušené</h3>
          <ul className="border-t border-line-soft">
            {canceled.map((r) => (
              <InvoiceLine key={r.id} row={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
