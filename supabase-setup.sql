-- =========================================================
-- LOS SANTOS NEWS — ПОЛНАЯ СХЕМА SUPABASE ДЛЯ ПОРТАЛА
-- Проект: https://kahtjjlnivxkyynfjtyd.supabase.co
-- Администратор: deeeenchik80@gmail.com
-- =========================================================

-- 1. ТАБЛИЦА ПРОФИЛЕЙ ПОЛЬЗОВАТЕЛЕЙ
-- Хранит игровые никнеймы (без _), персональный ID (USR-101...) и роли
drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id_code text unique not null,
  username text unique not null,
  email text,
  role text check (role in ('admin', 'leader', 'deputy', 'journalist')),
  role_title text default 'Читатель',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Включаем RLS
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

-- Публичный доступ на чтение профилей (для авторства, редакции и состава)
drop policy if exists "Public profiles read" on public.profiles;
create policy "Public profiles read"
  on public.profiles
  for select to anon, authenticated
  using (true);

-- Пользователи могут обновлять свой собственный профиль
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Руководство (Admin, Leader, Deputy) может обновлять роли в соответствии с иерархией
drop policy if exists "Management update profiles" on public.profiles;
create policy "Management update profiles"
  on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'leader', 'deputy')
    )
  );

-- 2. АВТОМАТИЧЕСКИЙ ТРИГГЕР НА РЕГИСТРАЦИЮ В AUTH.USERS
-- Создаёт профиль, выдаёт ID USR-101+, нормализует никнейм и делает deeeenchik80@gmail.com Администратором
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_num int;
  raw_name text;
  clean_name text;
  is_admin boolean;
begin
  -- Вычисляем следующий USR-ID
  select coalesce(max(substring(user_id_code from 5)::int), 100) + 1
  into next_num
  from public.profiles;

  raw_name := trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  -- Заменяем _ на пробел для естественных никнеймов
  clean_name := regexp_replace(raw_name, '_', ' ', 'g');
  if clean_name = '' then
    clean_name := 'User ' || next_num;
  end if;

  -- Проверка на главного администратора
  is_admin := (lower(new.email) = 'deeeenchik80@gmail.com');

  insert into public.profiles (
    id,
    user_id_code,
    username,
    email,
    role,
    role_title
  )
  values (
    new.id,
    'USR-' || next_num,
    clean_name,
    new.email,
    case when is_admin then 'admin' else null end,
    case when is_admin then '🛡️ Администратор' else 'Читатель' end
  )
  on conflict (id) do update set
    email = excluded.email,
    role = case when is_admin then 'admin' else public.profiles.role end,
    role_title = case when is_admin then '🛡️ Администратор' else public.profiles.role_title end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- На случай если пользователь deeeenchik80@gmail.com уже существует в auth.users:
do $$
declare
  admin_user record;
  next_num int;
begin
  for admin_user in select * from auth.users where lower(email) = 'deeeenchik80@gmail.com' loop
    select coalesce(max(substring(user_id_code from 5)::int), 100) + 1 into next_num from public.profiles;
    insert into public.profiles (id, user_id_code, username, email, role, role_title)
    values (
      admin_user.id,
      'USR-' || next_num,
      coalesce(nullif(regexp_replace(admin_user.raw_user_meta_data ->> 'username', '_', ' ', 'g'), ''), 'Admin LSN'),
      admin_user.email,
      'admin',
      '🛡️ Администратор'
    )
    on conflict (id) do update
    set role = 'admin', role_title = '🛡️ Администратор';
  end loop;
end;
$$;

-- 3. ТАБЛИЦА ПУБЛИКАЦИЙ (НОВОСТИ, РЕКЛАМА, КОЛОНКИ, ДОСЬЕ)
create table if not exists public.lsn_articles (
  id text primary key,
  type text not null check (type in ('news', 'ad', 'column', 'staff')),
  title text not null,
  category text not null default 'Новости',
  lead text not null default '',
  body text not null default '',
  author text not null default 'Редакция Los Santos News',
  author_id uuid references auth.users (id) on delete set null,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lsn_articles enable row level security;
revoke all on public.lsn_articles from anon, authenticated;
grant select on public.lsn_articles to anon, authenticated;
grant insert, update, delete on public.lsn_articles to authenticated;

drop policy if exists "Public read articles" on public.lsn_articles;
create policy "Public read articles"
  on public.lsn_articles
  for select to anon, authenticated
  using (true);

drop policy if exists "Journalists and management insert articles" on public.lsn_articles;
create policy "Journalists and management insert articles"
  on public.lsn_articles
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'leader', 'deputy', 'journalist')
    )
  );

drop policy if exists "Authors and management update articles" on public.lsn_articles;
create policy "Authors and management update articles"
  on public.lsn_articles
  for update to authenticated
  using (
    author_id = (select auth.uid()) or
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'leader', 'deputy')
    )
  );

drop policy if exists "Authors and management delete articles" on public.lsn_articles;
create policy "Authors and management delete articles"
  on public.lsn_articles
  for delete to authenticated
  using (
    author_id = (select auth.uid()) or
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'leader', 'deputy')
    )
  );

-- 4. ТАБЛИЦА РЕЙТИНГА РАДИОСТАНЦИЙ SAMP-RP
create table if not exists public.lsn_radio_ratings (
  id text primary key default 'official_rating',
  ratings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.lsn_radio_ratings enable row level security;
revoke all on public.lsn_radio_ratings from anon, authenticated;
grant select on public.lsn_radio_ratings to anon, authenticated;
grant insert, update on public.lsn_radio_ratings to authenticated;

drop policy if exists "Public read ratings" on public.lsn_radio_ratings;
create policy "Public read ratings"
  on public.lsn_radio_ratings
  for select to anon, authenticated
  using (true);

drop policy if exists "Management update ratings" on public.lsn_radio_ratings;
create policy "Management update ratings"
  on public.lsn_radio_ratings
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'leader', 'deputy')
    )
  );

-- Вставляем начальные показатели рейтинга San Andreas
insert into public.lsn_radio_ratings (id, ratings)
values (
  'official_rating',
  '{
    "lsn": { "name": "Los Santos News", "freq": "102.2 FM", "rating": 4820, "ratingDelta": "+185", "listeners": 1420, "listenersDelta": "+120", "broadcasts": 46, "awards": 12 },
    "sfn": { "name": "San Fierro News", "freq": "103.3 FM", "rating": 3950, "ratingDelta": "+65", "listeners": 980, "listenersDelta": "-40", "broadcasts": 38, "awards": 8 },
    "lvn": { "name": "Las Venturas News", "freq": "104.4 FM", "rating": 3610, "ratingDelta": "-20", "listeners": 870, "listenersDelta": "+15", "broadcasts": 32, "awards": 6 }
  }'::jsonb
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
