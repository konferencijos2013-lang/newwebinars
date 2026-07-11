-- -----------------------------------------------------------------
-- Auth profile sync + RLS cleanup
-- -----------------------------------------------------------------

-- Fix recursion: profile select policy used a subquery back to profiles.
-- Use the existing SECURITY DEFINER helper instead.

drop policy if exists "Profiles: own or platform admin can view" on public.profiles;

create policy "Profiles: own or platform admin can view"
  on public.profiles
  for select
  to authenticated
  using (auth.uid () = id or public.is_platform_admin ());

-- Keep the existing "own can update" policy; it does not recurse.

-- -----------------------------------------------------------------
-- Auto-create a public profile row when Supabase Auth creates a user.
-- -----------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, avatar_url)
  values (
    new.id,
    new.email,
    coalesce (
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part (new.email, '@', 1)
    ),
    'guest',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now ();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();

comment on function public.handle_new_user () is 'Keeps public.profiles in sync with auth.users. SECURITY DEFINER so it can insert despite RLS.';
