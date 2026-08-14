-- lib/sharedReadings.ts's voteFor() used to run a switch-vote as two
-- separate client round trips (delete the caller's existing vote, then
-- insert the new one). If the insert failed after the delete succeeded, the
-- previous vote was silently lost — getProposals would then report the
-- caller hadn't voted at all, with only a generic error alert shown.
-- Wrapped in one function so it's atomic: a failed insert rolls back the
-- delete too, in the same implicit transaction.
--
-- SECURITY DEFINER bypasses shared_reading_book_votes_insert's own RLS
-- check, so the membership check it normally does is re-implemented here —
-- without it, any authenticated user could vote on a reading they're not a
-- member of.
create or replace function vote_for_proposal(p_reading_id uuid, p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from shared_reading_members m
    where m.shared_reading_id = p_reading_id and m.user_id = auth.uid()
  ) then
    raise exception 'not a member of this shared reading';
  end if;

  delete from shared_reading_book_votes
    where shared_reading_id = p_reading_id and user_id = auth.uid();
  insert into shared_reading_book_votes (proposal_id, shared_reading_id, user_id)
    values (p_proposal_id, p_reading_id, auth.uid());
end;
$$;

grant execute on function vote_for_proposal(uuid, uuid) to authenticated;
