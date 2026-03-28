ALTER TABLE public.time_logs
  DROP COLUMN IF EXISTS end_time;

ALTER TABLE public.time_logs
  RENAME COLUMN start_time TO last_started_at;

ALTER TABLE public.time_logs
  ALTER COLUMN last_started_at DROP NOT NULL;

ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS accumulated_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_running boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.time_logs_user_id_start_time_idx;

CREATE INDEX IF NOT EXISTS time_logs_user_id_last_started_at_idx
  ON public.time_logs (user_id, last_started_at DESC);
