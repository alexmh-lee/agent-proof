CREATE TYPE "public"."agent_key_status" AS ENUM('active', 'retiring', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'pending_review', 'revoked');--> statement-breakpoint
CREATE TABLE "agent_key" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"thumbprint" text NOT NULL,
	"status" "agent_key_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"not_after" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"label" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_four" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "registration_challenge" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"nonce" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_key" ADD CONSTRAINT "agent_key_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_challenge" ADD CONSTRAINT "registration_challenge_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_key_thumbprint_unique" ON "agent_key" USING btree ("thumbprint");--> statement-breakpoint
CREATE INDEX "agent_key_agent_idx" ON "agent_key" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_account_name_unique" ON "agent" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "agent_account_status_idx" ON "agent" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "agent_account_created_idx" ON "agent" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_unique" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_account_idx" ON "api_key" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_challenge_nonce_unique" ON "registration_challenge" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "registration_challenge_account_idx" ON "registration_challenge" USING btree ("account_id");