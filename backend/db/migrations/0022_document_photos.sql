-- Account-owned images for rich documents (not Quick Notes).
-- Four slots per document, 180 KB each after client compression.
CREATE TABLE IF NOT EXISTS dayframe.document_photos (
 document_id uuid NOT NULL,
 owner_user_id text NOT NULL,
 slot smallint NOT NULL CHECK(slot BETWEEN 0 AND 3),
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 image_bytes bytea NOT NULL CHECK(octet_length(image_bytes) BETWEEN 16 AND 180000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,slot),
 CONSTRAINT document_photos_owned
 FOREIGN KEY(document_id,owner_user_id) REFERENCES dayframe.documents(id,owner_user_id)
 ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS document_photos_owner ON dayframe.document_photos(owner_user_id,document_id);
INSERT INTO dayframe.schema_migrations(version) VALUES('0022_document_photos')
 ON CONFLICT(version) DO NOTHING;
