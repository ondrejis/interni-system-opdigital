import { PageHeader } from "@rebar/ui";
import { requireCtx } from "@/server/request";
import { MyTasks } from "./my-tasks";

export default async function TasksPage() {
  await requireCtx();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Moje úkoly" }]} />
      <MyTasks />
    </div>
  );
}
