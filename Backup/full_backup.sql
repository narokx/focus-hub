


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_note_collision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If a note already exists for this user, REDIRECT the content to the existing row
  IF EXISTS (SELECT 1 FROM public.user_notes WHERE user_id = NEW.user_id) THEN
    UPDATE public.user_notes
    SET content = NEW.content,
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
    RETURN NULL; -- This cancels the original INSERT, preventing the Unique Constraint error
  END IF;
  RETURN NEW; -- Proceed with INSERT only if no row exists
END;
$$;


ALTER FUNCTION "public"."handle_user_note_collision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_routine"("_routine_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.routines
    WHERE id = _routine_id AND user_id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."owns_routine"("_routine_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "date" "date" NOT NULL,
    "task_id" "uuid",
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "completed" boolean DEFAULT false,
    "subtasks" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_task_buffer" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "date" "date" NOT NULL,
    "task_id" "uuid",
    "completed" boolean DEFAULT false,
    "order_index" integer,
    "day_color" "text",
    "is_custom_color" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."daily_task_buffer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."routine_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "routine_id" "uuid",
    "task_id" "uuid",
    "order_index" integer
);


ALTER TABLE "public"."routine_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."routine_time_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "routine_id" "uuid",
    "task_id" "uuid",
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "subtasks" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."routine_time_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."routines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "order_index" integer,
    "color" "text" DEFAULT '#cbd5e1'::"text"
);


ALTER TABLE "public"."routines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "task_id" "text",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note_key" "text" NOT NULL
);

ALTER TABLE ONLY "public"."task_notes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."task_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."user_notes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."user_notes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_task_buffer"
    ADD CONSTRAINT "daily_task_buffer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routine_tasks"
    ADD CONSTRAINT "routine_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routine_time_slots"
    ADD CONSTRAINT "routine_time_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routines"
    ADD CONSTRAINT "routines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_notes"
    ADD CONSTRAINT "task_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_notes"
    ADD CONSTRAINT "task_notes_user_id_note_key_key" UNIQUE ("user_id", "note_key");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_user_id_unique" UNIQUE ("user_id");



CREATE INDEX "task_notes_user_id_idx" ON "public"."task_notes" USING "btree" ("user_id");



CREATE UNIQUE INDEX "task_notes_user_note_key_key" ON "public"."task_notes" USING "btree" ("user_id", "note_key");



CREATE UNIQUE INDEX "user_notes_user_id_key" ON "public"."user_notes" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "on_task_notes_updated" BEFORE UPDATE ON "public"."task_notes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_user_note_collision" BEFORE INSERT ON "public"."user_notes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_user_note_collision"();



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."daily_task_buffer"
    ADD CONSTRAINT "daily_task_buffer_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_task_buffer"
    ADD CONSTRAINT "daily_task_buffer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."routine_tasks"
    ADD CONSTRAINT "routine_tasks_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routine_tasks"
    ADD CONSTRAINT "routine_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routine_time_slots"
    ADD CONSTRAINT "routine_time_slots_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routine_time_slots"
    ADD CONSTRAINT "routine_time_slots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."routines"
    ADD CONSTRAINT "routines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_notes"
    ADD CONSTRAINT "task_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can create own calendar_events" ON "public"."calendar_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own daily_task_buffer" ON "public"."daily_task_buffer" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own notes" ON "public"."user_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own routine_tasks" ON "public"."routine_tasks" FOR INSERT WITH CHECK ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can create own routine_time_slots" ON "public"."routine_time_slots" FOR INSERT WITH CHECK ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can create own routines" ON "public"."routines" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own task notes" ON "public"."task_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own tasks" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own calendar_events" ON "public"."calendar_events" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own daily_task_buffer" ON "public"."daily_task_buffer" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own routine_tasks" ON "public"."routine_tasks" FOR DELETE USING ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can delete own routine_time_slots" ON "public"."routine_time_slots" FOR DELETE USING ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can delete own routines" ON "public"."routines" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own task notes" ON "public"."task_notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own tasks" ON "public"."tasks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own task notes" ON "public"."task_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own calendar_events" ON "public"."calendar_events" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own daily_task_buffer" ON "public"."daily_task_buffer" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notes" ON "public"."user_notes" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own routine_tasks" ON "public"."routine_tasks" FOR UPDATE USING ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can update own routine_time_slots" ON "public"."routine_time_slots" FOR UPDATE USING ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can update own routines" ON "public"."routines" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own task notes" ON "public"."task_notes" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own tasks" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own calendar_events" ON "public"."calendar_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own daily_task_buffer" ON "public"."daily_task_buffer" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notes" ON "public"."user_notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own routine_tasks" ON "public"."routine_tasks" FOR SELECT USING ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can view own routine_time_slots" ON "public"."routine_time_slots" FOR SELECT USING ("public"."owns_routine"("routine_id"));



CREATE POLICY "Users can view own routines" ON "public"."routines" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own task notes" ON "public"."task_notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own tasks" ON "public"."tasks" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_task_buffer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."routine_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."routine_time_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."routines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."task_notes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_notes";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_note_collision"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_note_collision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_note_collision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."owns_routine"("_routine_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_routine"("_routine_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_routine"("_routine_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."daily_task_buffer" TO "anon";
GRANT ALL ON TABLE "public"."daily_task_buffer" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_task_buffer" TO "service_role";



GRANT ALL ON TABLE "public"."routine_tasks" TO "anon";
GRANT ALL ON TABLE "public"."routine_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."routine_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."routine_time_slots" TO "anon";
GRANT ALL ON TABLE "public"."routine_time_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."routine_time_slots" TO "service_role";



GRANT ALL ON TABLE "public"."routines" TO "anon";
GRANT ALL ON TABLE "public"."routines" TO "authenticated";
GRANT ALL ON TABLE "public"."routines" TO "service_role";



GRANT ALL ON TABLE "public"."task_notes" TO "anon";
GRANT ALL ON TABLE "public"."task_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."task_notes" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_notes" TO "anon";
GRANT ALL ON TABLE "public"."user_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































