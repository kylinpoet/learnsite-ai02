export type NavigationTask = {
  id: number;
  title: string;
  task_type: string;
};

export type ContextQuery = Partial<Record<'course_id' | 'task_id' | 'plan_id' | 'session_id', number>>;

export type GroupTaskDraft = {
  id: number;
  submission_note: string | null;
  source_code: string | null;
  version_no: number;
  updated_at: string | null;
  updated_by_name: string | null;
  updated_by_student_no: string | null;
};
