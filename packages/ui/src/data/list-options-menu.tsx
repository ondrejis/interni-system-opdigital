"use client";

import type { AttributeDescriptor, EntityDescriptor } from "@rebar/core/shared";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Columns3,
  Download,
  Layers,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/overlay";
import type { ExportFormat } from "./export-dialog";
import {
  MenuRadioGroup,
  MenuRadioItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from "./menu-parts";
import { GROUPABLE, TYPE_ICONS } from "./type-icons";
import type { ViewConfig } from "./types";

type Props = {
  entity: EntityDescriptor;
  cfg: ViewConfig;
  /** Zobrazené sloupce tabulky. */
  visible: string[];
  isKanban: boolean;
  /** Přepínač Tabulka / Kanban je v nabídce, jen když ho lišta neukazuje (telefon). */
  viewTypeInMenu: boolean;
  onConfig: (patch: Partial<ViewConfig>) => void;
  onCycleSort: (key: string) => void;
  /** Export celé filtrované sady; `undefined` = entita export nenabízí (nebo vložený seznam). */
  exportApi?:
    { exporting: boolean; run: (format: ExportFormat) => void; openDialog: () => void } | undefined;
  /** Ukládání pohledů; `undefined` u vloženého seznamu. */
  saveApi?:
    | {
        dirty: boolean;
        canUpdate: boolean;
        onUpdate: () => void;
        onSaveNew: () => void;
      }
    | undefined;
};

/**
 * Jedna nabídka „Zobrazení“ pro vedlejší nástroje seznamu: sloupce (u nástěnky atributy karty), řazení, seskupení, export
 * a uložení pohledu. Hlavní věci (hledání, filtr, pohled, nový záznam) zůstávají na liště.
 */
export function ListOptionsMenu({
  entity,
  cfg,
  visible,
  isKanban,
  viewTypeInMenu,
  onConfig,
  onCycleSort,
  exportApi,
  saveApi,
}: Props) {
  const attrs = entity.attributes;
  const groupable = attrs.filter((a) => GROUPABLE.includes(a.type));
  const sortCount = cfg.sort?.length ?? 0;
  const groupLabel = cfg.group ? attrs.find((a) => a.key === cfg.group)?.label : undefined;
  const dirty = !!saveApi?.dirty;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          data-testid="list-options"
          loading={exportApi?.exporting ?? false}
          aria-label={dirty ? "Zobrazení (neuložené změny pohledu)" : "Zobrazení"}
          className="relative"
        >
          <SlidersHorizontal />
          <span className="hidden @[40rem]:inline">Zobrazení</span>
          {dirty && (
            <span
              aria-hidden
              className="absolute right-1 top-1 size-1.5 rounded-full bg-accent"
              data-testid="view-dirty"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {viewTypeInMenu && (
          <>
            <DropdownMenuLabel>Zobrazit jako</DropdownMenuLabel>
            <MenuRadioGroup
              value={isKanban ? "kanban" : "table"}
              onValueChange={(v) => onConfig({ viewType: v === "kanban" ? "kanban" : "table" })}
            >
              <MenuRadioItem value="table">Tabulka</MenuRadioItem>
              <MenuRadioItem value="kanban">Kanban</MenuRadioItem>
            </MenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {isKanban ? (
          <MenuSub>
            <MenuSubTrigger hint={cfg.cardAttributes?.length || undefined}>
              <Columns3 /> Atributy na kartě
            </MenuSubTrigger>
            <MenuSubContent>
              <DropdownMenuLabel>Atributy na kartě</DropdownMenuLabel>
              {attrs
                .filter((a) => a.key !== entity.titleKey && a.key !== entity.statusKey)
                .map((a) => (
                  <DropdownMenuCheckboxItem
                    key={a.key}
                    checked={(cfg.cardAttributes ?? []).includes(a.key)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) =>
                      onConfig({
                        cardAttributes: v
                          ? [...(cfg.cardAttributes ?? []), a.key]
                          : (cfg.cardAttributes ?? []).filter((k) => k !== a.key),
                      })
                    }
                  >
                    {a.label}
                  </DropdownMenuCheckboxItem>
                ))}
            </MenuSubContent>
          </MenuSub>
        ) : (
          <MenuSub>
            <MenuSubTrigger hint={visible.length}>
              <Columns3 /> Sloupce
            </MenuSubTrigger>
            <MenuSubContent>
              <DropdownMenuLabel>Zobrazené sloupce</DropdownMenuLabel>
              {attrs.map((a) => (
                <DropdownMenuCheckboxItem
                  key={a.key}
                  checked={visible.includes(a.key)}
                  disabled={a.key === entity.titleKey}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) =>
                    onConfig({
                      columns: v ? [...visible, a.key] : visible.filter((k) => k !== a.key),
                    })
                  }
                >
                  {a.label}
                </DropdownMenuCheckboxItem>
              ))}
            </MenuSubContent>
          </MenuSub>
        )}
        <MenuSub>
          <MenuSubTrigger hint={sortCount || undefined}>
            <ArrowDownUp /> Řazení
          </MenuSubTrigger>
          <MenuSubContent>
            <DropdownMenuLabel>Řadit podle (klik mění směr)</DropdownMenuLabel>
            {attrs
              .filter((a) => a.sortable)
              .map((a: AttributeDescriptor) => {
                const cur = (cfg.sort ?? []).find((x) => x.attr === a.key);
                return (
                  <DropdownMenuItem
                    key={a.key}
                    onSelect={(e) => {
                      e.preventDefault();
                      onCycleSort(a.key);
                    }}
                  >
                    <span className="flex-1">{a.label}</span>
                    {cur &&
                      (cur.dir === "asc" ? (
                        <ArrowUp className="!text-accent" />
                      ) : (
                        <ArrowDown className="!text-accent" />
                      ))}
                  </DropdownMenuItem>
                );
              })}
            {sortCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onConfig({ sort: [] })}>
                  Zrušit řazení
                </DropdownMenuItem>
              </>
            )}
          </MenuSubContent>
        </MenuSub>
        {!isKanban && groupable.length > 0 && (
          <MenuSub>
            <MenuSubTrigger hint={groupLabel}>
              <Layers /> Seskupit
            </MenuSubTrigger>
            <MenuSubContent>
              {cfg.group && (
                <>
                  <DropdownMenuItem onSelect={() => onConfig({ group: null })}>
                    Zrušit seskupení
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {groupable.map((a) => {
                const I = TYPE_ICONS[a.type];
                return (
                  <DropdownMenuItem key={a.key} onSelect={() => onConfig({ group: a.key })}>
                    <I />
                    {a.label}
                  </DropdownMenuItem>
                );
              })}
            </MenuSubContent>
          </MenuSub>
        )}
        {exportApi && (
          <MenuSub>
            <MenuSubTrigger data-testid="export-menu">
              <Download /> Export
            </MenuSubTrigger>
            <MenuSubContent>
              <DropdownMenuLabel>Celá filtrovaná sada, zobrazené sloupce</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => exportApi.run("xlsx")}>
                Excel (XLSX)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportApi.run("csv")}>CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportApi.run("pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTimeout(exportApi.openDialog, 60)}
                data-testid="export-dialog-open"
              >
                Export s nastavením…
              </DropdownMenuItem>
            </MenuSubContent>
          </MenuSub>
        )}
        {saveApi && (
          <>
            <DropdownMenuSeparator />
            {saveApi.dirty && saveApi.canUpdate && (
              <DropdownMenuItem onSelect={saveApi.onUpdate}>
                <Save /> Uložit změny do pohledu
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={saveApi.onSaveNew}>
              <Save /> Uložit jako pohled…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
