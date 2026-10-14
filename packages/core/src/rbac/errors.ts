/** Uživatel nemá právo na akci nebo záznam. */
export class PermissionError extends Error {
  readonly code = "forbidden";
  constructor(message = "Na tuto akci nemáte oprávnění.") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Záznam neexistuje (nebo ho uživatel nesmí vidět — oboje se tváří stejně). */
export class NotFoundError extends Error {
  readonly code = "not_found";
  constructor(message = "Záznam nenalezen.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Chyba, jejíž text se smí ukázat uživateli (špatný vstup, porušené obchodní pravidlo). */
export class UserError extends Error {
  readonly code = "user_error";
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
