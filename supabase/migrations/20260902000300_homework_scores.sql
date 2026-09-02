alter table public.lesson_student_records
  add column if not exists homework_score numeric(5,2)
  check (homework_score is null or (homework_score >= 0 and homework_score <= 100));
