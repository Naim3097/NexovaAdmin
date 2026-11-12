"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Submit button that disables itself while its parent <form action={...}> is
 * running — prevents double-submits on slow actions (e.g. draft uploads).
 * Drop-in replacement for <Button type="submit">.
 */
export function PendingButton({
    children,
    pendingLabel = "Working…",
    variant,
    size,
    className,
    disabled,
    title,
}: {
    children: React.ReactNode;
    pendingLabel?: string;
    variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
    size?: "default" | "sm" | "lg";
    className?: string;
    /** Also disabled for a reason of the form's own (e.g. nothing to submit yet). */
    disabled?: boolean;
    title?: string;
}) {
    const { pending } = useFormStatus();
    return (
        <Button
            type="submit"
            disabled={pending || disabled}
            variant={variant}
            size={size}
            className={className}
            title={title}
        >
            {pending ? pendingLabel : children}
        </Button>
    );
}
