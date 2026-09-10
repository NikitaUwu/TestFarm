ALTER TABLE research_runs ADD COLUMN autonomy_plan jsonb;
CREATE TABLE intake_requests (
 owner_id uuid NOT NULL REFERENCES principals,
 request_key text NOT NULL,
 idea_id uuid NOT NULL REFERENCES ideas ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES research_runs ON DELETE CASCADE,
 PRIMARY KEY(owner_id,request_key)
);
