alter table properties        enable row level security;
alter table source_documents  enable row level security;
alter table ledger_entries    enable row level security;
alter table portfolio_reports enable row level security;

create policy "users manage own properties"
  on properties for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own source documents"
  on source_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own ledger entries"
  on ledger_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own reports"
  on portfolio_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);