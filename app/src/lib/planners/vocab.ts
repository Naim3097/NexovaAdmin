/**
 * The task vocabulary: task types, seats, approvers and the default split.
 * Pure constants with no I/O, so client components (the board, the
 * calendar, the quick edit) can import them. The dev store re-exports them.
 */
import type { TeamCategory } from "@/lib/team/categories";

// ---------------------------------------------------------------------------
// Vocabulary shared with works (tasks)
// ---------------------------------------------------------------------------

/**
 * What one deliverable row / task is. Static post and Video post both land on the
 * content calendar; they are separate types because a video takes far longer
 * and often a different person, so hours and capacity need the split.
 */
export const LINE_TYPES = ["campaign", "static", "video", "seo", "website", "custom"] as const;
export type LineType = (typeof LINE_TYPES)[number];
export const LINE_TYPE_LABEL: Record<LineType, string> = {
    campaign: "Campaign",
    static: "Static post",
    video: "Video post",
    seo: "SEO article",
    website: "Website item",
    custom: "Other task",
};
export const LINE_TYPE_SHORT: Record<LineType, string> = {
    campaign: "Campaign",
    static: "Static post",
    video: "Video post",
    seo: "SEO",
    website: "Website",
    custom: "Other",
};
/** Plural words for counts ("12 statics · 2 campaigns"). */
export const LINE_TYPE_WORDS: Record<LineType, [string, string]> = {
    campaign: ["campaign", "campaigns"],
    static: ["static post", "static posts"],
    video: ["video post", "video posts"],
    seo: ["SEO article", "SEO articles"],
    website: ["website item", "website items"],
    custom: ["other task", "other tasks"],
};
/** Types that end up as a post on the content calendar. */
export const CONTENT_LINE_TYPES: ReadonlySet<LineType> = new Set<LineType>(["static", "video"]);

export function isLineType(v: string): v is LineType {
    return (LINE_TYPES as readonly string[]).includes(v);
}

/**
 * A type from any record, old or new. Older records said "post" (now Static
 * image, or Video when the title reads like a reel or video) and "branding"
 * (now Other). `fallback` when nothing fits.
 */
export function toLineType(raw: unknown, title = "", fallback: LineType = "static"): LineType {
    if (typeof raw !== "string") return fallback;
    if (isLineType(raw)) return raw;
    if (raw === "post") return /\b(reel|video|tiktok|short)/i.test(title) ? "video" : "static";
    if (raw === "branding") return "custom";
    return fallback;
}

/** Who holds a share of a task. Resolved to a team member when tasks are made. */
export const SEATS = ["dm", "creative", "dev", "am"] as const;
export type Seat = (typeof SEATS)[number];
export const SEAT_LABEL: Record<Seat, string> = {
    dm: "Digital marketer",
    creative: "Creative",
    dev: "Developer",
    am: "Account manager",
};
export const SEAT_SHORT: Record<Seat, string> = { dm: "DM", creative: "Creative", dev: "Dev", am: "AM" };
/** Job categories that can hold each seat, in order of preference. */
export const SEAT_CATEGORIES: Record<Seat, TeamCategory[]> = {
    dm: ["dm"],
    creative: ["creative"],
    dev: ["developer"],
    am: ["am", "closer"],
};
export function isSeat(v: string): v is Seat {
    return (SEATS as readonly string[]).includes(v);
}
/** A seat from any record: the old SEO seat is the digital marketer now. */
export function toSeat(raw: unknown): Seat | null {
    if (typeof raw !== "string") return null;
    if (isSeat(raw)) return raw;
    if (raw === "seo") return "dm";
    return null;
}
/** True when someone in `category` can hold `seat`. */
export function canHoldSeat(category: TeamCategory, seat: Seat): boolean {
    return SEAT_CATEGORIES[seat].includes(category);
}

export type SplitShare = { seat: Seat; pct: number };

/** Who a task type goes to by default; the account manager can change it per task. */
export const DEFAULT_SPLIT: Record<LineType, SplitShare[]> = {
    campaign: [{ seat: "dm", pct: 100 }],
    static: [{ seat: "creative", pct: 100 }],
    video: [{ seat: "creative", pct: 100 }],
    seo: [{ seat: "dm", pct: 100 }],
    website: [{ seat: "dev", pct: 100 }],
    custom: [{ seat: "am", pct: 100 }],
};

/** Who signs a task off. "client" goes through the account manager (portal). */
export const APPROVERS = ["none", "am", "client"] as const;
export type Approver = (typeof APPROVERS)[number];
/** Who signs a task off. */
export const APPROVER_LABEL: Record<Approver, string> = {
    none: "None",
    am: "Account manager",
    client: "Client",
};
export function isApprover(v: string): v is Approver {
    return (APPROVERS as readonly string[]).includes(v);
}

/** The client signs off what they see published (statics, videos); the AM signs off the rest. */
export function defaultApprover(type: LineType): Approver {
    return CONTENT_LINE_TYPES.has(type) ? "client" : "am";
}
