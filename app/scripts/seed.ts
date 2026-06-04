/**
 * One-time idempotent seed for going-live config:
 *   - the 9 Nexova services (so invoicing/projects have a catalog)
 *   - agency_profile display name + country (so invoices have a header)
 *
 * Safe to re-run: services are matched by name (only missing ones inserted),
 * and agency fields are only filled when currently blank — never clobbers data
 * you've entered in Settings.
 *
 * Run from app/:  npm run seed
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded from
 * .env.local automatically).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// --- load .env.local into process.env (tsx doesn't do this for us) ----------
async function loadEnvLocal() {
    const file = path.join(process.cwd(), ".env.local");
    let raw: string;
    try {
        raw = await fs.readFile(file, "utf8");
    } catch {
        return; // rely on ambient env
    }
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

const SERVICES: Array<{
    name: string;
    category: string;
    unit: string;
    description: string;
}> = [
    { name: "Website Creation", category: "website", unit: "project", description: "Design + build a marketing website." },
    { name: "App Development", category: "app", unit: "project", description: "Mobile / web application build." },
    { name: "Social Media Management", category: "content", unit: "month", description: "Content calendar + posting + community." },
    { name: "META Ads", category: "ads", unit: "month", description: "Facebook / Instagram ad management." },
    { name: "Google Ads", category: "ads", unit: "month", description: "Search / display / YouTube ad management." },
    { name: "Google SEO", category: "seo", unit: "month", description: "Organic search optimisation + content." },
    { name: "Google My Business", category: "seo", unit: "month", description: "Local listing optimisation + posts." },
    { name: "Brand Development & Kit", category: "branding", unit: "project", description: "Logo, identity, brand guidelines." },
    { name: "Business Operation System", category: "retainer", unit: "project", description: "Custom internal ops platform (this product line)." },
];

async function main() {
    await loadEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env/.env.local",
        );
        process.exit(2);
    }
    const sb = createClient(url, key, { auth: { persistSession: false } });

    // --- services ----------------------------------------------------------
    const { data: existing, error: listErr } = await sb
        .from("services")
        .select("name");
    if (listErr) {
        console.error("Could not read services:", listErr.message);
        process.exit(1);
    }
    const have = new Set(
        (existing ?? []).map((s) => String(s.name).trim().toLowerCase()),
    );
    const now = new Date().toISOString();
    const toInsert = SERVICES.filter(
        (s) => !have.has(s.name.toLowerCase()),
    ).map((s) => ({
        id: randomUUID(),
        name: s.name,
        category: s.category,
        unit: s.unit,
        default_price: 0,
        description: s.description,
        active: true,
        created_at: now,
        updated_at: now,
    }));

    if (toInsert.length > 0) {
        const { error } = await sb.from("services").insert(toInsert);
        if (error) {
            console.error("Inserting services failed:", error.message);
            process.exit(1);
        }
        console.log(`✅ Seeded ${toInsert.length} new service(s).`);
    } else {
        console.log("✅ Services already present — nothing to add.");
    }

    // --- agency profile (fill blanks only) ---------------------------------
    const { data: agency, error: agErr } = await sb
        .from("agency_profile")
        .select("*")
        .eq("id", "nexov")
        .maybeSingle();
    if (agErr) {
        console.error("Could not read agency_profile:", agErr.message);
        process.exit(1);
    }
    if (!agency) {
        console.warn(
            "⚠ agency_profile row (id='nexov') missing — apply migration 0001 first.",
        );
    } else {
        const patch: Record<string, string> = {};
        if (!String(agency.display_name ?? "").trim()) patch.display_name = "Nexova";
        if (!String(agency.legal_name ?? "").trim()) patch.legal_name = "Nexova";
        if (!String(agency.country ?? "").trim()) patch.country = "MY";
        if (Object.keys(patch).length > 0) {
            patch.updated_at = now;
            const { error } = await sb
                .from("agency_profile")
                .update(patch)
                .eq("id", "nexov");
            if (error) {
                console.error("Updating agency_profile failed:", error.message);
                process.exit(1);
            }
            console.log(
                `✅ Filled agency profile blanks: ${Object.keys(patch)
                    .filter((k) => k !== "updated_at")
                    .join(", ")}.`,
            );
        } else {
            console.log("✅ Agency profile already configured.");
        }
    }

    console.log(
        "\nNext: fill SST no. + bank details in Settings → Agency for complete invoices.",
    );
}

void main();
