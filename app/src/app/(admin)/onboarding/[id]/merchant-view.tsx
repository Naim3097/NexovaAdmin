/* eslint-disable @next/next/no-img-element */
/**
 * Structured admin view of a merchant-registration submission — the merchant
 * profile as the team reads it. Banking details, director IC numbers, and the
 * IC document are restricted to admins (same bar as invoices); everything
 * else is team-wide.
 */
import { Badge } from "@/components/ui/badge";
import {
    DELIVERY_TIMELINES,
    ENTITY_TYPES,
    GATE_OPTIONS,
    OPERATING_MODELS,
    VOLUME_OPTIONS,
    hasOutlet,
    isRegisteredEntity,
    parseDirectors,
    requiredDocs,
    wantsPayments,
} from "@/lib/onboarding/merchant-schema";
import type { OnboardingSubmission } from "@/lib/data/onboarding";

type StoredFile = { url: string; name: string };

function str(data: Record<string, unknown>, key: string): string {
    const v = data[key];
    return typeof v === "string" ? v : "";
}

function label<T extends { value: string; label: string }>(
    options: readonly T[],
    value: string,
): string {
    return options.find((o) => o.value === value)?.label ?? value;
}

function maskIc(ic: string): string {
    if (ic.length <= 4) return "••••";
    return `••••••${ic.slice(-4)}`;
}

const STATUS_LABELS: Record<string, string> = {
    active_merchant_pending: "Payment setup — verify & submit to gateway",
    pre_approved: "Pre-approved — docs on file",
    marketing_only: "Marketing only",
};

