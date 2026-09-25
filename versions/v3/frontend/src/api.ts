/**
 * API client — relative URLs only.
 *
 * WHY relative: locally they hit the Vite proxy; on AWS they hit the ALB, which
 * routes /api/* to the backend service. The frontend never learns where the
 * backend lives — the network in front of it decides. (Stage 0: break the
 * proxy and watch what happens. Stage 4: the ALB replaces the proxy.)
 */
import type { EnvironmentResponse, Task } from './types';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(`Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    throw new ApiError(response.status, `${init?.method ?? 'GET'} ${url} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export async function fetchEnvironment(): Promise<string> {
  const body = await requestJson<EnvironmentResponse>('/api/environment');
  return body.environment;
}

export function fetchTasks(): Promise<Task[]> {
  return requestJson<Task[]>('/api/tasks');
}

export function createTask(title: string): Promise<Task> {
  return requestJson<Task>('/api/tasks', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ title }),
  });
}

export function updateTask(id: string, completed: boolean): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ completed }),
  });
}
