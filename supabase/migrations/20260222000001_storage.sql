-- Create the documents bucket (private — no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760, -- 10MB in bytes
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can upload to their own folder
CREATE POLICY "users can upload own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- RLS: users can read their own documents
CREATE POLICY "users can read own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- RLS: users can delete their own documents
CREATE POLICY "users can delete own documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );