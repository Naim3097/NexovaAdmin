import { z } from "zod";

/**
 * Onboarding form (Website Creation) — full first-pass schema.
 * Repeater fields (services/team/testimonials/faq) are submitted as JSON
 * strings via hidden inputs so they survive a plain HTML form post.
 */

const repeaterServices = z.array(
    z.object({
        name: z.string().min(1),
        description: z.string().optional().default(""),
    }),
);

const repeaterTeam = z.array(
    z.object({
        name: z.string().min(1),
        title: z.string().optional().default(""),
        bio: z.string().optional().default(""),
    }),
);

const repeaterTestimonials = z.array(
    z.object({
        text: z.string().min(1),
        reviewer: z.string().optional().default(""),
    }),
);

const repeaterFaq = z.array(
    z.object({
        question: z.string().min(1),
        answer: z.string().optional().default(""),
    }),
);

const jsonString = <T extends z.ZodTypeAny>(inner: T) =>
    z.preprocess((v) => {
        if (typeof v !== "string" || v.trim() === "") return [];
        try {
            return JSON.parse(v);
        } catch {
            return [];
        }
    }, inner);

export const onboardingFormSchema = z.object({
    business_name: z.string().min(1, { error: "Business name is required" }),
    tagline: z.string().optional().default(""),
    ssm: z.string().min(1, { error: "Business registration number is required" }),
    address: z.string().min(1, { error: "Address is required" }),
    phone: z.string().min(1, { error: "Phone is required" }),
    email: z.email({ error: "Valid email required" }),
    operating_hours: z.string().optional().default(""),

    brand_colors: z.string().optional().default(""),
    fonts: z.string().optional().default(""),

    about_us: z.string().min(1, { error: "About Us is required" }),
    services_json: jsonString(repeaterServices).default([]),
    pricing: z.string().optional().default(""),
    team_json: jsonString(repeaterTeam).default([]),
    testimonials_json: jsonString(repeaterTestimonials).default([]),
    faq_json: jsonString(repeaterFaq).default([]),

    goal: z.enum(["sell", "leads", "portfolio", "info"], {
        error: "Pick a main goal",
    }),
    style: z.string().optional().default(""),
    references: z.string().optional().default(""),

    domain: z.string().optional().default(""),
    facebook_url: z.url({ error: "Must be a URL" }).optional().or(z.literal("")),
    instagram_url: z.url({ error: "Must be a URL" }).optional().or(z.literal("")),
    google_business: z.url({ error: "Must be a URL" }).optional().or(z.literal("")),
});

export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;

export type ServiceItem = z.infer<typeof repeaterServices>[number];
export type TeamItem = z.infer<typeof repeaterTeam>[number];
export type TestimonialItem = z.infer<typeof repeaterTestimonials>[number];
export type FaqItem = z.infer<typeof repeaterFaq>[number];

export const STYLE_OPTIONS = [
    "Modern",
    "Bold",
    "Minimal",
    "Warm",
    "Luxury",
    "Playful",
    "Corporate",
] as const;

export const GOAL_OPTIONS = [
    { value: "sell", label: "Sell products / services" },
    { value: "leads", label: "Generate leads" },
    { value: "portfolio", label: "Showcase portfolio" },
    { value: "info", label: "Inform / company profile" },
] as const;
