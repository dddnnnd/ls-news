-- =========================================================
-- LOS SANTOS NEWS — GITHUB PAGES / SUPABASE FIXED SCHEMA
-- Safe to run again in Supabase SQL Editor.
-- =========================================================

-- ---------- PROFILES / AUTH ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id_code text unique not null,
  username text unique not null,
  email text,
  role text,
  role_title text default 'Читатель',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists user_id_code text,
  add column if not exists username text,
  add column if not exists email text,
  add column if not exists role_title text default 'Читатель',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Replace the old role constraint, if one exists.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role is null or role in ('admin','director','deputy','journalist','user'));

alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role_title set default '👤 Читатель';

-- Public view exposing only non-sensitive profile columns (strictly protects email)
create or replace view public.lsn_public_profiles with (security_invoker = false) as
  select
    id,
    user_id_code,
    username,
    role,
    role_title,
    created_at,
    updated_at
  from public.profiles;

revoke all on public.lsn_public_profiles from public;
grant select on public.lsn_public_profiles to anon, authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

drop policy if exists "Public profiles read" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Management update profiles" on public.profiles;
drop policy if exists lsn_profiles_select on public.profiles;
drop policy if exists lsn_profiles_update on public.profiles;

-- Authenticated users can read their own profile, or management can inspect profiles
create policy lsn_profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or (select coalesce(role, 'user') from public.profiles where id = auth.uid()) = 'admin'
  or (
    (select case role when 'admin' then 5 when 'director' then 4 when 'deputy' then 3 when 'journalist' then 2 else 1 end from public.profiles where id = auth.uid()) >
    (select case role when 'admin' then 5 when 'director' then 4 when 'deputy' then 3 when 'journalist' then 2 else 1 end from public.profiles where id = profiles.id)
  )
);

create policy lsn_profiles_update on public.profiles
for update to authenticated
using (
  id = auth.uid()
  or (select coalesce(role, 'user') from public.profiles where id = auth.uid()) = 'admin'
)
with check (
  (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and email = (select p.email from public.profiles p where p.id = auth.uid())
  )
  or (select coalesce(role, 'user') from public.profiles where id = auth.uid()) = 'admin'
);

-- Secure registration trigger: every registrant strictly receives role='user'.
-- Zero hardcoded email backdoors. Metadata role injection is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_num int;
  raw_name text;
  clean_name text;
begin
  select coalesce(max(substring(user_id_code from 5)::int), 100) + 1
    into next_num
  from public.profiles
  where user_id_code ~ '^USR-[0-9]+$';

  raw_name := trim(coalesce(new.raw_user_meta_data ->> 'username',
                            split_part(coalesce(new.email,''), '@', 1)));
  clean_name := regexp_replace(raw_name, '_', ' ', 'g');
  if clean_name = '' then clean_name := 'User ' || next_num; end if;

  insert into public.profiles (
    id, user_id_code, username, email, role, role_title
  )
  values (
    new.id,
    'USR-' || next_num,
    clean_name,
    new.email,
    'user',
    '👤 Читатель'
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(nullif(public.profiles.username,''), excluded.username),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- NOTICE: Administrative account elevation is strictly separated into manual tooling.
-- See supabase/sql/restore_primary_admin.sql to promote a specific administrative account.
drop function if exists public.lsn_username_available(text);

create or replace function public.lsn_username_available(candidate_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    candidate_username ~ '^[a-zA-Z0-9_]{3,24}$'
    and not exists (
      select 1 from public.profiles
      where lower(username) = lower(candidate_username)
    );
$$;

create or replace function public.get_lsn_username()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select user_id_code from public.profiles where id = auth.uid()),
    (select username from public.profiles where id = auth.uid()),
    ''
  );
$$;

create or replace function public.get_lsn_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'user'
  );
$$;

create or replace function public.lsn_v2_role_rank(p_role text)
returns integer
language sql
immutable
strict
set search_path = ''
as $function$
  select case p_role
    when 'admin' then 5
    when 'director' then 4
    when 'deputy' then 3
    when 'journalist' then 2
    when 'user' then 1
    else 0
  end
$function$;

drop function if exists public.lsn_admin_list_users();

create or replace function public.lsn_admin_list_users()
returns table (
  user_id uuid,
  username text,
  email text,
  full_name text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    coalesce(nullif(p.username,''), p.email, p.user_id_code),
    coalesce(p.role, 'user')
  from public.profiles p
  where exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and me.role in ('admin','director','deputy')
  )
  order by p.created_at asc;
$$;

