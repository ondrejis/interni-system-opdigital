"use client";

import { defineModuleUi, toast, type RecordAction, type RecordOverviewCard } from "@rebar/ui";
import { DriveButton, DriveCard, PRIVATE_WARNING } from "./ui/drive-button";
import { driveButtonModel } from "./state";
import type { DriveEntityType, DriveFolderInfo } from "./types";

export { DriveButton, DriveCard } from "./ui/drive-button";
export { DriveSettings } from "./ui/settings";

/** Pořadí podle `CLIENT_ACTIONS.disk` a těsně před kartou událostí (`CLIENT_OVERVIEW_ORDER`); konstanty jádra se do prohlížeče netáhnou. */
const CLIENT_ACTION_ORDER_DISK = 10;
const CLIENT_OVERVIEW_ORDER_DISK = 89;

/**
 * Akce v hlavičce karty klienta a zakázky. Hlavička jádra kreslí akce jako tlačítka se statickým popiskem, proto je
 * tohle nouzová podoba: po kliknutí zjistí stav a udělá, co by udělalo `DriveButton` (otevře, počká, zopakuje,
 * založí). Plnou podobu s popiskem podle stavu vykreslí hlavička přes `render`; tlačítko se stavem je také na kartě
 * „Složka na Disku“ na Přehledu.
 */
function driveAction(entityType: DriveEntityType): RecordAction {
  return {
    id: "disk",
    label: "Otevřít Disk",
    permission: "disk.read",
    order: CLIENT_ACTION_ORDER_DISK,
    render: ({ id }) => <DriveButton entityType={entityType} id={id} />,
    async run({ id, api, refresh }: ActionContext) {
      // okno otevřeme hned (po `await` by ho blokátor vyskakovacích oken zavřel)
      const win = window.open("", "_blank");
      if (win) win.opener = null;
      const close = () => win?.close();
      try {
        const info = await api.command<unknown, DriveFolderInfo>("disk.folderState", {
          entityType,
          id,
        });
        const model = driveButtonModel(info, true);
        if (model.kind === "open" && model.href && win) {
          win.location.href = model.href;
          return;
        }
        close();
        if (model.kind === "wait") toast("Složka se právě vytváří…");
        else if (model.kind === "retry") {
          await api.command("disk.retry", { entityType, id });
          toast("Požadavek na složku byl odeslán znovu.");
        } else if (model.kind === "create") {
          if (info.isPrivate && !window.confirm(PRIVATE_WARNING)) return;
          await api.command("disk.requestFolder", { entityType, id, force: info.isPrivate });
          toast("Složka se vytváří.");
        }
        refresh();
      } catch (err) {
        close();
        throw err;
      }
    },
  };
}

type ActionContext = Parameters<NonNullable<RecordAction["run"]>>[0];

const card = (entityType: DriveEntityType): RecordOverviewCard => ({
  id: "disk",
  column: "side",
  order: CLIENT_OVERVIEW_ORDER_DISK,
  permission: "disk.read",
  render: ({ id }) => (
    <section className="rounded-lg border border-line bg-bg p-4">
      <h3 className="mb-3 text-base font-semibold">Složka na Disku</h3>
      <DriveCard entityType={entityType} id={id} />
    </section>
  ),
});

/** UI modulu „disk“: tlačítko Otevřít Disk v hlavičce a karta složky na Přehledu klienta a zakázky. */
export const ui = defineModuleUi({
  recordActions: { company: [driveAction("company")], job: [driveAction("job")] },
  recordOverview: { company: [card("company")], job: [card("job")] },
});
