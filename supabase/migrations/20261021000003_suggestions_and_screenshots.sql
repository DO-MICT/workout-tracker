-- Tester suggestions, with an optional screenshot in private storage.

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'idea' check (kind in ('idea', 'bug', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  screenshot_path text,                      -- object path in the 'suggestions' bucket
  context jsonb not null default '{}'::jsonb, -- plan, day, app version, device
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'wont_do')),
  created_at timestamptz not null default now()
);
comment on table public.suggestions is 'Feedback from testers. Status is updated by the team in the dashboard.';
create index suggestions_user_created_idx on public.suggestions (user_id, created_at desc);

alter table public.suggestions enable row level security;

create policy "Send own suggestions" on public.suggestions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'new');
create policy "Read own suggestions" on public.suggestions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.suggestions from anon;
revoke update, delete on public.suggestions from authenticated;

-- Private bucket for screenshots: images only, up to 5 MB, one folder per user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suggestions', 'suggestions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

create policy "Upload own screenshots" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'suggestions' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "View own screenshots" on storage.objects
  for select to authenticated
  using (bucket_id = 'suggestions' and (storage.foldername(name))[1] = (select auth.uid())::text);
