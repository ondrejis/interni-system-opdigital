import { hash, verify } from "@node-rs/argon2";

/** Argon2id s parametry doporučenými OWASP (19 MiB, 2 průchody, 1 vlákno) — vejde se do 1 vCPU / 4 GB. */
// `algorithm: 2` = Argon2id (const enum `Algorithm` se při verbatimModuleSyntax nedá importovat).
const PARAMS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

export async function verifyPassword({
  hash: stored,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
