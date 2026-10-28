/** 教师仪表盘（课堂首页）用到的数据契约。 */

export type SubmissionStage = 'none' | 'partial' | 'completed';

/** 单个学生的实时状态：签到 + 当前学案的提交阶段 */
export type LiveStudent = {
  user_id: number;
  display_name: string;
  student_no: string;
  seat_label: string | null;
  signed_in_at: string | null;
  submission_stage: SubmissionStage;
};

/** 座位格：由班级座位表 + 实时签到/提交状态合并而成 */
export type SeatCell = {
  key: string;
  label: string;
  row: number;
  col: number;
  virtual: boolean;
  signedIn: boolean;
  stage: SubmissionStage;
  displayName: string | null;
  studentNo: string | null;
  ip: string | null;
};

export type RoomBrief = { id: number; name: string; row_count: number; col_count: number } | null;

export type LiveSession = {
  session_id: number;
  status: string;
  started_at: string;
  class_id: number;
  class_name: string;
  plan_id: number | null;
  plan_title: string | null;
  task_count: number;
  /** 以下字段用于首屏「上哪节课」标识，老接口可能不返回 */
  unit_title?: string | null;
  lesson_title?: string | null;
  lesson_no?: number | null;
  book_name?: string | null;
};

export type ClassLivePayload = {
  class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
  };
  session: LiveSession | null;
  attendance: {
    student_count: number;
    checked_in_count: number;
    pending_signin_count: number;
    pending_students: LiveStudent[];
  };
  submission: {
    task_count: number;
    submitted_count: number;
    pending_review_count: number;
    completed_student_count: number;
    partial_student_count: number;
    none_student_count: number;
  };
  students: LiveStudent[];
  seats: Array<{
    seat_key: string;
    seat_label: string;
    row_no: number;
    col_no: number;
    ip_address: string;
    hostname: string | null;
    is_enabled: boolean;
    is_virtual: boolean;
    signed_in_today: boolean;
    checked_in_at: string | null;
    student: {
      user_id: number;
      student_no: string;
      display_name: string;
      focus_plan_submission_stage: SubmissionStage;
    } | null;
  }>;
  room: RoomBrief;
  generated_at: string;
};
