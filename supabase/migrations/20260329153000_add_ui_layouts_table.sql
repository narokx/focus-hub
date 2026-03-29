CREATE TABLE IF NOT EXISTS public.ui_layouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ui_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_layouts REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Users can view own ui layouts" ON public.ui_layouts;
CREATE POLICY "Users can view own ui layouts"
ON public.ui_layouts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own ui layouts" ON public.ui_layouts;
CREATE POLICY "Users can create own ui layouts"
ON public.ui_layouts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ui layouts" ON public.ui_layouts;
CREATE POLICY "Users can update own ui layouts"
ON public.ui_layouts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_ui_layouts_updated ON public.ui_layouts;
CREATE TRIGGER on_ui_layouts_updated
BEFORE UPDATE ON public.ui_layouts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ui_layouts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ui_layouts;
  END IF;
END
$$;
