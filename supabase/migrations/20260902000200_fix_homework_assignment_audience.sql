create or replace function public.is_lesson_audience(target_lesson uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.lessons
    where id = target_lesson
      and (
        student_id = auth.uid()
        or exists(
          select 1
          from public.group_members gm
          where gm.group_id = lessons.group_id
            and gm.student_id = auth.uid()
        )
      )
  )
  or exists(
    select 1
    from public.lesson_students
    where lesson_id = target_lesson
      and student_id = auth.uid()
  )
  or exists(
    select 1
    from public.lesson_groups lg
    join public.group_members gm on gm.group_id = lg.group_id
    where lg.lesson_id = target_lesson
      and gm.student_id = auth.uid()
  )
$$;