drop function if exists public.lsn_set_user_role(uuid, text);

create or replace function public.lsn_set_user_role(
  p_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  actor_rank integer;
  target_current_role text;
  target_current_rank integer;
  new_target_rank integer;
  new_title text;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Нельзя изменять собственную роль через RPC';
  end if;

  select coalesce(role, 'user') into actor_role from public.profiles where id = auth.uid();
  actor_rank := public.lsn_v2_role_rank(actor_role);
  new_target_rank := public.lsn_v2_role_rank(p_new_role);

  if new_target_rank = 0 then
    raise exception 'Недопустимая целевая роль: %', p_new_role;
  end if;

  select role into target_current_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Целевой пользователь не найден';
  end if;
  target_current_rank := public.lsn_v2_role_rank(target_current_role);

  if target_current_role = 'admin' and actor_role <> 'admin' then
    raise exception 'Управлять учётной записью администратора может только администратор';
  end if;
  if p_new_role = 'admin' and actor_role <> 'admin' then
    raise exception 'Назначать роль администратора может только администратор';
  end if;

  if actor_role <> 'admin' then
    if actor_rank <= target_current_rank then
      raise exception 'Недостаточно прав: ранг цели равен или превышает ваш';
    end if;
    if actor_rank <= new_target_rank then
      raise exception 'Нельзя назначать роль равную или выше собственной';
    end if;
  end if;

  new_title := case p_new_role
    when 'admin' then '🛡️ Администратор'
    when 'director' then '👑 Генеральный директор'
    when 'deputy' then '⭐ Заместитель генерального директора'
    when 'journalist' then '📝 Журналист'
    else '👤 Читатель'
  end;

  update public.profiles
  set role = p_new_role,
      role_title = new_title,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'role', p_new_role,
    'role_title', new_title
  );
end;
$$;

-- ---------- ARTICLES ----------
create table if not exists public.lsn_articles (
  id text primary key,
  type text not null default 'news',
  title text not null,
  category text not null default 'Новости',
  lead text not null default '',
  excerpt text not null default '',
  body text not null default '',
  author text not null default 'Редакция Los Santos News',
  author_name text not null default 'Редакция Los Santos News',
  author_id uuid references auth.users(id) on delete set null,
  image_url text,
  status text not null default 'published',
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lsn_articles
  add column if not exists type text default 'news',
  add column if not exists lead text default '',
  add column if not exists excerpt text default '',
  add column if not exists author text default 'Редакция Los Santos News',
  add column if not exists author_name text default 'Редакция Los Santos News',
  add column if not exists author_id uuid references auth.users(id) on delete set null,
  add column if not exists image_url text,
  add column if not exists status text default 'published',
  add column if not exists published_at timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.lsn_articles alter column type set default 'news';
alter table public.lsn_articles alter column status set default 'published';

update public.lsn_articles
set
  excerpt = coalesce(nullif(excerpt,''), lead, ''),
  lead = coalesce(nullif(lead,''), excerpt, ''),
  author_name = coalesce(nullif(author_name,''), author, 'Редакция Los Santos News'),
  author = coalesce(nullif(author,''), author_name, 'Редакция Los Santos News'),
  type = coalesce(nullif(type,''), 'news'),
  status = coalesce(nullif(status,''), 'published'),
  published_at = case when coalesce(status,'published') = 'published'
                      then coalesce(published_at, created_at)
                      else published_at end;

alter table public.lsn_articles
  drop constraint if exists lsn_articles_type_check;
alter table public.lsn_articles
  add constraint lsn_articles_type_check
  check (type in ('news','ad','column','staff'));

alter table public.lsn_articles
  drop constraint if exists lsn_articles_status_check;
alter table public.lsn_articles
  add constraint lsn_articles_status_check
  check (status in ('draft','published','archived'));

alter table public.lsn_articles enable row level security;
revoke all on public.lsn_articles from anon, authenticated;
grant select on public.lsn_articles to anon, authenticated;
grant insert, update, delete on public.lsn_articles to authenticated;

drop policy if exists "Public read articles" on public.lsn_articles;
create policy "Public read articles"
  on public.lsn_articles for select
  to anon, authenticated
  using (status = 'published' or author_id = auth.uid() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','director','deputy')
  ));

drop policy if exists "Authors insert articles" on public.lsn_articles;
create policy "Authors insert articles"
  on public.lsn_articles for insert
  to authenticated
  with check (
    (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin','director','deputy')
      )
    )
    or (
      author_id = auth.uid()
      and status = 'draft'
      and lower(type) = 'news'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'journalist'
      )
    )
  );

