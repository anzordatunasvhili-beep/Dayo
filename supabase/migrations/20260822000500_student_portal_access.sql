create policy "students read their groups" on public.groups for select using (
  exists(
    select 1 from public.group_members gm
    where gm.group_id=groups.id and gm.student_id=auth.uid()
  )
);
