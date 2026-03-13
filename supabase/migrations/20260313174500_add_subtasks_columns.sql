alter table public.calendar_events
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

alter table public.routine_time_slots
  add column if not exists subtasks jsonb not null default '[]'::jsonb;
