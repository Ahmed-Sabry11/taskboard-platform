import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import type { Task, TaskInput } from './types';

// Integration tests: the whole UI runs against an in-memory stand-in for the
// backend that follows the same HTTP contract as the FastAPI service.

const NOW = '2026-10-12T10:00:00Z';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Write thesis',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFakeBackend(initial: Task[] = []) {
  let tasks = [...initial];
  let nextId = 100;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const idMatch = /^\/api\/tasks\/(\d+)$/.exec(url.pathname);

    if (url.pathname === '/api/tasks' && method === 'GET') {
      const status = url.searchParams.get('status');
      const items = status ? tasks.filter((task) => task.status === status) : tasks;
      return json({ items, total: items.length, limit: 100, offset: 0 });
    }
    if (url.pathname === '/api/tasks' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as TaskInput;
      const task: Task = { ...body, id: nextId++, created_at: NOW, updated_at: NOW };
      tasks = [task, ...tasks];
      return json(task, 201);
    }
    if (idMatch && method === 'PATCH') {
      const id = Number(idMatch[1]);
      const changes = JSON.parse(String(init?.body)) as Partial<TaskInput>;
      tasks = tasks.map((task) => (task.id === id ? { ...task, ...changes } : task));
      return json(tasks.find((task) => task.id === id));
    }
    if (idMatch && method === 'DELETE') {
      const id = Number(idMatch[1]);
      tasks = tasks.filter((task) => task.id !== id);
      return new Response(null, { status: 204 });
    }
    return json({ detail: 'not found' }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callsWithMethod(fetchMock: ReturnType<typeof installFakeBackend>, method: string) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows the tasks returned by the backend', async () => {
    installFakeBackend([
      makeTask({ id: 1, title: 'Write thesis' }),
      makeTask({ id: 2, title: 'Book the lab', status: 'done' }),
    ]);

    render(<App />);

    expect(await screen.findByText('Write thesis')).toBeInTheDocument();
    expect(screen.getByText('Book the lab')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tasks (2)' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no tasks', async () => {
    installFakeBackend();

    render(<App />);

    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('creates a task and clears the form', async () => {
    const fetchMock = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/No tasks yet/);

    await user.type(screen.getByLabelText('Title'), '  Prepare demo  ');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByRole('heading', { name: 'Prepare demo' })).toBeInTheDocument();
    const [, init] = callsWithMethod(fetchMock, 'POST')[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      title: 'Prepare demo',
      priority: 'high',
      status: 'todo',
      due_date: null,
    });
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue(''));
  });

  it('blocks an empty title without calling the backend', async () => {
    const fetchMock = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/No tasks yet/);

    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(callsWithMethod(fetchMock, 'POST')).toHaveLength(0);
  });

  it('changes the status of a task', async () => {
    const fetchMock = installFakeBackend([makeTask()]);
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(await screen.findByLabelText('Status of Write thesis'), 'done');

    await waitFor(() => expect(screen.getByLabelText('Status of Write thesis')).toHaveValue('done'));
    const [url, init] = callsWithMethod(fetchMock, 'PATCH')[0];
    expect(String(url)).toBe('/api/tasks/1');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'done' });
  });

  it('edits a task', async () => {
    installFakeBackend([makeTask()]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Edit Write thesis' }));
    const row = screen.getByRole('button', { name: 'Save changes' }).closest('li')!;
    const title = within(row).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Write thesis chapter 2');
    await user.click(within(row).getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { name: 'Write thesis chapter 2' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('deletes a task after confirmation', async () => {
    const fetchMock = installFakeBackend([makeTask()]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete Write thesis' }));

    await waitFor(() => expect(screen.queryByText('Write thesis')).not.toBeInTheDocument());
    expect(callsWithMethod(fetchMock, 'DELETE')).toHaveLength(1);
  });

  it('keeps the task when deletion is cancelled', async () => {
    const fetchMock = installFakeBackend([makeTask()]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete Write thesis' }));

    expect(screen.getByText('Write thesis')).toBeInTheDocument();
    expect(callsWithMethod(fetchMock, 'DELETE')).toHaveLength(0);
  });

  it('filters tasks by status', async () => {
    installFakeBackend([
      makeTask({ id: 1, title: 'Write thesis' }),
      makeTask({ id: 2, title: 'Book the lab', status: 'done' }),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Write thesis');

    await user.selectOptions(screen.getByLabelText('Show'), 'done');

    await waitFor(() => expect(screen.queryByText('Write thesis')).not.toBeInTheDocument());
    expect(screen.getByText('Book the lab')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tasks (1)' })).toBeInTheDocument();
  });

  it('shows the server message when loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ detail: 'database unavailable' }, 503)),
    );

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('database unavailable');
  });

  it('shows an error and keeps the form contents when saving fails', async () => {
    const fetchMock = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/No tasks yet/);
    fetchMock.mockImplementationOnce(async () =>
      json({ detail: [{ msg: 'String should have at most 200 characters' }] }, 422),
    );

    await user.type(screen.getByLabelText('Title'), 'Keep me');
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('at most 200 characters');
    expect(screen.getByLabelText('Title')).toHaveValue('Keep me');
  });
});
