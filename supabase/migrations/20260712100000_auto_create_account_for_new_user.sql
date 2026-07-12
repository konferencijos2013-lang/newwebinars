-- -----------------------------------------------------------------
-- Auto-create a default account + owner membership for new users.
-- -----------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_account_id uuid;
  base_slug text;
  final_slug text;
  counter integer := 0;
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

  -- Create a default account for the new user if they don't already have one.
  if not exists (
    select 1 from public.account_members where user_id = new.id
  ) then
    new_account_id := gen_random_uuid ();
    base_slug := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := regexp_replace(base_slug, '^-|-$', '', 'g');
    if length(base_slug) = 0 or base_slug is null then
      base_slug := 'workspace';
    end if;
    final_slug := base_slug;

    -- Ensure unique slug.
    while exists (select 1 from public.accounts where slug = final_slug) loop
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    end loop;

    insert into public.accounts (id, slug, name, owner_id, plan)
    values (
      new_account_id,
      final_slug,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)) || '''s workspace',
      new.id,
      'free'
    );

    insert into public.account_members (account_id, user_id, role, joined_at)
    values (new_account_id, new.id, 'owner', now ());
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user () is 'Keeps public.profiles in sync with auth.users and creates a default account + owner membership.';

-- Backfill existing users that have a profile but no account.
insert into public.accounts (id, slug, name, owner_id, plan)
select
  gen_random_uuid (),
  lower(regexp_replace(coalesce(p.full_name, split_part(p.email, '@', 1)), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(p.id::text, 1, 8),
  coalesce(p.full_name, split_part(p.email, '@', 1)) || '''s workspace',
  p.id,
  'free'
from public.profiles p
where not exists (
  select 1 from public.account_members am where am.user_id = p.id
)
and not exists (
  select 1 from public.accounts a where a.owner_id = p.id
);

insert into public.account_members (account_id, user_id, role, joined_at)
select a.id, a.owner_id, 'owner', now ()
from public.accounts a
where not exists (
  select 1 from public.account_members am where am.account_id = a.id and am.user_id = a.owner_id
)
on conflict (account_id, user_id) do nothing;
