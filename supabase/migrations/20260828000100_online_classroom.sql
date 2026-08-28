create table public.lesson_whiteboards (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.lesson_chat_messages (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index lesson_chat_messages_lesson_created_idx
  on public.lesson_chat_messages(lesson_id, created_at);

alter table public.lesson_whiteboards enable row level security;
alter table public.lesson_chat_messages enable row level security;

create policy "classroom participants read whiteboards" on public.lesson_whiteboards
  for select using (public.owns_lesson(lesson_id) or public.is_lesson_audience(lesson_id));
create policy "classroom participants write whiteboards" on public.lesson_whiteboards
  for insert with check (public.owns_lesson(lesson_id) or public.is_lesson_audience(lesson_id));
create policy "classroom participants update whiteboards" on public.lesson_whiteboards
  for update using (public.owns_lesson(lesson_id) or public.is_lesson_audience(lesson_id))
  with check (public.owns_lesson(lesson_id) or public.is_lesson_audience(lesson_id));

create policy "classroom participants read chat" on public.lesson_chat_messages
  for select using (public.owns_lesson(lesson_id) or public.is_lesson_audience(lesson_id));
create policy "classroom participants send chat" on public.lesson_chat_messages
  for insert with check (
    user_id = auth.uid()
    and (public.owns_lesson(lesson_id) or public.is_lesson_audience(lesson_id))
  );

alter publication supabase_realtime add table public.lesson_chat_messages;
