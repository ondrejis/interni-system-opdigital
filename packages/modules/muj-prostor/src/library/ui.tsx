"use client";

import { defineModuleUi, errorToast, successToast } from "@rebar/ui";
import { LibraryPage } from "./library-page";
import type { LibraryMoveResult } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UI oblasti „library“ modulu „muj-prostor“ (MPR-2): stránka E-mailová knihovna (hledání bez diakritiky, filtry, náhled
 * s daty kontaktu, kopírování, Gmail, přesun do sdílených šablon) a akce „Přesunout do knihovny“ na sdílených šablonách.
 * Generický seznam s filtry a exportem je na `/muj-prostor/knihovna/vse`. Zapojuje ji `ui.tsx` přes `mergeModuleUi`.
 */
export const areaUi = defineModuleUi({
  pages: [
    {
      path: "/muj-prostor/knihovna",
      render: ({ rest, query }) => (
        <LibraryPage
          selectedId={rest[0] && UUID.test(rest[0]) ? rest[0] : null}
          startNew={query.nova === "1"}
        />
      ),
    },
  ],
  recordActions: {
    email_template: [
      {
        id: "muj-prostor.library.fromTemplate",
        label: "Přesunout do knihovny",
        permission: "muj-prostor.email_library",
        run: async ({ api, id, push }) => {
          try {
            const r = await api.command<unknown, LibraryMoveResult>("muj-prostor.library.move", {
              direction: "fromTemplate",
              id,
            });
            successToast("Šablona je v soukromé knihovně.");
            push(r.href);
          } catch (e) {
            errorToast(e instanceof Error ? e.message : "Přesun se nepodařil.");
          }
        },
      },
    ],
  },
  paletteActions: [
    {
      id: "muj-prostor.library.new",
      label: "Nová položka e-mailové knihovny",
      keywords: "knihovna e-mail text šablona",
      icon: "mail-template",
      permission: "muj-prostor.email_library",
      href: "/muj-prostor/knihovna?nova=1",
    },
    {
      id: "muj-prostor.library.open",
      label: "Hledat v e-mailové knihovně",
      keywords: "knihovna e-mail text kopírovat gmail",
      icon: "mail-template",
      permission: "muj-prostor.email_library",
      href: "/muj-prostor/knihovna",
    },
  ],
});
