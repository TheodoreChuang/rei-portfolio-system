import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

// Lazily initialized so the key is only required when admin functions are actually called
let _adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is required for E2E tests. " +
        "Run `npx supabase start` and add it to your .env.local.",
    );
  }
  _adminClient = createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

export async function createTestUser(email?: string) {
  const testEmail = email ?? `pw-test-${crypto.randomUUID()}@propflow.test`;
  const password = "test-password-123";

  const { data, error } = await getAdminClient().auth.admin.createUser({
    email: testEmail,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`Failed to create test user: ${error.message}`);
  return { user: data.user!, email: testEmail, password };
}

export async function deleteTestUser(userId: string) {
  await getAdminClient().auth.admin.deleteUser(userId);
}

export async function getTestSession(email: string, password: string) {
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  return res.json();
}
