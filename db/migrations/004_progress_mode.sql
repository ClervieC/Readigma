-- Adds progress_mode so the "pages" vs "percent" progress editor choice is
-- remembered per book instead of each screen (Discover's reading-now card,
-- the book detail screen) defaulting to 'pages' independently — previously
-- switching to percent on one screen and opening the other would silently
-- flip back to pages.

alter table user_books add column if not exists progress_mode varchar(10) not null default 'pages';
