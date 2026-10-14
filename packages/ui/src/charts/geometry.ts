// Čistá geometrie SVG: všechna čísla procházejí `n()`, takže se do atributů nikdy nedostane NaN ani Infinity.

/** Číslo pro SVG atribut: konečné, zaokrouhlené na 2 desetinná místa. */
export function n(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export type RoundEnd = "top" | "bottom" | "left" | "right" | "none";

/** Sloupec se zaoblenou jen hranou na straně dat (4 px), na straně základny je rovný. */
export function barPath(x: number, y: number, w: number, h: number, r: number, end: RoundEnd) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const tl = end === "top" || end === "left" ? rr : 0;
  const tr = end === "top" || end === "right" ? rr : 0;
  const br = end === "bottom" || end === "right" ? rr : 0;
  const bl = end === "bottom" || end === "left" ? rr : 0;
  const [X, Y, W, H] = [n(x), n(y), n(w), n(h)];
  const arc = (rad: number, ex: number, ey: number) =>
    rad ? `A${n(rad)},${n(rad)} 0 0 1 ${n(ex)},${n(ey)}` : "";
  return (
    `M${n(X + tl)},${Y}H${n(X + W - tr)}${arc(tr, X + W, Y + tr)}` +
    `V${n(Y + H - br)}${arc(br, X + W - br, Y + H)}` +
    `H${n(X + bl)}${arc(bl, X, Y + H - bl)}` +
    `V${n(Y + tl)}${arc(tl, X + tl, Y)}Z`
  );
}

/** Bod na kružnici; úhel se měří od 12. hodiny po směru hodinových ručiček. */
export function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [n(cx + r * Math.sin(angle)), n(cy - r * Math.cos(angle))];
}

/** Výseč prstence (nebo koláče, když `ri` = 0). Celý kruh se rozdělí na dva půlobloky, aby SVG oblouk nezdegeneroval. */
export function arcPath(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number) {
  const span = a1 - a0;
  if (!(span > 0) || !(ro > 0)) return "";
  if (span >= Math.PI * 2 - 1e-4) {
    const [t, b] = [polar(cx, cy, ro, 0), polar(cx, cy, ro, Math.PI)];
    const outer = `M${t[0]},${t[1]}A${n(ro)},${n(ro)} 0 1 1 ${b[0]},${b[1]}A${n(ro)},${n(ro)} 0 1 1 ${t[0]},${t[1]}Z`;
    if (!(ri > 0)) return outer;
    const [it, ib] = [polar(cx, cy, ri, 0), polar(cx, cy, ri, Math.PI)];
    return `${outer}M${it[0]},${it[1]}A${n(ri)},${n(ri)} 0 1 0 ${ib[0]},${ib[1]}A${n(ri)},${n(ri)} 0 1 0 ${it[0]},${it[1]}Z`;
  }
  const large = span > Math.PI ? 1 : 0;
  const [o0, o1] = [polar(cx, cy, ro, a0), polar(cx, cy, ro, a1)];
  if (!(ri > 0)) {
    return `M${n(cx)},${n(cy)}L${o0[0]},${o0[1]}A${n(ro)},${n(ro)} 0 ${large} 1 ${o1[0]},${o1[1]}Z`;
  }
  const [i0, i1] = [polar(cx, cy, ri, a0), polar(cx, cy, ri, a1)];
  return (
    `M${o0[0]},${o0[1]}A${n(ro)},${n(ro)} 0 ${large} 1 ${o1[0]},${o1[1]}` +
    `L${i1[0]},${i1[1]}A${n(ri)},${n(ri)} 0 ${large} 0 ${i0[0]},${i0[1]}Z`
  );
}

/** Tvary značek řad; doplňují barvu, aby se řady nerozlišovaly jen odstínem. */
export const SERIES_SHAPES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "hexagon",
  "cross",
  "triangle-down",
  "pentagon",
] as const;
export type SeriesShape = (typeof SERIES_SHAPES)[number] | "dash";

function polygon(cx: number, cy: number, r: number, sides: number, rotation = -Math.PI / 2) {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    pts.push(`${n(cx + r * Math.cos(a))},${n(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Obrys značky o poloměru `r` se středem v [cx, cy]. */
export function markerPath(shape: SeriesShape, cx: number, cy: number, r: number): string {
  switch (shape) {
    case "circle":
      return `M${n(cx - r)},${n(cy)}a${n(r)},${n(r)} 0 1 0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1 0 ${n(-2 * r)},0Z`;
    case "square":
      return `M${n(cx - r * 0.9)},${n(cy - r * 0.9)}h${n(1.8 * r)}v${n(1.8 * r)}h${n(-1.8 * r)}Z`;
    case "triangle":
      return `M${n(cx)},${n(cy - r)}L${n(cx + r * 1.05)},${n(cy + r * 0.8)}L${n(cx - r * 1.05)},${n(cy + r * 0.8)}Z`;
    case "triangle-down":
      return `M${n(cx)},${n(cy + r)}L${n(cx + r * 1.05)},${n(cy - r * 0.8)}L${n(cx - r * 1.05)},${n(cy - r * 0.8)}Z`;
    case "diamond":
      return `M${n(cx)},${n(cy - r * 1.15)}L${n(cx + r * 1.15)},${n(cy)}L${n(cx)},${n(cy + r * 1.15)}L${n(cx - r * 1.15)},${n(cy)}Z`;
    case "hexagon":
      return polygon(cx, cy, r * 1.05, 6, 0);
    case "pentagon":
      return polygon(cx, cy, r * 1.08, 5);
    case "cross": {
      const a = r * 0.38;
      const pts = [
        [-a, -r],
        [a, -r],
        [a, -a],
        [r, -a],
        [r, a],
        [a, a],
        [a, r],
        [-a, r],
        [-a, a],
        [-r, a],
        [-r, -a],
        [-a, -a],
      ];
      return `M${pts.map(([px, py]) => `${n(cx + px!)},${n(cy + py!)}`).join("L")}Z`;
    }
    case "dash":
      return `M${n(cx - r)},${n(cy - r * 0.4)}h${n(2 * r)}v${n(r * 0.8)}h${n(-2 * r)}Z`;
  }
}
