import { sql, type Kysely } from 'kysely';
import type { Database, JsonObject, WorkerConfig } from './types.js';

export interface EligibleWebhookEvent {
  event_id: string;
  source_id: string;
  line_timestamp: string;
  received_sequence: string;
}

/**
 * Finds the next eligible webhook event for a worker, strictly adhering to FIFO per room/source.
 *
 * Guarantees:
 * 1. Ordering criterion in both NOT EXISTS and ORDER BY is strictly identical:
 *    (line_timestamp ASC, received_sequence ASC).
 * 2. Unexpired lease or pending event on the same room blocks subsequent events in that room.
 * 3. Different rooms are processed concurrently without blocking each other.
 * 4. Events exceeding config.maxAttempts are excluded (can be cleaned up or marked FAILED).
 */
export async function getNextEligibleWebhookEvent(
  db: Kysely<Database>,
  config: WorkerConfig,
  roomId?: string
): Promise<EligibleWebhookEvent | null> {
  const roomFilter = roomId ? sql`AND e1.source_id = ${roomId}` : sql``;

  const result = await sql<EligibleWebhookEvent>`
    WITH eligible_events AS (
      SELECT DISTINCT ON (source_id)
        e1.event_id,
        e1.source_id,
        e1.line_timestamp,
        e1.received_sequence
      FROM webhook_events e1
      WHERE e1.status IN ('PENDING', 'PROCESSING')
        AND (e1.locked_until IS NULL OR e1.locked_until < NOW())
        AND e1.attempts < ${config.maxAttempts}
        ${roomFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM webhook_events e0
          WHERE e0.source_id = e1.source_id
            AND e0.event_id <> e1.event_id
            AND e0.status IN ('PENDING', 'PROCESSING')
            AND (
              e0.line_timestamp < e1.line_timestamp
              OR (e0.line_timestamp = e1.line_timestamp AND e0.received_sequence < e1.received_sequence)
            )
        )
      ORDER BY e1.source_id, e1.line_timestamp ASC, e1.received_sequence ASC
    )
    SELECT event_id, source_id, line_timestamp, received_sequence
    FROM eligible_events
    ORDER BY line_timestamp ASC, received_sequence ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  `.execute(db);

  return result.rows[0] ?? null;
}

/**
 * Acquires a lease on a specific webhook event for the calling worker.
 */
export async function leaseWebhookEvent(
  db: Kysely<Database>,
  eventId: string,
  workerId: string,
  config: WorkerConfig
): Promise<boolean> {
  const result = await sql`
    UPDATE webhook_events
    SET status = 'PROCESSING',
        worker_id = ${workerId},
        locked_until = NOW() + (${config.leaseDurationSeconds} * INTERVAL '1 second'),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE event_id = ${eventId}
      AND status IN ('PENDING', 'PROCESSING')
      AND (locked_until IS NULL OR locked_until < NOW())
    RETURNING event_id;
  `.execute(db);

  return result.rows.length > 0;
}

/**
 * Commits the completion of a webhook event.
 * Validates that the committing worker holds an active, unexpired lease.
 */
export async function commitWebhookEvent(
  db: Kysely<Database>,
  eventId: string,
  workerId: string,
  resultPayload: JsonObject
): Promise<boolean> {
  const result = await sql`
    UPDATE webhook_events
    SET status = 'COMPLETED',
        result_payload = ${JSON.stringify(resultPayload)}::jsonb,
        locked_until = NULL,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE event_id = ${eventId}
      AND worker_id = ${workerId}
      AND status = 'PROCESSING'
      AND locked_until > NOW()
    RETURNING event_id;
  `.execute(db);

  return result.rows.length > 0;
}

/**
 * Fails a webhook event (e.g. max attempts exceeded or fatal non-retryable error),
 * unblocking any subsequent events in the same room.
 */
export async function failWebhookEvent(
  db: Kysely<Database>,
  eventId: string,
  errorPayload: JsonObject
): Promise<boolean> {
  const result = await sql`
    UPDATE webhook_events
    SET status = 'FAILED',
        raw_payload = NULL,
        result_payload = ${JSON.stringify(errorPayload)}::jsonb,
        locked_until = NULL,
        updated_at = NOW()
    WHERE event_id = ${eventId}
    RETURNING event_id;
  `.execute(db);

  return result.rows.length > 0;
}
