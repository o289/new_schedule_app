CREATE OR REPLACE FUNCTION "prevent_schedule_date_overlap"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT "user_id"
  INTO target_user_id
  FROM "schedules"
  WHERE "id" = NEW."schedule_id";

  PERFORM pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM "schedule_dates" AS existing_date
    INNER JOIN "schedules" AS existing_schedule
      ON existing_schedule."id" = existing_date."schedule_id"
    WHERE existing_schedule."user_id" = target_user_id
      AND existing_date."id" <> NEW."id"
      AND existing_date."start_date" < NEW."end_date"
      AND existing_date."end_date" > NEW."start_date"
  ) THEN
    RAISE EXCEPTION 'SCHEDULE_TIME_OVERLAP' USING ERRCODE = '23P01';
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "schedule_dates_no_overlap"
AFTER INSERT OR UPDATE OF "schedule_id", "start_date", "end_date" ON "schedule_dates"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "prevent_schedule_date_overlap"();
