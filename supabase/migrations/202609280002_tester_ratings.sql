-- Projects rate the tester (1–5 stars) after a bug is paid, once per bug.
create table public.tester_ratings (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null unique references public.bugs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tester_account_id uuid not null references public.accounts(id),
  rater_account_id uuid not null references public.accounts(id),
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index tester_ratings_tester_idx on public.tester_ratings(tester_account_id, created_at desc);
alter table public.tester_ratings enable row level security;

-- Track record every project sees before approving a tester.
create view public.tester_stats as
select
  a.id as tester_account_id,
  a.display_name,
  a.created_at as member_since,
  (select count(distinct ap.campaign_id) from public.applications ap
     where ap.tester_account_id = a.id and ap.status in ('approved', 'removed')) as campaigns_tested,
  (select count(*) from public.bugs b where b.tester_account_id = a.id) as bugs_reported,
  (select count(*) from public.bugs b where b.tester_account_id = a.id and b.status in ('accepted', 'paid')) as bugs_accepted,
  (select count(*) from public.bugs b where b.tester_account_id = a.id and b.status in ('accepted', 'paid')
     and b.severity_final in ('critical', 'high')) as critical_or_high,
  (select coalesce(sum(b.payout_amount), 0) from public.bugs b where b.tester_account_id = a.id and b.status = 'paid') as earned,
  (select round(avg(r.stars)::numeric, 2) from public.tester_ratings r where r.tester_account_id = a.id) as rating_avg,
  (select count(*) from public.tester_ratings r where r.tester_account_id = a.id) as rating_count
from public.accounts a
where a.role = 'tester';

revoke all on public.tester_stats from anon, authenticated;
