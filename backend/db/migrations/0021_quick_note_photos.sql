-- M10: private, bounded Quick Note image. No legacy-database migration.
-- Apply only to the current Dayframe Neon branch, before deploying the new API.
-- One 180 KB photo per note; images are not publicly addressable.
CREATE TABLE IF NOT EXISTS dayframe.note_photos (
 note_id uuid PRIMARY KEY,
 owner_user_id text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 image_bytes bytea NOT NULL CHECK(octet_length(image_bytes) BETWEEN 16 AND 180000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT note_photos_owner_note_fk
  FOREIGN KEY(note_id,owner_user_id)
  REFERENCES dayframe.quick_notes(id,owner_user_id)
  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS note_photos_owner ON dayframe.note_photos(owner_user_id,note_id);
INSERT INTO dayframe.schema_migrations(version)
 VALUES('0021_quick_note_photos') ON CONFLICT(version) DO NOTHING;
