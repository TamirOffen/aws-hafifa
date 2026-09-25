/**
 * Task storage, Version 1: in-memory.
 *
 * WHY in memory (deliberately): tasks vanish whenever the container restarts.
 * That is the point — in Stage 8 you replace this with DynamoDB and *feel*
 * the difference a managed database makes. Until then, restarting the task
 * (which ECS does happily) resets your data. That is a feature of the lesson.
 *
 * Updates are immutable: setCompleted stores and returns a new object; the
 * original Task object is never mutated.
 */
import { randomUUID } from 'node:crypto';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

export interface TaskStore {
  createTask(title: string): Task;
  listTasks(): readonly Task[];
  setCompleted(id: string, completed: boolean): Task | undefined;
}

export function createInMemoryTaskStore(): TaskStore {
  const tasks = new Map<string, Task>();

  return {
    createTask(title) {
      const task: Task = {
        id: randomUUID(),
        title,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      tasks.set(task.id, task);
      return task;
    },

    listTasks() {
      return [...tasks.values()];
    },

    setCompleted(id, completed) {
      const existing = tasks.get(id);
      if (!existing) {
        return undefined;
      }
      const updated: Task = { ...existing, completed };
      tasks.set(id, updated);
      return updated;
    },
  };
}
