/**
 * Default delivery workflows, one per service category.
 *
 * Single source of truth shared by:
 *   - the `workflow_templates` seed (migration 0005)
 *   - the templates adapter's `resetTemplate` / dev-store fallback
 *
 * A template is an ordered list of stages; each stage names the team ROLE that
 * owns it. When a project is created the matching template is *copied* onto the
 * project as editable `ProjectStage`s (the per-project flow), and the PIC is
 * auto-assigned to the first active member of the owner role.
 *
 * These are just defaults — the team edits them in Settings → Workflows, and
 * each project can diverge from its template freely.
 */
import type { ServiceCategory } from "@/lib/dev-store/services";
import type { TeamRole } from "@/lib/dev-store/team";

export type WorkflowStageDef = {
    /** Stable-ish slug, handy for keys. Not used as an identity across edits. */
    key: string;
    label: string;
    /** Team role that owns this stage (drives PIC auto-assignment). */
    ownerRole: TeamRole;
    description: string;
};

export type WorkflowTemplate = {
    serviceCategory: ServiceCategory;
    name: string;
    stages: WorkflowStageDef[];
};

const s = (
    key: string,
    label: string,
    ownerRole: TeamRole,
    description = "",
): WorkflowStageDef => ({ key, label, ownerRole, description });

export const DEFAULT_WORKFLOWS: Record<ServiceCategory, WorkflowTemplate> = {
    website: {
        serviceCategory: "website",
        name: "Website delivery",
        stages: [
            s("discovery", "Discovery", "PM", "Confirm scope, sitemap, content & assets."),
            s("design", "UI/UX Design", "UI/UX", "Wireframes → high-fidelity design."),
            s("frontend", "Frontend Build", "Frontend", "Build the approved design."),
            s("backend", "Backend Integration", "Backend", "Forms, CMS, integrations, data."),
            s("qa", "QA", "PM", "Cross-device + functional testing."),
            s("client_review", "Client Review", "PM", "Share staging, collect amendments."),
            s("launch", "Launch", "Backend", "Deploy to production + DNS."),
            s("handover", "Handover", "PM", "Docs, training, credentials."),
        ],
    },
    app: {
        serviceCategory: "app",
        name: "App delivery",
        stages: [
            s("discovery", "Discovery", "PM", "Scope, user flows, tech approach."),
            s("design", "UI/UX Design", "UI/UX", "Screens + prototype."),
            s("frontend", "Frontend", "Frontend", "Build client app."),
            s("backend", "Backend / API", "Backend", "APIs, data, auth."),
            s("qa", "Integration & QA", "Backend", "Wire up + test end to end."),
            s("client_review", "Client Review", "PM", "UAT + amendments."),
            s("launch", "Launch", "Backend", "Store / production release."),
            s("handover", "Handover", "PM", "Docs + handover."),
        ],
    },
    ads: {
        serviceCategory: "ads",
        name: "Ads campaign",
        stages: [
            s("brief", "Brief & Goals", "PM", "Objectives, budget, KPIs."),
            s("strategy", "Audience & Strategy", "Ads", "Targeting + funnel plan."),
            s("creative", "Creative Design", "UI/UX", "Ad visuals."),
            s("copy", "Ad Copy", "Content", "Headlines + primary text."),
            s("launch", "Build & Launch", "Ads", "Set up campaigns + go live."),
            s("optimize", "Optimize", "Ads", "Monitor + iterate."),
            s("report", "Report", "PM", "Results + recommendations."),
        ],
    },
    seo: {
        serviceCategory: "seo",
        name: "SEO engagement",
        stages: [
            s("audit", "Audit", "SEO", "Technical + content audit."),
            s("keywords", "Keyword Plan", "SEO", "Target keywords + map."),
            s("onpage", "On-Page Fixes", "Frontend", "Implement technical/on-page changes."),
            s("content", "Content", "Content", "Articles / page copy."),
            s("offpage", "Off-Page / Links", "SEO", "Backlinks + citations."),
            s("report", "Monthly Report", "PM", "Rankings + traffic report."),
        ],
    },
    content: {
        serviceCategory: "content",
        name: "Social / content",
        stages: [
            s("strategy", "Strategy", "PM", "Pillars, cadence, goals."),
            s("calendar", "Content Calendar", "Content", "Plan the month's posts."),
            s("creative", "Creative Design", "UI/UX", "Graphics / video."),
            s("schedule", "Schedule & Post", "Content", "Publish + community."),
            s("report", "Engagement Report", "PM", "Performance recap."),
        ],
    },
    branding: {
        serviceCategory: "branding",
        name: "Brand development",
        stages: [
            s("discovery", "Discovery", "PM", "Brand questionnaire + direction."),
            s("moodboard", "Moodboard", "UI/UX", "Visual direction options."),
            s("logo", "Logo & Identity", "UI/UX", "Logo + core identity."),
            s("kit", "Brand Kit", "UI/UX", "Guidelines, assets, templates."),
            s("handover", "Handover", "PM", "Deliver files + guide."),
        ],
    },
    retainer: {
        serviceCategory: "retainer",
        name: "Operation system / retainer",
        stages: [
            s("scoping", "Scoping", "PM", "Define modules + priorities."),
            s("design", "Design", "UI/UX", "Flows + screens."),
            s("build", "Build", "Backend", "Implement."),
            s("qa", "QA", "PM", "Test."),
            s("launch", "Launch", "Backend", "Roll out."),
            s("support", "Ongoing Support", "PM", "Iterate + maintain."),
        ],
    },
    other: {
        serviceCategory: "other",
        name: "General delivery",
        stages: [
            s("discovery", "Discovery", "PM", "Understand the ask."),
            s("execution", "Execution", "PM", "Do the work."),
            s("review", "Review", "PM", "Internal + client review."),
            s("delivery", "Delivery", "PM", "Hand over."),
        ],
    },
};

export function defaultTemplate(category: ServiceCategory): WorkflowTemplate {
    return DEFAULT_WORKFLOWS[category] ?? DEFAULT_WORKFLOWS.other;
}

/** Map a service NAME (e.g. "META Ads") to its category for template lookup. */
export function serviceNameToCategory(name: string): ServiceCategory {
    const n = name.toLowerCase();
    if (/website|web\b/.test(n)) return "website";
    if (/\bapp\b|application|mobile/.test(n)) return "app";
    if (/\bads?\b|meta|google ads|tiktok/.test(n)) return "ads";
    if (/seo|search|my business|gmb/.test(n)) return "seo";
    if (/social|content|smm/.test(n)) return "content";
    if (/brand/.test(n)) return "branding";
    if (/operation system|retainer|bos\b/.test(n)) return "retainer";
    return "other";
}
