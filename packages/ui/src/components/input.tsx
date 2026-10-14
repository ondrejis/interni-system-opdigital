import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

const field =
  "w-full rounded-md border border-line-strong bg-bg px-2.5 text-base text-fg placeholder:text-faint transition-colors duration-150 hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50 aria-[invalid=true]:border-danger";

export function Input({
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(field, "h-8", className)} {...rest} />;
}

export function Textarea({
  className,
  ref,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(field, "min-h-20 py-1.5", className)} {...rest} />;
}

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-muted", className)} {...rest} />
  );
}

/** Popisek + pole + nápověda/chyba pod ním. */
export function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  // popisek se k poli přiřadí sám (`for` + `id`), když pole je `Input` nebo `Textarea` bez vlastního `id`
  const auto = useId();
  const child =
    !htmlFor &&
    isValidElement(children) &&
    (children.type === Input || children.type === Textarea) &&
    !(children.props as { id?: string }).id
      ? cloneElement(children as ReactElement<{ id?: string }>, { id: auto })
      : children;
  const forId = htmlFor ?? (child !== children ? auto : undefined);
  return (
    <div className="mb-3">
      <Label htmlFor={forId}>{label}</Label>
      {child}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
