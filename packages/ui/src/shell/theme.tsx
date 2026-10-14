"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

export type ThemeChoice = "light" | "dark" | "system";

/** Skript do `<head>`: nastaví téma před vykreslením, aby stránka při načtení nezablikala. */
export const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", choice);
  } catch {
    /* soukromý režim: téma platí jen do zavření stránky */
  }
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Světlý", icon: Sun },
  { value: "system", label: "Podle systému", icon: Monitor },
  { value: "dark", label: "Tmavý", icon: Moon },
];

export function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      setChoice(t === "light" || t === "dark" ? t : "system");
    } catch {
      /* ponecháno „podle systému“ */
    }
  }, []);
  return (
    <div
      role="radiogroup"
      aria-label="Vzhled"
      className={cn("flex rounded-md bg-hover p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, icon: I }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          title={label}
          onClick={() => {
            setChoice(value);
            apply(value);
          }}
          className={cn(
            "flex h-6 flex-1 items-center justify-center rounded text-muted transition-colors",
            choice === value && "bg-bg text-fg shadow-sm",
          )}
        >
          <I className="size-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
