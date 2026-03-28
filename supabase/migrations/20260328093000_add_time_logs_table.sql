CREATE TABLE IF NOT EXISTS public.time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone
);

CREATE INDEX IF NOT EXISTS time_logs_user_id_start_time_idx
  ON public.time_logs (user_id, start_time DESC);

ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Users can view own time logs" ON public.time_logs;
CREATE POLICY "Users can view own time logs"
ON public.time_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own time logs" ON public.time_logs;
CREATE POLICY "Users can create own time logs"
ON public.time_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own time logs" ON public.time_logs;
CREATE POLICY "Users can update own time logs"
ON public.time_logs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own time logs" ON public.time_logs;
CREATE POLICY "Users can delete own time logs"
ON public.time_logs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'time_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.time_logs;
  END IF;
END
$$;
