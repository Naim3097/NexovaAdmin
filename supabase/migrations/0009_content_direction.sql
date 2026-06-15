-- 0009_content_direction.sql
-- Phase 6: the loop now starts with the CLIENT. They create an item with a
-- Direction + reference links; the agency then fills the creative concept
-- (visual headline / idea / copywriting) before uploading an asset.
--
-- Note: the column is reference_links (not "references") because `references` is
-- a reserved word in Postgres. The app maps it to the TS field `references`.

alter table public.content_posts
    add column if not exists direction       text  not null default '',
    add column if not exists reference_links jsonb not null default '[]'::jsonb,
    add column if not exists visual_headline text  not null default '',
    add column if not exists visual_idea     text  not null default '',
    add column if not exists copywriting     text  not null default '';
