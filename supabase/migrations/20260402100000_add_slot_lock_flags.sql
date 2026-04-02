alter table public.calendar_events
  add column if not exists locked boolean not null default false;

alter table public.routine_time_slots
  add column if not exists locked boolean not null default false;
