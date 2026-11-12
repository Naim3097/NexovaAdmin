"use client";
/**
 * "← Back": one step back in the browser history, or to a fallback page when
 * this tab has nowhere to go back to (opened from a link, fresh tab). Sits at
 * the top of every page so moving around never needs the browser chrome.
 */
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function BackButton({ fallback = "/dashboard", className }: { fallback?: string; className?: string }) {
    const router = useRouter();
    const back = () => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
    };
    return (
        <button
            type="button"
            onClick={back}
            className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground", className)}
            aria-label="Back to the previous page"
        >
            <span aria-hidden>←</span> Back
        </button>
    );
}
