create type public.attendance_status as enum ('unknown','present','absent','late','excused');
create type public.homework_status as enum ('none','assigned','submitted','completed','missing');

create table public.teacher_unavailability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default 'Unavailable',
  recurring_weekly boolean not null default false,
  created_at timestamptz not null default now(),
  constraint valid_red_zone_time check (ends_at > starts_at)
);
create index teacher_unavailability_teacher_time_idx on public.teacher_unavailability(teacher_id,starts_at,ends_at);

create table public.student_subject_prices (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  price numeric(10,2) not null check(price >= 0),
  currency text not null default 'USD',
  updated_at timestamptz not null default now(),
  primary key(student_id,subject_id)
);

create table public.lesson_student_records (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance public.attendance_status not null default 'unknown',
  homework public.homework_status not null default 'none',
  homework_note text,
  price_snapshot numeric(10,2),
  currency text,
  updated_at timestamptz not null default now(),
  primary key(lesson_id,student_id)
);

alter table public.teacher_unavailability enable row level security;
alter table public.student_subject_prices enable row level security;
alter table public.lesson_student_records enable row level security;

create policy "teachers manage red zones" on public.teacher_unavailability for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "students read teacher red zones" on public.teacher_unavailability for select using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.teacher_id=teacher_unavailability.teacher_id));

create policy "teachers manage student prices" on public.student_subject_prices for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid() and public.is_teacher_of(student_id));
create policy "students read own prices" on public.student_subject_prices for select using (student_id=auth.uid());

create policy "teachers manage lesson tracking" on public.lesson_student_records for all using (public.owns_lesson(lesson_id)) with check (public.owns_lesson(lesson_id) and public.is_teacher_of(student_id));
create policy "students read own tracking" on public.lesson_student_records for select using (student_id=auth.uid());
