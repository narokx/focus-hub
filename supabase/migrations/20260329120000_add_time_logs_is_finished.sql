ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS is_finished boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS time_logs_user_id_is_finished_idx
  ON public.time_logs (user_id, is_finished);
