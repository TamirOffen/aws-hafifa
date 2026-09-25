/**
 * Smoke tests — this is an AWS workshop, not a frontend course.
 * One file proving the app renders, loads data, and wires user actions to the API.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import * as api from './api';

vi.mock('./api', () => ({
  fetchEnvironment: vi.fn(),
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

const fixtures = [
  { id: 't1', title: 'Learn VPCs', completed: false, createdAt: '2025-01-01T00:00:00Z' },
  { id: 't2', title: 'Learn ECS', completed: true, createdAt: '2025-01-01T00:00:01Z' },
];

// Without globally-registered test hooks, RTL does not auto-cleanup between
// tests — do it explicitly so the DOM never accumulates across renders.
afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchEnvironment).mockResolvedValue('dev');
  vi.mocked(api.fetchTasks).mockResolvedValue(fixtures);
});

describe('App', () => {
  test('renders the header and the environment reported by the API', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AWS Task App' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Environment: dev')).toBeTruthy());
  });

  test('renders tasks from the API', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Learn VPCs')).toBeTruthy());
    expect(screen.getByText('Learn ECS')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('submits the form to create a task', async () => {
    vi.mocked(api.createTask).mockResolvedValue({
      id: 't3',
      title: 'Learn SQS',
      completed: false,
      createdAt: '2025-01-01T00:00:02Z',
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Learn VPCs')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Learn SQS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('Learn SQS'));
    await waitFor(() => expect(screen.getByText('Learn SQS')).toBeTruthy());
  });

  test('toggles a task through the API when its checkbox changes', async () => {
    vi.mocked(api.updateTask).mockResolvedValue({ ...fixtures[0], completed: true });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Learn VPCs')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith('t1', true));
  });

  test('shows an error banner when loading fails', async () => {
    vi.mocked(api.fetchTasks).mockRejectedValue(new Error('Network error calling /api/tasks: refused'));
    render(<App />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/refused/);
  });
});
