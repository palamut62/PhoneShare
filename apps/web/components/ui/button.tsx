"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** PRD §70 — dokunma hedefleri en az ~44px. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold select-none " +
    "transition-[background-color,border-color,transform] duration-150 active:translate-y-px " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        // Sinyal rengi: her iki temada da ayni lime, uzerinde koyu yazi.
        primary:
          "bg-primary text-primary-foreground hover:brightness-[1.08] active:brightness-95 " +
          "shadow-[0_1px_0_0_color-mix(in_srgb,var(--primary)_70%,black)]",
        secondary: "border border-border bg-elevated text-foreground hover:border-hairline hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        danger: "bg-danger text-[var(--danger-foreground)] hover:brightness-110",
      },
      size: {
        md: "min-h-11 px-4 text-sm tracking-tight",
        lg: "min-h-14 px-6 text-base tracking-tight",
        xl: "min-h-16 w-full px-6 text-lg tracking-tight",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
