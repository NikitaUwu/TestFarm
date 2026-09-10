CREATE TABLE principals (id uuid PRIMARY KEY, role text NOT NULL CHECK (role IN ('owner','reviewer')), name text NOT NULL);
INSERT INTO principals VALUES ('10000000-0000-0000-0000-000000000001','owner','Владелец'),('10000000-0000-0000-0000-000000000002','reviewer','Проверяющий');
CREATE TABLE sessions (token_hash text PRIMARY KEY, principal_id uuid NOT NULL REFERENCES principals, expires_at timestamptz NOT NULL);
CREATE TABLE ideas (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES principals, title text NOT NULL,
 priority integer NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 2),
 stage text NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','queued','research','assessment','decision','mvp_building','mvp_ready','archived')),
 execution_state text NOT NULL DEFAULT 'ready' CHECK(execution_state IN ('ready','running','waiting_for_user','waiting_for_data','paused','error','completed','cancelled')),
 current_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE idea_versions (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(idea_id,version));
CREATE TABLE idea_changes (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, from_version integer, to_version integer NOT NULL, changed_fields jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE configurations (kind text NOT NULL, id text NOT NULL, version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id,version));
CREATE TABLE datasets (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE dataset_versions (id uuid PRIMARY KEY, dataset_id uuid NOT NULL REFERENCES datasets ON DELETE CASCADE, version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(dataset_id,version));
CREATE TABLE solution_candidates (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE research_runs (
 id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, idea_version_id uuid NOT NULL REFERENCES idea_versions ON DELETE CASCADE,
 idempotency_key text NOT NULL, status text NOT NULL DEFAULT 'ready', stale boolean NOT NULL DEFAULT false, config_versions jsonb NOT NULL,
 dataset_version_id uuid REFERENCES dataset_versions ON DELETE CASCADE, solution_versions jsonb NOT NULL DEFAULT '[]',
 call_count integer NOT NULL DEFAULT 0, search_count integer NOT NULL DEFAULT 0, started_at timestamptz, finished_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(idea_id,idempotency_key)
);
CREATE TABLE jobs (id uuid PRIMARY KEY, run_id uuid NOT NULL UNIQUE REFERENCES research_runs ON DELETE CASCADE, status text NOT NULL DEFAULT 'ready', priority integer NOT NULL, requested_action text, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX jobs_ready ON jobs(status,created_at);
CREATE TABLE step_runs (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, step_id text NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,step_id,input_hash));
CREATE TABLE experiment_runs (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, solution_id uuid NOT NULL REFERENCES solution_candidates ON DELETE CASCADE, dataset_version_id uuid NOT NULL REFERENCES dataset_versions ON DELETE CASCADE, status text NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE task_observations (id uuid PRIMARY KEY, experiment_id uuid NOT NULL REFERENCES experiment_runs ON DELETE CASCADE, task_id text NOT NULL, repetition integer NOT NULL, content jsonb NOT NULL);
CREATE TABLE measurements (id uuid PRIMARY KEY, observation_id uuid NOT NULL REFERENCES task_observations ON DELETE CASCADE, metric text NOT NULL, value double precision, unit text NOT NULL, provenance text NOT NULL);
CREATE TABLE baseline_metrics (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, dataset_version_id uuid NOT NULL REFERENCES dataset_versions ON DELETE CASCADE, content jsonb NOT NULL);
CREATE TABLE assumptions (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE constraints (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, content jsonb NOT NULL);
CREATE TABLE calculation_runs (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE scenarios (id uuid PRIMARY KEY, calculation_id uuid NOT NULL REFERENCES calculation_runs ON DELETE CASCADE, name text NOT NULL, content jsonb NOT NULL);
CREATE TABLE sensitivity_analyses (id uuid PRIMARY KEY, calculation_id uuid NOT NULL REFERENCES calculation_runs ON DELETE CASCADE, content jsonb NOT NULL);
CREATE TABLE evidence_sources (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, url text NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE evidence_claims (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, source_id uuid REFERENCES evidence_sources ON DELETE CASCADE, content jsonb NOT NULL);
CREATE TABLE reports (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, version integer NOT NULL, content jsonb NOT NULL, public_token text UNIQUE, public_content jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE decisions (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, report_id uuid NOT NULL REFERENCES reports ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES principals, decision text NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mvp_builds (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, decision_id uuid NOT NULL REFERENCES decisions ON DELETE CASCADE, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mvp_versions (id uuid PRIMARY KEY, build_id uuid NOT NULL REFERENCES mvp_builds ON DELETE CASCADE, version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mvp_results (id uuid PRIMARY KEY, version_id uuid NOT NULL REFERENCES mvp_versions ON DELETE CASCADE, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE integrations (id text PRIMARY KEY, content jsonb NOT NULL);
CREATE TABLE integration_snapshots (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE component_catalog (id text NOT NULL, version text NOT NULL, content jsonb NOT NULL, PRIMARY KEY(id,version));
CREATE TABLE artifacts (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, run_id uuid REFERENCES research_runs ON DELETE CASCADE, object_key text NOT NULL UNIQUE, mime text NOT NULL, size bigint NOT NULL, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE business_observations (id uuid PRIMARY KEY, idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_events (id uuid PRIMARY KEY, actor_id uuid REFERENCES principals, idea_id uuid REFERENCES ideas ON DELETE SET NULL, action text NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE deletion_jobs (id uuid PRIMARY KEY, object_keys jsonb NOT NULL, status text NOT NULL DEFAULT 'ready', error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE login_attempts (key text PRIMARY KEY, count integer NOT NULL, window_start timestamptz NOT NULL);
