-- Liakos Chat :: επεξεργασία και διαγραφή μηνυμάτων
-- Τα διαγραμμένα μηνύματα δεν σβήνονται πραγματικά (soft delete), ώστε να
-- μπορούμε να δείξουμε "το μήνυμα διαγράφηκε" αντί να εξαφανιστεί ξαφνικά.
ALTER TABLE messages ADD COLUMN edited_at INTEGER;
ALTER TABLE messages ADD COLUMN deleted_at INTEGER;
