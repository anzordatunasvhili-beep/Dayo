-- Dayo Edu database schema. Run in the Supabase SQL editor.
create extension if not exists "pgcrypto";
create type public.user_role as enum ('teacher', 'student');
create type public.lesson_mode as enum ('individual', 'group');
create type public.payment_status as enum ('pending', 'paid', 'overdue', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'student',
  email text,
  first_name text not null,
  last_name text not null,
  teacher_id uuid references public.profiles(id) on delete cascade,
  studio_code text,
  country_region text,
  created_at timestamptz not null default now(),
  constraint student_has_teacher check (role = 'teacher' or teacher_id is not null)
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles (id, role, email, first_name, last_name, teacher_id, studio_code, country_region)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'teacher'),
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name','Teacher'),
    coalesce(new.raw_user_meta_data->>'last_name','Account'),
    nullif(new.raw_user_meta_data->>'teacher_id','')::uuid,
    new.raw_user_meta_data->>'studio_code',
    new.raw_user_meta_data->>'country_region'
  ) on conflict (id) do update set email=excluded.email;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.subjects (id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade, name text not null, color text default 'sage', unique(teacher_id,name));
create table public.groups (id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade, name text not null, subject_id uuid references public.subjects(id) on delete set null, unique(teacher_id,name));
create table public.student_subjects (student_id uuid references public.profiles(id) on delete cascade, subject_id uuid references public.subjects(id) on delete cascade, lesson_mode public.lesson_mode not null, group_id uuid references public.groups(id) on delete set null, primary key(student_id,subject_id));
create table public.group_members (group_id uuid references public.groups(id) on delete cascade, student_id uuid references public.profiles(id) on delete cascade, primary key(group_id,student_id));
create table public.lessons (id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade, subject_id uuid references public.subjects(id) on delete set null, student_id uuid references public.profiles(id) on delete cascade, group_id uuid references public.groups(id) on delete cascade, starts_at timestamptz not null, ends_at timestamptz not null, available boolean not null default false, notes text, created_at timestamptz default now(), constraint one_audience check ((student_id is not null)::int + (group_id is not null)::int <= 1), constraint valid_time check (ends_at > starts_at));
create table public.payments (id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade, student_id uuid not null references public.profiles(id) on delete cascade, amount numeric(10,2) not null check(amount >= 0), currency text not null default 'USD', due_date date not null, paid_at timestamptz, status public.payment_status not null default 'pending', note text, created_at timestamptz default now());

alter table public.profiles enable row level security; alter table public.subjects enable row level security; alter table public.groups enable row level security; alter table public.student_subjects enable row level security; alter table public.group_members enable row level security; alter table public.lessons enable row level security; alter table public.payments enable row level security;
create function public.is_teacher_of(student uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=student and teacher_id=auth.uid()) $$;
create policy "read own related profiles" on public.profiles for select using (id=auth.uid() or teacher_id=auth.uid() or public.is_teacher_of(auth.uid()));
create policy "teacher updates students" on public.profiles for update using (id=auth.uid() or teacher_id=auth.uid());
create policy "teachers manage subjects" on public.subjects for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "students read assigned subjects" on public.subjects for select using (exists(select 1 from student_subjects ss where ss.subject_id=id and ss.student_id=auth.uid()));
create policy "teachers manage groups" on public.groups for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "teachers manage assignments" on public.student_subjects for all using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));
create policy "students read assignments" on public.student_subjects for select using (student_id=auth.uid());
create policy "teachers manage members" on public.group_members for all using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));
create policy "members read membership" on public.group_members for select using (student_id=auth.uid());
create policy "teacher manages lessons" on public.lessons for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "student reads lessons" on public.lessons for select using (student_id=auth.uid() or exists(select 1 from group_members gm where gm.group_id=lessons.group_id and gm.student_id=auth.uid()));
create policy "teacher manages payments" on public.payments for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "student reads payments" on public.payments for select using (student_id=auth.uid());
