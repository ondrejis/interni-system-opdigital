import { PageHeader } from "@rebar/ui";
import { requireCtx } from "@/server/request";
import { InboxList } from "./inbox-list";

export default async function InboxPage() {
  await requireCtx();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Inbox" }]} />
      <InboxList />
    </div>
  );
}
