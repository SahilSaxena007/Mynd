CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  captured_at timestamptz NOT NULL,
  device text,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text,
  parent_id uuid REFERENCES folders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES folders(id),
  title text NOT NULL,
  summary text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE note_sources (
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  capture_id uuid NOT NULL REFERENCES captures(id),
  PRIMARY KEY (note_id, capture_id)
);

CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  instruction text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON captures (status);
CREATE INDEX ON notes (folder_id);
CREATE INDEX ON note_sources (capture_id);
