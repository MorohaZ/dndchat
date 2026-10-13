import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql, type Kysely } from 'kysely';
import { createDatabaseClient } from './client.js';
import { migrateToLatest, migrateDown } from './migrator.js';
import {
  getNextEligibleWebhookEvent,
  leaseWebhookEvent,
  commitWebhookEvent,
  failWebhookEvent,
} from './queries.js';
import type { Database, WorkerConfig } from './types.js';

const { Client } = pg;

const ADMIN_DATABASE_URL =
  process.env.ADMIN_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
const TEST_DATABASE_NAME = 'dndchat_test';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || `postgres://postgres:postgres@127.0.0.1:5432/${TEST_DATABASE_NAME}`;

const TEST_WORKER_CONFIG: WorkerConfig = {
  maxAttempts: 5,
  leaseDurationSeconds: 30,
};

describe('PostgreSQL Database Schema & Concurrency (Task 1.3)', () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    // 1. Isolate test database: drop if exists and create fresh dndchat_test
    const adminClient = new Client({ connectionString: ADMIN_DATABASE_URL });
    await adminClient.connect();
    try {
      await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME} WITH (FORCE);`);
      await adminClient.query(`CREATE DATABASE ${TEST_DATABASE_NAME};`);
    } finally {
      await adminClient.end();
    }

    // 2. Connect client exclusively to isolated dndchat_test
    db = createDatabaseClient(TEST_DATABASE_URL);
    await migrateToLatest(db);
  });

  afterAll(async () => {
    // 1. Terminate client connection
    if (db) {
      await db.destroy();
    }

    // 2. Clean up test database
    const adminClient = new Client({ connectionString: ADMIN_DATABASE_URL });
    try {
      await adminClient.connect();
      await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME} WITH (FORCE);`);
    } finally {
      await adminClient.end();
    }
  });

  it('1. Migration up and down cycle cleanly', async () => {
    // Test rollback
    const downResult = await migrateDown(db);
    expect(downResult.error).toBeUndefined();

    // Verify tables are dropped
    const checkTable = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'rooms'
      ) as exists;
    `.execute(db);
    expect(checkTable.rows[0].exists).toBe(false);

    // Re-migrate to latest
    const upResult = await migrateToLatest(db);
    expect(upResult.error).toBeUndefined();

    const checkTableAfter = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'rooms'
      ) as exists;
    `.execute(db);
    expect(checkTableAfter.rows[0].exists).toBe(true);
  });

  it('2. Events before room exists succeed without foreign key violation', async () => {
    const eventId = `evt_before_room_${Date.now()}`;
    const uncreatedGroupId = `group_uncreated_${Date.now()}`;

    // Webhook arrival for a room that does not exist in rooms table yet
    const insertResult = await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id, status
      ) VALUES (
        ${eventId}, 1700000000000, 'corr_test_pre_room', 'join', 'group', ${uncreatedGroupId}, 'PENDING'
      ) RETURNING event_id;
    `.execute(db);

    expect(insertResult.rows).toHaveLength(1);
    expect((insertResult.rows[0] as { event_id: string }).event_id).toBe(eventId);
  });

  it('3. Optimistic locking on room and character fails when version mismatches', async () => {
    const roomId = `room_opt_${Date.now()}`;

    // Create room with version = 1
    await sql`
      INSERT INTO rooms (id, source_type, name, status, version)
      VALUES (${roomId}, 'group', 'Adventure Room', 'ACTIVE', 1);
    `.execute(db);

    // Worker A updates version 1 -> 2
    const updateA = await sql`
      UPDATE rooms
      SET name = 'Adventure Room by Worker A', version = version + 1
      WHERE id = ${roomId} AND version = 1
      RETURNING version;
    `.execute(db);
    expect(updateA.rows).toHaveLength(1);
    expect((updateA.rows[0] as { version: number }).version).toBe(2);

    // Worker B attempts to update with stale version 1
    const updateB = await sql`
      UPDATE rooms
      SET name = 'Adventure Room by Worker B', version = version + 1
      WHERE id = ${roomId} AND version = 1
      RETURNING version;
    `.execute(db);
    // Optimistic lock failure: 0 rows affected
    expect(updateB.rows).toHaveLength(0);
  });

  it('4. Constraints enforcement: FK, CHECK, and UNIQUE', async () => {
    const playerId = '00000000-0000-0000-0000-000000000001';
    const lineUserId = `U_test_user_${Date.now()}`;
    const roomId = `room_constraints_${Date.now()}`;

    // Insert Player (line_user_id is UNIQUE NOT NULL)
    await sql`
      INSERT INTO players (id, line_user_id, display_name)
      VALUES (${playerId}::uuid, ${lineUserId}, 'Test Paladin');
    `.execute(db);

    // Insert Room
    await sql`
      INSERT INTO rooms (id, source_type, name, status, created_by)
      VALUES (${roomId}, 'group', 'Catacombs', 'ACTIVE', ${playerId}::uuid);
    `.execute(db);

    // CHECK: hp_current > hp_max must fail
    await expect(
      sql`
        INSERT INTO characters (
          room_id, player_id, name, race, class, level, hp_max, hp_current,
          score_str, score_dex, score_con, score_int, score_wis, score_cha
        ) VALUES (
          ${roomId}, ${playerId}::uuid, 'Arthur', 'Human', 'Paladin', 1, 20, 25,
          16, 12, 14, 10, 13, 15
        );
      `.execute(db)
    ).rejects.toThrow(/chk_character_hp_bounds/i);

    // CHECK: hp_current < 0 must fail
    await expect(
      sql`
        INSERT INTO characters (
          room_id, player_id, name, race, class, level, hp_max, hp_current,
          score_str, score_dex, score_con, score_int, score_wis, score_cha
        ) VALUES (
          ${roomId}, ${playerId}::uuid, 'Arthur', 'Human', 'Paladin', 1, 20, -5,
          16, 12, 14, 10, 13, 15
        );
      `.execute(db)
    ).rejects.toThrow(/chk_character_hp_bounds/i);

    // CHECK: score_int outside 1-30 must fail
    await expect(
      sql`
        INSERT INTO characters (
          room_id, player_id, name, race, class, level, hp_max, hp_current,
          score_str, score_dex, score_con, score_int, score_wis, score_cha
        ) VALUES (
          ${roomId}, ${playerId}::uuid, 'Arthur', 'Human', 'Paladin', 1, 20, 20,
          16, 12, 14, 35, 13, 15
        );
      `.execute(db)
    ).rejects.toThrow(/chk_character_abilities/i);

    // CHECK: level outside 1-20 must fail
    await expect(
      sql`
        INSERT INTO characters (
          room_id, player_id, name, race, class, level, hp_max, hp_current,
          score_str, score_dex, score_con, score_int, score_wis, score_cha
        ) VALUES (
          ${roomId}, ${playerId}::uuid, 'Arthur', 'Human', 'Paladin', 25, 20, 20,
          16, 12, 14, 10, 13, 15
        );
      `.execute(db)
    ).rejects.toThrow(/chk_character_level/i);

    // Valid Character Insert
    const charResult = await sql`
      INSERT INTO characters (
        room_id, player_id, name, race, class, level, hp_max, hp_current,
        score_str, score_dex, score_con, score_int, score_wis, score_cha
      ) VALUES (
        ${roomId}, ${playerId}::uuid, 'Arthur', 'Human', 'Paladin', 1, 20, 20,
        16, 12, 14, 10, 13, 15
      ) RETURNING id;
    `.execute(db);
    const characterId = (charResult.rows[0] as { id: string }).id;

    // UNIQUE: uq_character_player_room (duplicate player in same room) must fail
    await expect(
      sql`
        INSERT INTO characters (
          room_id, player_id, name, race, class, level, hp_max, hp_current,
          score_str, score_dex, score_con, score_int, score_wis, score_cha
        ) VALUES (
          ${roomId}, ${playerId}::uuid, 'Arthur Duplicate', 'Human', 'Paladin', 1, 20, 20,
          16, 12, 14, 10, 13, 15
        );
      `.execute(db)
    ).rejects.toThrow(/uq_character_player_room/i);

    // UNIQUE: uq_event_logs_room_seq
    await sql`
      INSERT INTO event_logs (room_id, correlation_id, sequence_number, event_type, payload)
      VALUES (${roomId}, 'corr_ev_1', 1, 'GAME_START', '{"scene":"entrance"}'::jsonb);
    `.execute(db);

    await expect(
      sql`
        INSERT INTO event_logs (room_id, correlation_id, sequence_number, event_type, payload)
        VALUES (${roomId}, 'corr_ev_dup', 1, 'GAME_START', '{"scene":"entrance"}'::jsonb);
      `.execute(db)
    ).rejects.toThrow(/uq_event_logs_room_seq/i);

    // Insert Webhook Event
    const rollEventId = `evt_roll_${Date.now()}`;
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id, status
      ) VALUES (
        ${rollEventId}, 1700000000000, 'corr_roll_1', 'message', 'group', ${roomId}, 'COMPLETED'
      );
    `.execute(db);

    // Insert Roll Audit Log
    await sql`
      INSERT INTO roll_audit_logs (
        room_id, event_id, correlation_id, player_id, character_id, expression, total, modifier, kept_rolls
      ) VALUES (
        ${roomId}, ${rollEventId}, 'corr_roll_1', ${playerId}::uuid, ${characterId}::uuid,
        '1d20+3', 18, 3, '[15]'::jsonb
      );
    `.execute(db);

    // UNIQUE: uq_roll_audit_event (replay duplicate prevention)
    await expect(
      sql`
        INSERT INTO roll_audit_logs (
          room_id, event_id, correlation_id, player_id, character_id, expression, total, modifier, kept_rolls
        ) VALUES (
          ${roomId}, ${rollEventId}, 'corr_roll_dup', ${playerId}::uuid, ${characterId}::uuid,
          '1d20+3', 18, 3, '[15]'::jsonb
        );
      `.execute(db)
    ).rejects.toThrow(/uq_roll_audit_event/i);

    // FK ON DELETE RESTRICT on room with audit log
    await expect(
      sql`DELETE FROM rooms WHERE id = ${roomId};`.execute(db)
    ).rejects.toThrow(/foreign key constraint/i);

    // FK ON DELETE RESTRICT on player with audit log
    await expect(
      sql`DELETE FROM players WHERE id = ${playerId}::uuid;`.execute(db)
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it('5. Trigger automatically updates updated_at column on row update', async () => {
    const roomId = `room_trig_${Date.now()}`;
    await sql`
      INSERT INTO rooms (id, source_type, name, status, updated_at)
      VALUES (${roomId}, 'group', 'Trigger Test Room', 'ACTIVE', '2020-01-01 00:00:00+00');
    `.execute(db);

    const initialRoom = await sql<{ updated_at: Date }>`
      SELECT updated_at FROM rooms WHERE id = ${roomId};
    `.execute(db);
    const initialTimestamp = new Date(initialRoom.rows[0].updated_at).getTime();

    // Perform an update without touching updated_at column explicitly
    await sql`
      UPDATE rooms
      SET name = 'Trigger Test Room Renamed'
      WHERE id = ${roomId};
    `.execute(db);

    const updatedRoom = await sql<{ updated_at: Date }>`
      SELECT updated_at FROM rooms WHERE id = ${roomId};
    `.execute(db);
    const updatedTimestamp = new Date(updatedRoom.rows[0].updated_at).getTime();

    expect(updatedTimestamp).toBeGreaterThan(initialTimestamp);
  });

  it('6. Data retention policy: clearing raw_payload succeeds, but deleting row is blocked by FK RESTRICT', async () => {
    const playerId = '00000000-0000-0000-0000-000000000002';
    const lineUserId = `U_retention_${Date.now()}`;
    const roomId = `room_retention_${Date.now()}`;
    const eventId = `evt_retention_${Date.now()}`;

    await sql`
      INSERT INTO players (id, line_user_id, display_name)
      VALUES (${playerId}::uuid, ${lineUserId}, 'Retention Hero');
    `.execute(db);

    await sql`
      INSERT INTO rooms (id, source_type, name, status, created_by)
      VALUES (${roomId}, 'group', 'Retention Chamber', 'ACTIVE', ${playerId}::uuid);
    `.execute(db);

    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id, status, raw_payload
      ) VALUES (
        ${eventId}, 1700000000000, 'corr_retention_1', 'message', 'group', ${roomId}, 'COMPLETED',
        '{"text":"!roll 1d20"}'::jsonb
      );
    `.execute(db);

    await sql`
      INSERT INTO roll_audit_logs (
        room_id, event_id, correlation_id, player_id, expression, total, modifier, kept_rolls
      ) VALUES (
        ${roomId}, ${eventId}, 'corr_retention_1', ${playerId}::uuid, '1d20', 15, 0, '[15]'::jsonb
      );
    `.execute(db);

    // Attempting to delete webhook_events row MUST fail due to roll_audit_logs FK RESTRICT
    await expect(
      sql`DELETE FROM webhook_events WHERE event_id = ${eventId};`.execute(db)
    ).rejects.toThrow(/foreign key constraint/i);

    // Clearing raw_payload for privacy retention MUST succeed
    const purgeResult = await sql`
      UPDATE webhook_events
      SET raw_payload = NULL
      WHERE event_id = ${eventId}
      RETURNING event_id, raw_payload;
    `.execute(db);

    expect(purgeResult.rows).toHaveLength(1);
    expect((purgeResult.rows[0] as { raw_payload: unknown }).raw_payload).toBeNull();

    // Audit log still exists and references event_id
    const auditCheck = await sql<{ event_id: string }>`
      SELECT event_id FROM roll_audit_logs WHERE event_id = ${eventId};
    `.execute(db);
    expect(auditCheck.rows).toHaveLength(1);
  });

  it('7. Atomic sequence increment per room concurrently yields 1..10 without gaps or collisions', async () => {
    const roomId = `room_seq_atomic_${Date.now()}`;

    await sql`
      INSERT INTO rooms (id, source_type, name, status, last_sequence_number)
      VALUES (${roomId}, 'group', 'Sequence Arena', 'ACTIVE', 0);
    `.execute(db);

    // Run 10 atomic increments concurrently
    const promises = Array.from({ length: 10 }, () =>
      sql<{ seq: string }>`
        UPDATE rooms
        SET last_sequence_number = last_sequence_number + 1,
            version = version + 1
        WHERE id = ${roomId}
        RETURNING last_sequence_number as seq;
      `.execute(db)
    );

    const results = await Promise.all(promises);
    const returnedSeqs = results.map((r) => Number(r.rows[0].seq)).sort((a, b) => a - b);

    expect(returnedSeqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('8. FIFO worker pickup: same room cannot be acquired simultaneously, different rooms run in parallel', async () => {
    const roomA = `room_fifo_A_${Date.now()}`;
    const roomB = `room_fifo_B_${Date.now()}`;

    // Room A Event 1: currently PROCESSING with unexpired lease
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id,
        status, worker_id, locked_until
      ) VALUES (
        'evt_A1', 1000, 'corr_A1', 'message', 'group', ${roomA},
        'PROCESSING', 'worker_alpha', NOW() + INTERVAL '30 seconds'
      );
    `.execute(db);

    // Room A Event 2: PENDING with higher timestamp
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id, status
      ) VALUES (
        'evt_A2', 2000, 'corr_A2', 'message', 'group', ${roomA}, 'PENDING'
      );
    `.execute(db);

    // Room B Event 1: PENDING
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id, status
      ) VALUES (
        'evt_B1', 1500, 'corr_B1', 'message', 'group', ${roomB}, 'PENDING'
      );
    `.execute(db);

    // Pick next eligible event using parameterized worker configuration
    const candidate = await getNextEligibleWebhookEvent(db, TEST_WORKER_CONFIG);

    // Room A Event 2 is blocked because Event A1 is PROCESSING with active lease.
    // Therefore, Room B Event 1 MUST be picked up!
    expect(candidate).not.toBeNull();
    expect(candidate?.event_id).toBe('evt_B1');
    expect(candidate?.source_id).toBe(roomB);
  });

  it('9. Max attempts exceeded transitions to FAILED and unblocks subsequent room events', async () => {
    const roomA = `room_max_attempts_${Date.now()}`;

    // Event A1 has reached max attempts (5) and its lease expired
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id,
        status, attempts, locked_until
      ) VALUES (
        'evt_failed_A1', 1000, 'corr_fail_1', 'message', 'group', ${roomA},
        'PROCESSING', 5, NOW() - INTERVAL '1 second'
      );
    `.execute(db);

    // Event A2 is pending behind it
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id, status
      ) VALUES (
        'evt_pending_A2', 2000, 'corr_pending_2', 'message', 'group', ${roomA}, 'PENDING'
      );
    `.execute(db);

    // Transition dead job to FAILED using failWebhookEvent helper
    const failedResult = await failWebhookEvent(db, 'evt_failed_A1', {
      error: 'Max attempts exceeded',
    });
    expect(failedResult).toBe(true);

    // Candidate pickup for roomA: Event A2 should now be unblocked!
    const candidate = await getNextEligibleWebhookEvent(db, TEST_WORKER_CONFIG, roomA);

    expect(candidate).not.toBeNull();
    expect(candidate?.event_id).toBe('evt_pending_A2');
  });

  it('10. Worker whose lease expired cannot commit (fencing lease validation)', async () => {
    const eventId = `evt_fencing_${Date.now()}`;

    // Worker holds expired lease
    await sql`
      INSERT INTO webhook_events (
        event_id, line_timestamp, correlation_id, event_type, source_type, source_id,
        status, worker_id, locked_until
      ) VALUES (
        ${eventId}, 1000, 'corr_fencing', 'message', 'group', 'room_fencing',
        'PROCESSING', 'worker_dead', NOW() - INTERVAL '5 seconds'
      );
    `.execute(db);

    // Worker attempts to commit results after lease expiration
    const commitSuccess = await commitWebhookEvent(db, eventId, 'worker_dead', {
      result: 'stale_write',
    });

    // Commit must fail because lease expired
    expect(commitSuccess).toBe(false);

    // Event remains in PROCESSING / expired state rather than committed
    const checkEvent = await sql<{ status: string }>`
      SELECT status FROM webhook_events WHERE event_id = ${eventId};
    `.execute(db);
    expect(checkEvent.rows[0].status).toBe('PROCESSING');

    // Acquire lease for a new worker succeeds
    const leaseSuccess = await leaseWebhookEvent(
      db,
      eventId,
      'worker_alive',
      TEST_WORKER_CONFIG
    );
    expect(leaseSuccess).toBe(true);

    // Active worker can now commit successfully
    const commitSuccessAlive = await commitWebhookEvent(db, eventId, 'worker_alive', {
      result: 'valid_write',
    });
    expect(commitSuccessAlive).toBe(true);

    const checkEventCompleted = await sql<{ status: string }>`
      SELECT status FROM webhook_events WHERE event_id = ${eventId};
    `.execute(db);
    expect(checkEventCompleted.rows[0].status).toBe('COMPLETED');
  });
});
