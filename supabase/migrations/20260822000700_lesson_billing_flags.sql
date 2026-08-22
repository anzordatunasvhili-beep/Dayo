alter table public.lesson_student_records
add column if not exists billable boolean not null default true,
add column if not exists paid boolean not null default false;
