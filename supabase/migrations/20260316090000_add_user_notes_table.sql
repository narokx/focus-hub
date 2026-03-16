CREATE TABLE public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes"
ON public.user_notes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notes"
ON public.user_notes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes"
ON public.user_notes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_user_notes_updated
BEFORE UPDATE ON public.user_notes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

