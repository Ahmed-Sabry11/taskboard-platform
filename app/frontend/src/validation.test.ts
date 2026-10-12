import { describe, expect, it } from 'vitest';

import type { TaskInput } from './types';
import { normalizeTaskInput, validateTaskInput } from './validation';

const valid: TaskInput = {
  title: 'Write report',
  description: '',
  status: 'todo',
  priority: 'medium',
  due_date: null,
};

describe('validateTaskInput', () => {
  it('accepts a valid task', () => {
    expect(validateTaskInput(valid)).toEqual({});
  });

  it('requires a title', () => {
    expect(validateTaskInput({ ...valid, title: '' }).title).toBe('Title is required.');
  });

  it('treats a whitespace-only title as missing', () => {
    expect(validateTaskInput({ ...valid, title: '   ' }).title).toBe('Title is required.');
  });

  it('accepts a title of exactly 200 characters', () => {
    expect(validateTaskInput({ ...valid, title: 'x'.repeat(200) })).toEqual({});
  });

  it('rejects a title longer than 200 characters', () => {
    expect(validateTaskInput({ ...valid, title: 'x'.repeat(201) }).title).toMatch(/200/);
  });

  it('rejects a description longer than 2000 characters', () => {
    expect(validateTaskInput({ ...valid, description: 'd'.repeat(2001) }).description).toMatch(
      /2000/,
    );
  });

  it('rejects a malformed due date', () => {
    expect(validateTaskInput({ ...valid, due_date: '01/12/2026' }).due_date).toBeDefined();
  });

  it('accepts an ISO due date', () => {
    expect(validateTaskInput({ ...valid, due_date: '2026-12-01' })).toEqual({});
  });
});

describe('normalizeTaskInput', () => {
  it('trims text and turns an empty due date into null', () => {
    expect(
      normalizeTaskInput({ ...valid, title: '  Report ', description: ' notes ', due_date: '' }),
    ).toEqual({ ...valid, title: 'Report', description: 'notes', due_date: null });
  });
});
