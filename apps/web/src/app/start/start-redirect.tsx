"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { applyAppearance } from "@/lib/appearance";

/** Použije uložený vzhled v tomto prohlížeči a přejde na úvodní stránku. */
export function StartRedirect({
  target,
  theme,
  density,
}: {
  target: string;
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
}) {
  const router = useRouter();
  useEffect(() => {
    applyAppearance({ theme, density });
    router.replace(target);
  }, [router, target, theme, density]);
  return (
    <main className="flex min-h-dvh items-center justify-center text-muted" aria-live="polite">
      Přihlašuji…
    </main>
  );
}
