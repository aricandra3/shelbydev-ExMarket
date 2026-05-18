"use client";

import * as React from "react";
import {
    buttonVariants,
    type ButtonSize,
    type ButtonVariant,
} from "@/components/ui/buttonStyles";

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
export { buttonVariants };
