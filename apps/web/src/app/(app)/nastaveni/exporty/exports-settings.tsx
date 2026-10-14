"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rebar/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ExportSettings } from "./csv-settings";
import { HistoryTab } from "./history-tab";
import { resolveTab, type TabKey } from "./labels";
import { MyExports } from "./my-exports";
import { SchedulesTab } from "./schedules-tab";
import { TemplatesTab } from "./templates-tab";

const TAB_LABEL: Record<TabKey, string> = {
  moje: "Moje exporty",
  sablony: "Šablony",
  plany: "Plány",
  historie: "Historie všech",
  nastaveni: "Nastavení",
};

export type ExportsSettingsProps = {
  /** Záložky, které smí uživatel vidět (pořadí = pořadí v liště). */
  tabs: TabKey[];
  canSchedule: boolean;
  canManage: boolean;
  me: { id: string; name: string };
  /** Adresa seznamu podle klíče entity (odkaz „Použít šablonu“). */
  entityPaths: Record<string, string>;
  retentionDays: number;
};

/** Nastavení → Exporty: záložky se stavem v adrese (`?tab=`), obsah záložky se načítá až po jejím otevření. */
export function ExportsSettings(props: ExportsSettingsProps) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  // odkaz z e-mailu s plánovaným exportem (`?plan=`) otevře rovnou Plány
  const tab = resolveTab(raw ?? (sp.get("plan") ? "plany" : null), props.tabs);
  const active = useRef<HTMLDivElement>(null);

  useEffect(() => {
    active.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  function select(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", next);
    if (next !== "plany") params.delete("plan");
    router.replace(`${path}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={select}>
      <div
        ref={active}
        className="scrollbar-none -mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:mx-0 lg:px-0"
      >
        <TabsList aria-label="Oddíly exportů" className="min-w-max">
          {props.tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="cursor-pointer pointer-coarse:min-h-11">
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="mt-4">
        <TabsContent value="moje" className="outline-none">
          <MyExports retentionDays={props.retentionDays} />
        </TabsContent>
        <TabsContent value="sablony" className="outline-none">
          <TemplatesTab canManage={props.canManage} entityPaths={props.entityPaths} />
        </TabsContent>
        <TabsContent value="plany" className="outline-none">
          <SchedulesTab canSchedule={props.canSchedule} canManage={props.canManage} me={props.me} />
        </TabsContent>
        <TabsContent value="historie" className="outline-none">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="nastaveni" className="outline-none">
          <ExportSettings />
        </TabsContent>
      </div>
    </Tabs>
  );
}
