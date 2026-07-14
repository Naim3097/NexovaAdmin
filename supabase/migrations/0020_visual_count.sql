-- 0020_visual_count.sql
-- Per-visual quota accounting: a content item declares how many visuals it
-- needs (carousel = several, single image/video = 1). Quota + chargeable
-- extras now count VISUALS, not posts — 1 visual = 1 quota unit.

alter table public.content_posts
    add column if not exists visual_count int not null default 1
        check (visual_count >= 1 and visual_count <= 20);