export function MerchantSubmissionView({
    sub,
    isAdmin,
}: {
    sub: OnboardingSubmission;
    isAdmin: boolean;
}) {
    const d = sub.data;
    const files = sub.files as Record<string, StoredFile | StoredFile[]>;
    const single = (key: string): StoredFile | null => {
        const f = files[key];
        return f && !Array.isArray(f) ? f : null;
    };

    const entity = str(d, "entity_type");
    const model = str(d, "operating_model");
    const gate = str(d, "gate_answer");
    const picIsOwner = str(d, "pic_is_owner") !== "0";
    const stage2 = wantsPayments(gate);
    const directors = parseDirectors(d.directors_json);
    const docs = requiredDocs({
        gate,
        entityType: entity,
        operatingModel: model,
        picIsOwner,
    });
    const logo = single("logo");
    const clientStatus = str(d, "client_status");

    const address = [
        str(d, "address_line1"),
        str(d, "address_line2"),
        `${str(d, "postcode")} ${str(d, "city")}`.trim(),
        str(d, "state"),
    ]
        .filter(Boolean)
        .join(", ");

    return (
        <>
            {/* Track / status */}
            {gate ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-medium">Payment track</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {label(GATE_OPTIONS, gate)}
                            </p>
                        </div>
                        {clientStatus ? (
                            <Badge
                                variant={
                                    clientStatus === "marketing_only"
                                        ? "secondary"
                                        : "default"
                                }
                            >
                                {STATUS_LABELS[clientStatus] ?? clientStatus}
                            </Badge>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {/* Business */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-medium">Business</h2>
                        <p className="mt-1 text-lg font-semibold">
                            {str(d, "display_name") || sub.clientName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {str(d, "what_you_sell")}
                        </p>
                    </div>
                    {logo ? (
                        <img
                            src={logo.url}
                            alt="Logo"
                            className="size-16 rounded-md border object-contain"
                        />
                    ) : null}
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
                    <Item label="Entity type" value={label(ENTITY_TYPES, entity)} />
                    {isRegisteredEntity(entity) ? (
                        <>
                            <Item
                                label="Registered name"
                                value={str(d, "registered_name")}
                            />
                            <Item label="SSM number" value={str(d, "ssm_number")} />
                            <Item
                                label="Incorporated"
                                value={str(d, "date_of_incorporation")}
                            />
                        </>
                    ) : null}
                    <Item label="Industry" value={str(d, "industry")} />
                    <Item label="Links" value={str(d, "links")} />
                    <Item
                        label="Operating model"
                        value={label(OPERATING_MODELS, model)}
                    />
                    <Item label="Business address" value={address} />
                    {hasOutlet(model) ? (
                        <Item
                            label="Outlet address"
                            value={
                                str(d, "outlet_same_as_registered") !== "0"
                                    ? "Same as business address"
                                    : str(d, "outlet_address")
                            }
                        />
                    ) : null}
                    <Item label="TIN" value={str(d, "tin") || "— (collect later)"} />
                </dl>
            </section>

            {/* People */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">People</h2>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
                    <Item label="Owner" value={str(d, "owner_name")} />
                    <Item label="Owner phone" value={str(d, "owner_phone")} />
                    <Item label="Owner email" value={str(d, "owner_email")} />
                    {picIsOwner ? (
                        <Item label="Person in charge" value="Owner (same person)" />
                    ) : (
                        <>
                            <Item label="PIC" value={str(d, "pic_name")} />
                            <Item label="PIC phone" value={str(d, "pic_phone")} />
                            <Item label="PIC email" value={str(d, "pic_email")} />
                        </>
                    )}
                </dl>
                {directors.length > 0 ? (
                    <div className="mt-4 overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2 font-medium">
                                        Director / owner
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                        IC / passport
                                    </th>
                                    <th className="px-3 py-2 font-medium">
                                        Contact
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium">
                                        Share %
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {directors.map((dir, i) => (
                                    <tr key={i} className="border-b last:border-b-0">
                                        <td className="px-3 py-2 font-medium">
                                            {dir.name}
                                            {dir.is_pic ? (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    PIC
                                                </span>
                                            ) : null}
                                            <span className="block text-xs font-normal text-muted-foreground">
                                                {dir.nationality}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 tabular-nums">
                                            {isAdmin ? dir.ic : maskIc(dir.ic)}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                            {[dir.phone, dir.email]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {dir.share_pct || "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </section>

            {/* Brand & marketing assets — team-wide */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Brand &amp; marketing</h2>
                <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <AssetRow label="Logo" file={single("logo")} />
                    <AssetRow
                        label="Brand kit / guidelines"
                        file={single("brand_kit")}
                    />
                </ul>
                {(() => {
                    const mats = files.product_materials;
                    const list = Array.isArray(mats) ? mats : [];
                    if (list.length === 0) return null;
                    return (
                        <div className="mt-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Product / service materials ({list.length})
                            </p>
                            <ul className="mt-2 flex flex-wrap gap-2">
                                {list.map((f, i) => (
                                    <li key={i}>
                                        <a
                                            href={f.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-block max-w-52 truncate rounded-md border px-2 py-1 text-xs hover:bg-accent"
                                        >
                                            {f.name}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })()}
            </section>

            {/* Transaction profile */}
            {stage2 ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">Transaction profile</h2>
                    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
                        <Item
                            label="Average sale"
                            value={
                                str(d, "avg_transaction_value")
                                    ? `RM ${str(d, "avg_transaction_value")}`
                                    : ""
                            }
                        />
                        <Item
                            label="Expected monthly volume"
                            value={label(
                                VOLUME_OPTIONS,
                                str(d, "est_monthly_volume"),
                            )}
                        />
                        <Item
                            label="Delivery timeline"
                            value={label(
                                DELIVERY_TIMELINES,
                                str(d, "delivery_timeline"),
                            )}
                        />
                        <Item
                            label="Payment collection URL"
                            value={str(d, "payment_url")}
                        />
                        <div className="md:col-span-2">
                            <Item
                                label="Refund & cancellation policy"
                                value={str(d, "refund_policy")}
                            />
                        </div>
                    </dl>
                </section>
            ) : null}

            {/* Banking — admin only */}
            {stage2 ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-medium">
                            Settlement account
                        </h2>
                        <Badge variant="outline">admin only</Badge>
                    </div>
                    {isAdmin ? (
                        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                            <Item label="Bank" value={str(d, "bank_name")} />
                            <Item
                                label="Account number"
                                value={str(d, "bank_account_number")}
                            />
                            <Item
                                label="Account holder"
                                value={str(d, "bank_account_name")}
                            />
                        </dl>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Settlement details are visible to admins only.
                        </p>
                    )}
                </section>
            ) : null}

            {/* Documents */}
            {stage2 ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">
                        Verification documents
                    </h2>
                    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {docs.map((doc) => {
                            const f = single(doc.key);
                            // IC copies are identity data — admin eyes only.
                            const restricted = doc.key === "nric" && !isAdmin;
                            return (
                                <li
                                    key={doc.key}
                                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">
                                            {doc.label}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {restricted
                                                ? "Admin only"
                                                : (f?.name ?? "Not uploaded")}
                                        </p>
                                    </div>
                                    {f && !restricted ? (
                                        <a
                                            href={f.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="shrink-0 text-sm text-primary underline"
                                        >
                                            View
                                        </a>
                                    ) : (
                                        <Badge
                                            variant={
                                                f ? "secondary" : "destructive"
                                            }
                                        >
                                            {f ? "uploaded" : "missing"}
                                        </Badge>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                        {str(d, "consent_terms") === "1" && sub.submittedAt ? (
                            <p>
                                Terms acknowledged at submission ·{" "}
                                {new Date(sub.submittedAt).toLocaleString()}
                            </p>
                        ) : null}
                        {str(d, "consent_pdpa") === "1" ? (
                            <p>PDPA consent for KYC processing: given</p>
                        ) : null}
                        {str(d, "consent_declare") === "1" ? (
                            <p>Accuracy declaration: given</p>
                        ) : null}
                        {str(d, "docs_received_date") ? (
                            <p>
                                Documents received{" "}
                                {new Date(
                                    str(d, "docs_received_date"),
                                ).toLocaleDateString()}{" "}
                                — check freshness before gateway submission
                                (3–6 month rule).
                            </p>
                        ) : null}
                    </div>
                </section>
            ) : null}
        </>
    );
}

function AssetRow({
    label,
    file,
}: {
    label: string;
    file: StoredFile | null;
}) {
    return (
        <li className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {file?.name ?? "Not provided"}
                </p>
            </div>
            {file ? (
                <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-sm text-primary underline"
                >
                    View
                </a>
            ) : (
                <Badge variant="secondary">none</Badge>
            )}
        </li>
    );
}

function Item({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-0.5">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd className="whitespace-pre-wrap break-words">
                {value || <span className="text-muted-foreground">—</span>}
            </dd>
        </div>
    );
}
