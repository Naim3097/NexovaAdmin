/**
 * Merchant registration onboarding — schema, option lists, and conditional
 * rules. This is the "merchant-registration" checklist that rides the same
 * submission infrastructure as the website-creation onboarding.
 *
 * Structure follows the Lean.x onboarding form spec:
 *   - Stage 1: business + contact info (nothing that feels like a bank form)
 *   - GATE question: collect payments now (A) / pre-approve me (B) /
 *     marketing only (C)
 *   - Stage 2 (A + B only): KYC — legal entity, transaction profile,
 *     directors, settlement account, documents. Fully REQUIRED for A,
 *     save-anytime for B, skipped for C.
 *
 * The gateway's KYC needs typed IC numbers per director — that requirement
 * comes from the acquiring bank, and the form says so in the explainer.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Option lists (dropdowns — no free typing)

export const ENTITY_TYPES = [
    { value: "sole_prop", label: "Sole proprietor / Enterprise (SSM registered)" },
    { value: "sdn_bhd", label: "Sdn Bhd (private limited)" },
    { value: "partnership", label: "Partnership / LLP" },
    { value: "individual", label: "Individual — not registered yet" },
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number]["value"];

/** Registered entities must provide an SSM number + certificate. */
export function isRegisteredEntity(entity: string): boolean {
    return entity !== "" && entity !== "individual";
}

export const OPERATING_MODELS = [
    { value: "online", label: "Online only" },
    { value: "outlet", label: "Physical outlet / premises" },
    { value: "both", label: "Both online and physical" },
] as const;
export type OperatingModel = (typeof OPERATING_MODELS)[number]["value"];

export function hasOutlet(model: string): boolean {
    return model === "outlet" || model === "both";
}

/**
 * The gate — what happens after Stage 1.
 *   A: Stage 2 shown + required.  B: shown, save-anytime.  C: skipped.
 */
export const GATE_OPTIONS = [
    {
        value: "A",
        label: "Yes — set up my payment gateway now",
        help: "We'll collect your verification documents next and submit your merchant application.",
    },
    {
        value: "B",
        label: "Not yet — but pre-approve me",
        help: "Submit your documents now so activation takes 1–2 days when you're ready — no waiting for verification, no chasing documents later.",
    },
    {
        value: "C",
        label: "Marketing only for now",
        help: "Skip the documents. You can add payment collection anytime with this same link.",
    },
] as const;
export type GateAnswer = (typeof GATE_OPTIONS)[number]["value"];

/** Stage 2 (KYC) is shown for A and B, skipped for C. */
export function wantsPayments(gate: string): boolean {
    return gate === "A" || gate === "B";
}

/** Stage 2 is only ENFORCED at submit for A ("set up now"). */
export function kycRequired(gate: string): boolean {
    return gate === "A";
}

/** Merchant status the record lands in after submission. */
export function clientStatusFor(gate: string): string {
    if (gate === "A") return "active_merchant_pending";
    if (gate === "B") return "pre_approved";
    return "marketing_only";
}

export const INDUSTRIES = [
    "Food & Beverage",
    "Retail & E-commerce",
    "Beauty & Wellness",
    "Health & Medical",
    "Education & Training",
    "Professional Services",
    "Creative & Media",
    "Events & Photography",
    "Automotive",
    "Home & Construction",
    "Travel & Leisure",
    "Technology",
    "Other",
] as const;

export const MALAYSIAN_BANKS = [
    "Maybank",
    "CIMB Bank",
    "Public Bank",
    "RHB Bank",
    "Hong Leong Bank",
    "AmBank",
    "Bank Islam",
    "Bank Rakyat",
    "Bank Muamalat",
    "BSN",
    "Affin Bank",
    "Alliance Bank",
    "OCBC Bank",
    "HSBC",
    "Standard Chartered",
    "UOB",
    "Agrobank",
    "GXBank",
    "Boost Bank",
    "AEON Bank",
    "Other",
] as const;

export const MALAYSIAN_STATES = [
    "Johor",
    "Kedah",
    "Kelantan",
    "Kuala Lumpur",
    "Labuan",
    "Melaka",
    "Negeri Sembilan",
    "Pahang",
    "Perak",
    "Perlis",
    "Pulau Pinang",
    "Putrajaya",
    "Sabah",
    "Sarawak",
    "Selangor",
    "Terengganu",
] as const;

