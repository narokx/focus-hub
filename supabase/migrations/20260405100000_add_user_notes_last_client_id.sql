ALTER TABLE public.user_notes
ADD COLUMN IF NOT EXISTS last_client_id text;
