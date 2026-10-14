import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";

const button = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-[var(--accent-hover)]",
        secondary: "border border-line-strong bg-bg text-fg hover:bg-hover",
        ghost: "text-muted hover:bg-hover hover:text-fg",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-7 px-2.5 text-sm",
        md: "h-8 px-3 text-base",
        lg: "h-10 px-4 text-base",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { loading?: boolean; ref?: Ref<HTMLButtonElement> };

export function Button({
  className,
  variant,
  size,
  loading,
  children,
  disabled,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(button({ variant, size }), className)}
      {...rest}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "children"> & {
  label: string;
  children: React.ReactNode;
};

/** Tlačítko jen s ikonou; `label` je povinný název pro čtečky a tooltip. */
export function IconButton({
  label,
  className,
  size = "md",
  variant = "ghost",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={cn(
        size === "sm" ? "w-7 px-0" : size === "lg" ? "w-10 px-0" : "w-8 px-0",
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  );
}
