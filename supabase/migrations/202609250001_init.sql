-- Bugline MVP schema. Every table is reached only through the server with the service role:
-- RLS is enabled with no policies, so the anon/public key can read or write nothing.

create extension if not exists pgcrypto;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  -- The only identity key. Circle verifies it; email is self-reported and never used for access.
  circle_user_id text not null unique,
  email text,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.sessions (
  sid uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  circle_user_token text not null,
  circle_refresh_token text,
  circle_device_id text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_account_idx on public.sessions(account_id);

create table public.wallets (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  circle_wallet_id text not null unique,
  address text not null unique check (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now()
);

create table public.otp_requests (
  id bigint generated always as identity primary key,
  email text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index otp_requests_email_idx on public.otp_requests(email, created_at);
create index otp_requests_ip_idx on public.otp_requests(ip, created_at);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.accounts(id),
  job_type text not null default 'bug_test' check (job_type in ('bug_test')),
  title text not null check (char_length(title) between 5 and 120),
  product_name text not null check (char_length(product_name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 5000),
  scope_in text not null default '' check (char_length(scope_in) <= 3000),
  scope_out text not null default '' check (char_length(scope_out) <= 3000),
  test_url text check (test_url is null or test_url ~ '^https://'),
  platforms text[] not null default '{}',
  tester_slots int not null check (tester_slots between 1 and 500),
  budget numeric(20,6) not null check (budget > 0),
  ends_at timestamptz not null,
  response_hours int not null default 120 check (response_hours between 24 and 336),
  status text not null default 'draft' check (status in ('draft', 'funding', 'open', 'closed', 'settled')),
  escrow_id text not null unique check (escrow_id ~ '^0x[0-9a-f]{64}$'),
  fund_challenge_id text,
  fund_tx text unique,
  withdraw_challenge_id text,
  withdraw_tx text unique,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_status_idx on public.campaigns(status, ends_at);
create index campaigns_owner_idx on public.campaigns(owner_account_id);

create table public.campaign_payouts (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  amount numeric(20,6) not null check (amount > 0),
  primary key (campaign_id, severity)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tester_account_id uuid not null references public.accounts(id),
  message text not null default '' check (char_length(message) <= 1000),
  devices text not null default '' check (char_length(devices) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'removed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, tester_account_id)
);

create table public.bugs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tester_account_id uuid not null references public.accounts(id),
  title text not null check (char_length(title) between 5 and 160),
  steps text not null check (char_length(steps) between 10 and 5000),
  expected text not null check (char_length(expected) <= 2000),
  actual text not null check (char_length(actual) <= 2000),
  environment text not null check (char_length(environment) <= 300),
  evidence_urls text[] not null default '{}',
  severity_claimed text not null check (severity_claimed in ('critical', 'high', 'medium', 'low')),
  severity_final text check (severity_final in ('critical', 'high', 'medium', 'low')),
  status text not null default 'submitted' check (status in ('submitted', 'needs_info', 'accepted', 'rejected', 'disputed', 'rejected_final', 'paid')),
  reject_reason text check (reject_reason in ('duplicate', 'out_of_scope', 'cannot_reproduce', 'not_a_bug', 'low_quality')),
  reject_note text check (char_length(reject_note) <= 1000),
  duplicate_of uuid references public.bugs(id),
  response_due_at timestamptz,
  dispute_due_at timestamptz,
  decided_at timestamptz,
  decided_by text check (decided_by in ('owner', 'timeout', 'admin')),
  payout_amount numeric(20,6),
  payout_challenge_id text,
  payout_tx text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or reject_reason is not null),
  check (reject_reason <> 'duplicate' or duplicate_of is not null)
);
create index bugs_campaign_idx on public.bugs(campaign_id, status);
create index bugs_tester_idx on public.bugs(tester_account_id, created_at desc);
create index bugs_due_idx on public.bugs(status, response_due_at);

create table public.bug_messages (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null references public.bugs(id) on delete cascade,
  author_account_id uuid not null references public.accounts(id),
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index bug_messages_bug_idx on public.bug_messages(bug_id, created_at);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null unique references public.bugs(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid references public.accounts(id),
  resolution_note text check (char_length(resolution_note) <= 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Public reputation shown on every campaign page.
create view public.project_stats as
select
  c.owner_account_id,
  count(b.id) filter (where b.status in ('accepted', 'paid', 'rejected', 'rejected_final', 'disputed')) as decided,
  count(b.id) filter (where b.status in ('accepted', 'paid')) as accepted,
  count(b.id) filter (where b.decided_by = 'timeout') as timed_out,
  count(d.id) filter (where d.status = 'upheld') as overturned,
  avg(extract(epoch from (b.decided_at - b.created_at)) / 86400) filter (where b.decided_by = 'owner') as avg_response_days
from public.campaigns c
left join public.bugs b on b.campaign_id = c.id
left join public.disputes d on d.bug_id = b.id
group by c.owner_account_id;

alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.wallets enable row level security;
alter table public.otp_requests enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_payouts enable row level security;
alter table public.applications enable row level security;
alter table public.bugs enable row level security;
alter table public.bug_messages enable row level security;
alter table public.disputes enable row level security;
revoke all on public.project_stats from anon, authenticated;
