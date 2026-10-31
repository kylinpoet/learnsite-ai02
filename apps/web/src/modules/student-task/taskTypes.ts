import type { TaskSubmissionFile } from '@/types/submission';

export type TaskSubmission = {
  id: number;
  status: 'submitted' | 'reviewed';
  score: number | null;
  is_recommended: boolean;
  peer_review_score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  can_resubmit: boolean;
  submission_scope: 'individual' | 'group';
  group_id: number | null;
  group_name: string | null;
  group_no: number | null;
  submitted_by_name: string | null;
  submitted_by_student_no: string | null;
  files: TaskSubmissionFile[];
};

export type TaskAssetManifestItem = {
  path: string;
  size_kb: number;
  mime_type?: string | null;
  slot?: string;
};
