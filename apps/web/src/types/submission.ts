export type TaskSubmissionFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
  mime_type?: string;
  previewable?: boolean;
};

export type RecommendedSubmissionItem = {
  submission_id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  files: TaskSubmissionFile[];
};
