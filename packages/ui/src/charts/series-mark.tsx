import { markerPath, type SeriesShape } from "./geometry";

/** Malá značka řady (barva + tvar) do legendy a tooltipu. Tvar rozlišuje řady i bez barev. */
export function SeriesMark({
  shape,
  color,
  size = 10,
}: {
  shape: SeriesShape;
  color: string;
  size?: number;
}) {
  const c = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
      focusable="false"
    >
      <path d={markerPath(shape, c, c, c - 0.5)} style={{ fill: color }} />
    </svg>
  );
}
