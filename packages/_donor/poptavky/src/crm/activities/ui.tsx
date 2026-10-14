import { defineModuleUi } from "@rebar/ui";

/**
 * UI část oblasti CRM „aktivity“ (docs/CRM.md → Oblast B). Komponenty (`NextActivityIcon`, `ActivityComposer`,
 * `UpcomingSteps`, `Timeline`, `WorkPanel`, `ActivityList`) jsou v `components.tsx`; do nástěnky, detailu a stránek je
 * zapojují oblasti D, E a F. Entity `crm_activity`, `crm_note` a `crm_activity_type` mají seznamy z registru entit.
 */
export const areaUi = defineModuleUi({});
