import { DEFAULT_ROLES, defineSeed } from "@rebar/core/seed";

/**
 * Výchozí data klienta OPSYS (role, pipeline, číselníky, číselné řady). Při instalaci a aktualizaci se doplní jen to,
 * co chybí: co správce změnil v administraci, se nepřepisuje. Klíče oprávnění mimo katalog zapnutých modulů se ignorují.
 */
export default defineSeed({
  roles: [
    ...DEFAULT_ROLES,
    {
      key: "partner",
      name: "Partner",
      description:
        "Společník agentury: běžná práce se všemi zapnutými moduly bez nastavení systému",
      permissions: {
        "kontakty.read": "all",
        "kontakty.write": "all",
        "kontakty.merge": "all",
        "poptavky.read": "all",
        "poptavky.write": "all",
        "zakazky.read": "all",
        "zakazky.write": "all",
        "dochazka.own": "all",
        "dochazka.read": "own",
        "kalendar.read": "all",
        "kalendar.write": "all",
        "tasks.read": "all",
        "tasks.assign": "all",
        "dashboards.write": "all",
        "exports.schedule": "all",
      },
    },
    {
      key: "externista",
      name: "Externista",
      description: "Externí spolupracovník: jen své zakázky, hodiny a kalendář",
      permissions: {
        "zakazky.read": "own",
        "dochazka.own": "all",
        "kalendar.read": "own",
      },
    },
  ],
});
