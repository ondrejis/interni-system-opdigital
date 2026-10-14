import { getAccount } from "@rebar/core/auth";
import { requireCtx } from "@/server/request";
import { getTerminalState } from "@/server/terminal";
import { MoreScreen } from "./more-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Více" };

export default async function TerminalMore() {
  const ctx = await requireCtx({ allowTerminalOnly: true });
  const [{ terminalOnly }, account] = await Promise.all([getTerminalState(ctx), getAccount(ctx)]);
  return (
    <MoreScreen
      user={{ name: account.name, roleName: account.roleName, email: account.email }}
      terminalOnly={terminalOnly}
    />
  );
}
