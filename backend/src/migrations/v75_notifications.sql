-- v75: In-App Notification System
-- Used for: admin-modified colab groups, future system events

CREATE TABLE IF NOT EXISTS script_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  typ TEXT NOT NULL,
  titel TEXT NOT NULL,
  nachricht TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  gelesen BOOLEAN DEFAULT false,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_notif_user_unread
  ON script_notifications (user_id, gelesen);

CREATE INDEX IF NOT EXISTS idx_script_notif_user_time
  ON script_notifications (user_id, erstellt_am DESC);
