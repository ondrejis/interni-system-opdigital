export { renderMail } from "./templates";
export type { MailTemplateName, RenderedMail } from "./templates";
export { smtpTransport, verifySmtp } from "./transport";
export type { MailAttachment, MailTransport, OutgoingMail, SmtpConfig } from "./transport";
export {
  sendMailJob,
  createQueuedMailer,
  logDocumentMail,
  enqueueDocumentMail,
  queueNotificationMail,
} from "./service";
export type { MailDeps, DocumentMail, DocumentMailDeps } from "./service";
