"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * Merchant registration — mobile-first multi-step flow (Lean.x onboarding spec).
 *
 * Stage 1 (everyone): About you → Your business → GATE question.
 * Stage 2 (gate A/B): Payment profile → Directors → Settlement → Documents.
 * Review & submit closes both tracks.
 *
 * Track A ("set up now") enforces the full KYC at submit; track B
 * ("pre-approve me") lets the merchant submit whatever is ready; track C
 * ("marketing only") never sees Stage 2 at all. Every Continue autosaves —
 * the invite link is the resume link.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import {
    Check,
    ChevronLeft,
    FileText,
    Loader2,
    Pencil,
    Plus,
    ShieldCheck,
    Trash2,
    Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DECLARATION_TEXT,
    DELIVERY_TIMELINES,
    EMPTY_DIRECTOR,
    ENTITY_TYPES,
    GATE_OPTIONS,
    INDUSTRIES,
    KYC_EXPLAINER,
    MALAYSIAN_BANKS,
    MALAYSIAN_STATES,
    OPERATING_MODELS,
    PDPA_CONSENT_TEXT,
    VOLUME_OPTIONS,
    filledDirectors,
    hasOutlet,
    isRegisteredEntity,
    kycRequired,
    parseDirectors,
    requiredDocs,
    stateFromPostcode,
    wantsPayments,
    type DirectorRow,
    type MerchantDocKey,
} from "@/lib/onboarding/merchant-schema";
import {
    saveMerchantStepAction,
    submitMerchantAction,
    uploadMerchantDocAction,
    type MerchantFormState,
} from "@/lib/onboarding/merchant-actions";

type StoredFile = { url: string; name: string };

type Props = {
    token: string;
    clientName: string;
    initialData: Record<string, unknown>;
    initialFiles: Record<string, StoredFile>;
};

type StepKey =
    | "you"
    | "business"
    | "gate"
    | "profile"
    | "directors"
    | "bank"
    | "docs"
    | "review";

const STEP_TITLES: Record<StepKey, string> = {
    you: "About you",
    business: "Your business",
    gate: "Payments",
    profile: "Payment profile",
    directors: "Directors & owners",
    bank: "Settlement account",
    docs: "Verification documents",
    review: "Review & submit",
};

/** Which data keys autosave with which step. */
const STEP_KEYS: Record<string, string[]> = {
    you: [
        "owner_name",
        "owner_phone",
        "owner_email",
        "pic_is_owner",
        "pic_name",
        "pic_phone",
        "pic_email",
    ],
    business: [
        "display_name",
        "entity_type",
        "ssm_number",
        "registered_name",
        "what_you_sell",
        "industry",
        "website_or_social",
        "address_line1",
        "address_line2",
        "postcode",
        "city",
        "state",
        "operating_model",
        "outlet_same_as_registered",
        "outlet_address",
    ],
    gate: ["gate_answer"],
    profile: [
        "date_of_incorporation",
        "avg_transaction_value",
        "est_monthly_volume",
        "delivery_timeline",
        "refund_policy",
        "payment_url",
    ],
    directors: ["directors_json"],
    bank: ["bank_name", "bank_account_number", "bank_account_name", "tin"],
};

const INITIAL_SUBMIT_STATE: MerchantFormState = { ok: false };

