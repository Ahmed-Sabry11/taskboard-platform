import { useCallback, useEffect, useRef, useState } from 'react';

import { createTask, deleteTask, listTasks, updateTask } from './api';
import TaskForm from './components/TaskForm';
import TaskItem from './components/TaskItem';
import { STATUS_LABELS, STATUSES, type Task, type TaskInput, type TaskStatus } from './types';

type Filter = 'all' | TaskStatus;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the most recent list request may update state, so a slow response
  // for an old filter cannot overwrite a newer one.
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    try {
      const page = await listTasks(filter === 'all' ? undefined : filter);
      if (requestId !== latestRequest.current) {
        return;
      }
      setTasks(page.items);
      setTotal(page.total);
      setError(null);
    } catch (caught) {
      if (requestId === latestRequest.current) {
        setError(messageOf(caught));
      }
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Runs a change, then reloads the list so the screen always shows what the
  // server holds. Returns whether the change succeeded.
  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    }
    await refresh();
    return true;
  }

  const handleCreate = (input: TaskInput) => mutate(() => createTask(input));
  const handleUpdate = (id: number, changes: Partial<TaskInput>) =>
    mutate(() => updateTask(id, changes));
  const handleDelete = (id: number) => mutate(() => deleteTask(id));

  return (
    <main className="app">
      <header>
        <h1>TaskBoard</h1>
      </header>

      <section aria-labelledby="new-task-heading" className="card">
        <h2 id="new-task-heading">New task</h2>
        <TaskForm submitLabel="Add task" onSubmit={handleCreate} />
      </section>

      {error && (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section aria-labelledby="tasks-heading" className="card">
        <div className="list-header">
          <h2 id="tasks-heading">Tasks ({total})</h2>
          <div className="filter">
            <label htmlFor="status-filter">Show</label>
            <select
              id="status-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
            >
              <option value="all">All</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="muted">
            {filter === 'all' ? 'No tasks yet. Add your first one above.' : 'No tasks match.'}
          </p>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
