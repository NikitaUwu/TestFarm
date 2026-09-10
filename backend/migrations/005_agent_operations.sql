CREATE TABLE agent_results (
 id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE,
 run_id uuid REFERENCES research_runs ON DELETE CASCADE, operation_id uuid NOT NULL,
 role text NOT NULL, input_hash text NOT NULL, definition jsonb NOT NULL, inputs jsonb NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_results_idea ON agent_results(idea_id,created_at);
CREATE TABLE mvp_jobs (
 id uuid PRIMARY KEY, build_id uuid NOT NULL UNIQUE REFERENCES mvp_builds ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'ready', attempts integer NOT NULL DEFAULT 0,
 error text, config jsonb NOT NULL, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE process_sessions (
 id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE,
 task_id text NOT NULL, solution_id uuid REFERENCES solution_candidates ON DELETE CASCADE,
 phase text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 seconds double precision, source text NOT NULL, provenance text NOT NULL
);
