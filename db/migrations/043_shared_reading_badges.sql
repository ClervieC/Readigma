-- Per-reading badges — "Premier arrivé", "Théoricien", "Commentateur",
-- "Finisseur", "Marathonien" — computed on the fly from tables that already
-- exist (membership, theories, messages, user_books progress), not a new
-- table: there's nothing to store, every badge is deterministically
-- re-derivable each time this is called. "Sans spoiler" from the original
-- feature list is dropped — it'd need a moderation/report system scoped to
-- shared readings that doesn't exist yet, so there's no clean signal to
-- compute it from.
create or replace function get_shared_reading_badges(p_reading_id uuid)
returns table(badge text, user_id uuid, username varchar)
language plpgsql security definer set search_path = public as $$
declare
  v_book_id uuid;
begin
  if not exists (
    select 1 from shared_reading_members m
    where m.shared_reading_id = p_reading_id and m.user_id = auth.uid()
  ) then
    raise exception 'Accès refusé';
  end if;

  select r.book_id into v_book_id from shared_readings r where r.id = p_reading_id;

  return query
    select 'first_arrived', m.user_id, p.username
    from shared_reading_members m
    join profiles p on p.id = m.user_id
    where m.shared_reading_id = p_reading_id
    order by m.joined_at asc
    limit 1;

  return query
    select 'theorist', t.user_id, p.username
    from shared_reading_theories t
    join profiles p on p.id = t.user_id
    where t.shared_reading_id = p_reading_id
    group by t.user_id, p.username
    order by count(*) desc
    limit 1;

  return query
    select 'commentator', msg.user_id, p.username
    from shared_reading_messages msg
    join profiles p on p.id = msg.user_id
    where msg.shared_reading_id = p_reading_id
    group by msg.user_id, p.username
    order by count(*) desc
    limit 1;

  -- Every member who finished gets this one — not a single-winner badge
  -- like the others above.
  return query
    select 'finisher', ub.user_id, p.username
    from user_books ub
    join shared_reading_members m on m.user_id = ub.user_id and m.shared_reading_id = p_reading_id
    join profiles p on p.id = ub.user_id
    where ub.book_id = v_book_id and ub.progress_percent >= 100;

  return query
    select 'marathonien', ub.user_id, p.username
    from user_books ub
    join shared_reading_members m on m.user_id = ub.user_id and m.shared_reading_id = p_reading_id
    join profiles p on p.id = ub.user_id
    where ub.book_id = v_book_id and ub.progress_percent >= 100
    order by ub.finished_at asc nulls last
    limit 1;
end;
$$;
