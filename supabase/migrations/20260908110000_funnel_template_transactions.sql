-- Transactional funnel template operations. Function calls are atomic in PostgreSQL.

create or replace function public.replace_funnel_page_template(
  p_page_id uuid,
  p_theme jsonb,
  p_blocks jsonb
)
returns public.funnel_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.funnel_pages%rowtype;
  v_account_id uuid;
  v_block jsonb;
  v_index integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_page_id is null then
    raise exception 'Page id is required' using errcode = '22023';
  end if;
  if p_theme is null or jsonb_typeof(p_theme) <> 'object' then
    raise exception 'Theme must be a JSON object' using errcode = '22023';
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Blocks must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_blocks) > 100 then
    raise exception 'A page template cannot contain more than 100 blocks' using errcode = '22023';
  end if;

  select p.*
    into v_page
  from public.funnel_pages p
  where p.id = p_page_id
  for update;

  if not found then
    raise exception 'Funnel page not found' using errcode = 'P0002';
  end if;

  select f.account_id
    into v_account_id
  from public.funnels f
  where f.id = v_page.funnel_id;
  if not public.has_account_role(
    v_account_id,
    array['owner', 'admin', 'editor', 'host']
  ) then
    raise exception 'Not authorized to edit this funnel page' using errcode = '42501';
  end if;
  if v_page.step_type = 'waiting_room' and not exists (
    select 1
    from jsonb_array_elements(p_blocks) item
    where item->>'block_type' = 'waiting_room_system'
  ) then
    raise exception 'Waiting room templates must include the system waiting_room block' using errcode = '22023';
  end if;

  for v_block, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_blocks) with ordinality
  loop
    if jsonb_typeof(v_block) <> 'object'
      or nullif(trim(v_block->>'block_type'), '') is null
      or coalesce(jsonb_typeof(v_block->'content'), 'object') <> 'object'
      or coalesce(jsonb_typeof(v_block->'settings'), 'object') <> 'object'
    then
      raise exception 'Invalid block at index %', v_index using errcode = '22023';
    end if;
  end loop;

  update public.funnel_pages
  set theme = p_theme, updated_at = now()
  where id = p_page_id
  returning * into v_page;

  delete from public.funnel_blocks where page_id = p_page_id;

  insert into public.funnel_blocks (page_id, block_type, sort_order, content, settings)
  select
    p_page_id,
    trim(value->>'block_type'),
    ordinality::integer - 1,
    coalesce(value->'content', '{}'::jsonb),
    coalesce(value->'settings', '{}'::jsonb)
  from jsonb_array_elements(p_blocks) with ordinality;

  return v_page;
end;
$$;

revoke all on function public.replace_funnel_page_template(uuid, jsonb, jsonb) from public;
grant execute on function public.replace_funnel_page_template(uuid, jsonb, jsonb) to authenticated;

