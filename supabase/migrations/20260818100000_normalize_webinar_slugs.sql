-- Stable ASCII webinar URLs with automatic conflict suffixes.
create or replace function public.normalize_webinar_slug(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(
        translate(lower(coalesce(p_value, '')), 'ąčęėįšųūž', 'aceeisuuz'),
        '[^a-z0-9]+', '-', 'g'
      )),
      ''
    ),
    'webinar'
  );
$$;

create or replace function public.ensure_unique_webinar_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix integer := 2;
begin
  base_slug := public.normalize_webinar_slug(new.slug);
  candidate_slug := base_slug;

  while exists (
    select 1 from public.webinars w
    where w.slug = candidate_slug
      and w.id is distinct from new.id
  ) loop
    candidate_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  end loop;

  new.slug := candidate_slug;
  return new;
end;
$$;

drop trigger if exists trg_ensure_unique_webinar_slug on public.webinars;
create trigger trg_ensure_unique_webinar_slug
before insert or update of slug on public.webinars
for each row execute function public.ensure_unique_webinar_slug();

-- Correct existing non-ASCII links, including the webinar already created.
update public.webinars
set slug = slug
where slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
