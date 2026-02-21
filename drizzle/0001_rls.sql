-- RLS: enable row-level security and per-user access policies
-- Runs after 0000 has created all tables

alter table properties        enable row level security;
alter table statements        enable row level security;
alter table portfolio_reports enable row level security;
alter table mortgage_entries  enable row level security;

create policy "users manage own properties"
  on properties for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own statements"
  on statements for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own reports"
  on portfolio_reports for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own mortgage entries"
  on mortgage_entries for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);