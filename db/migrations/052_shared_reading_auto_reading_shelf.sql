-- Starting a shared reading — as its creator, or by joining one someone
-- else made — should put that book on the reader's own "En cours" (reading)
-- shelf automatically, since that's now what they're actually doing. A
-- single trigger on shared_reading_members covers both cases: the creator
-- is itself auto-added there by add_shared_reading_creator_as_member (see
-- migration 038), so this fires for them too, not just later joiners.
create or replace function add_shared_reading_member_book_to_reading() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_book_id uuid;
begin
  select book_id into v_book_id from shared_readings where id = new.shared_reading_id;
  if v_book_id is null then
    return new;
  end if;
  insert into user_books (user_id, book_id, status)
  values (new.user_id, v_book_id, 'reading')
  on conflict (user_id, book_id) do update set status = 'reading';
  return new;
end;
$$;

create trigger shared_reading_members_add_book_to_reading
  after insert on shared_reading_members
  for each row execute function add_shared_reading_member_book_to_reading();
