-- Fixes user_books_before_write so a percent-only progress update isn't
-- silently overwritten back to the page-derived value. Previously the
-- trigger recomputed progress_percent from current_page/total_pages on
-- every write whenever both were already set on the row, even if the
-- write didn't touch either column — so updating "by %" when a book
-- already had pages on file had no visible effect. Run this once against
-- an existing database; it only replaces the function body (the trigger
-- itself doesn't need recreating).

create or replace function user_books_before_write() returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.rating is not null then
    new.rating = round(new.rating * 4) / 4;
  end if;

  if new.total_pages > 0 and new.current_page is not null
     and (tg_op = 'INSERT' or new.current_page is distinct from old.current_page or new.total_pages is distinct from old.total_pages) then
    new.progress_percent = round((new.current_page::numeric / new.total_pages) * 100, 2);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'done' then
      new.finished_at = now();
    elsif new.status = 'reading' and old.started_at is null then
      new.started_at = now();
    end if;
  end if;

  return new;
end;
$$;
