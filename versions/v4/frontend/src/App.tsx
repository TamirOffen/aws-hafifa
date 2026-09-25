import { useCallback, useEffect, useState } from 'react';
import { createTask, fetchEnvironment, fetchTasks, updateTask } from './api';
import type { Task } from './types';

const TITLE_MAX_LENGTH = 200;

export function App() {
  const [environment, setEnvironment] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [env, initialTasks] = await Promise.all([fetchEnvironment(), fetchTasks()]);
        if (!cancelled) {
          setEnvironment(env);
          setTasks(initialTasks);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addTask = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        setError(null);
        const created = await createTask(trimmed);
        setTasks((previous) => [...previous, created]);
        setTitle('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [title],
  );

  const toggleTask = useCallback(async (task: Task) => {
    try {
      setError(null);
      const updated = await updateTask(task.id, !task.completed);
      setTasks((previous) => previous.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <main>
      <header>
        <h1>AWS Task App</h1>
        <p className="environment">Environment: {environment ?? '…'}</p>
      </header>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading && <p className="muted">Loading…</p>}

      <ul>
        {tasks.map((task) => (
          <li key={task.id} className={task.completed ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={task.completed} onChange={() => void toggleTask(task)} />
              {task.title}
            </label>
          </li>
        ))}
      </ul>

      <form onSubmit={addTask}>
        <input
          type="text"
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          placeholder="New task title"
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Task title"
        />
        <button type="submit">Add task</button>
      </form>
    </main>
  );
}
