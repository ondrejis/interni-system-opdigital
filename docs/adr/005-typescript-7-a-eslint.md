# ADR 005: TypeScript 7 pro `tsc`, TypeScript 6 API pro nástroje

- Stav: přijato (2026-10-08)

## Kontext

TypeScript 7.0 nemá programové API; `typescript-eslint` ho vyžaduje (a odmítne TS 7). Microsoft pro tento případ publikuje `@typescript/typescript6`.

## Rozhodnutí

V kořenovém `package.json`:

- `typescript` = `npm:@typescript/typescript6@^6.0.2` (API pro `typescript-eslint` a `next build`, binárka `tsc6`),
- `@typescript/native` = `npm:typescript@^7.0.2` (binárka `tsc` pro `pnpm typecheck`).

Až `typescript-eslint` podpoří TS 7.1+, alias se odstraní.
