import type { ColumnType, Generated, JSONColumnType } from 'kysely';

export type WebhookStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type RoomStatus = 'WAITING' | 'ACTIVE' | 'PAUSED' | 'ENDED';
export type RoomSourceType = 'group' | 'room' | 'user';

export type JsonObject = Record<string, unknown>;
export type DiceRollNumbers = number[];

export interface PlayersTable {
  id: Generated<string>; // UUID
  line_user_id: string;
  display_name: string | null;
  is_deleted: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface WebhookEventsTable {
  event_id: string;
  received_sequence: Generated<string>; // BIGSERIAL as string
  line_timestamp: string; // BIGINT as string
  correlation_id: string;
  destination_id: string | null;
  event_type: string;
  source_type: RoomSourceType;
  source_id: string;
  raw_payload: JSONColumnType<JsonObject, JsonObject | string, JsonObject | string> | null;
  result_payload: JSONColumnType<JsonObject, JsonObject | string, JsonObject | string> | null;
  status: Generated<WebhookStatus>;
  attempts: Generated<number>;
  worker_id: string | null;
  locked_until: Date | null;
  received_at: Generated<Date>;
  processed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface RoomsTable {
  id: string; // Session / Group / Room / User ID
  source_type: RoomSourceType;
  name: string;
  status: Generated<RoomStatus>;
  last_sequence_number: Generated<string>; // BIGINT as string
  version: Generated<number>;
  created_by: string | null; // UUID
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface CharactersTable {
  id: Generated<string>; // UUID
  room_id: string;
  player_id: string; // UUID
  name: string;
  race: string;
  class: string;
  level: Generated<number>;
  hp_max: number;
  hp_current: number;
  hp_temp: Generated<number>;
  armor_class: Generated<number>;
  score_str: number;
  score_dex: number;
  score_con: number;
  score_int: number;
  score_wis: number;
  score_cha: number;
  is_alive: Generated<boolean>;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface EventLogsTable {
  id: Generated<string>; // UUID
  room_id: string;
  correlation_id: string;
  sequence_number: string; // BIGINT as string
  event_type: string;
  payload: JSONColumnType<JsonObject, JsonObject | string, JsonObject | string>;
  created_at: Generated<Date>;
}

export interface RollAuditLogsTable {
  id: Generated<string>; // UUID
  room_id: string;
  event_id: string;
  correlation_id: string;
  event_log_id: string | null; // UUID
  player_id: string; // UUID
  character_id: string | null; // UUID
  expression: string;
  total: number;
  modifier: number;
  kept_rolls: JSONColumnType<DiceRollNumbers, DiceRollNumbers | string, DiceRollNumbers | string>;
  dropped_rolls: JSONColumnType<DiceRollNumbers, DiceRollNumbers | string, DiceRollNumbers | string> | null;
  is_crit: Generated<boolean>;
  is_fumble: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface Database {
  players: PlayersTable;
  webhook_events: WebhookEventsTable;
  rooms: RoomsTable;
  characters: CharactersTable;
  event_logs: EventLogsTable;
  roll_audit_logs: RollAuditLogsTable;
}
