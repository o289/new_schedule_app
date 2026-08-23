CREATE TYPE "public"."group_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "group_banned_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by_user_id" uuid NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_banned_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"join_code_digest" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_join_code_digest_unique" UNIQUE("join_code_digest")
);
--> statement-breakpoint
ALTER TABLE "group_banned_members" ADD CONSTRAINT "group_banned_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_banned_members" ADD CONSTRAINT "group_banned_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_banned_members" ADD CONSTRAINT "group_banned_members_banned_by_user_id_users_id_fk" FOREIGN KEY ("banned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_banned_members_user_id_index" ON "group_banned_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_one_owner_unique" ON "group_members" USING btree ("group_id") WHERE "group_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "group_members_user_id_index" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "schedule_dates_start_end_index" ON "schedule_dates" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "schedules_user_id_index" ON "schedules" USING btree ("user_id");