create or replace function public.create_funnel_with_pages(
  p_account_id uuid,
  p_name text,
  p_slug text,
  p_webinar_id uuid default null,
  p_page_templates jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funnel public.funnels%rowtype;
  v_page public.funnel_pages%rowtype;
  v_page_spec jsonb;
  v_pages jsonb := '[]'::jsonb;
  v_step public.funnel_step_type;
  v_name text;
  v_path text;
  v_default boolean;
  v_blocks jsonb;
  v_theme jsonb;
  v_block jsonb;
  v_index integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_account_id is null or nullif(trim(p_name), '') is null or nullif(trim(p_slug), '') is null then
    raise exception 'Account, name, and slug are required' using errcode = '22023';
  end if;
  if not public.has_account_role(
    p_account_id,
    array['owner', 'admin', 'editor', 'host']
  ) then
    raise exception 'Not authorized to create funnels for this account' using errcode = '42501';
  end if;
  if p_webinar_id is not null and not exists (
    select 1 from public.webinars w where w.id = p_webinar_id and w.account_id = p_account_id
  ) then
    raise exception 'Webinar does not belong to the account' using errcode = '23503';
  end if;
  if p_page_templates is null or jsonb_typeof(p_page_templates) <> 'object' then
    raise exception 'Page templates must be a JSON object' using errcode = '22023';
  end if;

  insert into public.funnels (account_id, name, slug, status, webinar_id)
  values (p_account_id, trim(p_name), trim(p_slug), 'draft', p_webinar_id)
  returning * into v_funnel;

  for v_step, v_name, v_path, v_default in
    values
      ('registration'::public.funnel_step_type, 'Registration'::text, 'registration'::text, true),
      ('waiting_room'::public.funnel_step_type, 'Waiting room'::text, 'waiting-room'::text, false),
      ('webinar_room'::public.funnel_step_type, 'Webinar room'::text, 'room'::text, false),
      ('offer'::public.funnel_step_type, 'Offer'::text, 'offer'::text, false)
  loop
    v_page_spec := coalesce(p_page_templates->(v_step::text), '{}'::jsonb);
    if jsonb_typeof(v_page_spec) <> 'object' then
      raise exception 'Template for % must be a JSON object', v_step using errcode = '22023';
    end if;

    v_theme := coalesce(v_page_spec->'theme', jsonb_build_object(
      'background_type', 'color', 'background_color', '#f8fafc',
      'content_width', 800, 'content_panel_enabled', true,
      'content_background_color', '#ffffff', 'content_border_radius', 24,
      'content_shadow', 'medium'
    ));
    if jsonb_typeof(v_theme) <> 'object' then
      raise exception 'Theme for % must be a JSON object', v_step using errcode = '22023';
    end if;

    v_blocks := v_page_spec->'blocks';
    if v_blocks is null then
      v_blocks := case v_step
        when 'registration' then jsonb_build_array(
          jsonb_build_object('block_type', 'webinar_hero', 'content', jsonb_build_object('eyebrow', 'Free webinar', 'title', 'Reserve your seat', 'subtitle', 'Join us for a practical live session.', 'buttonText', 'Register for free', 'buttonAction', 'registration', 'showCountdown', true), 'settings', jsonb_build_object('column_span', 12, 'width_mode', 'viewport')),
          jsonb_build_object('block_type', 'registration_form', 'content', jsonb_build_object('title', 'Reserve your seat', 'buttonText', 'Register for free', 'collectName', true, 'registrationMethod', 'inherit', 'successMessage', 'You are registered!'), 'settings', '{}'::jsonb)
        )
        when 'waiting_room' then jsonb_build_array(
          jsonb_build_object('block_type', 'hero', 'content', jsonb_build_object('title', 'We are starting soon', 'subtitle', 'Stay on this page.', 'align', 'center'), 'settings', '{}'::jsonb),
          jsonb_build_object('block_type', 'waiting_room_system', 'content', jsonb_build_object('title', 'We are starting soon', 'message', 'The broadcast will begin automatically.', 'system', true), 'settings', '{}'::jsonb),
          jsonb_build_object('block_type', 'countdown', 'content', jsonb_build_object('mode', 'fixed', 'target', null, 'style', 'cards'), 'settings', '{}'::jsonb)
        )
        when 'webinar_room' then jsonb_build_array(
          jsonb_build_object('block_type', 'video', 'content', jsonb_build_object('url', '', 'provider', 'custom'), 'settings', '{}'::jsonb),
          jsonb_build_object('block_type', 'chat', 'content', jsonb_build_object('title', 'Live chat'), 'settings', '{}'::jsonb)
        )
        else jsonb_build_array(
          jsonb_build_object('block_type', 'hero', 'content', jsonb_build_object('title', 'Choose your next step', 'subtitle', 'Continue your progress today.', 'align', 'center'), 'settings', '{}'::jsonb),
          jsonb_build_object('block_type', 'offer', 'content', jsonb_build_object('title', 'Special offer', 'price', '€99', 'tiers', jsonb_build_array(
            jsonb_build_object('id', 'basic', 'name', 'Basic', 'price', '€49', 'description', 'A strong start', 'features', jsonb_build_array('Core program', 'Practical exercises'), 'featured', false, 'currency', 'EUR', 'oldPrice', '', 'badge', '', 'buttonText', 'Choose plan', 'buttonUrl', '#'),
            jsonb_build_object('id', 'standard', 'name', 'Standard', 'price', '€99', 'description', 'Best value', 'features', jsonb_build_array('Everything in Basic', 'Bonus templates', 'Group Q&A'), 'featured', true, 'currency', 'EUR', 'oldPrice', '', 'badge', '', 'buttonText', 'Choose plan', 'buttonUrl', '#'),
            jsonb_build_object('id', 'pro', 'name', 'Pro', 'price', '€249', 'description', 'Maximum results', 'features', jsonb_build_array('Everything in Standard', 'Private consultation'), 'featured', false, 'currency', 'EUR', 'oldPrice', '', 'badge', '', 'buttonText', 'Choose plan', 'buttonUrl', '#')
          )), 'settings', '{}'::jsonb)
        )
      end;
    end if;
    if jsonb_typeof(v_blocks) <> 'array' or jsonb_array_length(v_blocks) > 100 then
      raise exception 'Blocks for % must be an array of at most 100 items', v_step using errcode = '22023';
    end if;
    if v_step = 'waiting_room' and not exists (
      select 1 from jsonb_array_elements(v_blocks) item where item->>'block_type' = 'waiting_room_system'
    ) then
      raise exception 'Waiting room templates must include the system waiting_room block' using errcode = '22023';
    end if;

    for v_block, v_index in
      select value, ordinality::integer - 1 from jsonb_array_elements(v_blocks) with ordinality
    loop
      if jsonb_typeof(v_block) <> 'object'
        or nullif(trim(v_block->>'block_type'), '') is null
        or coalesce(jsonb_typeof(v_block->'content'), 'object') <> 'object'
        or coalesce(jsonb_typeof(v_block->'settings'), 'object') <> 'object'
      then
        raise exception 'Invalid % block at index %', v_step, v_index using errcode = '22023';
      end if;
    end loop;

    insert into public.funnel_pages (funnel_id, name, step_type, path, is_default, theme)
    values (v_funnel.id, v_name, v_step, v_path, v_default, v_theme)
    returning * into v_page;

    insert into public.funnel_blocks (page_id, block_type, sort_order, content, settings)
    select v_page.id, trim(value->>'block_type'), ordinality::integer - 1,
      coalesce(value->'content', '{}'::jsonb), coalesce(value->'settings', '{}'::jsonb)
    from jsonb_array_elements(v_blocks) with ordinality;

    v_pages := v_pages || jsonb_build_array(to_jsonb(v_page));
  end loop;

  return jsonb_build_object('funnel', to_jsonb(v_funnel), 'pages', v_pages);
end;
$$;

revoke all on function public.create_funnel_with_pages(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.create_funnel_with_pages(uuid, text, text, uuid, jsonb) to authenticated;
