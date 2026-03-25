-- Ensure one weekly note row per user; keep the most recently updated row.
DELETE FROM public.user_notes un
USING public.user_notes newer
WHERE un.user_id = newer.user_id
  AND (
    un.updated_at < newer.updated_at
    OR (un.updated_at = newer.updated_at AND un.id < newer.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_notes_user_id_key
ON public.user_notes (user_id);

CREATE TABLE IF NOT EXISTS public.task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_key text NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, note_key)
);

ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own task notes" ON public.task_notes;
CREATE POLICY "Users can view own task notes"
ON public.task_notes FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own task notes" ON public.task_notes;
CREATE POLICY "Users can create own task notes"
ON public.task_notes FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own task notes" ON public.task_notes;
CREATE POLICY "Users can update own task notes"
ON public.task_notes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own task notes" ON public.task_notes;
CREATE POLICY "Users can delete own task notes"
ON public.task_notes FOR DELETE
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_task_notes_updated ON public.task_notes;
CREATE TRIGGER on_task_notes_updated
BEFORE UPDATE ON public.task_notes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
