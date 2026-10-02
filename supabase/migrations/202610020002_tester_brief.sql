-- Tasks and instructions only approved testers (and the owner) can see: functions to test, test accounts, setup steps.
alter table public.campaigns add column tester_brief text, add column tester_brief_en text;
