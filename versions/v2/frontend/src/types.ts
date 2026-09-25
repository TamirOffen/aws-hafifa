/** Mirrors the backend contract exactly (see docs/versions.md). */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

export interface EnvironmentResponse {
  readonly environment: string;
}
