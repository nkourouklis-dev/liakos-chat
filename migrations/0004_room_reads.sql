-- Liakos Chat :: παρακολούθηση αδιάβαστων μηνυμάτων
-- Κρατάμε πότε ο κάθε χρήστης διάβασε τελευταία φορά κάθε δωμάτιο.
CREATE TABLE IF NOT EXISTS room_reads (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_reads_user
ON room_reads(user_id);
