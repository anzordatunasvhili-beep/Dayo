create or replace function public.owns_lesson(target_lesson uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.lessons where id=target_lesson and teacher_id=auth.uid())
$$;

create or replace function public.is_lesson_audience(target_lesson uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select
    exists(select 1 from public.lesson_students where lesson_id=target_lesson and student_id=auth.uid())
    or exists(
      select 1 from public.lesson_groups lg
      join public.group_members gm on gm.group_id=lg.group_id
      where lg.lesson_id=target_lesson and gm.student_id=auth.uid()
    )
$$;

drop policy if exists "teachers manage lesson students" on public.lesson_students;
drop policy if exists "teachers manage lesson groups" on public.lesson_groups;
drop policy if exists "student reads lessons" on public.lessons;

create policy "teachers manage lesson students" on public.lesson_students for all
using (public.owns_lesson(lesson_id)) with check (public.owns_lesson(lesson_id));

create policy "teachers manage lesson groups" on public.lesson_groups for all
using (public.owns_lesson(lesson_id)) with check (public.owns_lesson(lesson_id));

create policy "student reads lessons" on public.lessons for select using (
  student_id=auth.uid()
  or exists(select 1 from public.group_members gm where gm.group_id=lessons.group_id and gm.student_id=auth.uid())
  or public.is_lesson_audience(id)
);
