-- 0010_content_storage.sql
-- Phase 7: a public Storage bucket for content assets (carousel images, single
-- visuals, videos). Public-read so the agency review panel and the client portal
-- can preview assets directly by URL; writes go through the service-role client
-- server-side (bypasses Storage RLS), so clients never get direct write access.

insert into storage.buckets (id, name, public)
values ('content-assets', 'content-assets', true)
on conflict (id) do nothing;
