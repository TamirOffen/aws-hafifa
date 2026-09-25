/**
 * Request-body validation at the system boundary.
 *
 * WHY: the API's only untrusted input is the JSON request body. Every field is
 * validated here before any business logic runs, and invalid input fails fast
 * with a specific 400 message. Handlers stay boring: if parseTitle returned,
 * the title is good.
 */

export const MAX_TITLE_LENGTH = 200;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function parseTitle(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ValidationError('Field "title" is required and must be a string.');
  }
  const title = input.trim();
  if (title.length === 0) {
    throw new ValidationError('Field "title" must not be empty.');
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`Field "title" must be at most ${MAX_TITLE_LENGTH} characters.`);
  }
  return title;
}

export function parseCompleted(input: unknown): boolean {
  if (typeof input !== 'boolean') {
    throw new ValidationError('Field "completed" is required and must be a boolean.');
  }
  return input;
}
