/*
  Lehký vstup pro manifesty modulů. Manifest se dostane i do prohlížeče (navigace, oprávnění), proto nesmí táhnout
  validaci konfigurace (zod, ~90 kB gzip) z kořene `@rebar/core`. Moduly proto importují odsud.
*/
export { MODULE_IDS } from "./ids";
export type { ModuleId } from "./ids";
export { defineModule, CORE_PERMISSIONS } from "./manifest";
export type { ModuleManifest, ModuleSeed, NavItem, PageDef, PermissionDef } from "./manifest";
export { defineNotificationEvent } from "../notifications/types";
export type { AnyEventDef, NotificationEventDef } from "../notifications/types";
