CREATE TABLE "directory_attestation" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_key_id" text NOT NULL,
	"label" text NOT NULL,
	"authority" text NOT NULL,
	"content_digest" text NOT NULL,
	"signature_input" text NOT NULL,
	"signature" text NOT NULL,
	"created" integer NOT NULL,
	"expires" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory_attestation" ADD CONSTRAINT "directory_attestation_agent_key_id_agent_key_id_fk" FOREIGN KEY ("agent_key_id") REFERENCES "public"."agent_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_attestation_key_unique" ON "directory_attestation" USING btree ("agent_key_id");--> statement-breakpoint
CREATE INDEX "directory_attestation_key_idx" ON "directory_attestation" USING btree ("agent_key_id");