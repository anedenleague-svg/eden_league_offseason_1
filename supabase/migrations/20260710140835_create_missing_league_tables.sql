/*
# Create missing league tables (league_versions, league_history, manager_messages)

## Purpose
The Eden League app expects four tables for cloud persistence and sync:
  - league_state (already exists)
  - league_versions (missing — named save snapshots)
  - league_history (missing — completed season archives)
  - manager_messages (missing — DM threads between user and AI managers/players)

This migration creates the three missing tables with RLS enabled and open
single-tenant policies (no auth — the app has no sign-in screen, so anon +
authenticated are both granted full CRUD on intentionally shared data).

## New Tables

### 1. league_versions
Stores named snapshots of the entire league state (Save/Load feature).
- id (uuid, PK, auto-generated)
- title (text, defaults to 'Untitled save')
- data (jsonb, full LeagueState snapshot)
- created_at (timestamptz, defaults to now())

### 2. league_history
One row per completed season. `season` is unique. Used by AI to ground
future schedule generation and by the Trophy Room UI.
- id (uuid, PK, auto-generated)
- season (integer, NOT NULL, UNIQUE)
- champion (text, nullable)
- summary (text, defaults to empty string)
- standings (jsonb, defaults to '[]')
- leaderboards (jsonb, defaults to '{}')
- data (jsonb, defaults to '{}')
- created_at (timestamptz, defaults to now())

### 3. manager_messages
Individual DM message rows between the user and AI managers/players/groups.
- id (uuid, PK, auto-generated)
- user_team (text, NOT NULL)
- counterpart_kind (text, NOT NULL — 'manager', 'player', or 'group')
- counterpart_team (text, NOT NULL)
- counterpart_name (text, NOT NULL)
- role (text, NOT NULL — 'user' or 'ai')
- content (text, NOT NULL)
- created_at (timestamptz, defaults to now())
- Index on (user_team, counterpart_kind, counterpart_team, counterpart_name, created_at)

## Security (RLS)
All three tables are single-tenant (no auth screen). RLS is enabled and
policies grant full CRUD to both anon and authenticated roles because the
data is intentionally shared/public within this single-player app.

## Notes
1. All statements use IF NOT EXISTS for idempotency.
2. Policies are dropped before re-creation to support safe re-runs.
3. No foreign keys — team names are logical references managed
   application-side, consistent with the existing league_state design.
*/

-- ── league_versions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT 'Untitled save',
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_versions TO anon, authenticated;
GRANT ALL ON public.league_versions TO service_role;

ALTER TABLE public.league_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read league versions" ON public.league_versions;
CREATE POLICY "Anyone can read league versions"
  ON public.league_versions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can create league versions" ON public.league_versions;
CREATE POLICY "Anyone can create league versions"
  ON public.league_versions FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update league versions" ON public.league_versions;
CREATE POLICY "Anyone can update league versions"
  ON public.league_versions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete league versions" ON public.league_versions;
CREATE POLICY "Anyone can delete league versions"
  ON public.league_versions FOR DELETE TO anon, authenticated USING (true);

-- ── league_history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  champion text,
  summary text NOT NULL DEFAULT '',
  standings jsonb NOT NULL DEFAULT '[]'::jsonb,
  leaderboards jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (season)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_history TO anon, authenticated;
GRANT ALL ON public.league_history TO service_role;

ALTER TABLE public.league_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read league history" ON public.league_history;
CREATE POLICY "Anyone can read league history"
  ON public.league_history FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can insert league history" ON public.league_history;
CREATE POLICY "Anyone can insert league history"
  ON public.league_history FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update league history" ON public.league_history;
CREATE POLICY "Anyone can update league history"
  ON public.league_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete league history" ON public.league_history;
CREATE POLICY "Anyone can delete league history"
  ON public.league_history FOR DELETE TO anon, authenticated USING (true);

-- ── manager_messages ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manager_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_team text NOT NULL,
  counterpart_kind text NOT NULL CHECK (counterpart_kind IN ('manager','player','group')),
  counterpart_team text NOT NULL,
  counterpart_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','ai')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manager_messages_thread_idx
  ON public.manager_messages (user_team, counterpart_kind, counterpart_team, counterpart_name, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_messages TO anon, authenticated;
GRANT ALL ON public.manager_messages TO service_role;

ALTER TABLE public.manager_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read manager messages" ON public.manager_messages;
CREATE POLICY "Anyone can read manager messages"
  ON public.manager_messages FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can insert manager messages" ON public.manager_messages;
CREATE POLICY "Anyone can insert manager messages"
  ON public.manager_messages FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update manager messages" ON public.manager_messages;
CREATE POLICY "Anyone can update manager messages"
  ON public.manager_messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete manager messages" ON public.manager_messages;
CREATE POLICY "Anyone can delete manager messages"
  ON public.manager_messages FOR DELETE TO anon, authenticated USING (true);