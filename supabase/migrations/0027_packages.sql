-- 0027: packages catalog — standardised managed-growth offerings (Growth,
-- Scale). Versioned: (code, version) is unique and at most one version per
-- code is active, so a client sold on v1 keeps v1's terms after a price change.
-- Mirrors src/lib/dev-store/packages.ts (keep the seed in sync).

create table if not exists public.packages (
    id                   text primary key,
    code                 text not null,
    name                 text not null,
    version              integer not null default 1,
    active               boolean not null default true,
    tagline              text not null default '',
    monthly_fee_myr      numeric(12,2) not null default 0,
    minimum_term_months  integer not null default 6,
    platforms            jsonb not null default '[]'::jsonb,
    website_included     boolean not null default false,
    website_label        text not null default '',
    report_cadence       text not null default 'monthly'
                             check (report_cadence in ('monthly','weekly')),
    deliverables         jsonb not null default '[]'::jsonb,
    includes             text not null default '',
    not_included         text not null default '',
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    constraint packages_code_version_unique unique (code, version)
);
create index if not exists packages_active_idx on public.packages (active);

alter table public.packages enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'packages'
          and policyname = 'packages_authenticated_all'
    ) then
        create policy packages_authenticated_all
            on public.packages for all to authenticated using (true) with check (true);
    end if;
end $$;

drop trigger if exists set_updated_at_packages on public.packages;
create trigger set_updated_at_packages
    before update on public.packages
    for each row execute function public.set_updated_at();

-- Seed from NEXOVA PRICING PACKAGE 2 (Sep 2026). Safe to re-run.
insert into public.packages
    (id, code, name, version, active, tagline, monthly_fee_myr, minimum_term_months,
     platforms, website_included, website_label, report_cadence, deliverables, includes, not_included)
values
(
    gen_random_uuid()::text, 'growth', 'Growth', 1, true,
    'Businesses that already have products or services, but need a professional marketing team.',
    1500, 6,
    '["meta"]'::jsonb, true,
    'FREE custom website (valued at RM5,000) — designed and built on the Nexova Platform during the first month',
    'monthly',
    '[{"type":"ad_set","qtyPerMonth":8},{"type":"poster","qtyPerMonth":4},{"type":"strategy_meeting","qtyPerMonth":2}]'::jsonb,
    E'Full Nexova CMS, AI website features, hosting & maintenance\nUnlimited content updates (fair use)\nCampaign setup and structure\nAudience research and targeting\nOngoing campaign optimisation\nProfessional copywriting for ads, posters and the website\nFull Nexova Premium subscription, AI Content Assistant, analytics dashboard\nDedicated account manager\nWhatsApp Business support during business hours',
    E'Advertising spend (media budget) — paid by the client\nDomain name registration and renewal fees\nPhotography, videography, video editing and motion graphics\nInfluencer, KOL or affiliate fees\nPrinting and production costs\nPremium stock media, fonts or third-party licences\nAdditional creatives beyond the monthly quantities, or a website redesign after launch\nSST and other applicable taxes\nGoogle Ads, TikTok Ads, SEO services and blog content (Scale package)'
),
(
    gen_random_uuid()::text, 'scale', 'Scale', 1, true,
    'Established SMEs looking for aggressive growth across multiple channels.',
    3000, 6,
    '["meta","google","tiktok"]'::jsonb, true,
    'FREE premium custom website — with campaign landing pages and conversion optimisation, built on the Nexova Platform during the first month',
    'weekly',
    '[{"type":"ad_set","qtyPerMonth":16},{"type":"poster","qtyPerMonth":8},{"type":"seo_article","qtyPerMonth":4},{"type":"strategy_meeting","qtyPerMonth":2}]'::jsonb,
    E'Everything in Growth\nAdvanced AI features, conversion optimisation\nMonthly content calendar and campaign copywriting\nTechnical & on-page SEO, local SEO, Google Business Profile optimisation\nKPI dashboard and ROI review\nDedicated growth consultant with priority response\nMonthly growth planning session',
    E'Advertising spend (media budget) — paid by the client\nDomain name registration and renewal fees\nPhotography, videography, video editing and motion graphics\nInfluencer, KOL or affiliate fees\nPrinting and production costs\nPremium stock media, fonts or third-party licences\nAdditional creatives beyond the monthly quantities, or a website redesign after launch\nSST and other applicable taxes'
)
on conflict (code, version) do nothing;
