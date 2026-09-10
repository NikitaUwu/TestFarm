CREATE TABLE search_runs (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    query_hash text NOT NULL,
    content jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(run_id,query_hash)
);
