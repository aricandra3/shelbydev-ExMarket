import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => (
        <textarea
            className={cn("textarea-field", className)}
            ref={ref}
            {...props}
        />
    )
);
Textarea.displayName = "Textarea";

export { Textarea };
