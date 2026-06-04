"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Repeater } from "@/components/repeater";
import {
    saveDraftAction,
    submitOnboardingAction,
    type FormState,
} from "@/lib/onboarding/actions";
import {
    GOAL_OPTIONS,
    STYLE_OPTIONS,
    type FaqItem,
    type ServiceItem,
    type TeamItem,
    type TestimonialItem,
} from "@/lib/onboarding/schema";

const INITIAL_FORM_STATE: FormState = { ok: false };

type UploadedFile = { url: string; name: string };

type Props = {
    token: string;
    initialData: Record<string, unknown>;
    logo: UploadedFile | null;
    photos: UploadedFile[];
};

function v(data: Record<string, unknown>, key: string): string {
    const x = data[key];
    return typeof x === "string" ? x : "";
}

function parseRows<T>(data: Record<string, unknown>, key: string): T[] {
    const raw = data[key];
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

export function OnboardingForm({ token, initialData, logo, photos }: Props) {
    const submit = submitOnboardingAction.bind(null, token);
    const draft = saveDraftAction.bind(null, token);
    const [state, formAction, pending] = useActionState<FormState, FormData>(
        submit,
        INITIAL_FORM_STATE,
    );

    const [styles, setStyles] = useState<string[]>(
        v(initialData, "style").split(",").filter(Boolean),
    );
    const [goal, setGoal] = useState<string>(v(initialData, "goal"));

    function fieldError(key: string) {
        return state.fieldErrors?.[key]?.[0];
    }

    async function onSaveDraft(formData: FormData) {
        formData.set("style", styles.join(","));
        formData.set("goal", goal);
        const result = await draft(state, formData);
        if (result.ok) toast.success(result.message ?? "Saved");
        else toast.error(result.message ?? "Failed to save");
    }

    return (
        <form
            action={formAction}
            className="space-y-8"
            suppressHydrationWarning
        >
            <input type="hidden" name="style" value={styles.join(",")} />
            <input type="hidden" name="goal" value={goal} />

            <Section title="Business">
                <Field label="Business name" error={fieldError("business_name")}>
                    <Input name="business_name" defaultValue={v(initialData, "business_name")} required />
                </Field>
                <Field label="Tagline">
                    <Input name="tagline" defaultValue={v(initialData, "tagline")} />
                </Field>
                <Field label="SSM (registration number)" error={fieldError("ssm")}>
                    <Input name="ssm" defaultValue={v(initialData, "ssm")} required />
                </Field>
                <Field label="Address" error={fieldError("address")}>
                    <Textarea name="address" defaultValue={v(initialData, "address")} required rows={2} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Phone" error={fieldError("phone")}>
                        <Input name="phone" type="tel" inputMode="tel" defaultValue={v(initialData, "phone")} required />
                    </Field>
                    <Field label="Email" error={fieldError("email")}>
                        <Input name="email" type="email" inputMode="email" defaultValue={v(initialData, "email")} required />
                    </Field>
                </div>
                <Field label="Operating hours">
                    <Textarea name="operating_hours" defaultValue={v(initialData, "operating_hours")} rows={2} />
                </Field>
            </Section>

            <Section title="Brand">
                <Field label="Logo (PNG / SVG, transparent background)">
                    <Input name="logo" type="file" accept=".png,.svg,.jpg,.jpeg,.webp" className="h-11" />
                    {logo ? (
                        <div className="mt-2 flex items-center gap-3 rounded-md border p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logo.url} alt={logo.name} className="size-12 object-contain" />
                            <span className="text-sm text-muted-foreground">{logo.name}</span>
                        </div>
                    ) : null}
                </Field>
                <Field label="Brand colours (hex, comma-separated)">
                    <Input name="brand_colors" defaultValue={v(initialData, "brand_colors")} placeholder="#0F172A, #F97316" />
                </Field>
                <Field label="Preferred fonts / brand guide notes">
                    <Textarea name="fonts" defaultValue={v(initialData, "fonts")} rows={2} />
                </Field>
            </Section>

            <Section title="Content">
                <Field label="About us / company story" error={fieldError("about_us")}>
                    <Textarea name="about_us" defaultValue={v(initialData, "about_us")} required rows={4} />
                </Field>

                <Repeater<ServiceItem & Record<string, string>>
                    name="services_json"
                    label="Services or products"
                    addLabel="Add service"
                    initial={parseRows<ServiceItem>(initialData, "services_json").map((s) => ({
                        name: s.name ?? "",
                        description: s.description ?? "",
                    }))}
                    blank={{ name: "", description: "" }}
                    fields={[
                        { key: "name", label: "Name", placeholder: "e.g. Web design" },
                        { key: "description", label: "Description", type: "textarea" },
                    ]}
                />

                <Field label="Pricing notes (optional, shown on site if filled)">
                    <Textarea name="pricing" defaultValue={v(initialData, "pricing")} rows={3} />
                </Field>

                <Repeater<TeamItem & Record<string, string>>
                    name="team_json"
                    label="Team members"
                    addLabel="Add member"
                    initial={parseRows<TeamItem>(initialData, "team_json").map((t) => ({
                        name: t.name ?? "",
                        title: t.title ?? "",
                        bio: t.bio ?? "",
                    }))}
                    blank={{ name: "", title: "", bio: "" }}
                    fields={[
                        { key: "name", label: "Name" },
                        { key: "title", label: "Title / role" },
                        { key: "bio", label: "Short bio", type: "textarea" },
                    ]}
                />

                <Repeater<TestimonialItem & Record<string, string>>
                    name="testimonials_json"
                    label="Customer testimonials"
                    addLabel="Add testimonial"
                    initial={parseRows<TestimonialItem>(initialData, "testimonials_json").map((t) => ({
                        text: t.text ?? "",
                        reviewer: t.reviewer ?? "",
                    }))}
                    blank={{ text: "", reviewer: "" }}
                    fields={[
                        { key: "text", label: "Quote", type: "textarea" },
                        { key: "reviewer", label: "Reviewer name" },
                    ]}
                />

                <Repeater<FaqItem & Record<string, string>>
                    name="faq_json"
                    label="FAQ"
                    addLabel="Add question"
                    initial={parseRows<FaqItem>(initialData, "faq_json").map((q) => ({
                        question: q.question ?? "",
                        answer: q.answer ?? "",
                    }))}
                    blank={{ question: "", answer: "" }}
                    fields={[
                        { key: "question", label: "Question" },
                        { key: "answer", label: "Answer", type: "textarea" },
                    ]}
                />
            </Section>

            <Section title="Photos">
                <Field label="Upload photos (storefront, products, team) — pick multiple">
                    <Input
                        name="photos"
                        type="file"
                        accept="image/*"
                        multiple
                        className="h-11"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        New uploads add to the existing set; nothing is replaced.
                    </p>
                    {photos.length > 0 ? (
                        <ul className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-4">
                            {photos.map((p, i) => (
                                <li key={i} className="overflow-hidden rounded-md border">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={p.url}
                                        alt={p.name}
                                        className="aspect-square w-full object-cover"
                                    />
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </Field>
            </Section>

            <Section title="Design preferences">
                <Field label="Main goal" error={fieldError("goal")}>
                    <Select value={goal} onValueChange={(val) => setGoal(val ?? "")}>
                        <SelectTrigger className="h-11">
                            <SelectValue placeholder="Pick one" />
                        </SelectTrigger>
                        <SelectContent>
                            {GOAL_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="Style preferences (pick any)">
                    <div className="flex flex-wrap gap-3">
                        {STYLE_OPTIONS.map((opt) => {
                            const id = `style-${opt}`;
                            const checked = styles.includes(opt);
                            return (
                                <label key={opt} htmlFor={id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                    <Checkbox
                                        id={id}
                                        checked={checked}
                                        onCheckedChange={(c) => {
                                            setStyles((curr) =>
                                                c ? [...curr, opt] : curr.filter((s) => s !== opt),
                                            );
                                        }}
                                    />
                                    {opt}
                                </label>
                            );
                        })}
                    </div>
                </Field>
                <Field label="Reference websites you like (one URL per line)">
                    <Textarea name="references" defaultValue={v(initialData, "references")} rows={3} />
                </Field>
            </Section>

            <Section title="Technical">
                <Field label="Domain (existing or desired)">
                    <Input name="domain" defaultValue={v(initialData, "domain")} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Facebook URL" error={fieldError("facebook_url")}>
                        <Input name="facebook_url" type="url" defaultValue={v(initialData, "facebook_url")} />
                    </Field>
                    <Field label="Instagram URL" error={fieldError("instagram_url")}>
                        <Input name="instagram_url" type="url" defaultValue={v(initialData, "instagram_url")} />
                    </Field>
                </div>
                <Field label="Google Business Profile URL" error={fieldError("google_business")}>
                    <Input name="google_business" type="url" defaultValue={v(initialData, "google_business")} />
                </Field>
            </Section>

            {state.message && !state.ok ? (
                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <p className="font-medium">{state.message}</p>
                    {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 ? (
                        <ul className="ml-5 list-disc space-y-0.5 text-xs">
                            {Object.entries(state.fieldErrors).map(([key, msgs]) => (
                                <li key={key}>
                                    <span className="font-medium">
                                        {key.replace(/_/g, " ").replace(/\./g, " → ")}:
                                    </span>{" "}
                                    {msgs.join(", ")}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}
            {state.message && state.ok ? (
                <p className="text-sm text-emerald-600">{state.message}</p>
            ) : null}

            <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur md:static md:mx-0 md:flex-row md:justify-end md:border-0 md:bg-transparent md:p-0">
                <Button
                    type="button"
                    variant="outline"
                    formNoValidate
                    onClick={(e) => {
                        e.preventDefault();
                        const form = (e.currentTarget as HTMLButtonElement).closest("form");
                        if (form) onSaveDraft(new FormData(form));
                    }}
                >
                    Save draft
                </Button>
                <Button type="submit" disabled={pending}>
                    {pending ? "Submitting…" : "Submit onboarding"}
                </Button>
            </div>
        </form>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="space-y-4">{children}</div>
        </section>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-sm">{label}</Label>
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}
