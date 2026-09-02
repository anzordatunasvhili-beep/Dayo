create policy "students delete own homework files"
  on storage.objects for delete
  using (
    bucket_id = 'homework-submissions'
    and auth.uid()::text = (storage.foldername(name))[2]
  );
