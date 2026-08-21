ALTER TABLE "users" ADD COLUMN "name" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" varchar(20);--> statement-breakpoint
UPDATE "users" SET "name" = 'ユーザー' WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "registration_name" varchar(50);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "registration_avatar" varchar(20);
