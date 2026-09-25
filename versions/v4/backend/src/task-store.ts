/**
 * Task storage contract, shared by every backend version.
 *
 * Version 3 fulfills it with DynamoDB (see dynamo-store.ts). The interface is
 * async so the HTTP routes do not care whether they are talking to a Map in
 * process memory (v1/v2) or a regional managed database (v3/v4) — the version
 * switch is invisible above this line, which is exactly the point students
 * should notice when diffing v2 against v3.
 */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

export interface TaskStore {
  createTask(title: string): Promise<Task>;
  listTasks(): Promise<readonly Task[]>;
  setCompleted(id: string, completed: boolean): Promise<Task | undefined>;
}