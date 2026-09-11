CREATE TABLE "farm_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "farm_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "farm_action_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"idea_id" uuid,
	"pathname" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_calculations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_datasets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_ideas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"stage" text DEFAULT 'draft' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_intake_keys" (
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"idea_id" uuid NOT NULL,
	CONSTRAINT "farm_intake_keys_owner_id_key_pk" PRIMARY KEY("owner_id","key")
);
--> statement-breakpoint
CREATE TABLE "farm_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text DEFAULT 'research' NOT NULL,
	"target_id" uuid,
	"priority" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"starting_at" timestamp with time zone,
	"workflow_id" text,
	"launch_token" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "farm_legacy_archives" (
	"idea_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_execution_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid,
	"actor_type" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"provider" text,
	"model" text,
	"status" text NOT NULL,
	"retry_number" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"input_ref" text,
	"output_ref" text
);
--> statement-breakpoint
CREATE TABLE "farm_mvp_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mvp_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"status" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_mvps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idea_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_rate_limits" (
	"key" text NOT NULL,
	"slot" integer NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "farm_rate_limits_key_slot_pk" PRIMARY KEY("key","slot")
);
--> statement-breakpoint
CREATE TABLE "farm_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"public_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_reports_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "farm_research_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idea_id" uuid NOT NULL,
	"idea_version_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'analyzeIdea' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"stale" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "farm_sessions" (
	"hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"url" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_trials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"repetition" integer NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_idea_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idea_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm_action_data" ADD CONSTRAINT "farm_action_data_id_farm_execution_log_id_fk" FOREIGN KEY ("id") REFERENCES "public"."farm_execution_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_artifacts" ADD CONSTRAINT "farm_artifacts_owner_id_farm_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."farm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_artifacts" ADD CONSTRAINT "farm_artifacts_idea_id_farm_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."farm_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_calculations" ADD CONSTRAINT "farm_calculations_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_datasets" ADD CONSTRAINT "farm_datasets_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_decisions" ADD CONSTRAINT "farm_decisions_report_id_farm_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."farm_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_ideas" ADD CONSTRAINT "farm_ideas_owner_id_farm_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."farm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_intake_keys" ADD CONSTRAINT "farm_intake_keys_owner_id_farm_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."farm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_intake_keys" ADD CONSTRAINT "farm_intake_keys_idea_id_farm_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."farm_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_jobs" ADD CONSTRAINT "farm_jobs_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_legacy_archives" ADD CONSTRAINT "farm_legacy_archives_idea_id_farm_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."farm_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_execution_log" ADD CONSTRAINT "farm_execution_log_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_mvp_results" ADD CONSTRAINT "farm_mvp_results_mvp_id_farm_mvps_id_fk" FOREIGN KEY ("mvp_id") REFERENCES "public"."farm_mvps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_mvps" ADD CONSTRAINT "farm_mvps_idea_id_farm_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."farm_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_mvps" ADD CONSTRAINT "farm_mvps_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_mvps" ADD CONSTRAINT "farm_mvps_decision_id_farm_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."farm_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_reports" ADD CONSTRAINT "farm_reports_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_research_runs" ADD CONSTRAINT "farm_research_runs_idea_id_farm_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."farm_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_research_runs" ADD CONSTRAINT "farm_research_runs_idea_version_id_farm_idea_versions_id_fk" FOREIGN KEY ("idea_version_id") REFERENCES "public"."farm_idea_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_sessions" ADD CONSTRAINT "farm_sessions_account_id_farm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."farm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_sources" ADD CONSTRAINT "farm_sources_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_steps" ADD CONSTRAINT "farm_steps_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_trials" ADD CONSTRAINT "farm_trials_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_trials" ADD CONSTRAINT "farm_trials_variant_id_farm_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."farm_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_trials" ADD CONSTRAINT "farm_trials_dataset_id_farm_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."farm_datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_variants" ADD CONSTRAINT "farm_variants_run_id_farm_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."farm_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_idea_versions" ADD CONSTRAINT "farm_idea_versions_idea_id_farm_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."farm_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farm_queue_idx" ON "farm_jobs" USING btree ("status","priority","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "farm_mvp_result_uq" ON "farm_mvp_results" USING btree ("mvp_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "farm_run_request_uq" ON "farm_research_runs" USING btree ("idea_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "farm_source_uq" ON "farm_sources" USING btree ("run_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "farm_step_uq" ON "farm_steps" USING btree ("run_id","name","input_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "farm_trial_uq" ON "farm_trials" USING btree ("run_id","variant_id","task_id","repetition");--> statement-breakpoint
CREATE UNIQUE INDEX "farm_idea_version_uq" ON "farm_idea_versions" USING btree ("idea_id","version");