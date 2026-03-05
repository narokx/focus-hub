
-- Enable RLS on daily_task_buffer
ALTER TABLE public.daily_task_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily_task_buffer" ON public.daily_task_buffer
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own daily_task_buffer" ON public.daily_task_buffer
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily_task_buffer" ON public.daily_task_buffer
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily_task_buffer" ON public.daily_task_buffer
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Enable RLS on calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar_events" ON public.calendar_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own calendar_events" ON public.calendar_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar_events" ON public.calendar_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar_events" ON public.calendar_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add foreign keys if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'calendar_events_task_id_fkey') THEN
    ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'daily_task_buffer_task_id_fkey') THEN
    ALTER TABLE public.daily_task_buffer ADD CONSTRAINT daily_task_buffer_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);
  END IF;
END $$;
