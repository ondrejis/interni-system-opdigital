import { getAccount } from "@rebar/core/auth";
import { collectNav } from "@rebar/core";
import { listMyTasks, unreadCount } from "@rebar/core/collab";
import { can, scopeOf } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { Icon, PageHeader } from "@rebar/ui";
import Link from "next/link";
import { homeBoardId, listBoards } from "@rebar/core/dashboards";
import { collectDashboard } from "@/server/dashboard";
import { dashboardsEnabled } from "@/server/dashboards";
import { HomeBoards } from "./home-boards";
import { groupNav } from "@/server/shell";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const TONE = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  default: "",
} as const;
const DOT = { danger: "bg-danger", warning: "bg-warning", info: "bg-accent" } as const;

/** Úvodní stránka po přihlášení: co vyžaduje pozornost, dlaždice zapnutých modulů podle oprávnění a moje úkoly. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCtx();
  const { runtime } = getServices();
  // vlastní nástěnky: přepínač nahoře; vybraná nástěnka (nebo domovská pro roli) nahradí klasický Přehled
  const boardsOn = dashboardsEnabled();
  const [boards, homeId] = boardsOn
    ? await Promise.all([listBoards(ctx), homeBoardId(ctx)])
    : [[], null];
  const param = (await searchParams).board;
  const wanted = typeof param === "string" ? param : undefined;
  const activeId =
    wanted === "prehled"
      ? null
      : wanted
        ? (boards.find((b) => b.id === wanted)?.id ??
          // správce nástěnek smí otevřít i cizí (náhled výchozích sad rolí)
          (boardsOn && can(ctx, "dashboards.manage") && /^[0-9a-f-]{36}$/i.test(wanted)
            ? wanted
            : null))
        : (boards.find((b) => b.id === homeId)?.id ?? null);
  const jobsAvailable =
    runtime.modules.some((m) => m.id === "zakazky") && !!scopeOf(ctx, "zakazky.read");
  const showBoards = boardsOn && (boards.length > 0 || can(ctx, "dashboards.write"));
  if (activeId)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader breadcrumbs={[{ label: "Přehled" }]} />
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <HomeBoards
            boards={boards}
            activeId={activeId}
            hasHome={!!homeId}
            jobsAvailable={jobsAvailable}
          />
        </div>
      </div>
    );
  const [account, unread, tasks, dashboard] = await Promise.all([
    getAccount(ctx),
    unreadCount(ctx),
    listMyTasks(ctx),
    collectDashboard(ctx),
  ]);
  const nav = collectNav(runtime.modules).filter(
    (n) => n.permission === undefined || [n.permission].flat().some((p) => can(ctx, p)),
  );
  const today = todayIso();
  const open = tasks.filter((t) => !t.doneAt);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Přehled" }]} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {showBoards && (
          <HomeBoards
            boards={boards}
            activeId={null}
            hasHome={!!homeId}
            jobsAvailable={jobsAvailable}
          />
        )}
        <h1 className="text-2xl font-semibold">Dobrý den, {account.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted" data-testid="whoami">
          Přihlášen: <strong className="text-fg">{account.name}</strong> ({account.roleName})
        </p>

        <section aria-label="Vyžaduje pozornost" className="mt-6" data-testid="attention">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-faint">
            Vyžaduje pozornost
          </h2>
          {dashboard.attention.length === 0 && overdue === 0 ? (
            <p className="rounded-lg border border-line p-4 text-muted">
              Teď nic nehoří, všechno je v pořádku.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {overdue > 0 && (
                <li>
                  <Link href="/ukoly" className="flex items-start gap-3 px-4 py-3 hover:bg-subtle">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT.danger}`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="font-medium">Úkoly po termínu: {overdue}</span>
                    </span>
                  </Link>
                </li>
              )}
              {dashboard.attention.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[a.severity]}`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{a.title}</span>
                      {a.detail && <span className="block text-sm text-muted">{a.detail}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Přehled" className="mt-6">
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6"
            data-testid="widgets"
          >
            <Link
              href="/inbox"
              className="rounded-lg border border-line p-4 hover:border-line-strong hover:bg-subtle"
            >
              <div className="text-sm text-muted">Nepřečtená upozornění</div>
              <div className="mt-1 text-2xl font-semibold tabular">{unread}</div>
            </Link>
            <Link
              href="/ukoly"
              className="rounded-lg border border-line p-4 hover:border-line-strong hover:bg-subtle"
            >
              <div className="text-sm text-muted">Moje otevřené úkoly</div>
              <div className="mt-1 text-2xl font-semibold tabular">{open.length}</div>
            </Link>
            {dashboard.widgets.map((w) => {
              const body = (
                <>
                  <div className="text-sm text-muted">{w.title}</div>
                  <div
                    className={`mt-1 text-2xl font-semibold tabular ${TONE[w.tone ?? "default"]}`}
                  >
                    {w.value}
                  </div>
                  {w.hint && <div className="mt-0.5 truncate text-sm text-muted">{w.hint}</div>}
                </>
              );
              const cls =
                "rounded-lg border border-line p-4 hover:border-line-strong hover:bg-subtle";
              return w.href ? (
                <Link key={w.id} href={w.href} className={cls} data-testid="widget">
                  {body}
                </Link>
              ) : (
                <div key={w.id} className={cls} data-testid="widget">
                  {body}
                </div>
              );
            })}
          </div>
        </section>

        {open.length > 0 && (
          <section aria-label="Moje úkoly" className="mt-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wide text-faint">Moje úkoly</h2>
              <Link href="/ukoly" className="text-sm text-accent hover:underline">
                Všechny
              </Link>
            </div>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {open.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link
                    href="/ukoly"
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-subtle"
                  >
                    <span className="min-w-0 truncate">{t.title}</span>
                    {t.dueDate && (
                      <span
                        className={`shrink-0 text-sm ${t.dueDate < today ? "text-danger" : "text-muted"}`}
                      >
                        {formatDate(t.dueDate)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div data-testid="modules" className="mt-6 space-y-6">
          {groupNav(nav).map((g) => (
            <section key={g.heading} aria-label={g.heading}>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-faint">
                {g.heading}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-subtle"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                        <Icon name={item.icon} className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.children?.length ? (
                          <span className="block truncate text-xs text-faint">
                            {item.children.map((c) => c.label.toLowerCase()).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
