"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type SelectNavOption = {
    value: string;
    label: string;
    /** Where picking this option navigates (server-rendered, so filters stay URL-based). */
    href: string;
};

/**
 * A dropdown that navigates on change. The label shows the field and the
 * current value ("Month: November"), so active filters read at a glance
 * without opening anything. Used for every list filter instead of pill rows.
 */
export function SelectNav({
    label,
    value,
    options,
    className,
    size = "sm",
}: {
    label: string;
    value: string;
    options: SelectNavOption[];
    className?: string;
    size?: "sm" | "md";
}) {
    const router = useRouter();
    const current = options.find((o) => o.value === value);
    return (
        <label
            className={cn(
                "inline-flex items-center gap-1 rounded-md border bg-card text-foreground shadow-xs hover:bg-accent",
                size === "sm" ? "h-8 px-2 text-xs" : "h-9 px-2.5 text-sm",
                current && current !== options[0] ? "border-primary/50 bg-primary/5" : "",
                className,
            )}
        >
            <span className="text-muted-foreground">{label}</span>
            <select
                aria-label={label}
                value={value}
                onChange={(e) => {
                    const next = options.find((o) => o.value === e.target.value);
                    if (next) router.push(next.href, { scroll: false });
                }}
                className="max-w-[12rem] cursor-pointer appearance-none truncate bg-transparent pr-4 font-medium outline-none"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'><path d='m6 9 6 6 6-6'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0 center",
                }}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