export function MerchantForm({
    token,
    clientName,
    initialData,
    initialFiles,
}: Props) {
    const s = (key: string, fallback = "") => {
        const x = initialData[key];
        return typeof x === "string" && x !== "" ? x : fallback;
    };

    const [values, setValues] = useState<Record<string, string>>(() => ({
        owner_name: s("owner_name"),
        owner_phone: s("owner_phone"),
        owner_email: s("owner_email"),
        pic_is_owner: s("pic_is_owner", "1"),
        pic_name: s("pic_name"),
        pic_phone: s("pic_phone"),
        pic_email: s("pic_email"),
        display_name: s("display_name", clientName),
        entity_type: s("entity_type"),
        ssm_number: s("ssm_number"),
        registered_name: s("registered_name"),
        what_you_sell: s("what_you_sell"),
        industry: s("industry"),
        website_or_social: s("website_or_social"),
        address_line1: s("address_line1"),
        address_line2: s("address_line2"),
        postcode: s("postcode"),
        city: s("city"),
        state: s("state"),
        operating_model: s("operating_model"),
        outlet_same_as_registered: s("outlet_same_as_registered", "1"),
        outlet_address: s("outlet_address"),
        gate_answer: s("gate_answer"),
        date_of_incorporation: s("date_of_incorporation"),
        avg_transaction_value: s("avg_transaction_value"),
        est_monthly_volume: s("est_monthly_volume"),
        delivery_timeline: s("delivery_timeline"),
        refund_policy: s("refund_policy"),
        payment_url: s("payment_url"),
        directors_json: s("directors_json", "[]"),
        bank_name: s("bank_name"),
        bank_account_number: s("bank_account_number"),
        bank_account_name: s("bank_account_name"),
        tin: s("tin"),
    }));
    const [directors, setDirectors] = useState<DirectorRow[]>(() => {
        const rows = parseDirectors(s("directors_json", "[]"));
        return rows.length > 0 ? rows : [{ ...EMPTY_DIRECTOR }];
    });
    const [files, setFiles] =
        useState<Record<string, StoredFile>>(initialFiles);
    const [stepIdx, setStepIdx] = useState(() => (s("owner_name") ? 0 : -1));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, startSaving] = useTransition();
    const [consentTerms, setConsentTerms] = useState(false);
    const [consentPdpa, setConsentPdpa] = useState(false);
    const [consentDeclare, setConsentDeclare] = useState(false);
    const topRef = useRef<HTMLDivElement>(null);

    const [submitState, submitAction, submitting] = useActionState(
        submitMerchantAction.bind(null, token),
        INITIAL_SUBMIT_STATE,
    );

    const gate = values.gate_answer;
    const stage2 = wantsPayments(gate);
    const enforced = kycRequired(gate);
    const registered = isRegisteredEntity(values.entity_type);
    const outlet = hasOutlet(values.operating_model);
    const picIsOwner = values.pic_is_owner !== "0";

    /** Dynamic step order — Stage 2 exists only for gate A/B. */
    const steps: StepKey[] = useMemo(
        () => [
            "you",
            "business",
            "gate",
            ...(stage2
                ? (["profile", "directors", "bank", "docs"] as StepKey[])
                : []),
            "review",
        ],
        [stage2],
    );
    const step: StepKey | null = stepIdx >= 0 ? steps[stepIdx] : null;

    const docs = useMemo(
        () =>
            requiredDocs({
                gate,
                entityType: values.entity_type,
                operatingModel: values.operating_model,
                picIsOwner,
            }),
        [gate, values.entity_type, values.operating_model, picIsOwner],
    );

    const set = (key: string, value: string) => {
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
    };

    const setDirector = (i: number, patch: Partial<DirectorRow>) => {
        setDirectors((rows) => {
            const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
            setValues((v) => ({
                ...v,
                directors_json: JSON.stringify(filledDirectors(next)),
            }));
            return next;
        });
    };

    // ---- per-step client validation (Stage 2 enforced only on track A) ----
    function validateStep(key: StepKey): boolean {
        const missing: Record<string, string> = {};
        const need = (k: string, msg: string) => {
            if (!values[k]?.trim()) missing[k] = msg;
        };
        if (key === "you") {
            need("owner_name", "Enter your full name.");
            need("owner_phone", "Enter your phone number.");
            need("owner_email", "Enter your email.");
            if (!picIsOwner) {
                need("pic_name", "Enter their name.");
                need("pic_phone", "Enter their phone number.");
            }
        }
        if (key === "business") {
            need("display_name", "Enter your business name.");
            need("entity_type", "Choose your business type.");
            if (registered) {
                need("ssm_number", "Enter your SSM number.");
                need("registered_name", "Enter your registered name.");
            }
            need("what_you_sell", "Tell us what you sell.");
            need("industry", "Choose an industry.");
            need("address_line1", "Enter your address.");
            if (!/^\d{5}$/.test(values.postcode.trim())) {
                missing.postcode = "Postcode should be 5 digits.";
            }
            need("city", "Enter your city.");
            need("state", "Choose your state.");
            need("operating_model", "Tell us how you operate.");
            if (outlet && values.outlet_same_as_registered !== "1") {
                need("outlet_address", "Enter your outlet address.");
            }
        }
        if (key === "gate") {
            need("gate_answer", "Choose one to continue.");
        }
        if (key === "profile" && enforced) {
            if (!/^\d+(\.\d+)?$/.test(values.avg_transaction_value.trim())) {
                missing.avg_transaction_value =
                    "Enter your average sale in RM (numbers only).";
            }
            need("est_monthly_volume", "Choose a range.");
            need("delivery_timeline", "Choose one.");
            need("refund_policy", "Describe or link your policy.");
            need("payment_url", "Enter the page where customers will pay.");
            if (registered) {
                need("date_of_incorporation", "Enter the incorporation date.");
            }
        }
        if (key === "directors" && enforced) {
            const filled = filledDirectors(directors);
            if (filled.length === 0) {
                missing.directors_json = "Add at least one director or owner.";
            } else if (filled.some((d) => !d.name.trim() || !d.ic.trim())) {
                missing.directors_json =
                    "Every director needs a name and IC/passport number.";
            }
        }
        if (key === "bank" && enforced) {
            need("bank_name", "Choose your bank.");
            if (!/^\d{6,20}$/.test(values.bank_account_number.trim())) {
                missing.bank_account_number =
                    "Account number should be 6–20 digits.";
            }
            need("bank_account_name", "Enter the account holder name.");
        }
        setErrors(missing);
        return Object.keys(missing).length === 0;
    }

    function persistStep(key: StepKey | null, after?: () => void) {
        const keys = key ? (STEP_KEYS[key] ?? []) : [];
        startSaving(async () => {
            if (keys.length > 0) {
                const fd = new FormData();
                for (const k of keys) fd.set(k, values[k] ?? "");
                const res = await saveMerchantStepAction(token, fd);
                if (!res.ok) {
                    toast.error(res.message ?? "Couldn't save — try again.");
                    return;
                }
            }
            after?.();
            topRef.current?.scrollIntoView({ behavior: "smooth" });
        });
    }

    function next() {
        if (step && !validateStep(step)) return;
        persistStep(step, () => setStepIdx((v) => v + 1));
    }
    function back() {
        if (stepIdx > 0) persistStep(step, () => setStepIdx((v) => v - 1));
        else setStepIdx(-1);
    }
    function jumpTo(key: StepKey) {
        const i = steps.indexOf(key);
        if (i >= 0) setStepIdx(i);
    }

    const serverErrors = submitState.fieldErrors ?? {};
    const missingDocs = submitState.missingDocs ?? [];

    if (submitState.ok) {
        return (
            <div className="rounded-xl border bg-card p-8 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-6" />
                </div>
                <h2 className="mt-4 text-xl font-semibold">
                    {gate === "C"
                        ? "Details submitted"
                        : "Registration submitted"}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    {gate === "A"
                        ? "Thanks! We'll verify your documents and submit your merchant application. We'll WhatsApp you as soon as you're live — usually 1–2 business days."
                        : gate === "B"
                          ? "Thanks! Your documents are on file for pre-approval. When you're ready to collect payments, activation takes 1–2 days."
                          : "Thanks! We'll be in touch shortly. You can add payment collection anytime using this same link."}
                </p>
            </div>
        );
    }

    // ---- Welcome ----
    if (stepIdx === -1) {
        return (
            <div className="rounded-xl border bg-card p-6 md:p-8">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Merchant registration
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                    Get {clientName} set up
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    About 5 minutes. Your progress saves automatically — if you
                    need to stop, just open this same link to continue.
                </p>
                <div className="mt-5 rounded-lg bg-muted/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        If you want to collect payments, have these nearby
                    </p>
                    <ul className="mt-2 space-y-1.5">
                        {[
                            "Director/owner IC (a phone photo works)",
                            "Bank account details + a recent statement",
                            "SSM certificate — if your business is registered",
                        ].map((c) => (
                            <li key={c} className="flex items-start gap-2 text-sm">
                                <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                {c}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Marketing-only? None of this is needed — you&apos;ll be
                        done in 2 minutes.
                    </p>
                </div>
                <Button
                    size="lg"
                    className="mt-6 w-full md:w-auto"
                    onClick={() => setStepIdx(0)}
                >
                    {s("owner_name") ? "Continue" : "Start"}
                </Button>
            </div>
        );
    }

    return (
        <div ref={topRef} className="space-y-5">
            {/* Progress */}
            <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {step ? STEP_TITLES[step] : ""}
                    </span>
                    <span className="tabular-nums">
                        Step {stepIdx + 1} of {steps.length}
                    </span>
                </div>
                <div className="mt-2 flex gap-1.5">
                    {steps.map((st, i) => (
                        <div
                            key={st}
                            className={`h-1.5 flex-1 rounded-full ${
                                i <= stepIdx ? "bg-primary" : "bg-muted"
                            }`}
                        />
                    ))}
                </div>
            </div>

            <div className="rounded-xl border bg-card p-5 md:p-6">
                {/* ---- About you ---- */}
                {step === "you" ? (
                    <div className="space-y-4">
                        <Field
                            label="Full name"
                            help="As printed on your NRIC."
                            error={errors.owner_name ?? first(serverErrors.owner_name)}
                        >
                            <Input
                                value={values.owner_name}
                                onChange={(e) => set("owner_name", e.target.value)}
                                autoComplete="name"
                            />
                        </Field>
                        <Field
                            label="Phone (WhatsApp)"
                            error={errors.owner_phone ?? first(serverErrors.owner_phone)}
                        >
                            <Input
                                type="tel"
                                inputMode="tel"
                                value={values.owner_phone}
                                onChange={(e) => set("owner_phone", e.target.value)}
                                placeholder="e.g. 012-345 6789"
                                autoComplete="tel"
                            />
                        </Field>
                        <Field
                            label="Email"
                            help="Confirmation and your resume link go here."
                            error={errors.owner_email ?? first(serverErrors.owner_email)}
                        >
                            <Input
                                type="email"
                                inputMode="email"
                                value={values.owner_email}
                                onChange={(e) => set("owner_email", e.target.value)}
                                autoComplete="email"
                            />
                        </Field>

                        <ToggleRow
                            label="Someone else handles day-to-day?"
                            checked={!picIsOwner}
                            onChange={(on) => set("pic_is_owner", on ? "0" : "1")}
                        />
                        {!picIsOwner ? (
                            <div className="space-y-4 rounded-lg bg-muted/40 p-4">
                                <Field
                                    label="Their name"
                                    error={errors.pic_name ?? first(serverErrors.pic_name)}
                                >
                                    <Input
                                        value={values.pic_name}
                                        onChange={(e) => set("pic_name", e.target.value)}
                                    />
                                </Field>
                                <Field
                                    label="Their phone"
                                    error={errors.pic_phone ?? first(serverErrors.pic_phone)}
                                >
                                    <Input
                                        type="tel"
                                        inputMode="tel"
                                        value={values.pic_phone}
                                        onChange={(e) => set("pic_phone", e.target.value)}
                                    />
                                </Field>
                                <Field label="Their email" optional>
                                    <Input
                                        type="email"
                                        inputMode="email"
                                        value={values.pic_email}
                                        onChange={(e) => set("pic_email", e.target.value)}
                                    />
                                </Field>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* ---- Your business ---- */}
                {step === "business" ? (
                    <div className="space-y-4">
                        <Field
                            label="Business name"
                            help="The name your customers know."
                            error={errors.display_name ?? first(serverErrors.display_name)}
                        >
                            <Input
                                value={values.display_name}
                                onChange={(e) => {
                                    const prev = values.display_name;
                                    set("display_name", e.target.value);
                                    if (
                                        !values.registered_name ||
                                        values.registered_name === prev
                                    ) {
                                        set("registered_name", e.target.value);
                                    }
                                }}
                            />
                        </Field>
                        <Field
                            label="Business type"
                            error={errors.entity_type ?? first(serverErrors.entity_type)}
                        >
                            <Select
                                value={values.entity_type || null}
                                onValueChange={(v) => set("entity_type", v ?? "")}
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Choose one" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ENTITY_TYPES.map((e) => (
                                        <SelectItem key={e.value} value={e.value}>
                                            {e.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        {registered ? (
                            <div className="space-y-4 rounded-lg bg-muted/40 p-4">
                                <Field
                                    label="SSM registration number"
                                    help="New format, plus the old one if you have it."
                                    error={errors.ssm_number ?? first(serverErrors.ssm_number)}
                                >
                                    <Input
                                        value={values.ssm_number}
                                        onChange={(e) => set("ssm_number", e.target.value)}
                                        placeholder="e.g. 202301012345 (1234567-X)"
                                    />
                                </Field>
                                <Field
                                    label="Registered company name"
                                    help="Exactly as per SSM — only if it differs from your business name."
                                    error={
                                        errors.registered_name ??
                                        first(serverErrors.registered_name)
                                    }
                                >
                                    <Input
                                        value={values.registered_name}
                                        onChange={(e) =>
                                            set("registered_name", e.target.value)
                                        }
                                    />
                                </Field>
                            </div>
                        ) : null}
                        <Field
                            label="What do you sell?"
                            help="One line is enough — e.g. “Handmade cakes and desserts”."
                            error={errors.what_you_sell ?? first(serverErrors.what_you_sell)}
                        >
                            <Input
                                value={values.what_you_sell}
                                onChange={(e) => set("what_you_sell", e.target.value)}
                            />
                        </Field>
                        <Field
                            label="Industry"
                            error={errors.industry ?? first(serverErrors.industry)}
                        >
                            <Select
                                value={values.industry || null}
                                onValueChange={(v) => set("industry", v ?? "")}
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Choose one" />
                                </SelectTrigger>
                                <SelectContent>
                                    {INDUSTRIES.map((i) => (
                                        <SelectItem key={i} value={i}>
                                            {i}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field
                            label="Website or social link"
                            optional
                            help="Instagram, Facebook, TikTok or website — whichever customers see."
                        >
                            <Input
                                value={values.website_or_social}
                                onChange={(e) =>
                                    set("website_or_social", e.target.value)
                                }
                                placeholder="e.g. instagram.com/yourbusiness"
                            />
                        </Field>

                        <div className="space-y-4 border-t pt-4">
                            <Field
                                label="Business address"
                                error={
                                    errors.address_line1 ??
                                    first(serverErrors.address_line1)
                                }
                            >
                                <Input
                                    value={values.address_line1}
                                    onChange={(e) => set("address_line1", e.target.value)}
                                    placeholder="Street address"
                                    autoComplete="address-line1"
                                />
                            </Field>
                            <Field label="Unit / floor / building" optional>
                                <Input
                                    value={values.address_line2}
                                    onChange={(e) => set("address_line2", e.target.value)}
                                    autoComplete="address-line2"
                                />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field
                                    label="Postcode"
                                    error={errors.postcode ?? first(serverErrors.postcode)}
                                >
                                    <Input
                                        inputMode="numeric"
                                        maxLength={5}
                                        value={values.postcode}
                                        onChange={(e) => {
                                            const pc = e.target.value.replace(/\D/g, "");
                                            set("postcode", pc);
                                            const st = stateFromPostcode(pc);
                                            if (st) set("state", st);
                                        }}
                                        autoComplete="postal-code"
                                    />
                                </Field>
                                <Field
                                    label="City"
                                    error={errors.city ?? first(serverErrors.city)}
                                >
                                    <Input
                                        value={values.city}
                                        onChange={(e) => set("city", e.target.value)}
                                        autoComplete="address-level2"
                                    />
                                </Field>
                            </div>
                            <Field
                                label="State"
                                help="Filled from your postcode — change it if it's wrong."
                                error={errors.state ?? first(serverErrors.state)}
                            >
                                <Select
                                    value={values.state || null}
                                    onValueChange={(v) => set("state", v ?? "")}
                                >
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Choose your state" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MALAYSIAN_STATES.map((st) => (
                                            <SelectItem key={st} value={st}>
                                                {st}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>

                        <div className="space-y-4 border-t pt-4">
                            <Field
                                label="How do you operate?"
                                error={
                                    errors.operating_model ??
                                    first(serverErrors.operating_model)
                                }
                            >
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {OPERATING_MODELS.map((o) => (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() =>
                                                set("operating_model", o.value)
                                            }
                                            className={`rounded-lg border p-3 text-sm transition-colors ${
                                                values.operating_model === o.value
                                                    ? "border-primary bg-primary/5 font-medium"
                                                    : "hover:bg-accent"
                                            }`}
                                        >
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            {outlet ? (
                                <div className="space-y-4 rounded-lg bg-muted/40 p-4">
                                    <ToggleRow
                                        label="Outlet is at the address above"
                                        checked={
                                            values.outlet_same_as_registered === "1"
                                        }
                                        onChange={(on) =>
                                            set(
                                                "outlet_same_as_registered",
                                                on ? "1" : "0",
                                            )
                                        }
                                    />
                                    {values.outlet_same_as_registered !== "1" ? (
                                        <Field
                                            label="Outlet address"
                                            error={
                                                errors.outlet_address ??
                                                first(serverErrors.outlet_address)
                                            }
                                        >
                                            <Textarea
                                                rows={2}
                                                value={values.outlet_address}
                                                onChange={(e) =>
                                                    set(
                                                        "outlet_address",
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </Field>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {/* ---- GATE ---- */}
                {step === "gate" ? (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-base font-semibold">
                                Do you want to collect online payments?
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                You can change your mind anytime — this link
                                stays open.
                            </p>
                        </div>
                        {errors.gate_answer ? (
                            <p className="text-sm text-destructive">
                                {errors.gate_answer}
                            </p>
                        ) : null}
                        <div className="space-y-2">
                            {GATE_OPTIONS.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => set("gate_answer", o.value)}
                                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                                        gate === o.value
                                            ? "border-primary bg-primary/5"
                                            : "hover:bg-accent"
                                    }`}
                                >
                                    <span className="flex items-start gap-3">
                                        <span
                                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                                                gate === o.value
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : ""
                                            }`}
                                        >
                                            {gate === o.value ? (
                                                <Check className="size-3" />
                                            ) : null}
                                        </span>
                                        <span>
                                            <span className="block text-sm font-medium">
                                                {o.label}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                                {o.help}
                                            </span>
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* ---- Stage 2 explainer (first KYC step) ---- */}
                {step === "profile" ? (
                    <div className="space-y-4">
                        <KycExplainer />
                        {registered ? (
                            <Field
                                label="Date of incorporation"
                                error={
                                    errors.date_of_incorporation ??
                                    first(serverErrors.date_of_incorporation)
                                }
                            >
                                <Input
                                    type="date"
                                    value={values.date_of_incorporation}
                                    onChange={(e) =>
                                        set("date_of_incorporation", e.target.value)
                                    }
                                />
                            </Field>
                        ) : null}
                        <Field
                            label="Average sale amount (RM)"
                            error={
                                errors.avg_transaction_value ??
                                first(serverErrors.avg_transaction_value)
                            }
                        >
                            <Input
                                inputMode="decimal"
                                value={values.avg_transaction_value}
                                onChange={(e) =>
                                    set(
                                        "avg_transaction_value",
                                        e.target.value.replace(/[^\d.]/g, ""),
                                    )
                                }
                                placeholder="e.g. 150"
                            />
                        </Field>
                        <Field
                            label="Expected monthly sales"
                            error={
                                errors.est_monthly_volume ??
                                first(serverErrors.est_monthly_volume)
                            }
                        >
                            <Select
                                value={values.est_monthly_volume || null}
                                onValueChange={(v) =>
                                    set("est_monthly_volume", v ?? "")
                                }
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Choose a range" />
                                </SelectTrigger>
                                <SelectContent>
                                    {VOLUME_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field
                            label="How quickly do customers receive their order?"
                            error={
                                errors.delivery_timeline ??
                                first(serverErrors.delivery_timeline)
                            }
                        >
                            <Select
                                value={values.delivery_timeline || null}
                                onValueChange={(v) =>
                                    set("delivery_timeline", v ?? "")
                                }
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Choose one" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DELIVERY_TIMELINES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field
                            label="Refund & cancellation policy"
                            help="A short description, or a link to the policy page."
                            error={
                                errors.refund_policy ??
                                first(serverErrors.refund_policy)
                            }
                        >
                            <Textarea
                                rows={2}
                                value={values.refund_policy}
                                onChange={(e) => set("refund_policy", e.target.value)}
                            />
                        </Field>
                        <Field
                            label="Where will customers pay?"
                            help="The website, store page, or app where checkout will live."
                            error={
                                errors.payment_url ??
                                first(serverErrors.payment_url)
                            }
                        >
                            <Input
                                value={values.payment_url}
                                onChange={(e) => set("payment_url", e.target.value)}
                                placeholder="e.g. yourstore.com or instagram.com/yourbusiness"
                            />
                        </Field>
                    </div>
                ) : null}

                {/* ---- Directors ---- */}
                {step === "directors" ? (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            The gateway needs every director/owner on record
                            {values.entity_type === "sdn_bhd"
                                ? " — for a Sdn Bhd, list all directors."
                                : "."}
                        </p>
                        {(errors.directors_json ??
                            first(serverErrors.directors_json)) ? (
                            <p className="text-sm text-destructive">
                                {errors.directors_json ??
                                    first(serverErrors.directors_json)}
                            </p>
                        ) : null}
                        {directors.map((d, i) => (
                            <div
                                key={i}
                                className="space-y-3 rounded-lg border p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">
                                        Director {i + 1}
                                    </p>
                                    {directors.length > 1 ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-muted-foreground"
                                            onClick={() => {
                                                setDirectors((rows) => {
                                                    const next = rows.filter(
                                                        (_, j) => j !== i,
                                                    );
                                                    setValues((v) => ({
                                                        ...v,
                                                        directors_json:
                                                            JSON.stringify(
                                                                filledDirectors(
                                                                    next,
                                                                ),
                                                            ),
                                                    }));
                                                    return next;
                                                });
                                            }}
                                        >
                                            <Trash2 className="size-3" /> Remove
                                        </Button>
                                    ) : null}
                                </div>
                                <Field label="Full name (as per IC)">
                                    <Input
                                        value={d.name}
                                        onChange={(e) =>
                                            setDirector(i, { name: e.target.value })
                                        }
                                    />
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="IC / passport no.">
                                        <Input
                                            value={d.ic}
                                            onChange={(e) =>
                                                setDirector(i, { ic: e.target.value })
                                            }
                                        />
                                    </Field>
                                    <Field label="Nationality">
                                        <Select
                                            value={d.nationality || null}
                                            onValueChange={(v) =>
                                                setDirector(i, {
                                                    nationality: v ?? "Malaysian",
                                                })
                                            }
                                        >
                                            <SelectTrigger className="h-10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Malaysian">
                                                    Malaysian
                                                </SelectItem>
                                                <SelectItem value="Non-Malaysian">
                                                    Non-Malaysian
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Mobile">
                                        <Input
                                            type="tel"
                                            inputMode="tel"
                                            value={d.phone}
                                            onChange={(e) =>
                                                setDirector(i, {
                                                    phone: e.target.value,
                                                })
                                            }
                                        />
                                    </Field>
                                    <Field label="Shareholding %">
                                        <Input
                                            inputMode="numeric"
                                            value={d.share_pct}
                                            onChange={(e) =>
                                                setDirector(i, {
                                                    share_pct: e.target.value.replace(
                                                        /[^\d.]/g,
                                                        "",
                                                    ),
                                                })
                                            }
                                            placeholder="e.g. 100"
                                        />
                                    </Field>
                                </div>
                                <Field label="Email">
                                    <Input
                                        type="email"
                                        inputMode="email"
                                        value={d.email}
                                        onChange={(e) =>
                                            setDirector(i, { email: e.target.value })
                                        }
                                    />
                                </Field>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={d.is_pic}
                                        onCheckedChange={(v) =>
                                            setDirector(i, { is_pic: v === true })
                                        }
                                    />
                                    This person is the day-to-day contact
                                </label>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                                setDirectors((rows) => [
                                    ...rows,
                                    { ...EMPTY_DIRECTOR },
                                ])
                            }
                        >
                            <Plus className="size-4" /> Add another director
                        </Button>
                    </div>
                ) : null}

                {/* ---- Settlement account ---- */}
                {step === "bank" ? (
                    <div className="space-y-4">
                        <Field
                            label="Bank"
                            error={errors.bank_name ?? first(serverErrors.bank_name)}
                        >
                            <Select
                                value={values.bank_name || null}
                                onValueChange={(v) => set("bank_name", v ?? "")}
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Choose your bank" />
                                </SelectTrigger>
                                <SelectContent>
                                    {MALAYSIAN_BANKS.map((b) => (
                                        <SelectItem key={b} value={b}>
                                            {b}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field
                            label="Account number"
                            error={
                                errors.bank_account_number ??
                                first(serverErrors.bank_account_number)
                            }
                        >
                            <Input
                                inputMode="numeric"
                                value={values.bank_account_number}
                                onChange={(e) =>
                                    set(
                                        "bank_account_number",
                                        e.target.value.replace(/\D/g, ""),
                                    )
                                }
                            />
                        </Field>
                        <Field
                            label="Account holder name"
                            help="Must match your legal entity name exactly — settlements fail otherwise."
                            error={
                                errors.bank_account_name ??
                                first(serverErrors.bank_account_name)
                            }
                        >
                            <Input
                                value={
                                    values.bank_account_name ||
                                    values.registered_name ||
                                    values.owner_name
                                }
                                onChange={(e) =>
                                    set("bank_account_name", e.target.value)
                                }
                                onFocus={() => {
                                    if (!values.bank_account_name) {
                                        set(
                                            "bank_account_name",
                                            values.registered_name ||
                                                values.owner_name,
                                        );
                                    }
                                }}
                            />
                        </Field>
                        <Field
                            label="Tax identification number (TIN)"
                            optional
                            help="For e-invoicing — you can also send this later."
                        >
                            <Input
                                value={values.tin}
                                onChange={(e) => set("tin", e.target.value)}
                            />
                        </Field>
                    </div>
                ) : null}

                {/* ---- Documents ---- */}
                {step === "docs" ? (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Photos straight from your phone are perfect. Tap a
                            card to upload — you can replace anything before
                            submitting.
                            {gate === "B"
                                ? " Upload what you have — you can send the rest later."
                                : ""}
                        </p>
                        {docs.map((d) => (
                            <DocCard
                                key={d.key}
                                token={token}
                                docKey={d.key}
                                label={d.label}
                                help={d.help}
                                file={files[d.key] ?? null}
                                highlight={missingDocs.includes(d.key)}
                                optional={!enforced}
                                onUploaded={(f) =>
                                    setFiles((prev) => ({ ...prev, [d.key]: f }))
                                }
                            />
                        ))}
                        <DocCard
                            token={token}
                            docKey="logo"
                            label="Logo"
                            help="Optional — you can add or change it anytime."
                            optional
                            file={files.logo ?? null}
                            onUploaded={(f) =>
                                setFiles((prev) => ({ ...prev, logo: f }))
                            }
                        />
                    </div>
                ) : null}

                {/* ---- Review & submit ---- */}
                {step === "review" ? (
                    <form action={submitAction} className="space-y-5">
                        {Object.entries(values).map(([k, v]) => (
                            <input key={k} type="hidden" name={k} value={v} />
                        ))}
                        <input
                            type="hidden"
                            name="consent_terms"
                            value={consentTerms ? "1" : "0"}
                        />
                        <input
                            type="hidden"
                            name="consent_pdpa"
                            value={consentPdpa ? "1" : "0"}
                        />
                        <input
                            type="hidden"
                            name="consent_declare"
                            value={consentDeclare ? "1" : "0"}
                        />

                        <ReviewGroup title="You" onEdit={() => jumpTo("you")}>
                            <ReviewRow label="Name" value={values.owner_name} />
                            <ReviewRow label="Phone" value={values.owner_phone} />
                            <ReviewRow label="Email" value={values.owner_email} />
                            {!picIsOwner ? (
                                <ReviewRow
                                    label="Person in charge"
                                    value={`${values.pic_name} · ${values.pic_phone}`}
                                />
                            ) : null}
                        </ReviewGroup>

                        <ReviewGroup
                            title="Business"
                            onEdit={() => jumpTo("business")}
                        >
                            <ReviewRow label="Name" value={values.display_name} />
                            <ReviewRow
                                label="Type"
                                value={
                                    ENTITY_TYPES.find(
                                        (e) => e.value === values.entity_type,
                                    )?.label ?? ""
                                }
                            />
                            {registered ? (
                                <ReviewRow
                                    label="SSM"
                                    value={`${values.registered_name} · ${values.ssm_number}`}
                                />
                            ) : null}
                            <ReviewRow label="Sells" value={values.what_you_sell} />
                            <ReviewRow label="Industry" value={values.industry} />
                            <ReviewRow
                                label="Address"
                                value={[
                                    values.address_line1,
                                    values.address_line2,
                                    `${values.postcode} ${values.city}, ${values.state}`,
                                ]
                                    .filter(Boolean)
                                    .join(", ")}
                            />
                        </ReviewGroup>

                        <ReviewGroup title="Payments" onEdit={() => jumpTo("gate")}>
                            <ReviewRow
                                label="Choice"
                                value={
                                    GATE_OPTIONS.find((o) => o.value === gate)
                                        ?.label ?? "—"
                                }
                            />
                            {stage2 ? (
                                <>
                                    <ReviewRow
                                        label="Avg sale"
                                        value={
                                            values.avg_transaction_value
                                                ? `RM ${values.avg_transaction_value}`
                                                : ""
                                        }
                                    />
                                    <ReviewRow
                                        label="Monthly volume"
                                        value={
                                            VOLUME_OPTIONS.find(
                                                (o) =>
                                                    o.value ===
                                                    values.est_monthly_volume,
                                            )?.label ?? ""
                                        }
                                    />
                                    <ReviewRow
                                        label="Pay at"
                                        value={values.payment_url}
                                    />
                                    <ReviewRow
                                        label="Directors"
                                        value={
                                            filledDirectors(directors)
                                                .map((d) => d.name)
                                                .join(", ") || "—"
                                        }
                                    />
                                    <ReviewRow
                                        label="Settlement"
                                        value={
                                            values.bank_name
                                                ? `${values.bank_name} · ${maskAccount(values.bank_account_number)}`
                                                : "—"
                                        }
                                    />
                                </>
                            ) : null}
                        </ReviewGroup>

                        {stage2 ? (
                            <ReviewGroup
                                title="Documents"
                                onEdit={() => jumpTo("docs")}
                            >
                                {docs.map((d) => (
                                    <ReviewRow
                                        key={d.key}
                                        label={d.label}
                                        value={
                                            files[d.key]?.name ??
                                            (enforced ? "Missing" : "Not yet")
                                        }
                                        bad={enforced && !files[d.key]}
                                    />
                                ))}
                            </ReviewGroup>
                        ) : null}

                        {submitState.message && !submitState.ok ? (
                            <p
                                role="alert"
                                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                            >
                                {submitState.message}
                            </p>
                        ) : null}

                        <div className="space-y-3">
                            <ConsentBox
                                checked={consentTerms}
                                onChange={setConsentTerms}
                                text="I acknowledge the service agreement and general terms."
                                error={
                                    !consentTerms
                                        ? first(serverErrors.consent_terms)
                                        : undefined
                                }
                            />
                            {stage2 ? (
                                <>
                                    <ConsentBox
                                        checked={consentPdpa}
                                        onChange={setConsentPdpa}
                                        text={PDPA_CONSENT_TEXT}
                                        error={
                                            !consentPdpa
                                                ? first(serverErrors.consent_pdpa)
                                                : undefined
                                        }
                                    />
                                    <ConsentBox
                                        checked={consentDeclare}
                                        onChange={setConsentDeclare}
                                        text={DECLARATION_TEXT}
                                        error={
                                            !consentDeclare
                                                ? first(
                                                      serverErrors.consent_declare,
                                                  )
                                                : undefined
                                        }
                                    />
                                </>
                            ) : null}
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            className="w-full"
                            disabled={
                                submitting ||
                                !consentTerms ||
                                (enforced && (!consentPdpa || !consentDeclare))
                            }
                        >
                            {submitting ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            {gate === "C" ? "Submit details" : "Submit registration"}
                        </Button>
                    </form>
                ) : null}
            </div>

            {/* Nav */}
            {step !== "review" ? (
                <div className="flex items-center justify-between">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={back}
                        disabled={saving}
                    >
                        <ChevronLeft className="size-4" /> Back
                    </Button>
                    <Button
                        type="button"
                        onClick={next}
                        disabled={saving}
                        className="min-w-32"
                    >
                        {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Continue
                    </Button>
                </div>
            ) : (
                <div className="flex items-center justify-start">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStepIdx((v) => v - 1)}
                        disabled={submitting}
                    >
                        <ChevronLeft className="size-4" /> Back
                    </Button>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------

function first(arr: string[] | undefined): string | undefined {
    return arr?.[0];
}

function maskAccount(acc: string): string {
    if (acc.length <= 4) return acc;
    return `••••${acc.slice(-4)}`;
}

function KycExplainer() {
    return (
        <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
                <p className="text-sm font-medium">
                    Why these details are needed
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {KYC_EXPLAINER}
                </p>
            </div>
        </div>
    );
}

function Field({
    label,
    help,
    error,
    optional,
    children,
}: {
    label: string;
    help?: string;
    error?: string;
    optional?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="flex items-baseline gap-2 text-sm">
                {label}
                {optional ? (
                    <span className="text-xs font-normal text-muted-foreground">
                        optional
                    </span>
                ) : null}
            </Label>
            {children}
            {error ? (
                <p className="text-xs text-destructive">{error}</p>
            ) : help ? (
                <p className="text-xs text-muted-foreground">{help}</p>
            ) : null}
        </div>
    );
}

function ToggleRow({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium">
            {label}
            <Checkbox
                checked={checked}
                onCheckedChange={(v) => onChange(v === true)}
            />
        </label>
    );
}

function ConsentBox({
    checked,
    onChange,
    text,
    error,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    text: string;
    error?: string;
}) {
    return (
        <div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => onChange(v === true)}
                    className="mt-0.5"
                />
                <span className="text-xs leading-relaxed">{text}</span>
            </label>
            {error ? (
                <p className="mt-1 text-xs text-destructive">{error}</p>
            ) : null}
        </div>
    );
}

function DocCard({
    token,
    docKey,
    label,
    help,
    file,
    optional,
    highlight,
    onUploaded,
}: {
    token: string;
    docKey: MerchantDocKey;
    label: string;
    help: string;
    file: StoredFile | null;
    optional?: boolean;
    highlight?: boolean;
    onUploaded: (f: StoredFile) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const isImage = file
        ? /\.(jpe?g|png|webp|heic|heif)(\?|$)/i.test(file.url) ||
          !/\.pdf(\?|$)/i.test(file.url)
        : false;

    async function onPick(picked: File | null) {
        if (!picked) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.set("file", picked);
            const res = await uploadMerchantDocAction(token, docKey, fd);
            if (res.ok) {
                onUploaded({ url: res.file.url, name: res.file.name });
                toast.success(`${label} uploaded`);
            } else {
                toast.error(res.message);
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className={`rounded-lg border p-3 ${
                highlight ? "border-destructive" : ""
            }`}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                    void onPick(e.target.files?.[0] ?? null);
                    e.target.value = "";
                }}
            />
            <div className="flex items-center gap-3">
                {file ? (
                    isImage ? (
                        <img
                            src={file.url}
                            alt={label}
                            className="size-14 shrink-0 rounded-md border object-cover"
                        />
                    ) : (
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                            <FileText className="size-6 text-muted-foreground" />
                        </span>
                    )
                ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed">
                        <Upload className="size-5 text-muted-foreground" />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 text-sm font-medium">
                        {label}
                        {optional ? (
                            <span className="text-xs font-normal text-muted-foreground">
                                optional
                            </span>
                        ) : null}
                        {file ? (
                            <Check className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                        {file ? file.name : help}
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant={file ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                >
                    {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : file ? (
                        "Replace"
                    ) : (
                        "Upload"
                    )}
                </Button>
            </div>
        </div>
    );
}

function ReviewGroup({
    title,
    onEdit,
    children,
}: {
    title: string;
    onEdit: () => void;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    className="h-7 gap-1 text-xs"
                >
                    <Pencil className="size-3" /> Edit
                </Button>
            </div>
            <dl className="space-y-2 p-4">{children}</dl>
        </section>
    );
}

function ReviewRow({
    label,
    value,
    bad,
}: {
    label: string;
    value: string;
    bad?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd
                className={`text-right ${
                    bad ? "font-medium text-destructive" : ""
                }`}
            >
                {value || "—"}
            </dd>
        </div>
    );
}
