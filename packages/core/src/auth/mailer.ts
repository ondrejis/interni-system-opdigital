/** Šablony systémových e-mailů, které posílá autentizace. Obsah a překlad řeší `mail` modul. */
export type AuthMailTemplate = "invitation" | "password-reset";

export type AuthMail = {
  to: string;
  template: AuthMailTemplate;
  /** Proměnné šablony. Mohou obsahovat tajný odkaz — nikdy se neukládají do logu v čitelné podobě. */
  vars: Record<string, string>;
};

export type Mailer = { send(mail: AuthMail): Promise<void> };
