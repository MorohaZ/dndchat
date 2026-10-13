import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Enable pgcrypto extension for UUID generation
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`.execute(db);

  // 2. Players Table (Personal Data Vault)
  await sql`
    CREATE TABLE players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      line_user_id VARCHAR(64) UNIQUE NOT NULL,
      display_name VARCHAR(100),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`CREATE INDEX idx_players_line_user_id ON players(line_user_id)`.execute(db);

  // 3. Webhook Events Table (Ingestion Queue & Idempotency - NO FK to rooms)
  await sql`
    CREATE TABLE webhook_events (
      event_id VARCHAR(64) PRIMARY KEY,
      received_sequence BIGSERIAL NOT NULL,
      line_timestamp BIGINT NOT NULL,
      correlation_id VARCHAR(64) NOT NULL,
      destination_id VARCHAR(64),
      event_type VARCHAR(32) NOT NULL,
      source_type VARCHAR(16) NOT NULL,
      source_id VARCHAR(64) NOT NULL,
      raw_payload JSONB,
      result_payload JSONB,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      attempts INT NOT NULL DEFAULT 0,
      worker_id VARCHAR(64),
      locked_until TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_webhook_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      CONSTRAINT chk_webhook_source_type CHECK (source_type IN ('group', 'room', 'user'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_webhook_fifo_order ON webhook_events (source_id, status, line_timestamp, received_sequence)
  `.execute(db);

  await sql`
    CREATE INDEX idx_webhook_lease ON webhook_events (status, locked_until, attempts)
    WHERE status IN ('PENDING', 'PROCESSING')
  `.execute(db);

  // 4. Rooms Table (Session Management & Room Ordering)
  await sql`
    CREATE TABLE rooms (
      id VARCHAR(64) PRIMARY KEY,
      source_type VARCHAR(16) NOT NULL,
      name VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
      last_sequence_number BIGINT NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES players(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_room_status CHECK (status IN ('WAITING', 'ACTIVE', 'PAUSED', 'ENDED')),
      CONSTRAINT chk_room_source_type CHECK (source_type IN ('group', 'room', 'user'))
    )
  `.execute(db);

  // 5. Characters Table (D&D 5e State)
  await sql`
    CREATE TABLE characters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      name VARCHAR(100) NOT NULL,
      race VARCHAR(50) NOT NULL,
      class VARCHAR(50) NOT NULL,
      level SMALLINT NOT NULL DEFAULT 1,
      hp_max INT NOT NULL,
      hp_current INT NOT NULL,
      hp_temp INT NOT NULL DEFAULT 0,
      armor_class INT NOT NULL DEFAULT 10,
      score_str SMALLINT NOT NULL,
      score_dex SMALLINT NOT NULL,
      score_con SMALLINT NOT NULL,
      score_int SMALLINT NOT NULL,
      score_wis SMALLINT NOT NULL,
      score_cha SMALLINT NOT NULL,
      is_alive BOOLEAN NOT NULL DEFAULT TRUE,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_character_level CHECK (level BETWEEN 1 AND 20),
      CONSTRAINT chk_character_hp_bounds CHECK (hp_current >= 0 AND hp_current <= hp_max),
      CONSTRAINT chk_character_hp_max CHECK (hp_max > 0),
      CONSTRAINT chk_character_hp_temp CHECK (hp_temp >= 0),
      CONSTRAINT chk_character_abilities CHECK (
        score_str BETWEEN 1 AND 30 AND
        score_dex BETWEEN 1 AND 30 AND
        score_con BETWEEN 1 AND 30 AND
        score_int BETWEEN 1 AND 30 AND
        score_wis BETWEEN 1 AND 30 AND
        score_cha BETWEEN 1 AND 30
      ),
      CONSTRAINT uq_character_player_room UNIQUE (room_id, player_id)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_characters_room ON characters(room_id)`.execute(db);

  // 6. Event Logs Table (Append-Only Game Journal per Room)
  await sql`
    CREATE TABLE event_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      correlation_id VARCHAR(64) NOT NULL,
      sequence_number BIGINT NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_event_logs_room_seq UNIQUE (room_id, sequence_number)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_event_logs_room_seq ON event_logs(room_id, sequence_number ASC)`.execute(db);

  // 7. Roll Audit Logs Table (Dice Audit Trail with Event Uniqueness)
  await sql`
    CREATE TABLE roll_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      event_id VARCHAR(64) NOT NULL REFERENCES webhook_events(event_id) ON DELETE RESTRICT,
      correlation_id VARCHAR(64) NOT NULL,
      event_log_id UUID REFERENCES event_logs(id) ON DELETE RESTRICT,
      player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
      expression VARCHAR(60) NOT NULL,
      total INT NOT NULL,
      modifier INT NOT NULL,
      kept_rolls JSONB NOT NULL,
      dropped_rolls JSONB,
      is_crit BOOLEAN NOT NULL DEFAULT FALSE,
      is_fumble BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_roll_audit_event UNIQUE (event_id)
    )
  `.execute(db);

  await sql`CREATE INDEX idx_roll_audit_room ON roll_audit_logs(room_id, created_at DESC)`.execute(db);
  await sql`CREATE INDEX idx_roll_audit_player ON roll_audit_logs(player_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS roll_audit_logs CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS event_logs CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS characters CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS rooms CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS webhook_events CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS players CASCADE`.execute(db);
}
