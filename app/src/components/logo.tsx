import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Nexova wordmark. Shows the black logo on light and the white logo on dark
 * (toggled by the `.dark` class on <html>), so it stays legible either way.
 * `className` controls height (e.g. "h-7"); width scales automatically.
 */
export function Logo({ className }: { className?: string }) {
    return (
        <span className={cn("inline-flex items-center", className)}>
            <Image
                src="/brand/nexova-black.png"
                alt="Nexova"
                width={613}
                height={160}
                priority
                className="block h-full w-auto dark:hidden"
            />
            <Image
                src="/brand/nexova-white.png"
                alt="Nexova"
                width={613}
                height={160}
                priority
                className="hidden h-full w-auto dark:block"
            />
        </span>
    );
}
