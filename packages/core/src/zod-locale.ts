import { z } from "zod";

// Validační hlášky Zodu česky (vlastní hlášky ve schématech mají přednost).
const cs = z.locales.cs().localeError;

const num = (n: number | bigint) => String(n).replace(".", ",");

/**
 * Doplněk české sady Zodu: její hlášky pro čísla ("number musí být <=24") a chybějící hodnoty ("očekáváno řetězec,
 * obdrženo undefined") nejsou pro uživatele srozumitelné; ty přepisujeme, ostatní nechává sada.
 */
z.config({
  localeError: (issue) => {
    if (issue.code === "too_big" && (issue.origin === "number" || issue.origin === "int")) {
      return issue.inclusive
        ? `Hodnota může být nejvýše ${num(issue.maximum)}.`
        : `Hodnota musí být menší než ${num(issue.maximum)}.`;
    }
    if (issue.code === "too_small" && (issue.origin === "number" || issue.origin === "int")) {
      return issue.inclusive
        ? `Hodnota musí být alespoň ${num(issue.minimum)}.`
        : `Hodnota musí být větší než ${num(issue.minimum)}.`;
    }
    if (issue.code === "invalid_type" && (issue.input === undefined || issue.input === null)) {
      return "Toto pole je povinné.";
    }
    return cs(issue);
  },
});
