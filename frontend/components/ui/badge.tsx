import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "outline";

const badgeVariants: Record<BadgeVariant, string> = {
    default: "border-ink bg-retro-coral text-ink",
    secondary: "border-ink bg-retro-mint text-ink",
    success: "border-ink bg-retro-lime text-ink",
    warning: "border-ink bg-retro-yellow text-ink",
    outline: "border-cream/60 bg-cream/10 text-cream",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: BadgeVariant;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-[5px] border-2 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
                badgeVariants[variant],
                className
            )}
            {...props}
        />
    );
}

export { Badge };
