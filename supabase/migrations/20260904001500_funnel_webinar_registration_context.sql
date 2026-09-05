-- Include the linked webinar context required by functional funnel registration blocks.
drop function if exists public.get_published_funnel_page(text, text);

create function public.get_published_funnel_page(
  funnel_slug text,
  page_path text
)
returns table (
  funnel_name text,
  page_name text,
  theme jsonb,
  blocks jsonb,
  webinar_id uuid,
  webinar_slug text,
  webinar_scheduled_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.name,
    p.name,
    coalesce(p.theme, '{}'::jsonb),
    coalesce(
      jsonb_agg(to_jsonb(b) order by b.sort_order) filter (where b.id is not null),
      '[]'::jsonb
    ),
    w.id,
    w.slug,
    w.scheduled_at
  from public.funnels f
  join public.funnel_pages p on p.funnel_id = f.id
  left join public.funnel_blocks b on b.page_id = p.id
  left join public.webinars w on w.id = f.webinar_id and w.status = 'published'
  where f.slug = funnel_slug
    and p.path = page_path
    and f.status = 'published'
  group by f.id, f.name, p.id, p.name, p.theme, w.id, w.slug, w.scheduled_at
$$;

grant execute on function public.get_published_funnel_page(text, text) to anon, authenticated;
