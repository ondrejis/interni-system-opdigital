import { NotFoundError, PermissionError, type Ctx } from "@rebar/core/rbac";

/*
  Poskytovatel „Moje úkoly“ pro widget Úkoly na dnes. Přehled nečte tabulky cizího modulu: úkoly vrací příkaz modulu
  `ukoly` (`ukoly.list`), takže viditelnost a soukromí úkolů hlídá modul. Příkaz spouští aplikace (`run`), která
  zkontroluje oprávnění jako u každého příkazu.
*/

/** Úkol z odpovědi `ukoly.list` (jen pole, která widget potřebuje; modul se neimportuje). */
type ListedTask = {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  assigneeName: string | null;
  company: { title: string | null } | null;
  jobNumber: string | null;
  job: { title: string | null } | null;
};

/** Úkol ve widgetu Úkoly na dnes. */
export type MyTask = {
  id: string;
  title: string;
  dueDate: string | null;
  subtitle?: string;
  href?: string;
  delegated?: boolean;
};

/** Spuštění příkazu modulu jako aktér (aplikace zkontroluje oprávnění příkazu). */
export type RunCommand = (ctx: Ctx, name: string, input: unknown) => Promise<unknown>;

const subtitleOf = (t: ListedTask): string =>
  [
    t.dueTime ? `v ${t.dueTime}` : null,
    t.company?.title ?? null,
    t.jobNumber ? `${t.jobNumber}${t.job?.title ? ` ${t.job.title}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Moje úkoly na dnes a po termínu (pohled `today` modulu úkolů). S `includeDelegated` přibudou úkoly, které jsem zadal
 * já a řeší je jiný, s termínem do dneška. Bez zapnutého modulu nebo oprávnění je seznam prázdný.
 */
export function createMyTasks(run: RunCommand) {
  return async function myTasks(
    ctx: Ctx,
    opts: { includeDelegated: boolean; limit: number },
  ): Promise<MyTask[]> {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
    const list = async (view: "today" | "delegated"): Promise<ListedTask[]> => {
      try {
        const r = (await run(ctx, "ukoly.list", {
          view,
          scope: "mine",
          limit: 50,
          includeSubtasks: true,
        })) as { rows: ListedTask[] };
        return r.rows;
      } catch (e) {
        if (e instanceof NotFoundError || e instanceof PermissionError) return [];
        throw e;
      }
    };
    const own: MyTask[] = (await list("today")).map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      ...(subtitleOf(t) ? { subtitle: subtitleOf(t) } : {}),
      href: `/ukoly?ukol=${t.id}`,
    }));
    const delegated: MyTask[] = opts.includeDelegated
      ? (await list("delegated"))
          .filter((t) => t.dueDate && t.dueDate <= today)
          .map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            subtitle: [`řeší ${t.assigneeName ?? "nikdo"}`, subtitleOf(t)]
              .filter(Boolean)
              .join(" · "),
            href: `/ukoly?ukol=${t.id}`,
            delegated: true,
          }))
      : [];
    return [...own, ...delegated]
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .slice(0, opts.limit);
  };
}
