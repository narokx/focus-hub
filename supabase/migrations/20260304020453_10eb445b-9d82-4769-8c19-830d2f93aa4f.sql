
-- Enable RLS on routines
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routines"
ON public.routines FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routines"
ON public.routines FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines"
ON public.routines FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines"
ON public.routines FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on routine_tasks
ALTER TABLE public.routine_tasks ENABLE ROW LEVEL SECURITY;

-- routine_tasks doesn't have user_id directly, use a security definer function
CREATE OR REPLACE FUNCTION public.owns_routine(_routine_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.routines
    WHERE id = _routine_id AND user_id = auth.uid()
  )
$$;

CREATE POLICY "Users can view own routine_tasks"
ON public.routine_tasks FOR SELECT
USING (public.owns_routine(routine_id));

CREATE POLICY "Users can create own routine_tasks"
ON public.routine_tasks FOR INSERT
WITH CHECK (public.owns_routine(routine_id));

CREATE POLICY "Users can update own routine_tasks"
ON public.routine_tasks FOR UPDATE
USING (public.owns_routine(routine_id));

CREATE POLICY "Users can delete own routine_tasks"
ON public.routine_tasks FOR DELETE
USING (public.owns_routine(routine_id));

-- Enable RLS on routine_time_slots
ALTER TABLE public.routine_time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routine_time_slots"
ON public.routine_time_slots FOR SELECT
USING (public.owns_routine(routine_id));

CREATE POLICY "Users can create own routine_time_slots"
ON public.routine_time_slots FOR INSERT
WITH CHECK (public.owns_routine(routine_id));

CREATE POLICY "Users can update own routine_time_slots"
ON public.routine_time_slots FOR UPDATE
USING (public.owns_routine(routine_id));

CREATE POLICY "Users can delete own routine_time_slots"
ON public.routine_time_slots FOR DELETE
USING (public.owns_routine(routine_id));
