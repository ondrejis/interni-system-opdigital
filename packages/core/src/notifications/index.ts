export {
  COMMENT_MENTION,
  CORE_NOTIFICATION_EVENTS,
  NotificationCatalogError,
  SYSTEM_TEST,
  TASK_ASSIGNED,
  TASK_DONE,
  TASK_DUE_CHANGED,
  TASK_DUE_TODAY,
  collectNotificationEvents,
  configureNotifications,
  getEventDef,
  getNotificationRuntime,
  listEventDefs,
  resetNotifications,
  validateEventDefs,
  validateNotificationsConfig,
} from "./catalog";
export type { NotificationRuntime } from "./catalog";
export {
  DEFAULT_DIGEST_TIMES,
  DEFAULT_QUIET_HOURS,
  eventRuleSchema,
  notificationRulesSchema,
  notificationsConfigSchema,
  userPrefsSchema,
} from "./config";
export type {
  EventRule,
  NotificationRules,
  NotificationsConfig,
  NotificationsConfigInput,
  PushMode,
  QuietHours,
  UserEventPref,
  UserPrefs,
} from "./config";
export {
  EmailNotConfiguredError,
  MAX_ATTEMPTS,
  RETRY_BACKOFF_SECONDS,
  cleanupNotifications,
  dispatchDue,
  snoozeNotification,
  tagOf,
} from "./dispatch";
export type { DispatchDeps, DispatchResult, EmailMessage } from "./dispatch";
export { MONEY_PERMISSIONS, stripMoney } from "./money";
export { notify } from "./notify";
export type { NotifyResult } from "./notify";
export { NOTIFY_CHANNEL } from "./pipeline";
export { actorHas, usersWithPermission, usersWithRole } from "./recipients";
export { planDelivery, resolveEvent } from "./rules";
export { describeRecipient, validateRule } from "./validate";
export {
  getAdminRules,
  getDeliveryStats,
  getDeliveryStatus,
  getMyPreferences,
  listMyDeliveries,
  queueTestNotification,
  saveAdminRules,
  saveMyPreferences,
  validateRules,
} from "./service";
export type {
  AdminEventView,
  AdminRulesView,
  DeliveryLogRow,
  DeliveryStats,
  DeliveryStatus,
  EventView,
  MyPreferences,
} from "./service";
export { loadRules, notificationRulesSetting } from "./store";
export { countOf, plural } from "./text";
export { inQuietHours, nextDailyTime, quietEnd } from "./times";
export { CHANNELS, CHANNEL_LABELS, SEVERITY_LABELS, defineNotificationEvent } from "./types";
export type {
  AnyEventDef,
  Channel,
  NotificationEventDef,
  NotifyInput,
  ParamDef,
  Severity,
} from "./types";
