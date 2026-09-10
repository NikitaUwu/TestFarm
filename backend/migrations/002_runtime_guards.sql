CREATE UNIQUE INDEX task_observation_once ON task_observations(experiment_id,task_id,repetition);
ALTER TABLE step_runs ADD COLUMN attempt integer NOT NULL DEFAULT 1;
ALTER TABLE step_runs ADD COLUMN reused_from uuid REFERENCES step_runs(id) ON DELETE SET NULL;
ALTER TABLE research_runs ADD COLUMN active_seconds double precision NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN attempt_started_at timestamptz;
CREATE TABLE step_attempts(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE,step_id text NOT NULL,attempt integer NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
