import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy — NexOps",
    description:
        "How Nexova Digital collects, uses, and protects personal data across its services, forms, and advertising.",
};

const EFFECTIVE_DATE = "28 August 2026";
const CONTACT_EMAIL = "sales@nexovadigital.com";

/**
 * Public privacy policy — required by ad/platform integrations (e.g. the Meta
 * app powering Lead Ads → /api/webhooks/meta-leads) and linked from client
 * touchpoints. Also serves as the platform "data deletion instructions" URL
 * (see the Deletion section anchor).
 */
export default function PrivacyPolicyPage() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-10">
            <article className="space-y-8 rounded-xl border bg-card p-6 sm:p-10">
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Privacy Policy
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Nexova Digital (&ldquo;we&rdquo;, &ldquo;us&rdquo;) ·
                        Effective {EFFECTIVE_DATE}
                    </p>
                </header>

                <Section title="Who we are">
                    Nexova Digital is a Malaysian digital marketing agency. This
                    policy covers personal data handled through our website,
                    our advertising (including lead forms on platforms such as
                    Facebook and Instagram), and our operations &amp; client
                    portal at nexops.my.
                </Section>

                <Section title="What we collect">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                            <strong>Enquiries and lead forms</strong> — name,
                            company, email address, phone number, and anything
                            you write in a message or form, including forms
                            submitted through Meta (Facebook/Instagram) lead
                            ads together with basic ad context such as the
                            campaign and ad the form belonged to.
                        </li>
                        <li>
                            <strong>Client accounts</strong> — login email,
                            profile details, project material you share with
                            us, and billing details needed for quotations and
                            invoices.
                        </li>
                        <li>
                            <strong>Technical data</strong> — standard server
                            logs (IP address, timestamps) kept for security and
                            troubleshooting.
                        </li>
                    </ul>
                </Section>

                <Section title="How we use it">
                    To respond to your enquiry, provide and manage the services
                    you engage us for, issue quotations and invoices, keep our
                    records accurate, and send service-related communications.
                    We do not sell personal data, and we do not use it for
                    unrelated marketing without your consent.
                </Section>

                <Section title="Where it lives">
                    Data is processed by service providers acting on our
                    instructions: website and application hosting (Vercel),
                    database (Supabase), transactional email (Resend), and
                    payment processing (LeanX for Malaysian FPX payments).
                    Lead-form data originates from Meta Platforms when you
                    submit one of our forms there. Each provider only receives
                    what it needs to perform its function.
                </Section>

                <Section title="How long we keep it">
                    Leads and client records are kept while the enquiry or
                    engagement is active and for as long as needed afterwards
                    for legitimate business and legal purposes (e.g. tax and
                    accounting records for invoices), then deleted.
                </Section>

                <Section title="Your rights" id="deletion">
                    Under Malaysia&rsquo;s Personal Data Protection Act 2010
                    you may request access to, correction of, or deletion of
                    your personal data.{" "}
                    <strong>To request deletion</strong>, email{" "}
                    <a
                        className="underline underline-offset-2"
                        href={`mailto:${CONTACT_EMAIL}?subject=Data%20deletion%20request`}
                    >
                        {CONTACT_EMAIL}
                    </a>{" "}
                    from the address the data relates to (or provide enough
                    detail for us to locate it). We confirm and complete
                    verified deletion requests within 30 days, except where we
                    are legally required to retain specific records.
                </Section>

                <Section title="Security">
                    Access to personal data is limited to team members who need
                    it, protected by authenticated accounts, and transmitted
                    over encrypted connections (HTTPS).
                </Section>

                <Section title="Contact">
                    Questions about this policy or your data:{" "}
                    <a
                        className="underline underline-offset-2"
                        href={`mailto:${CONTACT_EMAIL}`}
                    >
                        {CONTACT_EMAIL}
                    </a>
                    . If we change this policy, we will update this page and
                    its effective date.
                </Section>
            </article>
        </main>
    );
}

function Section({
    title,
    id,
    children,
}: {
    title: string;
    id?: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="space-y-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="text-sm leading-6 text-muted-foreground">
                {children}
            </div>
        </section>
    );
}
