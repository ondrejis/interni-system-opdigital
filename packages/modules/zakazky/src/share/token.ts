import { createHash } from "node:crypto";
import { randomToken } from "@rebar/core/security";

/** Token v adrese odkazu: 32 bajtů náhody (43 znaků base64url). V databázi je jen jeho otisk. */
export const newShareToken = () => randomToken(32);

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export const hashShareToken = (token: string) => createHash("sha256").update(token).digest("hex");
