export { clientConfigSchema, INTERNAL_NAME } from "./config/schema";
export type { ClientConfig, ClientConfigInput } from "./config/schema";
export { defineClientConfig, ClientConfigError } from "./config/define";

export { MODULE_IDS } from "./modules/ids";
export type { ModuleId } from "./modules/ids";
export { defineModule, CORE_PERMISSIONS } from "./modules/manifest";
export type {
  ModuleManifest,
  ModuleSeed,
  NavItem,
  PageDef,
  PermissionDef,
} from "./modules/manifest";
export {
  resolveModules,
  collectNav,
  collectPermissions,
  ModuleResolutionError,
} from "./modules/registry";

export { defineExtension } from "./extensions/types";
export type { ClientExtension, EventMap, EventName } from "./extensions/types";

export { defineNotificationEvent } from "./notifications/types";
export type { AnyEventDef, NotificationEventDef } from "./notifications/types";
export { notificationsConfigSchema } from "./notifications/config";
