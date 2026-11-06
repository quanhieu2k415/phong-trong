-- Undecided bookings hold a slot; expiry gives them a terminal status of their own.
-- The overlap constraint only covers pending and confirmed, so an expired booking frees its slot.
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'expired'));
