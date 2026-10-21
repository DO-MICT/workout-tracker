-- Admins can reply to a suggestion; the tester sees the reply in their list.

alter table public.suggestions
  add column admin_reply text check (admin_reply is null or char_length(admin_reply) <= 2000),
  add column replied_at timestamptz;

-- replied_at is always set by the server when the reply text changes.
create or replace function private.stamp_suggestion_reply()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.admin_reply is distinct from old.admin_reply then
    new.admin_reply := nullif(btrim(new.admin_reply), '');
    new.replied_at := case when new.admin_reply is null then null else now() end;
  else
    new.replied_at := old.replied_at;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_suggestion_reply() from public, anon, authenticated;

create trigger suggestions_stamp_reply before update on public.suggestions
  for each row execute function private.stamp_suggestion_reply();

-- Admins (the only ones with an update policy) may change status and the reply.
grant update (admin_reply) on public.suggestions to authenticated;
