import { LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { ThemeSwitch } from "../shell/theme";
import { RiseStyle } from "./rise";

export type AuthBrand = { name: string; logoUrl?: string | null };

/** Třídy tlačítka odeslání na přihlašovacích stránkách (použije se s `Button variant="primary"`). */
export const AUTH_SUBMIT = "h-11 w-full rounded-lg text-[15px] font-semibold";

/** Odkaz vzhledem primárního tlačítka (např. „Požádat o nový odkaz“). */
export const AUTH_LINK_BUTTON =
  "inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-[15px] font-semibold text-accent-fg transition-colors hover:bg-[var(--accent-hover)]";

const monogram = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "•";

/** Logo klienta, nebo monogram z jeho názvu. */
export function BrandMark({
  brand,
  className,
  tone = "default",
}: {
  brand: AuthBrand;
  className?: string;
  tone?: "default" | "inverse";
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {brand.logoUrl ? (
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-1">
          <img src={brand.logoUrl} alt="" className="size-full object-contain" />
        </span>
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold tracking-tight text-accent-fg"
        >
          {monogram(brand.name)}
        </span>
      )}
      <span
        className={cn(
          "truncate text-lg font-semibold tracking-tight",
          tone === "inverse" ? "text-white" : "text-fg",
        )}
      >
        {brand.name}
      </span>
    </div>
  );
}

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Každý vidí jen své",
    text: "Přístup se řídí rolí, takže všichni mají přesně to, co potřebují.",
  },
  {
    icon: Smartphone,
    title: "Pohodlně z terénu",
    text: "Stejný systém v telefonu, tabletu i na počítači v kanceláři.",
  },
  {
    icon: LockKeyhole,
    title: "Chráněný přístup",
    text: "Přihlášení lze doplnit dvoufázovým ověřením.",
  },
];

/** Brandový panel vpravo: tmavé pozadí s odleskem akcentové barvy klienta, vždy bílý text (kontrast nezávisí na barvě). */
function BrandPanel({ brand }: { brand: AuthBrand }) {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden bg-[color-mix(in_oklab,var(--accent)_26%,#090a0e)] text-white lg:block"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 55% at 90% 0%, color-mix(in oklab, var(--accent) 75%, transparent), transparent 70%), radial-gradient(55% 50% at 0% 100%, color-mix(in oklab, var(--accent) 50%, transparent), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(rgb(255 255 255 / 0.16) 1px, transparent 1.6px)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(160deg, black, transparent 70%)",
          WebkitMaskImage: "linear-gradient(160deg, black, transparent 70%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between gap-10 p-12 xl:p-16">
        <div className="ui-rise max-w-md" style={{ animationDelay: "60ms" }}>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-white/70">
            Firemní systém
          </p>
          <p className="mt-3 break-words text-[40px] font-semibold leading-[1.1] tracking-tight xl:text-5xl">
            {brand.name}
          </p>
          <p className="mt-4 text-lg leading-relaxed text-white/80">
            Zakázky, lidé, materiál i technika na jednom místě. Přehledně a z jakéhokoli zařízení.
          </p>
          <ul className="mt-9 space-y-5">
            {FEATURES.map(({ icon: I, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <I className="size-5" strokeWidth={1.6} />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Ilustrace rozhraní: čistě dekorativní, bez vymyšlených údajů */}
        <div className="relative -mb-24 ml-auto w-full max-w-md translate-x-8 rounded-2xl border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-sm xl:translate-x-12">
          <div className="flex items-center gap-3">
            <span className="size-8 rounded-full bg-white/20" />
            <div className="space-y-1.5">
              <span className="block h-2.5 w-28 rounded-full bg-white/30" />
              <span className="block h-2 w-16 rounded-full bg-white/15" />
            </div>
            <span className="ml-auto h-6 w-16 rounded-full bg-white/15" />
          </div>
          <div className="mt-5 space-y-3">
            {[72, 54, 86, 40].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  {i < 2 && <span className="size-2 rounded-full bg-white/70" />}
                </span>
                <span className="h-2.5 rounded-full bg-white/20" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full w-3/5 rounded-full bg-white/55" />
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Společný rámec přihlášení, zapomenutého hesla, ověření a pozvánky: vlevo formulář,
 * vpravo (od šířky `lg`) brandový panel. Název a barvu bere z brandingu klienta.
 */
export function AuthShell({
  brand,
  title,
  description,
  icon,
  footer,
  children,
}: {
  brand: AuthBrand;
  title: string;
  description?: ReactNode;
  /** Ikona nad nadpisem (jen pro stránky, kde pomáhá pochopit situaci). */
  icon?: ReactNode;
  /** Pod formulářem, např. odkaz zpět na přihlášení. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-bg text-fg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <RiseStyle />
      <main className="flex min-h-dvh min-w-0 flex-col px-5 py-5 sm:px-10 sm:py-7">
        <header className="flex items-center justify-between gap-4">
          <BrandMark brand={brand} />
          <ThemeSwitch className="w-24 shrink-0" />
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="ui-rise w-full max-w-[25rem]">
            {icon && (
              <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-inset ring-[var(--accent-line)] [&_svg]:size-6">
                {icon}
              </span>
            )}
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
            {description && (
              <p className="mt-2 text-lg leading-relaxed text-muted">{description}</p>
            )}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-7 text-center text-base text-muted">{footer}</div>}
          </div>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-center text-sm text-faint">
          <ShieldCheck className="size-3.5" aria-hidden />
          Přístup je určen pozvaným uživatelům.
        </p>
      </main>
      <BrandPanel brand={brand} />
    </div>
  );
}