export const VOLUME_OPTIONS = [
    { value: "lt_5k", label: "Under RM5,000" },
    { value: "5k_20k", label: "RM5,000 – RM20,000" },
    { value: "20k_100k", label: "RM20,000 – RM100,000" },
    { value: "gt_100k", label: "Over RM100,000" },
] as const;

export const DELIVERY_TIMELINES = [
    { value: "instant", label: "Instant / digital delivery" },
    { value: "1_3_days", label: "1–3 days" },
    { value: "3_7_days", label: "3–7 days" },
    { value: "1_2_weeks", label: "1–2 weeks" },
    { value: "over_2_weeks", label: "More than 2 weeks" },
    { value: "service_based", label: "Service — delivered on appointment" },
] as const;

/** Bilingual-friendly KYC explainer (spec §5.1) — shown atop Stage 2. */
export const KYC_EXPLAINER =
    "These documents are required by the payment gateway and its acquiring bank under Bank Negara Malaysia KYC requirements for merchant accounts — not by our marketing team. They are used only for your merchant application and are not needed if you are not collecting payments.";

export const PDPA_CONSENT_TEXT =
    "I consent to the collection and processing of the personal data and documents submitted in this section for the purpose of applying for and maintaining a payment gateway merchant account. I understand this data will be disclosed to Lean.x and its acquiring bank partners for verification and regulatory KYC purposes, will not be used for any other purpose, and will be retained only for as long as required by the merchant relationship and applicable law.";

export const DECLARATION_TEXT =
    "I declare that the information and documents provided are true, accurate and complete.";

// ---------------------------------------------------------------------------
// Directors / owners (repeatable — stored as directors_json)

export type DirectorRow = {
    name: string;
    ic: string;
    nationality: string;
    phone: string;
    email: string;
    share_pct: string;
    is_pic: boolean;
};

export const EMPTY_DIRECTOR: DirectorRow = {
    name: "",
    ic: "",
    nationality: "Malaysian",
    phone: "",
    email: "",
    share_pct: "",
    is_pic: false,
};

export function parseDirectors(raw: unknown): DirectorRow[] {
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((r) => r && typeof r === "object")
            .map((r) => ({ ...EMPTY_DIRECTOR, ...(r as Partial<DirectorRow>) }));
    } catch {
        return [];
    }
}

/** Rows where the merchant actually entered something. */
export function filledDirectors(rows: DirectorRow[]): DirectorRow[] {
    return rows.filter((r) => r.name.trim() !== "" || r.ic.trim() !== "");
}

// ---------------------------------------------------------------------------
// Postcode → state derivation (first two digits, standard Pos Malaysia ranges)

const POSTCODE_STATE: Array<[number, number, string]> = [
    [1, 2, "Perlis"],
    [5, 9, "Kedah"],
    [10, 14, "Pulau Pinang"],
    [15, 18, "Kelantan"],
    [20, 24, "Terengganu"],
    [25, 28, "Pahang"],
    [39, 39, "Pahang"],
    [49, 49, "Pahang"],
    [30, 36, "Perak"],
    [40, 48, "Selangor"],
    [63, 64, "Selangor"],
    [68, 68, "Selangor"],
    [50, 60, "Kuala Lumpur"],
    [62, 62, "Putrajaya"],
    [70, 73, "Negeri Sembilan"],
    [75, 78, "Melaka"],
    [79, 86, "Johor"],
    [87, 87, "Labuan"],
    [88, 91, "Sabah"],
    [93, 98, "Sarawak"],
];

/** Best-effort state from a 5-digit Malaysian postcode ('' when unknown). */
export function stateFromPostcode(postcode: string): string {
    if (!/^\d{5}$/.test(postcode)) return "";
    const prefix = Number(postcode.slice(0, 2));
    for (const [lo, hi, state] of POSTCODE_STATE) {
        if (prefix >= lo && prefix <= hi) return state;
    }
    return "";
}

// ---------------------------------------------------------------------------
// Documents (Stage 2 — spec §5.6)

export type MerchantDocKey =
    | "nric"
    | "bank_statement_header"
    | "ssm_certificate"
    | "letter_of_authorisation"
    | "utility_bill"
    | "outlet_exterior"
    | "outlet_interior"
    | "logo"
    | "brand_kit"
    | "product_materials";

export type MerchantDocDef = {
    key: MerchantDocKey;
    label: string;
    help: string;
    /** Restrict the file picker/validation (e.g. header must be a PDF). */
    accept?: "pdf";
};

