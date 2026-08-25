CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_digest" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_sessions_refresh_token_digest_unique" UNIQUE("refresh_token_digest")
);
--> statement-breakpoint
ALTER TABLE "challenges" DROP CONSTRAINT "challenges_user_id_unique";--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_index" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenges_user_id_index" ON "challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenges_challenge_index" ON "challenges" USING btree ("challenge");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "refresh_token";