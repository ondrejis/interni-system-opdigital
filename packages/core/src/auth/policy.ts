/**
 * Komu je dvoufázové ověření (TOTP) povinné: `all` = všem rolím (OPSYS, AUT-01), `roles` = jen rolím s příznakem
 * `require_2fa` (původní chování jádra). Bez druhého faktoru se uživatel po přihlášení heslem dostane jen na nastavení
 * ověření; vypnout ho nejde.
 */
export type TwoFactorPolicy = "all" | "roles";

/** Výchozí zásada: druhý faktor je povinný pro každého. */
export const DEFAULT_TWO_FACTOR_POLICY: TwoFactorPolicy = "all";
