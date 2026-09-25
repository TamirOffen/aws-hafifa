import { describe, expect, test } from 'vitest';
import { createInMemoryTaskStore } from '../src/task-store';

describe('in-memory task store', () => {
  test('creates a task with an id, the given title, completed=false and a createdAt timestamp', () => {
    const store = createInMemoryTaskStore();
    const task = store.createTask('Learn VPCs');
    expect(task.title).toBe('Learn VPCs');
    expect(task.completed).toBe(false);
    expect(task.id).toBeTruthy();
    expect(task.createdAt).toBeTruthy();
  });

  test('lists every created task', () => {
    const store = createInMemoryTaskStore();
    store.createTask('Learn VPCs');
    store.createTask('Learn ECS');
    expect(store.listTasks()).toHaveLength(2);
  });

  test('setCompleted returns an updated copy and never mutates the stored original', () => {
    const store = createInMemoryTaskStore();
    const created = store.createTask('Learn IAM');

    const updated = store.setCompleted(created.id, true);

    expect(updated?.completed).toBe(true);
    expect(updated).not.toBe(created);
    // The original object we handed to the caller earlier is untouched...
    expect(created.completed).toBe(false);
    // ...and the store now serves the updated copy.
    expect(store.listTasks()[0].completed).toBe(true);
  });

  test('setCompleted can flip a task back to incomplete', () => {
    const store = createInMemoryTaskStore();
    const created = store.createTask('Learn IAM');
    store.setCompleted(created.id, true);
    const updated = store.setCompleted(created.id, false);
    expect(updated?.completed).toBe(false);
  });

  test('setCompleted returns undefined for an unknown task id', () => {
    const store = createInMemoryTaskStore();
    expect(store.setCompleted('does-not-exist', true)).toBeUndefined();
  });
});
