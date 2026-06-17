-- 0013_report_insights.sql
-- AI-written narrative for a client's monthly report (Summary / Conclusion /
-- Recommendations), generated on demand from that month's deliverables + notes
-- and cached per (client, month) so it isn't re-billed on every view.

create table if not exists public.report_insights (
    id              text primary key,
    client_name     text not null,
    month           text not null,                 -- YYYY-MM
    summary         text not null default '',
    conclusion      text not null default '',
    recommendations jsonb not null default '[]'::jsonb,  -- string[]
    generated_at    timestamptz not null default now(),
    unique (client_name, month)
);

alter table public.report_insights enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'report_insights'
          and policyname = 'report_insights_authenticated_all'
    ) then
        create policy report_insights_authenticated_all
            on public.report_insights
            for all to authenticated using (true) with check (true);
    end if;
end $$;
