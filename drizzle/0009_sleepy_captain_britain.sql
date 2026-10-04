CREATE TABLE "email_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" varchar(10) NOT NULL,
	"status" varchar(16) NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider_message_id" varchar(255),
	"last_error" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_delivery_logs_user_local_date_unique" UNIQUE("user_id","local_date"),
	CONSTRAINT "chk_email_delivery_logs_local_date" CHECK ("email_delivery_logs"."local_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "chk_email_delivery_logs_status" CHECK ("email_delivery_logs"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "email_notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"global_enabled" boolean DEFAULT false NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Tokyo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_email_notification_timezone" CHECK ("email_notification_preferences"."timezone" = 'Asia/Tokyo')
);
--> statement-breakpoint
CREATE TABLE "email_notification_weekday_rules" (
	"user_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"delivery_time" varchar(5) DEFAULT '09:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_notification_weekday_rules_user_id_day_of_week_pk" PRIMARY KEY("user_id","day_of_week"),
	CONSTRAINT "chk_email_notification_day_of_week" CHECK ("email_notification_weekday_rules"."day_of_week" between 1 and 7),
	CONSTRAINT "chk_email_notification_delivery_time" CHECK ("email_notification_weekday_rules"."delivery_time" ~ '^(0[0-9]|1[0-9]|2[0-3]):[03]0$')
);
--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_preferences" ADD CONSTRAINT "email_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_weekday_rules" ADD CONSTRAINT "email_notification_weekday_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_delivery_logs_user_id_index" ON "email_delivery_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_notification_weekday_rules_user_id_index" ON "email_notification_weekday_rules" USING btree ("user_id");