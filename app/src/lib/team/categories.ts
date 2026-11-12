/**
 * Job category: what kind of work a person does in Nexops. It maps people to
 * task seats (a DM holds campaigns and SEO, Creative holds statics and videos,
 * a Developer holds website work) and to duties (Business Support handles
 * quotes, contracts, invoices and onboarding, so it carries the finance duty
 * and no delivery capacity). The job ROLE ("Chief Executive Officer") is free
 * text for people to read; the category is what the app reads. Pure module.
 */

export const TEAM_CATEGORIES = ["closer", "dm", "creative", "developer", "am", "business_support"] as const;
export type TeamCategory = (typeof TEAM_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TeamCategory, string> = {
    closer: "Closer",
    dm: "Digital marketer",
    creative: "Creative",
    developer: "Developer",
    am: "Account manager",
    business_support: "Business support",
};

/** Short form for chips and tables. */
export const CATEGORY_SHORT: Record<TeamCategory, string> = {
    closer: "Closer",
    dm: "DM",
    creative: "Creative",
    developer: "Developer",
    am: "AM",
    business_support: "Business support",
};

/** The task seats each category is matched to, for the one-line hint under the category picker. */
export const CATEGORY_MATCHES: Record<TeamCategory, string> = {
    closer: "other work and account management",
    dm: "campaigns and SEO",
    creative: "statics and videos",
    developer: "website work",
    am: "other work and account management",
    business_support: "no task seats: quotes, contracts, invoices and onboarding",
};

export function isTeamCategory(v: unknown): v is TeamCategory {
    return typeof v === "string" && (TEAM_CATEGORIES as readonly string[]).includes(v);
}

/** The category an older record implies from its job role (CEO, Frontend, Content…). */
export function categoryFromRole(role: string): TeamCategory {
    const r = role.trim().toLowerCase();
    if (/front|back|develop|engineer|infra/.test(r)) return "developer";
    if (/ui|ux|design|creative|video|motion/.test(r)) return "creative";
    if (/content|ads|seo|market/.test(r)) return "dm";
    if (/account|^pm$|project/.test(r)) return "am";
    if (/admin|support|finance/.test(r)) return "business_support";
    return "closer";
}

export function normalizeCategory(raw: unknown, role = ""): TeamCategory {
    return isTeamCategory(raw) ? raw : categoryFromRole(role);
}

/** Duties a new person in this category starts with; an admin can change them. */
export function defaultFunctionsFor(category: TeamCategory): Array<"delivery" | "finance"> {
    return category === "business_support" ? ["finance"] : ["delivery"];
}

/** Job role suggestions offered in the free-text field. */
export const JOB_ROLE_SUGGESTIONS = [
    "Chief Executive Officer",
    "Chief Technical Officer",
    "Creative Director",
    "Head of Digital Infrastructure",
    "Head of Business Operations",
    "Head of Account Management",
    "Digital Marketer",
    "Graphic Designer",
    "Video Editor",
    "Web Developer",
    "Admin and Business Support",
] as const;
