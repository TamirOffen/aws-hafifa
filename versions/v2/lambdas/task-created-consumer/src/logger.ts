/**
 * Lambda logging: one JSON object per console.log line.
 *
 * Lambda captures stdout into CloudWatch Logs. Keeping the same "one JSON
 * object per line" shape as the backend means you can search both with the
 * same tooling (Stage 6/7).
 */
export type LogFields = Record<string, unknown>;

export function log(message: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...fields }));
}
