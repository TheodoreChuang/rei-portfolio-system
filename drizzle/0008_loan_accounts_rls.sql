-- RLS is auto-enabled by the event trigger in 0002 when the table is created.
-- This migration adds the per-user access policy.
CREATE POLICY "users manage own loan accounts"
  ON loan_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
