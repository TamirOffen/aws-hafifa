/**
 * Lambda logging: one JSON object per console.log line.
 * Lambda captures stdout into CloudWatch Logs — same shape as the backend.
 */
export type LogFields = Record<string, unknown>;

export function log(message: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...fields }));
}