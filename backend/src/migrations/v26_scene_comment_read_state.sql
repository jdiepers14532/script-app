-- v26: Scene comment read-state for Messenger-App annotation badge
-- scene_comment_read_state: tracks when each user last "read" comments for a scene
CREATE TABLE IF NOT EXISTS scene_comment_read_state (
  scene_id     INTEGER      NOT NULL,
  user_id      TEXT         NOT NULL,
  last_read_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scene_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_comment_read_state_scene
  ON scene_comment_read_state (scene_id);

-- scene_comment_events: projection of Messenger-App annotations (pushed via internal webhook)
-- Only stores minimal data needed for unread-count, no content
CREATE TABLE IF NOT EXISTS scene_comment_events (
  id                       SERIAL PRIMARY KEY,
  scene_id                 INTEGER NOT NULL,
  messenger_annotation_id  TEXT    NOT NULL UNIQUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scene_comment_events_scene
  ON scene_comment_events (scene_id)
  WHERE deleted_at IS NULL;
