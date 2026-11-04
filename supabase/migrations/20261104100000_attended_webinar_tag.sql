-- When someone enters a webinar room, tag their email and Telegram contact
-- with an ASCII name derived from the webinar slug: attended-{slug}.

create or replace function public.assign_attended_webinar_tag(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.registrations;
  v_account_id uuid;
  v_slug text;
  v_name text;
  v_tag_id uuid;
  v_email_id uuid;
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if v_reg.id is null or v_reg.joined_webinar_at is null then
    return;
  end if;

  select w.account_id,
         lower(regexp_replace(w.slug, '[^a-zA-Z0-9-]', '', 'g'))
    into v_account_id, v_slug
  from public.webinars w
  where w.id = v_reg.webinar_id;
  if v_account_id is null or coalesce(v_slug, '') = '' then
    return;
  end if;

  v_name := left('attended-' || v_slug, 40);
  if v_name !~ '^[a-z0-9-]+$' then
    return;
  end if;

  insert into public.contact_tags (account_id, name)
  values (v_account_id, v_name)
  on conflict (account_id, lower(name)) do nothing;

  select id into v_tag_id
  from public.contact_tags
  where account_id = v_account_id and lower(name) = v_name;
  if v_tag_id is null then
    return;
  end if;

  if nullif(lower(trim(coalesce(v_reg.email, ''))), '') is not null then
    select id into v_email_id
    from public.email_contacts
    where account_id = v_account_id
      and email = lower(trim(v_reg.email));
    if v_email_id is not null then
      insert into public.email_contact_tags (email_contact_id, tag_id)
      values (v_email_id, v_tag_id)
      on conflict do nothing;
    end if;
  end if;

  if v_reg.telegram_contact_id is not null then
    insert into public.telegram_contact_tags (telegram_contact_id, tag_id)
    select contact.id, v_tag_id
    from public.telegram_contacts contact
    where contact.id = v_reg.telegram_contact_id
      and contact.account_id = v_account_id
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.assign_attended_webinar_tag(uuid) from public;

create or replace function public.registrations_assign_attended_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.joined_webinar_at is not null
     and (tg_op = 'INSERT' or old.joined_webinar_at is null) then
    perform public.assign_attended_webinar_tag(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_assign_attended_tag on public.registrations;
create trigger registrations_assign_attended_tag
  after insert or update of joined_webinar_at on public.registrations
  for each row execute function public.registrations_assign_attended_tag();

select public.assign_attended_webinar_tag(id)
from public.registrations
where joined_webinar_at is not null;
