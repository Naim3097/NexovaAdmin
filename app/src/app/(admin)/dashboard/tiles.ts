/**
 * The Dashboard tile: one big number, a hint of about three words, a colour
 * and the page that fixes it. Each tab's maths module in @/lib/dashboard
 * builds its own row of these; <TileGrid> draws them.
 *
 * Colour rules: nothing wrong = green (and quiet when the number is zero);
 * overdue, over capacity or unpaid past due = red; due soon or waiting on
 * someone = amber.
 */
import type { Health } from "@/lib/management/metrics";
import type { DashboardTab } from "@/lib/roles";

export type Tile = {
    key: string;
    label: string;
    value: string;
    /** About three words. */
    hint: string;
    health: Health;
    href: string;
    /** The count behind the number; a green zero renders quiet. */
    count: number;
};

/** The tabs that carry tiles (Activity is a feed). */
export type TileTab = Exclude<DashboardTab, "activity">;
