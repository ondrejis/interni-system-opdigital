/**
 * Bezpečný výpočet vzorců výkazu výměr. Žádné `eval`: vlastní rekurzivní parser jednoduchých aritmetických výrazů
 * (čísla s tečkou nebo čárkou, + − × ÷, závorky, unární mínus a proměnné z ostatních řádků téže položky).
 */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")" };

export class FormulaError extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^\d+(?:[.,]\d+)?|^[.,]\d+/.exec(src.slice(i));
    if (num) {
      out.push({ t: "num", v: Number(num[0].replace(",", ".")) });
      i += num[0].length;
      continue;
    }
    const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = ch === "×" || ch === "·" ? "*" : ch === "÷" || ch === ":" ? "/" : ch;
    if (op === "+" || op === "-" || op === "*" || op === "/" || op === "(" || op === ")") {
      out.push({ t: "op", v: op });
      i++;
      continue;
    }
    throw new FormulaError(`Neplatný znak „${ch}“ ve vzorci.`);
  }
  return out;
}

/** Spočítá výraz; `resolve` vrací hodnotu proměnné nebo vyhodí `FormulaError`. */
function evaluate(tokens: Token[], resolve: (name: string) => number): number {
  let p = 0;
  const peek = () => tokens[p];
  const eatOp = (v: string) => {
    const t = peek();
    if (t?.t === "op" && t.v === v) {
      p++;
      return true;
    }
    return false;
  };
  function expr(): number {
    let v = term();
    for (;;) {
      if (eatOp("+")) v += term();
      else if (eatOp("-")) v -= term();
      else return v;
    }
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (eatOp("*")) v *= unary();
      else if (eatOp("/")) {
        const d = unary();
        if (d === 0) throw new FormulaError("Dělení nulou.");
        v /= d;
      } else return v;
    }
  }
  function unary(): number {
    if (eatOp("-")) return -unary();
    if (eatOp("+")) return unary();
    return primary();
  }
  function primary(): number {
    const t = peek();
    if (!t) throw new FormulaError("Vzorec je neúplný.");
    if (t.t === "num") {
      p++;
      return t.v;
    }
    if (t.t === "id") {
      p++;
      return resolve(t.v);
    }
    if (eatOp("(")) {
      const v = expr();
      if (!eatOp(")")) throw new FormulaError("Chybí zavírací závorka.");
      return v;
    }
    throw new FormulaError("Vzorec je neplatný.");
  }
  const v = expr();
  if (p < tokens.length) throw new FormulaError("Vzorec je neplatný.");
  if (!Number.isFinite(v)) throw new FormulaError("Výsledek není číslo.");
  return v;
}

/** Zaokrouhlení výsledku na tisíciny půl od nuly; `Math.round` na kladném čísle se chová jako „půl nahoru“. */
export function roundThousandths(v: number): number {
  return (Math.sign(v) * Math.round(Math.abs(v) * 1000 + 1e-9)) / 1000;
}

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

/** Spočítá jeden vzorec s danými proměnnými. Prázdný vzorec je 0. */
export function evaluateFormula(src: string, vars: Record<string, number> = {}): FormulaResult {
  try {
    if (!src.trim()) return { ok: true, value: 0 };
    const v = evaluate(tokenize(src), (name) => {
      const x = vars[name];
      if (x === undefined) throw new FormulaError(`Neznámá proměnná „${name}“.`);
      return x;
    });
    return { ok: true, value: roundThousandths(v) };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message };
    throw e;
  }
}

export type CalcInput = { variable?: string | null; formula: string };
export type CalcOutput = { value: number; error: string | null };

/**
 * Spočítá všechny řádky výkazu jedné položky. Řádek může odkazovat na proměnnou kteréhokoli jiného řádku
 * (v libovolném pořadí); cyklus a duplicitní proměnná jsou chyby řádku. Řádek s chybou počítá jako 0.
 */
export function evaluateCalcLines(lines: readonly CalcInput[]): CalcOutput[] {
  const byName = new Map<string, number>();
  const dupes = new Set<number>();
  lines.forEach((l, idx) => {
    const name = l.variable?.trim();
    if (!name) return;
    if (byName.has(name)) dupes.add(idx);
    else byName.set(name, idx);
  });
  const memo = new Map<number, CalcOutput>();
  const stack = new Set<number>();

  const calc = (idx: number): CalcOutput => {
    const hit = memo.get(idx);
    if (hit) return hit;
    const line = lines[idx]!;
    let out: CalcOutput;
    if (dupes.has(idx)) {
      out = { value: 0, error: `Proměnná „${line.variable?.trim()}“ je použitá víckrát.` };
    } else if (!line.formula.trim()) {
      out = { value: 0, error: null };
    } else {
      stack.add(idx);
      try {
        const v = evaluate(tokenize(line.formula), (name) => {
          const target = byName.get(name);
          if (target === undefined) throw new FormulaError(`Neznámá proměnná „${name}“.`);
          if (stack.has(target)) throw new FormulaError(`Vzorec odkazuje sám na sebe („${name}“).`);
          const r = calc(target);
          if (r.error) throw new FormulaError(`Proměnná „${name}“ má chybný vzorec.`);
          return r.value;
        });
        out = { value: roundThousandths(v), error: null };
      } catch (e) {
        if (!(e instanceof FormulaError)) throw e;
        out = { value: 0, error: e.message };
      } finally {
        stack.delete(idx);
      }
    }
    memo.set(idx, out);
    return out;
  };
  return lines.map((_, i) => calc(i));
}

/** Součet výsledků řádků v tisícinách (přesně, bez chyby plovoucí čárky). */
export function sumCalcThousandths(values: readonly number[]): number {
  return values.reduce((a, v) => a + Math.round(v * 1000), 0);
}
