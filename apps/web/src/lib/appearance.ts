"use client";

/*
  Uložený vzhled uživatele (Nastavení → Vzhled) v tomto prohlížeči. Motiv používá stejný mechanismus jako přepínač
  v panelu (`localStorage.theme` + `data-theme`), hustota řádků je `localStorage.density` + `data-density` na
  `<html>` (`comfortable` | `compact`); styly seznamů a tabulek na atribut reagují.
*/

export type AppearanceValues = {
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
};

/** Nastaví motiv a hustotu v tomto prohlížeči (selhání úložiště se tiše ignoruje, platí aspoň do zavření stránky). */
export function applyAppearance({ theme, density }: AppearanceValues) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  root.setAttribute("data-density", density);
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
    localStorage.setItem("density", density);
  } catch {
    /* soukromý režim */
  }
}
