ALTER TABLE metric_jobs ALTER COLUMN observation_id DROP NOT NULL;
ALTER TABLE deletion_jobs ADD COLUMN runner_prefixes jsonb NOT NULL DEFAULT '[]';
