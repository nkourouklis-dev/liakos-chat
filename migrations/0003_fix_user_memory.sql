DROP TABLE IF EXISTS user_memory;

CREATE TABLE user_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  importance INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, memory_key)
);

CREATE INDEX idx_user_memory_user ON user_memory(user_id);
CREATE INDEX idx_user_memory_importance ON user_memory(user_id, importance DESC, updated_at DESC);