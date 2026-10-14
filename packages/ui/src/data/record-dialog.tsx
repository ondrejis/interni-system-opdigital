"use client";

import type { EntityDescriptor } from "@rebar/core/shared";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { useRecordDialogExt, type RecordDialogExt } from "./module-ui";
import { RecordView } from "./record-view";

type Props = {
  entity: EntityDescriptor;
  /** Otevřený záznam; `null` = zavřeno. */
  id: string | null;
  /** Zavření (Esc, křížek, klik mimo). Řídí ho volající, typicky `useRecordParam().close`. */
  onClose: () => void;
  onDeleted?: (() => void) | undefined;
  /** Obsah karty Přehled navíc (viz `RecordView`). */
  overview?: ReactNode;
  /** Záložka a podzáložka při otevření (`?tab=`, `?sub=`). */
  initialTab?: string | undefined;
  initialSub?: string | undefined;
  /** Vlastní hlavička, Přehled a lišta záložek od modulu (jen pro pop-up; stránka záznamu se nemění). */
  ext?: RecordDialogExt | undefined;
};

/**
 * Detail záznamu v pop-upu, široký až 1280 px (pod ~1300 px obrazovky téměř celou šířku, na telefonu celou obrazovku). Obsah je `RecordView` v režimu
 * `dialog`: hlavička, pás od modulu (`recordHeader`), záložky i akce modulu fungují jako na stránce záznamu.
 * Seznam pod pop-upem se nepřekresluje, takže filtr, hledání i pozice v nástěnce zůstanou.
 */
export function RecordDialog({
  entity,
  id,
  onClose,
  onDeleted,
  overview,
  initialTab,
  initialSub,
  ext,
}: Props) {
  const moduleExt = useRecordDialogExt(entity.key);
  return (
    <D.Root open={!!id} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--bg-overlay)] anim-fade" />
        <D.Content
          data-testid="record-dialog"
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            // oznámení (Zpět po smazání…) jsou mimo pop-up, ale nemají ho zavřít
            const t = e.target as HTMLElement | null;
            if (t?.closest("[data-sonner-toaster]")) e.preventDefault();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-bg pb-[env(safe-area-inset-bottom)] outline-none anim-pop sm:inset-auto sm:left-1/2 sm:top-[4vh] sm:h-[92vh] sm:w-[min(80rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:overflow-hidden sm:rounded-xl sm:border sm:border-line sm:pb-0 sm:shadow-float"
        >
          <D.Title className="sr-only">{entity.label.one}</D.Title>
          {id && (
            <RecordView
              key={id}
              entity={entity}
              id={id}
              mode="dialog"
              onClose={onClose}
              onDeleted={() => {
                onDeleted?.();
                onClose();
              }}
              overview={overview}
              initialTab={initialTab}
              initialSub={initialSub}
              dialogExt={ext ?? moduleExt}
            />
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
