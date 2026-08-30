create table public.lesson_homework_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  description text,
  attachments jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create index lesson_homework_submissions_lesson_idx
  on public.lesson_homework_submissions(lesson_id, updated_at desc);

alter table public.lesson_homework_submissions enable row level security;

create policy "students manage own homework submissions"
  on public.lesson_homework_submissions for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and public.is_lesson_audience(lesson_id));

create policy "teachers read lesson homework submissions"
  on public.lesson_homework_submissions for select
  using (public.owns_lesson(lesson_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('homework-submissions', 'homework-submissions', false, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy "students upload own homework files"
  on storage.objects for insert
  with check (
    bucket_id = 'homework-submissions'
    and auth.uid()::text = (storage.foldername(name))[2]
    and public.is_lesson_audience(((storage.foldername(name))[1])::uuid)
  );

create policy "students update own homework files"
  on storage.objects for update
  using (
    bucket_id = 'homework-submissions'
    and auth.uid()::text = (storage.foldername(name))[2]
  )
  with check (
    bucket_id = 'homework-submissions'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

create policy "homework participants read files"
  on storage.objects for select
  using (
    bucket_id = 'homework-submissions'
    and (
      auth.uid()::text = (storage.foldername(name))[2]
      or public.owns_lesson(((storage.foldername(name))[1])::uuid)
    )
  );
