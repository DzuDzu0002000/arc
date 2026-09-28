-- Each account picks one side once: a project (posts campaigns, funds escrow, reviews bugs)
-- or a tester (applies, reports bugs, disputes rejections). Admins are configured separately by Circle user id.
alter table public.accounts
  add column if not exists role text check (role in ('project', 'tester'));
