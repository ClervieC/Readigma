-- Adds series tracking to the shared `books` catalog, behind the book
-- detail screen's new "Série" card: a series name (best-effort auto-filled
-- from Open Library's `series:X` subject tag when searching, otherwise set
-- manually — that source's series tagging is too sparse to rely on alone)
-- and an optional tome/volume number.

alter table books add column if not exists series varchar(500);
alter table books add column if not exists series_index numeric(5,2);
