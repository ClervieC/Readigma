-- When a book transitions to status='done', its shelf_position (if any) was
-- earned on a *different* shelf (to_read/reading) and is meaningless on the
-- "done" shelf — worse, it can collide with a book already manually placed
-- there. Clear it so the book falls back to the client's finished_at-DESC
-- ordering (newest finish on top) until the user explicitly repositions it
-- with a drag/tap on the "done" shelf.
create or replace function user_books_before_write() returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.rating is not null then
    new.rating = round(new.rating * 4) / 4;
  end if;

  -- Only re-derive progress_percent from pages when this write actually
  -- touches current_page/total_pages — otherwise a percent-only update
  -- (progress tracked by % rather than page count) would get silently
  -- clobbered back to whatever the last page-based value was.
  if new.total_pages > 0 and new.current_page is not null
     and (tg_op = 'INSERT' or new.current_page is distinct from old.current_page or new.total_pages is distinct from old.total_pages) then
    new.progress_percent = round((new.current_page::numeric / new.total_pages) * 100, 2);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'done' then
      new.finished_at = now();
      new.shelf_position = null;
    elsif new.status = 'reading' and old.started_at is null then
      new.started_at = now();
    end if;
  end if;

  return new;
end;
$$;
