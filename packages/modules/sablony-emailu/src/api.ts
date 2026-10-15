/*
  Veřejné funkce modulu „sablony-emailu“ pro jiné moduly (`@rebar/sablony-emailu/api`; smí je importovat jen modul, který má
  „sablony-emailu“ v `dependsOn`). D §2.4 žádné nevyžaduje; přesun textů s knihovnou v Můj prostor jde přes službu
  `emailTemplates` (viz `service.ts#emailTemplatesService`), ne přes toto API.
*/
export { composeLinks, gmailComposeUrl, mailtoComposeUrl, GMAIL_URL_MAX } from "./logic";
export type { ComposeLinks } from "./logic";