const DOCS_BASE: MerchantDocDef[] = [
    {
        key: "nric",
        label: "Director / owner IC copy",
        help: "Front and back in one photo or PDF. All text readable.",
    },
    {
        key: "bank_statement_header",
        label: "Bank statement header (PDF)",
        help: "Just the header page showing your account name and account number — most banking apps can export this as PDF.",
        accept: "pdf",
    },
];

const DOC_SSM: MerchantDocDef = {
    key: "ssm_certificate",
    label: "SSM certificate",
    help: "Sdn Bhd: Section 14/17 + Superform (or Form 9/24/49). Enterprise: Form A + Form D.",
};

const DOC_AUTH_LETTER: MerchantDocDef = {
    key: "letter_of_authorisation",
    label: "Letter of authorisation",
    help: "Needed because your person in charge is not the owner/director.",
};

const DOCS_OUTLET: MerchantDocDef[] = [
    {
        key: "utility_bill",
        label: "Utility bill (last month)",
        help: "Electricity, water, or internet bill showing your business address.",
    },
    {
        key: "outlet_exterior",
        label: "Outlet exterior photo",
        help: "Taken from outside — make sure your signboard is visible.",
    },
    {
        key: "outlet_interior",
        label: "Outlet interior photo",
        help: "A clear shot of the inside of your outlet.",
    },
];

/**
 * The adaptive required-document checklist. Empty for gate C — marketing-only
 * clients are never asked for KYC documents.
 */
export function requiredDocs(input: {
    gate: string;
    entityType: string;
    operatingModel: string;
    picIsOwner: boolean;
}): MerchantDocDef[] {
    if (!wantsPayments(input.gate)) return [];
    return [
        ...DOCS_BASE,
        ...(isRegisteredEntity(input.entityType) ? [DOC_SSM] : []),
        ...(input.picIsOwner ? [] : [DOC_AUTH_LETTER]),
        ...(hasOutlet(input.operatingModel) ? DOCS_OUTLET : []),
    ];
}

/**
 * Marketing/brand assets — collected on every track (a marketing-only client
 * is exactly who we need them from), all optional, never blocking.
 */
export const BRAND_ASSETS: MerchantDocDef[] = [
    {
        key: "logo",
        label: "Business logo",
        help: "PNG with transparent background if you have it — any format works.",
    },
    {
        key: "brand_kit",
        label: "Brand kit / guidelines",
        help: "If you have one — colours, fonts, do's and don'ts (PDF or images).",
    },
];

export const PRODUCT_MATERIALS_DOC: MerchantDocDef = {
    key: "product_materials",
    label: "Product / service materials",
    help: "Photos, menus, brochures, price lists — anything that shows what you offer.",
};

// ---------------------------------------------------------------------------
// Validation

const req = (msg: string) => z.string().trim().min(1, msg);

/**
 * Full-submission schema. Stage 1 + gate are always required; Stage 2 fields
 * are enforced only when the gate answer is A ("set up now"). All values
 * arrive as strings (FormData).
 */
