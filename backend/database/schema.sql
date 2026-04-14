-- ============================================================
-- Ticket Lord Database Schema (PostgreSQL / Supabase)
-- ============================================================

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE users (
  id                        SERIAL PRIMARY KEY,
  email                     VARCHAR(255) NOT NULL UNIQUE,
  password_hash             VARCHAR(255) NOT NULL,
  name                      VARCHAR(100) NOT NULL,
  role                      VARCHAR(20) NOT NULL DEFAULT 'attendee' CHECK (role IN ('attendee', 'host', 'admin')),
  email_verified            BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id        VARCHAR(255) NULL,
  stripe_connect_account_id VARCHAR(255) NULL,
  avatar_url                VARCHAR(500) NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Tokens
-- ============================================================
CREATE TABLE refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at);

CREATE TABLE verification_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_tokens_token_hash ON verification_tokens (token_hash);
CREATE INDEX idx_verification_tokens_type ON verification_tokens (type);

-- ============================================================
-- Events
-- ============================================================
CREATE TABLE events (
  id            SERIAL PRIMARY KEY,
  host_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL,
  category      VARCHAR(20) NOT NULL DEFAULT 'other' CHECK (category IN ('music','sports','arts','food','business','technology','education','other')),
  venue_name    VARCHAR(200) NOT NULL,
  venue_address VARCHAR(300) NOT NULL,
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(100) NOT NULL,
  country       VARCHAR(100) NOT NULL DEFAULT 'US',
  latitude      NUMERIC(10,8) NULL,
  longitude     NUMERIC(11,8) NULL,
  start_date    TIMESTAMPTZ NOT NULL,
  end_date      TIMESTAMPTZ NOT NULL,
  image_url     VARCHAR(500) NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled','completed')),
  is_online     BOOLEAN NOT NULL DEFAULT FALSE,
  online_url    VARCHAR(500) NULL,
  max_attendees INTEGER NULL,
  tags          VARCHAR(500) NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_host ON events (host_id);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_start_date ON events (start_date);
CREATE INDEX idx_events_category ON events (category);
CREATE INDEX idx_events_city ON events (city);
CREATE INDEX idx_events_search ON events USING GIN (to_tsvector('english', title || ' ' || description));

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Ticket Types
-- ============================================================
CREATE TABLE ticket_types (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  description   TEXT NULL,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  quantity      INTEGER NOT NULL,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  sale_start    TIMESTAMPTZ NULL,
  sale_end      TIMESTAMPTZ NULL,
  max_per_order INTEGER NOT NULL DEFAULT 10,
  min_per_order INTEGER NOT NULL DEFAULT 1,
  is_visible    BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_types_event ON ticket_types (event_id);
CREATE INDEX idx_ticket_types_deleted ON ticket_types (deleted_at);

CREATE TRIGGER ticket_types_updated_at
  BEFORE UPDATE ON ticket_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Orders
-- ============================================================
CREATE TABLE orders (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id                  INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  total_amount              INTEGER NOT NULL, -- Amount in cents
  platform_fee              INTEGER NOT NULL DEFAULT 0, -- Fee in cents
  status                    VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','refunded')),
  stripe_payment_intent_id  VARCHAR(255) NULL UNIQUE,
  stripe_charge_id          VARCHAR(255) NULL,
  refund_id                 VARCHAR(255) NULL,
  notes                     TEXT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_event ON orders (event_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_payment_intent ON orders (stripe_payment_intent_id);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id  INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  quantity        INTEGER NOT NULL,
  unit_price      INTEGER NOT NULL, -- Price per ticket in cents at time of purchase
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- ============================================================
-- Tickets (individual admission tickets)
-- ============================================================
CREATE TABLE tickets (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id   INTEGER NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id  INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
  ticket_number   VARCHAR(20) NOT NULL UNIQUE,
  qr_code         TEXT NOT NULL, -- Base64 encoded QR code data URL
  status          VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','cancelled','refunded')),
  checked_in_at   TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_user ON tickets (user_id);
CREATE INDEX idx_tickets_event ON tickets (event_id);
CREATE INDEX idx_tickets_order ON tickets (order_id);
CREATE INDEX idx_tickets_ticket_number ON tickets (ticket_number);
CREATE INDEX idx_tickets_status ON tickets (status);

-- ============================================================
-- Seed: Admin user (password: Admin1234!)
-- Update password before deploying to production
-- ============================================================
INSERT INTO users (email, password_hash, name, role, email_verified)
VALUES (
  'admin@ticketlord.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCgdi6UdHVV4E.Rh4yI3f4a',
  'Ticket Lord Admin',
  'admin',
  TRUE
);
