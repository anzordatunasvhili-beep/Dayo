alter table public.subjects
add column if not exists icon text not null default 'menu_book';

comment on column public.subjects.icon is 'Google Material Symbols icon name selected by the teacher';
