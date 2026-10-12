import type { TaskInput } from './types';

// Keep in sync with app/backend/app/schemas.py. The backend is the authority;
// these checks only give faster feedback.
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export type TaskInputErrors = Partial<Record<'title' | 'description' | 'due_date', string>>;

export function normalizeTaskInput(input: TaskInput): TaskInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    due_date: input.due_date ? input.due_date : null,
  };
}

export function validateTaskInput(input: TaskInput): TaskInputErrors {
  const normalized = normalizeTaskInput(input);
  const errors: TaskInputErrors = {};

  if (normalized.title.length === 0) {
    errors.title = 'Title is required.';
  } else if (normalized.title.length > TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (normalized.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (normalized.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.due_date)) {
    errors.due_date = 'Due date must be a valid date.';
  }

  return errors;
}
