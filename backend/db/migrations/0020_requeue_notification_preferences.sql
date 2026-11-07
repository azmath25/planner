-- M8.1: a preference change invalidates unsent outbox fire instants.
-- Regenerate pending/retry occurrences from the new timezone/quiet window
-- during the next scheduled enqueue. Delivered rows are retained as history.
-- In-flight (sending) rows are rechecked against the current preferences
-- by the worker; after recheck they are either expired or sent. At-least-once
-- delivery and the narrow recheck/send race remain operational limitations.
CREATE OR REPLACE FUNCTION dayframe.clear_stale_notification_queue()
RETURNS trigger LANGUAGE plpgsql AS $clear_queue$
BEGIN
 IF NEW.time_zone IS DISTINCT FROM OLD.time_zone
  OR NEW.quiet_start IS DISTINCT FROM OLD.quiet_start
  OR NEW.quiet_end IS DISTINCT FROM OLD.quiet_end THEN
  DELETE FROM dayframe.notification_deliveries d
   WHERE d.owner_user_id=NEW.owner_user_id AND d.status IN ('pending','retry');
  DELETE FROM dayframe.note_notification_deliveries d
   WHERE d.owner_user_id=NEW.owner_user_id AND d.status IN ('pending','retry');
 END IF;
 RETURN NEW;
END $clear_queue$;

DROP TRIGGER IF EXISTS notification_preferences_queue_guard
 ON dayframe.notification_preferences;
CREATE TRIGGER notification_preferences_queue_guard
 AFTER UPDATE OF time_zone,quiet_start,quiet_end
 ON dayframe.notification_preferences FOR EACH ROW
 EXECUTE FUNCTION dayframe.clear_stale_notification_queue();

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0020_requeue_notification_preferences') ON CONFLICT(version) DO NOTHING;
