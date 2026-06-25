-- 0019_sprint_tasks.sql
-- Lightweight single-layer "sprint tasks": a quick dump of work, each with a PIC
-- and a deadline (default today + 3 days, set in code). A daily Vercel cron pings
-- the PIC via Telegram 1 day before the deadline. Distinct from project workflows.

create table if not exists public.sprint_tasks (
    id           text primary key,
    title        text not null,
    pic          text not null default '',   -- PIC name (matches team_members.name)
    details      text not null default '',
    deadline     date not null,
    status       text not null check (status in ('open','done')) default 'open',
    -- date for which the "due tomorrow" ping was already sent (idempotency);
    -- null = not yet reminded.
    reminded_for date,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    completed_at timestamptz
);
create index if not exists sprint_tasks_status_idx on public.sprint_tasks (status);
create index if not exists sprint_tasks_deadline_idx on public.sprint_tasks (deadline);
create index if not exists sprint_tasks_pic_idx on public.sprint_tasks (pic);

-- RLS — same single-tenant policy as every other table (0001).
alter table public.sprint_tasks enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'sprint_tasks'
          and policyname = 'sprint_tasks_authenticated_all'
    ) then
        create policy sprint_tasks_authenticated_all
            on public.sprint_tasks for all to authenticated using (true) with check (true);
    end if;
end $$;

-- Keep updated_at fresh (reuses the function created in 0001).
drop trigger if exists set_updated_at_sprint_tasks on public.sprint_tasks;
create trigger set_updated_at_sprint_tasks
    before update on public.sprint_tasks
    for each row execute function public.set_updated_at();

-- Allow the new 'task_due_soon' notification kind.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'project_signoff','invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced','content_draft_submitted',
         'content_changes_requested','content_approved','quote_sent',
         'quote_accepted','task_due_soon','system'));
