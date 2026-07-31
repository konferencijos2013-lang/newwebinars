-- Platform administrator foundation: an immutable audit ledger and safe, compact read models.

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  account_id uuid references public.accounts(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is 'Append-only platform administration action log. Every privileged mutation must create a record.';

create index idx_admin_audit_logs_created_at on public.admin_audit_logs(created_at desc);
create index idx_admin_audit_logs_account_id on public.admin_audit_logs(account_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
grant select, insert on public.admin_audit_logs to authenticated;

create policy "Admin audit logs: platform admin read"
  on public.admin_audit_logs for select to authenticated
  using (public.is_platform_admin());

-- Inserts are limited to a caller recording their own action. Privileged Edge
-- Functions will later use the service role and set actor_id explicitly.
create policy "Admin audit logs: platform admin append"
  on public.admin_audit_logs for insert to authenticated
  with check (public.is_platform_admin() and actor_id = auth.uid());

create or replace function public.get_platform_admin_overview()
returns table (
  accounts_count bigint,
  users_count bigint,
  paid_subscriptions_count bigint,
  past_due_subscriptions_count bigint,
  payments_cents bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.accounts),
    (select count(*) from public.profiles),
    (select count(*) from public.subscriptions where status in ('active', 'trialing')),
    (select count(*) from public.subscriptions where status = 'past_due'),
    (select coalesce(sum(amount_cents), 0) from public.payments where status = 'succeeded');
$$;

grant execute on function public.get_platform_admin_overview() to authenticated;
