alter table public.lessons
add column if not exists recurrence_series_id uuid;

create index if not exists lessons_recurrence_series_idx on public.lessons(recurrence_series_id);

create table public.lesson_students (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  primary key (lesson_id, student_id)
);

create table public.lesson_groups (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (lesson_id, group_id)
);

insert into public.lesson_students (lesson_id, student_id)
select id, student_id from public.lessons where student_id is not null
on conflict do nothing;

insert into public.lesson_groups (lesson_id, group_id)
select id, group_id from public.lessons where group_id is not null
on conflict do nothing;

alter table public.lesson_students enable row level security;
alter table public.lesson_groups enable row level security;

create policy "teachers manage lesson students" on public.lesson_students for all
using (exists(select 1 from public.lessons l where l.id=lesson_id and l.teacher_id=auth.uid()))
with check (exists(select 1 from public.lessons l where l.id=lesson_id and l.teacher_id=auth.uid()));
create policy "students read own lesson audience" on public.lesson_students for select using (student_id=auth.uid());

create policy "teachers manage lesson groups" on public.lesson_groups for all
using (exists(select 1 from public.lessons l where l.id=lesson_id and l.teacher_id=auth.uid()))
with check (exists(select 1 from public.lessons l where l.id=lesson_id and l.teacher_id=auth.uid()));
create policy "students read their lesson groups" on public.lesson_groups for select
using (exists(select 1 from public.group_members gm where gm.group_id=lesson_groups.group_id and gm.student_id=auth.uid()));

drop policy if exists "student reads lessons" on public.lessons;
create policy "student reads lessons" on public.lessons for select using (
  student_id=auth.uid()
  or exists(select 1 from public.group_members gm where gm.group_id=lessons.group_id and gm.student_id=auth.uid())
  or exists(select 1 from public.lesson_students ls where ls.lesson_id=lessons.id and ls.student_id=auth.uid())
  or exists(select 1 from public.lesson_groups lg join public.group_members gm on gm.group_id=lg.group_id where lg.lesson_id=lessons.id and gm.student_id=auth.uid())
);
