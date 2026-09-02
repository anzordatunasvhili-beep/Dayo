create table public.lesson_homework_assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  description text,
  attachments jsonb not null default '[]'::jsonb,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id)
);

create index lesson_homework_assignments_lesson_idx
  on public.lesson_homework_assignments(lesson_id, updated_at desc);

alter table public.lesson_homework_assignments enable row level security;

create policy "teachers manage homework assignments"
  on public.lesson_homework_assignments for all
  using (public.owns_lesson(lesson_id))
  with check (public.owns_lesson(lesson_id));

create policy "students read homework assignments"
  on public.lesson_homework_assignments for select
  using (public.is_lesson_audience(lesson_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('homework-assignments', 'homework-assignments', false, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy "teachers upload homework assignment files"
  on storage.objects for insert
  with check (
    bucket_id = 'homework-assignments'
    and public.owns_lesson(((storage.foldername(name))[1])::uuid)
  );

create policy "teachers update homework assignment files"
  on storage.objects for update
  using (
    bucket_id = 'homework-assignments'
    and public.owns_lesson(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'homework-assignments'
    and public.owns_lesson(((storage.foldername(name))[1])::uuid)
  );

create policy "homework assignment participants read files"
  on storage.objects for select
  using (
    bucket_id = 'homework-assignments'
    and (
      public.owns_lesson(((storage.foldername(name))[1])::uuid)
      or public.is_lesson_audience(((storage.foldername(name))[1])::uuid)
    )
  );
