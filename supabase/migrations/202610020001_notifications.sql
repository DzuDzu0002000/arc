-- In-app notifications: one row per recipient, so each person has their own read state.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  bug_id uuid references public.bugs(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_account_idx on public.notifications(account_id, created_at desc);
create index notifications_unread_idx on public.notifications(account_id) where read_at is null;

-- Same model as the other tables: only the server (service role) reads and writes.
alter table public.notifications enable row level security;
