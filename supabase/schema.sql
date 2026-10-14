-- Point Scramble: optional cloud sync. Run once in the Supabase SQL editor.
-- Also enable: Authentication > Providers > Anonymous Sign-Ins (and add CAPTCHA / rate limits there).

create table if not exists public.scramble_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint items_is_array check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 60),
  constraint items_small    check (pg_column_size(items) < 20000)
);

alter table public.scramble_settings enable row level security;

-- Each visitor can only touch their own row.
create policy "read own row"   on public.scramble_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own row" on public.scramble_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own row" on public.scramble_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own row" on public.scramble_settings for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.scramble_settings from anon;
grant select, insert, update, delete on public.scramble_settings to authenticated;
