"use client";

import { cn, defineModuleUi, useCan, useNav } from "@rebar/ui";
import { LogTimeForm } from "./log-time-dialog";
import { JobHoursTab } from "./job-tab";
import { ReportView } from "./report";
import { TaskTimeExtra } from "./task-slot";
import { WeekView } from "./week";

function HodinyPage({ rest, query }: { rest: string[]; query: Record<string, string> }) {
  const { Link } = useNav();
  const can = useCan();
  const section = rest[0] ?? "tyden";
  const items = [
    { key: "tyden", href: "/hodiny", label: "Můj týden", show: true },
    { key: "prehled", href: "/hodiny/prehled", label: "Přehledy", show: true },
    { key: "zaznamy", href: "/hodiny/zaznamy", label: "Všechny záznamy", show: can("hodiny.read") },
  ].filter((i) => i.show);
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <nav
        aria-label="Oddíly hodin"
        className="flex gap-1 overflow-x-auto border-b border-line px-1 pt-2 md:px-3"
      >
        {items.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            aria-current={section === i.key ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium",
              section === i.key
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-4 p-4 md:p-6">
        {section === "tyden" && (
          <WeekView initialWeek={query.tyden} openLog={query.zapsat === "1"} />
        )}
        {section === "prehled" && <ReportView />}
      </div>
    </div>
  );
}

/** UI modulu „hodiny“: týdenní výkaz a přehledy, záložka a akce zakázky, příspěvek do dialogu úkolu, příkaz palety. */
export const areaUi = defineModuleUi({
  pages: [
    { path: "/hodiny", render: ({ rest, query }) => <HodinyPage rest={rest} query={query} /> },
  ],
  recordTabs: {
    job: [
      {
        id: "hodiny",
        label: "Hodiny",
        icon: "clock",
        order: 140,
        permission: "hodiny.read",
        render: ({ id }) => <JobHoursTab jobId={id} />,
      },
    ],
  },
  recordActions: {
    job: [
      {
        id: "hodiny.log",
        label: "Zapsat čas",
        permission: "hodiny.write",
        dialog: {
          title: "Zapsat čas",
          render: ({ id, row, close }) => (
            <LogTimeForm
              target={{
                job: {
                  id,
                  title: String(row.title ?? "Zakázka"),
                  number: typeof row.number === "string" ? row.number : null,
                },
              }}
              onDone={close}
              onCancel={close}
            />
          ),
        },
      },
    ],
  },
  slots: { "task.dialog.extras": TaskTimeExtra },
  paletteActions: [
    {
      id: "hodiny.log",
      label: "Zapsat hodiny",
      keywords: "čas hodiny výkaz odpracováno",
      icon: "clock",
      permission: "hodiny.write",
      href: "/hodiny?zapsat=1",
    },
  ],
});
