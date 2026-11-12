/**
 * The row of numbers at the top of every tab: one big number, a hint of about
 * three words, a colour and the page that fixes it.
 */
import { StatTile } from "@/app/(admin)/management/ui";
import type { Tile } from "@/app/(admin)/dashboard/tiles";
import { cn } from "@/lib/utils";

/** Columns for a row of tiles: five or six fit side by side; seven wrap to four. */
const GRID: Record<number, string> = {
    5: "xl:grid-cols-5",
    6: "xl:grid-cols-6",
};

export function TileGrid({ tiles }: { tiles: Tile[] }) {
    return (
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", GRID[tiles.length] ?? "xl:grid-cols-4")}>
            {tiles.map((t) => (
                <StatTile key={t.key} label={t.label} value={t.value} hint={t.hint} health={t.health} href={t.href} quiet={t.health === "green" && t.count === 0} />
            ))}
        </div>
    );
}
