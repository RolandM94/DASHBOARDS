-- Create storage bucket for report reference documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-reference-docs',
  'report-reference-docs',
  false,
  26214400, -- 25 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/x-markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload their own files
CREATE POLICY "Users can upload reference docs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-reference-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: Users can read files in their own folder
CREATE POLICY "Users can read their own reference docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-reference-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: Users can delete their own files
CREATE POLICY "Users can delete their own reference docs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-reference-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
