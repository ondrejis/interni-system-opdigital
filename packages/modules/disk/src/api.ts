/*
  Veřejné funkce modulu „disk“ pro jiné moduly (`@rebar/disk/api`; smí je importovat jen modul, který má „disk“
  v `dependsOn`) a pro testy. Jiné moduly Disk běžně nevolají: složky vznikají z doménových událostí a ruční akce jde
  přes službu `disk` (`deps.services.optional("disk")`, `@rebar/core/contracts`).
*/
export { driveFolderUrl } from "./types";
export { defaultStructure, validateStructure } from "./tree";
export { jobFolderName, clientFolderName } from "./naming";
