-- M3 cleanup safety: permanent task deletion also removes task-owned binary photos.
-- The irreversible operation is still separately authenticated and confirmed by the API.
ALTER TABLE dayframe.task_media DROP CONSTRAINT IF EXISTS task_media_owned;
ALTER TABLE dayframe.task_media ADD CONSTRAINT task_media_owned
 FOREIGN KEY(task_id,owner_user_id) REFERENCES dayframe.tasks(id,owner_user_id)
 ON DELETE CASCADE;
INSERT INTO dayframe.schema_migrations(version) VALUES ('0006_task_media_cascade')
 ON CONFLICT(version) DO NOTHING;