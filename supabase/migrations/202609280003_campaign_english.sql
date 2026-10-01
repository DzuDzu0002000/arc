-- Optional English copy of a campaign, shown when the viewer picks English (falls back to the original text).
alter table public.campaigns
  add column if not exists title_en text check (title_en is null or char_length(title_en) between 5 and 120),
  add column if not exists description_en text check (description_en is null or char_length(description_en) <= 5000),
  add column if not exists scope_in_en text check (scope_in_en is null or char_length(scope_in_en) <= 3000),
  add column if not exists scope_out_en text check (scope_out_en is null or char_length(scope_out_en) <= 3000);
