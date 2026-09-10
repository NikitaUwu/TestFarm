CREATE TABLE metric_jobs (
    id uuid PRIMARY KEY,
    idea_id uuid NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    observation_id uuid NOT NULL REFERENCES business_observations(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'ready',
    result jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX metric_jobs_pending ON metric_jobs(created_at) WHERE status='ready';
