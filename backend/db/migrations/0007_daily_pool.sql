-- M4.1: one untimed, ordered task pool per owner and calendar date.
-- Timed intervals, capacity, reminders and session storage remain untouched.
CREATE TABLE IF NOT EXISTS dayframe.daily_pools (
 owner_user_id text NOT NULL,
 plan_day date NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_user_id,plan_day)
);
CREATE TABLE IF NOT EXISTS dayframe.daily_pool_items (
 owner_user_id text NOT NULL,
 plan_day date NOT NULL,
 task_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 99),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_user_id,plan_day,task_id),
 CONSTRAINT daily_pool_parent FOREIGN KEY(owner_user_id,plan_day)
  REFERENCES dayframe.daily_pools(owner_user_id,plan_day) ON DELETE CASCADE,
 CONSTRAINT daily_pool_task_owner FOREIGN KEY(task_id,owner_user_id)
  REFERENCES dayframe.tasks(id,owner_user_id) ON DELETE CASCADE,
 CONSTRAINT daily_pool_unique_position UNIQUE(owner_user_id,plan_day,position)
);
CREATE INDEX IF NOT EXISTS daily_pool_task_lookup ON dayframe.daily_pool_items(owner_user_id,task_id);

CREATE OR REPLACE FUNCTION dayframe.replace_daily_pool(
 p_owner text,p_day date,p_expected_revision integer,p_ids uuid[]
) RETURNS integer LANGUAGE plpgsql AS $daily_pool$
DECLARE current_revision integer; next_revision integer; invalid_count integer;
BEGIN
 IF p_owner IS NULL OR length(p_owner)=0 OR length(p_owner)>256
  OR p_day IS NULL OR p_day<'2000-01-01'::date OR p_day>'2100-12-31'::date
  OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_ids IS NULL
  OR cardinality(p_ids)>100 OR array_position(p_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'Invalid day-pool arguments' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(DISTINCT id) FROM unnest(p_ids) AS ids(id))<>cardinality(p_ids) THEN
   RAISE EXCEPTION 'Duplicate task in day pool' USING ERRCODE='23514';
 END IF;
 INSERT INTO dayframe.daily_pools(owner_user_id,plan_day)
  VALUES(p_owner,p_day) ON CONFLICT(owner_user_id,plan_day) DO NOTHING;
 SELECT revision INTO current_revision
  FROM dayframe.daily_pools WHERE owner_user_id=p_owner AND plan_day=p_day FOR UPDATE;
 IF current_revision IS DISTINCT FROM p_expected_revision THEN
   RAISE EXCEPTION 'Day pool has been updated from another device' USING ERRCODE='40001';
 END IF;
 SELECT count(*) INTO invalid_count
  FROM unnest(p_ids) AS ids(id)
  LEFT JOIN dayframe.tasks t ON t.id=ids.id AND t.owner_user_id=p_owner
    AND t.status='open' AND t.deleted_at IS NULL AND t.archived_at IS NULL
  LEFT JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=p_owner
    AND w.deleted_at IS NULL AND w.archived_at IS NULL
  WHERE t.id IS NULL OR w.id IS NULL;
 IF invalid_count>0 THEN
   RAISE EXCEPTION 'Day pool contains a task that is not active or owned by this account' USING ERRCODE='40001';
 END IF;
 DELETE FROM dayframe.daily_pool_items
  WHERE owner_user_id=p_owner AND plan_day=p_day;
 INSERT INTO dayframe.daily_pool_items(owner_user_id,plan_day,task_id,position)
 SELECT p_owner,p_day,id,(ordinality-1)::integer
 FROM unnest(p_ids) WITH ORDINALITY AS items(id,ordinality);
 UPDATE dayframe.daily_pools SET revision=revision+1,updated_at=now()
  WHERE owner_user_id=p_owner AND plan_day=p_day
  RETURNING revision INTO next_revision;
 RETURN next_revision;
END $daily_pool$;

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0007_daily_pool') ON CONFLICT(version) DO NOTHING;
