-- Migration 0010 - Harden profile creation on auth sign-up.
-- Idempotent: safe to run more than once.
--
-- Supabase Auth surfaces trigger failures as "Database error creating new user".
-- Keep this trigger explicit about schemas/search_path so auth.users inserts
-- can always find the public profiles table and function.

alter table public.profiles
  add column if not exists user_type text;

update public.profiles
set user_type = 'owner'
where user_type is null;

alter table public.profiles
  alter column user_type set default 'owner',
  alter column user_type set not null;

do $$
begin
  alter table public.profiles
    add constraint profiles_user_type_check
    check (user_type in ('owner', 'member'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, display_name, user_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'owner'
  )
  on conflict (id) do update
  set display_name = coalesce(excluded.display_name, public.profiles.display_name),
      user_type = coalesce(public.profiles.user_type, excluded.user_type);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
