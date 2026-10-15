import { cn, colorFor } from "@rebar/ui";

/**
 * Avatar uživatele: zkratka (`short_name`) na barvě z profilu; bez zvolené barvy se barva odvodí z jména.
 * Zobrazuje se u profilu a ve správě uživatelů.
 */
export function UserAvatar({
  name,
  shortName,
  color,
  size = 32,
  className,
}: {
  name: string;
  shortName?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const text = (shortName || name.slice(0, 2)).toLocaleUpperCase("cs-CZ");
  return (
    <span
      className={cn("chip shrink-0 justify-center !p-0 font-semibold", className)}
      data-color={color || colorFor(name)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {text}
    </span>
  );
}
