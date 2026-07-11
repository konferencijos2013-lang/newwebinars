-- -----------------------------------------------------------------
-- AI assistant: prompts, threads, and message history
-- -----------------------------------------------------------------

create type public.ai_prompt_scope as enum (
  'global',
  'webinar',
  'funnel',
  'chat_script',
  'support'
);

create table public.ai_prompts (
  id uuid primary key default gen_random_uuid (),
  account_id uuid references public.accounts (id) on delete cascade,
  scope public.ai_prompt_scope not null default 'global',
  scope_id uuid,
  name text not null,
  system_prompt text,
  user_prompt_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index idx_ai_prompts_account_scope on public.ai_prompts (account_id, scope, scope_id);

comment on table public.ai_prompts is 'Stored AI prompts and prompt templates.';

create table public.ai_threads (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New chat',
  scope public.ai_prompt_scope not null default 'global',
  scope_id uuid,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index idx_ai_threads_account_user on public.ai_threads (account_id, user_id);

comment on table public.ai_threads is 'Conversation threads for the AI assistant.';

create table public.ai_messages (
  id uuid primary key default gen_random_uuid (),
  thread_id uuid not null references public.ai_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tokens_used int,
  metadata jsonb default '{}',
  created_at timestamptz not null default now ()
);

create index idx_ai_messages_thread_id on public.ai_messages (thread_id, created_at desc);

comment on table public.ai_messages is 'Messages inside an AI assistant thread.';

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.ai_prompts enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;

grant select, insert, update, delete on public.ai_prompts to authenticated;
grant select, insert, update, delete on public.ai_threads to authenticated;
grant select, insert on public.ai_messages to authenticated;

drop policy if exists "AI prompts: account members can view" on public.ai_prompts;
create policy "AI prompts: account members can view"
  on public.ai_prompts
  for select
  to authenticated
  using (account_id is null or public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "AI prompts: editors can manage" on public.ai_prompts;
create policy "AI prompts: editors can manage"
  on public.ai_prompts
  for all
  to authenticated
  using (
    (account_id is not null and public.has_account_role (account_id, array['owner', 'admin', 'editor']))
    or public.is_platform_admin ()
  )
  with check (
    (account_id is not null and public.has_account_role (account_id, array['owner', 'admin', 'editor']))
    or public.is_platform_admin ()
  );

drop policy if exists "AI threads: owner can manage" on public.ai_threads;
create policy "AI threads: owner can manage"
  on public.ai_threads
  for all
  to authenticated
  using (
    (auth.uid () = user_id and public.is_account_member (account_id))
    or public.is_platform_admin ()
  )
  with check (
    (auth.uid () = user_id and public.is_account_member (account_id))
    or public.is_platform_admin ()
  );

drop policy if exists "AI messages: thread owner can manage" on public.ai_messages;
create policy "AI messages: thread owner can manage"
  on public.ai_messages
  for all
  to authenticated
  using (
    public.is_account_member ((select account_id from public.ai_threads where id = thread_id))
    or public.is_platform_admin ()
  );
