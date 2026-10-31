export type ClassProfileEditPermissions = {
  can_edit_name: boolean;
  can_edit_gender: boolean;
  can_edit_photo: boolean;
  can_edit_class: boolean;
};

export type BootstrapPayload = {
  system: {
    platform_name: string;
    school_name: string;
    active_grade_nos: number[];
    theme_code: string;
    student_register_enabled: boolean;
    assistant_enabled: boolean;
    remote_proxy_url: string;
    auto_attendance_on_login: boolean;
    group_drive_file_max_count: number;
    group_drive_single_file_max_mb: number;
    group_drive_allowed_extensions: string;
    class_transfer_review_note_presets_text: string;
    class_transfer_unreview_reason_presets_text: string;
  };
  theme_presets: Array<{ code: string; name: string; description: string }>;
  assistant_prompts: { general_prompt: string; lesson_prompt: string };
  assistant_runtime: {
    temperature: number;
    top_p: number | null;
    max_tokens: number | null;
    presence_penalty: number | null;
    frequency_penalty: number | null;
    streaming_enabled: boolean;
    thinking_enabled: boolean;
  };
  classes: Array<{
    id: number;
    grade_no: number;
    class_no: number;
    class_name: string;
    head_teacher_name: string | null;
    default_room_id: number | null;
    student_count: number;
    profile_edit_permissions: ClassProfileEditPermissions;
  }>;
  archived_classes: Array<{
    id: number;
    class_name: string;
    original_class_name: string;
    promoted_to_class_name: string;
    moved_student_count: number;
    archived_at: string | null;
  }>;
  teachers: Array<{ id: number; username: string; display_name: string; title: string | null; is_admin: boolean; class_ids: number[] }>;
  students: Array<{
    id: number;
    username: string;
    display_name: string;
    student_no: string;
    grade_no: number | null;
    class_id: number | null;
    class_name: string;
    is_active: boolean;
  }>;
  rooms: Array<{ id: number; name: string; row_count: number; col_count: number; description: string | null; seats: Array<{ id?: number; row_no: number; col_no: number; seat_label: string; ip_address: string; hostname: string | null; is_enabled: boolean }> }>;
  stats: { class_count: number; teacher_count: number; student_count: number; room_count: number; archived_class_count: number };
};

export type CurriculumBook = { id: number; name: string; subject: string; edition: string; grade_scope: string; units: Array<{ id: number; title: string; term_no: number; unit_no: number; lessons: Array<{ id: number; title: string; lesson_no: number; summary: string | null }> }> };

export type CurriculumImportResult = {
  processed_row_count: number;
  created_book_count: number;
  created_unit_count: number;
  updated_unit_count: number;
  created_lesson_count: number;
  updated_lesson_count: number;
};

export type AssistantPromptSettings = { general_prompt: string; lesson_prompt: string };

export type AssistantRuntimeSettings = {
  temperature: number;
  top_p: number | null;
  max_tokens: number | null;
  presence_penalty: number | null;
  frequency_penalty: number | null;
  streaming_enabled: boolean;
  thinking_enabled: boolean;
};

export type PromotionPreviewPayload = {
  grade_increment: number;
  items: Array<{
    source_class_id: number;
    source_class_name: string;
    student_count: number;
    target_class_name: string;
    status: 'ready' | 'blocked';
    reason: string;
  }>;
  summary: {
    source_class_count: number;
    blocked_count: number;
    ready_count: number;
    student_count: number;
  };
};

export type AIProviderRecord = {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  model_name: string;
  is_default: boolean;
  is_enabled: boolean;
  has_api_key: boolean;
  masked_api_key: string;
  updated_at: string | null;
};

export type AIProviderModelDiscoveryResult = {
  items: string[];
  resolved_url: string;
};

export type TeacherEditorForm = {
  username: string;
  display_name: string;
  title: string;
  password: string;
  is_admin: boolean;
  class_ids: number[];
};

export type AdminStudentBatchAction = 'activate' | 'deactivate' | 'reset_password' | 'delete' | 'force_delete';

export type AdminStudentBatchResultItem = {
  student_id: number;
  status: 'processed' | 'skipped';
  reason: string;
};

export type AdminStudentBatchResult = {
  selected_count: number;
  processed_count: number;
  skipped_count: number;
  items?: AdminStudentBatchResultItem[];
};

export type StudentImportSkippedRow = {
  row_number: number;
  student_no: string;
  username: string;
  display_name: string;
  status: 'skipped';
  reason: string;
};

export type StudentImportResult = {
  created_count: number;
  updated_count: number;
  skipped_count: number;
  processed_count: number;
  skipped_rows?: StudentImportSkippedRow[];
};

export type RoomSeat = BootstrapPayload['rooms'][number]['seats'][number];

export type RoomSeatDraftPayload = { row_count: number; col_count: number; seats: RoomSeat[] };

export type AdminTab =
  | 'system'
  | 'classes'
  | 'teachers'
  | 'students'
  | 'promotions'
  | 'rooms'
  | 'curriculum'
  | 'ai-providers'
  | 'ai-safety';

export type SettingsNavItem = { tab: AdminTab; label: string; count: number | null };

export type SafetyCategoryForm = { label: string; enabled: boolean; keywordsText: string };

export type SafetySettingsPayload = {
  student_daily_message_limit: number;
  blocked_keywords: Record<string, { label: string; enabled: boolean; keywords: string[] }>;
};
