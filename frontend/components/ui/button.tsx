"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
    default: "bg-retro-yellow text-ink shadow-neo hover:shadow-neo-sm",
    secondary: "bg-retro-mint text-ink shadow-neo hover:shadow-neo-sm",
    outline: "bg-cream/10 text-cream border-cream/80 shadow-neo-dark hover:bg-cream hover:text-ink hover:shadow-neo-sm",
    ghost: "border-transparent bg-transparent text-cream shadow-none hover:border-cream/70 hover:bg-cream/10",
    destructive: "bg-retro-coral text-ink shadow-neo hover:shadow-neo-sm",
};

const sizes: Record<ButtonSize, string> = {
    default: "h-11 px-5 py-2",
    sm: "h-11 px-3 text-xs",
    lg: "h-12 px-7 text-base",
    icon: "h-11 w-11 p-0",
};

export function buttonVariants({
    variant = "default",
    size = "default",
    className,
}: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
} = {}) {
    return cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border-2 border-ink font-black uppercase tracking-wide transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-retro-cyan/35 disabled:pointer-events-none disabled:opacity-50 active:translate-x-1 active:translate-y-1 active:shadow-none",
        variants[variant],
        sizes[size],
        className
    );
}

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => (
        <button
            ref={ref}
            className={buttonVariants({ variant, size, className })}
            {...props}
        />
    )
);
Button.displayName = "Button";

export { Button };
