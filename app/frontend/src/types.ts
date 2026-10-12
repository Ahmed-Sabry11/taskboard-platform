export const STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
}

export interface Task extends TaskInput {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface TaskPage {
  items: Task[];
  total: number;
  limit: number;
  offset: number;
}
