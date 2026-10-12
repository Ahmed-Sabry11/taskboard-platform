import { type FormEvent, useId, useState } from 'react';

import { PRIORITIES, PRIORITY_LABELS, type TaskInput, type TaskPriority } from '../types';
import {
  DESCRIPTION_MAX_LENGTH,
  normalizeTaskInput,
  type TaskInputErrors,
  validateTaskInput,
} from '../validation';

const EMPTY: TaskInput = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  due_date: null,
};

interface TaskFormProps {
  initial?: TaskInput;
  submitLabel: string;
  /** Resolves to true when the task was saved, false when saving failed. */
  onSubmit: (input: TaskInput) => Promise<boolean>;
  onCancel?: () => void;
}

export default function TaskForm({ initial, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const [values, setValues] = useState<TaskInput>(initial ?? EMPTY);
  const [errors, setErrors] = useState<TaskInputErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const id = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateTaskInput(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSubmitting(true);
    const saved = await onSubmit(normalizeTaskInput(values));
    setSubmitting(false);
    if (saved && !initial) {
      setValues(EMPTY);
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          type="text"
          value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
        />
        {errors.title && (
          <p className="field-error" id={`${id}-title-error`}>
            {errors.title}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          rows={2}
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          aria-invalid={errors.description ? true : undefined}
        />
        {errors.description && <p className="field-error">{errors.description}</p>}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-priority`}>Priority</label>
          <select
            id={`${id}-priority`}
            value={values.priority}
            onChange={(event) =>
              setValues({ ...values, priority: event.target.value as TaskPriority })
            }
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${id}-due-date`}>Due date</label>
          <input
            id={`${id}-due-date`}
            type="date"
            value={values.due_date ?? ''}
            onChange={(event) => setValues({ ...values, due_date: event.target.value || null })}
            aria-invalid={errors.due_date ? true : undefined}
          />
          {errors.due_date && <p className="field-error">{errors.due_date}</p>}
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
