-- The owner's planned day on a task.
--
-- due_date stays the deadline the account manager set. planned_date is the
-- day the owner intends to do the work (dragged on the calendar or picked in
-- the task's quick edit), never after the deadline. NULL = on the deadline.

alter table public.works
    add column if not exists planned_date date;

comment on column public.works.planned_date is
    'Day the owner plans to do the task, never after due_date; NULL = on the deadline.';
