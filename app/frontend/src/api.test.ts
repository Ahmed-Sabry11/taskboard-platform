import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createTask, deleteTask, listTasks, updateTask } from './api';
import type { TaskInput } from './types';

const input: TaskInput = {
  title: 'Write report',
  description: '',
  status: 'todo',
  priority: 'medium',
  due_date: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('lists tasks with a page size and no status by default', async () => {
    const page = { items: [], total: 0, limit: 100, offset: 0 };
    fetchMock.mockResolvedValue(json(page));

    await expect(listTasks()).resolves.toEqual(page);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks?limit=100');
  });

  it('passes the status filter as a query parameter', async () => {
    fetchMock.mockResolvedValue(json({ items: [], total: 0, limit: 100, offset: 0 }));

    await listTasks('in_progress');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks?limit=100&status=in_progress');
  });

  it('creates a task with a JSON body', async () => {
    fetchMock.mockResolvedValue(json({ ...input, id: 1 }, 201));

    await createTask(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tasks');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it('sends only the changed fields on update', async () => {
    fetchMock.mockResolvedValue(json({ ...input, id: 7, status: 'done' }));

    await updateTask(7, { status: 'done' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tasks/7');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'done' });
  });

  it('handles an empty 204 response on delete', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteTask(7)).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('turns an HTTP error into an ApiError with the server message', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'task not found' }, 404));

    const error = await updateTask(1, { status: 'done' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'task not found' });
  });

  it('joins validation messages from a 422 response', async () => {
    fetchMock.mockResolvedValue(
      json({ detail: [{ msg: 'String should have at least 1 character' }, { msg: 'Bad date' }] }, 422),
    );

    await expect(createTask(input)).rejects.toThrow(
      'String should have at least 1 character; Bad date',
    );
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    await expect(listTasks()).rejects.toThrow('Request failed (502)');
  });

  it('reports a network failure as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await listTasks().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0 });
    expect((error as ApiError).message).toMatch(/Cannot reach the server/);
  });
});
