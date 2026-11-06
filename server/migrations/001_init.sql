CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id               serial PRIMARY KEY,
  name             text NOT NULL UNIQUE,
  description      text NOT NULL DEFAULT '',
  capacity         integer NOT NULL CHECK (capacity > 0),
  hourly_price_vnd integer NOT NULL CHECK (hourly_price_vnd >= 0),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id         serial PRIMARY KEY,
  room_id    integer NOT NULL REFERENCES rooms (id),
  user_id    integer NOT NULL REFERENCES users (id),
  during     tstzrange NOT NULL CHECK (NOT isempty(during)),
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  total_vnd  integer NOT NULL CHECK (total_vnd >= 0),
  note       text NOT NULL DEFAULT '',
  decided_by integer REFERENCES users (id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Two live bookings can never overlap on one room, whatever the application does.
  CONSTRAINT bookings_no_overlap
    EXCLUDE USING gist (room_id WITH =, during WITH &&)
    WHERE (status IN ('pending', 'confirmed'))
);

CREATE INDEX bookings_user_idx ON bookings (user_id, created_at DESC);
CREATE INDEX bookings_status_idx ON bookings (status, created_at DESC);
CREATE INDEX bookings_start_idx ON bookings (lower(during));
