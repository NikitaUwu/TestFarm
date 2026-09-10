ALTER TABLE process_sessions ADD COLUMN dataset_version_id uuid REFERENCES dataset_versions ON DELETE CASCADE;
ALTER TABLE mvp_jobs ADD COLUMN call_count integer NOT NULL DEFAULT 0;
ALTER TABLE mvp_jobs ADD COLUMN started_at timestamptz;
