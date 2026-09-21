CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  captured_at timestamptz NOT NULL,
  device text,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text,
  parent_id uuid REFERENCES folders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES folders(id),
  title text NOT NULL,
  summary text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_sources (
  note_id uuid NOT NULL REFERENCES notes(id),
  capture_id uuid NOT NULL REFERENCES captures(id),
  PRIMARY KEY (note_id, capture_id)
);

CREATE TABLE IF NOT EXISTS rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  instruction text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS captures_status_idx ON captures (status);
CREATE INDEX IF NOT EXISTS notes_folder_id_idx ON notes (folder_id);
CREATE INDEX IF NOT EXISTS note_sources_capture_id_idx ON note_sources (capture_id);

CREATE TABLE IF NOT EXISTS model_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  cached_tokens integer NOT NULL DEFAULT 0,
  est_cost_usd numeric(10,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_calls_created_at_idx ON model_calls (created_at);
ALTER TABLE model_calls ADD COLUMN IF NOT EXISTS thinking_tokens integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quick_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid NOT NULL REFERENCES captures(id),
  topic text NOT NULL,
  item_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS quick_calls_status_idx ON quick_calls (status);

CREATE TABLE IF NOT EXISTS organize_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  captures_processed integer NOT NULL DEFAULT 0,
  items_filed integer NOT NULL DEFAULT 0,
  items_queued integer NOT NULL DEFAULT 0,
  notes_created integer NOT NULL DEFAULT 0,
  notes_appended integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  failed_capture_id uuid REFERENCES captures(id),
  error text
);
CREATE INDEX IF NOT EXISTS organize_runs_finished_at_idx ON organize_runs (finished_at DESC);
