-- M7.3: speed bounded, account-private completion history queries.
-- Index only; no data rewrite or production execution during feature work.
CREATE INDEX IF NOT EXISTS task_events_completion_owner_time
 ON dayframe.task_events(owner_user_id,created_at DESC,event_id DESC)
 WHERE event_type='completed';

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0018_completion_insights_index') ON CONFLICT(version) DO NOTHING;
