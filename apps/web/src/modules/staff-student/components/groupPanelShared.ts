/** 教师端「小组与协作」相关的数据类型与格式化工具。
 *  这些类型与 /staff/classes/{id}/groups、group-management、group-task-progress、
 *  group-operation-logs 的返回结构一一对应，从仪表盘迁移时原样保留。 */

export type TagType = 'default' | 'error' | 'info' | 'success' | 'warning';

export type GroupFile = {
  id: number;
  name: string;
  original_name: string;
  ext: string;
  size_kb: number;
  updated_at: string | null;
  uploaded_by_name: string | null;
  uploaded_by_student_no: string | null;
};

export type GroupActivityItem = {
  id: string;
  event_type: 'attendance' | 'drive_upload' | 'group_submission' | 'submission_reviewed' | string;
  event_label: string;
  occurred_at: string | null;
  group_id: number;
  group_name: string;
  group_no: number;
  actor_name: string | null;
  actor_student_no: string | null;
  title: string;
  description: string;
  file_id: number | null;
  submission_id: number | null;
  task_id: number | null;
};

export type GroupOperationLogItem = {
  id: number;
  event_type: string;
  event_label: string;
  occurred_at: string | null;
  group_id: number | null;
  group_no: number | null;
  group_name: string;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_student_no: string | null;
  title: string;
  description: string;
  task_id: number | null;
  task_title: string | null;
  file_id: number | null;
  file_name: string | null;
  submission_id: number | null;
  version_no: number | null;
};

export type GroupDriveLimits = {
  max_file_count: number;
  single_file_max_mb: number;
  allowed_extensions: string[];
  allowed_extensions_text: string;
};

export type GroupMember = {
  user_id: number;
  student_no: string;
  display_name: string;
  role: string;
  seat_label: string | null;
  room_name: string | null;
  checked_in_today: boolean;
  checked_in_at: string | null;
};

export type GroupOverview = {
  class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
    checked_in_count: number;
    group_count: number;
    shared_file_count: number;
  };
  groups: Array<{
    id: number;
    group_no: number;
    name: string;
    description: string | null;
    leader_name: string | null;
    leader_student_no: string | null;
    member_count: number;
    checked_in_count: number;
    pending_count: number;
    members: GroupMember[];
    shared_drive: {
      space_id: number;
      display_name: string;
      quota_mb: number;
      used_bytes: number;
      remaining_bytes: number;
      usage_percent: number;
      file_count: number;
      limits: GroupDriveLimits;
      files: GroupFile[];
    };
    activity_feed: GroupActivityItem[];
    operation_logs: GroupOperationLogItem[];
  }>;
};

export type GroupOverviewItem = GroupOverview['groups'][number];

export type GroupManagerStudent = {
  user_id: number;
  student_no: string;
  display_name: string;
  checked_in_today: boolean;
  checked_in_at: string | null;
  seat_label: string | null;
  room_name: string | null;
  current_group_id: number | null;
  current_group_no: number | null;
  current_group_name: string | null;
  current_role: string | null;
};

export type GroupManagerGroup = {
  id: number;
  group_no: number;
  name: string;
  description: string | null;
  leader_user_id: number | null;
  leader_name: string | null;
  leader_student_no: string | null;
  member_count: number;
  file_count: number;
  used_bytes: number;
  has_shared_files: boolean;
  members: GroupMember[];
};

export type GroupManagementPayload = {
  class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
    checked_in_count: number;
    group_count: number;
    unassigned_count: number;
  };
  groups: GroupManagerGroup[];
  students: GroupManagerStudent[];
  operation_logs: GroupOperationLogItem[];
};

export type GroupOperationLogQueryPayload = {
  items: GroupOperationLogItem[];
  total_count: number;
  limit: number;
};

export type GroupTaskProgressItem = {
  group_id: number;
  group_no: number;
  group_name: string;
  leader_name: string | null;
  member_count: number;
  status: string;
  submission_id: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  submitted_by_name: string | null;
  score: number | null;
  file_count: number;
  is_recommended: boolean;
};

export type GroupTaskProgressTask = {
  task_id: number;
  task_title: string;
  task_type: string;
  submission_scope: string;
  submitted_count: number;
  reviewed_count: number;
  pending_count: number;
  items: GroupTaskProgressItem[];
};

export type GroupTaskProgressPayload = {
  class: {
    id: number;
    class_name: string;
  };
  plan: {
    id: number;
    title: string;
    lesson_title: string;
    unit_title: string;
  };
  summary: {
    group_count: number;
    task_count: number;
    slot_count: number;
    submitted_count: number;
    reviewed_count: number;
    pending_count: number;
  };
  tasks: GroupTaskProgressTask[];
};

export type GroupTaskCompletionRow = {
  group_id: number;
  group_no: number;
  group_name: string;
  leader_name: string | null;
  member_count: number;
  total_task_count: number;
  submitted_count: number;
  reviewed_count: number;
  pending_count: number;
  completion_percent: number;
  review_percent: number;
};

export type EditableGroup = {
  id: number;
  group_no: number;
  name: string;
  description: string;
  leader_user_id: number | null;
  file_count: number;
  used_bytes: number;
  has_shared_files: boolean;
};

export type EditableStudent = GroupManagerStudent & { target_group_id: number | null };

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '暂无记录';
  return value.replace('T', ' ').slice(0, 16);
}

export function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
}

export function groupDriveLimitText(limits: GroupDriveLimits) {
  const extensionPreview = limits.allowed_extensions.slice(0, 8).join(', ');
  const extensionSuffix = limits.allowed_extensions.length > 8 ? ' 等' : '';
  const extensionText = limits.allowed_extensions.length
    ? `类型 ${extensionPreview}${extensionSuffix}`
    : '类型不限';
  return `单个文件 ${limits.single_file_max_mb} MB · 最多 ${limits.max_file_count} 个 · ${extensionText}`;
}

export function progressPercent(doneCount: number, totalCount: number) {
  if (!totalCount) return 0;
  return Math.round((doneCount / totalCount) * 100);
}

export function roleText(role: string | null) {
  if (role === 'leader') return '组长';
  if (role === 'member') return '成员';
  if (role === 'teacher') return '教师';
  if (role === 'admin') return '管理员';
  if (role === 'student') return '学生';
  return '未分组';
}

export function activityTagType(eventType: string): TagType {
  if (eventType === 'attendance') return 'success';
  if (eventType === 'drive_upload') return 'warning';
  if (eventType === 'submission_reviewed') return 'error';
  return 'info';
}

export function operationTagType(eventType: string): TagType {
  if (eventType.includes('deleted')) return 'error';
  if (eventType.includes('reviewed')) return 'warning';
  if (eventType.includes('submitted')) return 'success';
  if (eventType.includes('draft')) return 'info';
  return 'default';
}

export function groupTaskStatusText(status: string) {
  if (status === 'reviewed') return '已评阅';
  if (status === 'submitted') return '已提交';
  return '未开始';
}

export function groupTaskStatusType(status: string): TagType {
  if (status === 'reviewed') return 'success';
  if (status === 'submitted') return 'warning';
  return 'info';
}

export function getDownloadFileName(contentDisposition: string | null, fallbackName: string) {
  if (!contentDisposition) return fallbackName;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallbackName;
}

export function triggerBrowserDownload(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}
