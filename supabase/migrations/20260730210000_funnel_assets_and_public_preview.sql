-- Public assets and read-only rendering for published funnel pages.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'funnel-assets',
  'funnel-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Funnel assets: editors upload own account folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'funnel-assets'
    and (storage.foldername(name))[1] in (
      select account_id::text from public.account_members where user_id = auth.uid()
    )
  );

create policy "Funnel assets: public read"
  on storage.objects for select to public
  using (bucket_id = 'funnel-assets');

create or replace function public.get_published_funnel_page(
  funnel_slug text,
  page_path text
)
returns table (funnel_name text, page_name text, blocks jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.name,
    p.name,
    coalesce(
      jsonb_agg(to_jsonb(b) order by b.sort_order) filter (where b.id is not null),
      '[]'::jsonb
    )
  from public.funnels f
  join public.funnel_pages p on p.funnel_id = f.id
  left join public.funnel_blocks b on b.page_id = p.id
  where f.slug = funnel_slug
    and p.path = page_path
    and f.status = 'published'
  group by f.id, f.name, p.id, p.name
$$;

grant execute on function public.get_published_funnel_page(text, text) to anon, authenticated;