export const merchantFormSchema = z
    .object({
        // Stage 1 — you
        owner_name: req("Enter your full name."),
        owner_phone: req("Enter your phone number."),
        owner_email: z
            .string()
            .trim()
            .email("That email doesn't look right — check for typos."),
        pic_is_owner: z.string().default("1"),
        pic_name: z.string().trim().default(""),
        pic_phone: z.string().trim().default(""),
        pic_email: z
            .string()
            .trim()
            .email("That email doesn't look right.")
            .or(z.literal(""))
            .default(""),

        // Stage 1 — business
        display_name: req("Enter your business name."),
        entity_type: z.enum(
            ENTITY_TYPES.map((e) => e.value) as [EntityType, ...EntityType[]],
            { message: "Choose your business type." },
        ),
        ssm_number: z.string().trim().default(""),
        registered_name: z.string().trim().default(""),
        what_you_sell: req("Tell us in one line what you sell."),
        industry: req("Choose an industry."),
        /** Website + social + marketplace URLs, one per line (optional). */
        links: z.string().trim().default(""),
        address_line1: req("Enter your street address."),
        address_line2: z.string().trim().default(""),
        postcode: z
            .string()
            .trim()
            .regex(/^\d{5}$/, "Postcode should be 5 digits."),
        city: req("Enter your city."),
        state: req("Choose your state."),
        operating_model: z.enum(
            OPERATING_MODELS.map((o) => o.value) as [
                OperatingModel,
                ...OperatingModel[],
            ],
            { message: "Tell us how you operate." },
        ),
        outlet_same_as_registered: z.string().default("1"),
        outlet_address: z.string().trim().default(""),

        // Gate
        gate_answer: z.enum(["A", "B", "C"], {
            message: "Choose whether you want to collect payments.",
        }),

        // Stage 2 — legal entity extras
        date_of_incorporation: z.string().trim().default(""),

        // Stage 2 — transaction profile
        avg_transaction_value: z.string().trim().default(""),
        est_monthly_volume: z.string().trim().default(""),
        delivery_timeline: z.string().trim().default(""),
        refund_policy: z.string().trim().default(""),
        payment_url: z.string().trim().default(""),

        // Stage 2 — directors + settlement
        directors_json: z.string().default("[]"),
        bank_name: z.string().trim().default(""),
        bank_account_number: z.string().trim().default(""),
        bank_account_name: z.string().trim().default(""),
        tin: z.string().trim().default(""),

        // Consents
        consent_terms: z.string().refine((v) => v === "1", {
            message: "Please accept the service terms to submit.",
        }),
        consent_pdpa: z.string().default(""),
        consent_declare: z.string().default(""),
    })
    .superRefine((data, ctx) => {
        const issue = (path: string, message: string) =>
            ctx.addIssue({ code: "custom", path: [path], message });

        if (data.pic_is_owner !== "1") {
            if (!data.pic_name) issue("pic_name", "Enter the person in charge's name.");
            if (!data.pic_phone) issue("pic_phone", "Enter the person in charge's phone number.");
        }
        if (isRegisteredEntity(data.entity_type)) {
            if (!data.ssm_number) issue("ssm_number", "Enter your SSM registration number.");
            if (!data.registered_name) issue("registered_name", "Enter your registered company name.");
        }
        if (
            hasOutlet(data.operating_model) &&
            data.outlet_same_as_registered !== "1" &&
            !data.outlet_address
        ) {
            issue("outlet_address", "Enter your outlet address.");
        }

        // Stage 2 is enforced only for "set up now". The transaction profile
        // (avg sale, volume, delivery, refund policy, payment URL) and the
        // incorporation date are NOT collected from the merchant — ops fills
        // them during gateway submission if the acquirer asks; the fields stay
        // in the schema as optional so the record can hold them.
        if (kycRequired(data.gate_answer)) {
            const directors = filledDirectors(parseDirectors(data.directors_json));
            if (directors.length === 0) {
                issue("directors_json", "Add at least one director or owner.");
            } else {
                for (const d of directors) {
                    if (!d.name.trim() || !d.ic.trim()) {
                        issue("directors_json", "Every director needs a name and IC/passport number.");
                        break;
                    }
                }
            }

            if (!data.bank_name) issue("bank_name", "Choose your bank.");
            if (!/^\d{6,20}$/.test(data.bank_account_number)) {
                issue("bank_account_number", "Account number should be 6–20 digits, numbers only.");
            }
            if (!data.bank_account_name) {
                issue("bank_account_name", "Enter the account holder name exactly as your bank has it.");
            }

            if (data.consent_pdpa !== "1") {
                issue("consent_pdpa", "The PDPA consent is required for a merchant application.");
            }
            if (data.consent_declare !== "1") {
                issue("consent_declare", "Please confirm the declaration to submit.");
            }
        }
    });

export type MerchantFormValues = z.infer<typeof merchantFormSchema>;

/** Data keys the flow stores — used for step autosave allow-listing. */
export const MERCHANT_DATA_KEYS: readonly string[] = [
    "owner_name",
    "owner_phone",
    "owner_email",
    "pic_is_owner",
    "pic_name",
    "pic_phone",
    "pic_email",
    "display_name",
    "entity_type",
    "ssm_number",
    "registered_name",
    "what_you_sell",
    "industry",
    "links",
    "address_line1",
    "address_line2",
    "postcode",
    "city",
    "state",
    "operating_model",
    "outlet_same_as_registered",
    "outlet_address",
    "gate_answer",
    "date_of_incorporation",
    "avg_transaction_value",
    "est_monthly_volume",
    "delivery_timeline",
    "refund_policy",
    "payment_url",
    "directors_json",
    "bank_name",
    "bank_account_number",
    "bank_account_name",
    "tin",
    "consent_terms",
    "consent_pdpa",
    "consent_declare",
];
