import { useState } from 'react';

import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '../types';
import TaskForm from './TaskForm';

interface TaskItemProps {
  task: Task;
  onUpdate: (id: number, changes: Partial<TaskInput>) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

export default function TaskItem({ task, onUpdate, onDelete }: TaskItemProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="task editing">
        <TaskForm
          initial={{
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            due_date: task.due_date,
          }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const saved = await onUpdate(task.id, input);
            if (saved) {
              setEditing(false);
            }
            return saved;
          }}
        />
      </li>
    );
  }

  function handleDelete() {
    if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
      void onDelete(task.id);
    }
  }

  return (
    <li className={`task status-${task.status}`}>
      <div className="task-body">
        <h3>{task.title}</h3>
        {task.description && <p>{task.description}</p>}
        <p className="meta">
          <span className={`badge priority-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]} priority
          </span>
          {task.due_date && <span>Due {task.due_date}</span>}
        </p>
      </div>
      <div className="task-controls">
        <select
          aria-label={`Status of ${task.title}`}
          value={task.status}
          onChange={(event) =>
            void onUpdate(task.id, { status: event.target.value as TaskStatus })
          }
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${task.title}`}>
          Edit
        </button>
        <button
          type="button"
          className="danger"
          onClick={handleDelete}
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
