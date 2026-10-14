"use client";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  TriangleAlert,
  Check,
  X,
} from "lucide-react";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type KeyboardEvent,
} from "react";
import { cn } from "../lib/cn";

const control =
  "block h-11 w-full rounded-lg border border-line-strong bg-bg text-base text-fg pointer-fine:text-[15px] placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent-line)] disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-[var(--danger-soft)]";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  /** Ikona uvnitř pole vlevo (lucide, `size-4` se nastaví samo). */
  icon?: ReactNode;
  /** Vpravo uvnitř pole (např. přepínač zobrazení hesla). */
  trailing?: ReactNode;
  /** Vpravo na řádku popisku (např. odkaz „Zapomenuté heslo?“). */
  labelAction?: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  /** `compact` je hustší varianta pro nastavení uvnitř aplikace (výchozí je velké pole přihlášení). */
  density?: "comfortable" | "compact";
  ref?: Ref<HTMLInputElement>;
};

/** Pole formuláře pro přihlašovací a účtové stránky: popisek nad polem, ikona, nápověda a chyba pod ním. */
export function TextField({
  label,
  icon,
  trailing,
  labelAction,
  hint,
  error,
  density = "comfortable",
  id,
  className,
  ref,
  ...rest
}: TextFieldProps) {
  const compact = density === "compact";
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="relative space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-faint [&_svg]:size-4",
              compact ? "w-9" : "w-11",
            )}
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            control,
            compact && "h-8 rounded-md pointer-fine:text-base",
            icon ? (compact ? "pl-9" : "pl-11") : "pl-3",
            trailing ? "pr-11" : "pr-3",
            className,
          )}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-0.5">{trailing}</div>
        )}
      </div>
      {labelAction && (
        // za polem kvůli pořadí tabulátoru; vizuálně na řádku popisku
        <div className="absolute right-0 top-0">{labelAction}</div>
      )}
      {error ? (
        <p id={`${fieldId}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Pole pro heslo se zobrazením/skrytím a upozorněním na zapnutý Caps Lock. */
export function PasswordField({
  icon,
  hint,
  onKeyUp,
  ...rest
}: Omit<TextFieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <TextField
      {...rest}
      type={visible ? "text" : "password"}
      icon={icon}
      hint={caps ? "Máte zapnutý Caps Lock." : hint}
      onKeyUp={(e: KeyboardEvent<HTMLInputElement>) => {
        setCaps(e.getModifierState?.("CapsLock") ?? false);
        onKeyUp?.(e);
      }}
      onBlur={(e) => {
        setCaps(false);
        rest.onBlur?.(e);
      }}
      trailing={
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="flex h-8 w-10 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          <span className="sr-only">{visible ? "Skrýt heslo" : "Zobrazit heslo"}</span>
        </button>
      }
    />
  );
}

/**
 * Kód o pevném počtu číslic v samostatných polích. Uvnitř je jediný skutečný `<input>`
 * (vložení ze schránky, automatické doplnění z SMS/aplikace i čtečky fungují přirozeně),
 * políčka jsou jen jeho zobrazení.
 */
export function OtpInput({
  label,
  value,
  onChange,
  length = 6,
  autoFocus,
  invalid,
  hint,
  id,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "maxLength"> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  length?: number;
  invalid?: boolean;
  hint?: ReactNode;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);
  // Kurzor na konec; je-li kód vyplněný celý, označí se celý, aby ho další psaní nebo vložení nahradilo.
  const toEnd = (el: HTMLInputElement) =>
    el.value.length >= length
      ? el.select()
      : el.setSelectionRange(el.value.length, el.value.length);
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <div aria-hidden className="flex gap-2">
          {Array.from({ length }, (_, i) => (
            <div
              key={i}
              className={cn(
                "flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg border bg-bg text-2xl font-semibold tabular text-fg transition-[border-color,box-shadow] duration-150",
                invalid ? "border-danger" : "border-line-strong",
                focused &&
                  i === active &&
                  (invalid
                    ? "ring-[3px] ring-[var(--danger-soft)]"
                    : "border-accent ring-[3px] ring-[var(--accent-line)]"),
              )}
            >
              {value[i] ??
                (focused && i === active ? <span className="h-6 w-px animate-pulse bg-fg" /> : "")}
            </div>
          ))}
        </div>
        <input
          {...rest}
          id={fieldId}
          value={value}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`\\d{${length}}`}
          autoFocus={autoFocus}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={hint ? `${fieldId}-hint` : undefined}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
          onFocus={(e) => {
            setFocused(true);
            toEnd(e.currentTarget);
          }}
          onBlur={() => setFocused(false)}
          onClick={(e) => toEnd(e.currentTarget)}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
        />
      </div>
      {hint && (
        <p id={`${fieldId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Jak dobré je heslo: server vyžaduje jen délku, ostatní je doporučení. */
export function passwordStrength(password: string) {
  const length = password.length;
  const variety = [/[a-zá-ž]/, /[A-ZÁ-Ž]/, /\d/, /[^\p{L}\d]/u].filter((r) =>
    r.test(password),
  ).length;
  const longEnough = length >= 12;
  let score = 0;
  if (length > 0) score = 1;
  if (longEnough) score = 2;
  if (longEnough && (variety >= 3 || length >= 16)) score = 3;
  if (longEnough && variety >= 3 && length >= 16) score = 4;
  const labels = ["", "Příliš krátké", "Dostatečné", "Dobré", "Výborné"];
  return { score, label: labels[score]!, longEnough, variety };
}

/** Indikátor síly hesla s kontrolním seznamem požadavků. */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const { score, label, longEnough, variety } = passwordStrength(password);
  const color = score <= 1 ? "bg-danger" : score === 2 ? "bg-warning" : "bg-success";
  return (
    <div id={id} className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-150",
                i <= score ? color : "bg-active",
              )}
            />
          ))}
        </div>
        <span aria-live="polite" className="w-24 text-right text-sm text-muted">
          {label || " "}
        </span>
      </div>
      <ul className="space-y-1 text-sm">
        <Requirement ok={longEnough}>Alespoň 12 znaků</Requirement>
        <Requirement ok={variety >= 3} optional>
          Doporučeno: písmena, číslice i jiné znaky
        </Requirement>
      </ul>
    </div>
  );
}

function Requirement({
  ok,
  optional,
  children,
}: {
  ok: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-success" : "text-muted")}>
      {ok ? (
        <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      ) : optional ? (
        <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
          <span className="size-1 rounded-full bg-current" />
        </span>
      ) : (
        <X className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      )}
      <span>
        {children}
        <span className="sr-only">{ok ? " (splněno)" : optional ? "" : " (zatím nesplněno)"}</span>
      </span>
    </li>
  );
}

type NoticeTone = "error" | "success" | "info" | "warning";
const NOTICE: Record<NoticeTone, { box: string; icon: typeof Info }> = {
  error: { box: "bg-danger-soft text-danger", icon: AlertCircle },
  success: { box: "bg-success-soft text-success", icon: CheckCircle2 },
  info: { box: "bg-accent-soft text-fg", icon: Info },
  warning: { box: "bg-warning-soft text-warning", icon: TriangleAlert },
};

/** Zpráva ve formuláři. Chyba se čtečkám oznámí hned (`role="alert"`), ostatní zprávy slušně (`status`). */
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: I } = NOTICE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-2 rounded-lg p-3 text-sm", box, className)}
    >
      <I className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && (
          <div className={cn(title && "mt-0.5", tone === "info" && "text-muted")}>{children}</div>
        )}
      </div>
    </div>
  );
}
