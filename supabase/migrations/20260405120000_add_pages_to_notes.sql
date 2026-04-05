ALTER TABLE public.user_notes
ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[""]'::jsonb;

ALTER TABLE public.task_notes
ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[""]'::jsonb;

UPDATE public.user_notes
SET pages = jsonb_build_array(content)
WHERE content IS NOT NULL;

UPDATE public.task_notes
SET pages = jsonb_build_array(content)
WHERE content IS NOT NULL;