drop policy if exists "Authors update articles" on public.lsn_articles;
create policy "Authors update articles"
  on public.lsn_articles for update
  to authenticated
  using (
    (
      author_id = auth.uid()
      and status = 'draft'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','director','deputy')
    )
  )
  with check (
    (
      author_id = auth.uid()
      and status = 'draft'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','director','deputy')
    )
  );

drop policy if exists "Authors delete articles" on public.lsn_articles;
create policy "Authors delete articles"
  on public.lsn_articles for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','director','deputy')
    )
  );

-- ---------- SITE BANNERS ----------
create table if not exists public.lsn_site_banners (
  banner_key text primary key,
  label text not null default 'Новости',
  message text not null default '',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.lsn_site_banners enable row level security;
revoke all on public.lsn_site_banners from anon, authenticated;
grant select on public.lsn_site_banners to anon, authenticated;
grant insert, update, delete on public.lsn_site_banners to authenticated;

drop policy if exists "Public read banners" on public.lsn_site_banners;
create policy "Public read banners"
  on public.lsn_site_banners for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Management manage banners" on public.lsn_site_banners;
create policy "Management manage banners"
  on public.lsn_site_banners for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','director','deputy')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','director','deputy')
  ));

-- ---------- ARTICLE IMAGE STORAGE ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "Article images public read" on storage.objects;
create policy "Article images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'article-images');

drop policy if exists "Article images owner upload" on storage.objects;
create policy "Article images owner upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'article-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'director', 'deputy', 'journalist')
    )
  );

drop policy if exists "Article images owner update" on storage.objects;
create policy "Article images owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'article-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'director', 'deputy')
      )
    )
  )
  with check (
    bucket_id = 'article-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Article images owner delete" on storage.objects;
create policy "Article images owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'article-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'director', 'deputy')
      )
    )
  );

-- ---------- RADIO RATING ----------
create table if not exists public.lsn_radio_ratings (
  id text primary key default 'official_rating',
  ratings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.lsn_radio_ratings enable row level security;
revoke all on public.lsn_radio_ratings from anon, authenticated;
grant select on public.lsn_radio_ratings to anon, authenticated;
grant insert, update on public.lsn_radio_ratings to authenticated;

drop policy if exists "Public read ratings" on public.lsn_radio_ratings;
drop policy if exists "Management update ratings" on public.lsn_radio_ratings;
drop policy if exists "lsn_radio_ratings_select" on public.lsn_radio_ratings;
drop policy if exists "lsn_radio_ratings_update" on public.lsn_radio_ratings;

create policy "lsn_radio_ratings_select"
  on public.lsn_radio_ratings for select
  to anon, authenticated
  using (true);

create policy "lsn_radio_ratings_update"
  on public.lsn_radio_ratings for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','director','deputy','journalist')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','director','deputy','journalist')
  ));

insert into public.lsn_radio_ratings (id, ratings)
values (
  'official_rating',
  '{
    "lsn": {"name": "Los Santos News", "freq": "102.2 FM", "rating": 4820, "ratingDelta": "+185", "listeners": 1420, "listenersDelta": "+120", "broadcasts": 46, "awards": 12},
    "sfn": {"name": "San Fierro News", "freq": "103.3 FM", "rating": 3950, "ratingDelta": "+65", "listeners": 980, "listenersDelta": "-40", "broadcasts": 38, "awards": 8},
    "lvn": {"name": "Las Venturas News", "freq": "104.4 FM", "rating": 3610, "ratingDelta": "-20", "listeners": 870, "listenersDelta": "+15", "broadcasts": 32, "awards": 6}
  }'::jsonb
)
on conflict (id) do nothing;

-- Keep compatibility fields synchronized when the legacy editor writes them.
create or replace function public.lsn_sync_article_fields()
returns trigger
language plpgsql
as $$
begin
  if new.excerpt is null or new.excerpt = '' then
    new.excerpt := coalesce(new.lead, '');
  end if;
  if new.lead is null or new.lead = '' then
    new.lead := coalesce(new.excerpt, '');
  end if;
  if new.author_name is null or new.author_name = '' then
    new.author_name := coalesce(new.author, 'Редакция Los Santos News');
  end if;
  if new.author is null or new.author = '' then
    new.author := coalesce(new.author_name, 'Редакция Los Santos News');
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lsn_sync_article_fields on public.lsn_articles;
create trigger lsn_sync_article_fields
before insert or update on public.lsn_articles
for each row execute function public.lsn_sync_article_fields();

notify pgrst, 'reload schema';
