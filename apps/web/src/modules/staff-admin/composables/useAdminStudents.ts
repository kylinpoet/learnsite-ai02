import { computed, ref, watch } from 'vue';

import { apiGetBlob, apiPost, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import type {
  AdminStudentBatchAction,
  AdminStudentBatchResult,
  BootstrapPayload,
  StudentImportResult,
} from '../adminTypes';

export const studentImportAccept = '.csv,.txt,.tsv,.xlsx';

const adminStudentFilterClassId = ref<number | null>(null);
const adminStudentKeyword = ref('');
const adminStudentBatchPassword = ref('123456');
const selectedAdminStudentIds = ref<number[]>([]);
const studentListPage = ref(1);
const studentListPageSize = ref(20);
const isImportingStudents = ref(false);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

export function useAdminStudents(bootstrap: { value: BootstrapPayload | null }) {
  const authStore = useAuthStore();

  const filteredAdminStudents = computed(() => {
    const classId = adminStudentFilterClassId.value;
    const keyword = adminStudentKeyword.value.trim().toLowerCase();
    const students = bootstrap.value?.students ?? [];
    return students.filter((item) => {
      if (classId && item.class_id !== classId) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [
        item.student_no,
        item.username,
        item.display_name,
        item.class_name,
        item.class_label,
        item.entry_year ? `${item.entry_year}届` : '',
      ].some((text) => (text || '').toLowerCase().includes(keyword));
    });
  });

  const pagedAdminStudents = computed(() => {
    const start = (studentListPage.value - 1) * studentListPageSize.value;
    return filteredAdminStudents.value.slice(start, start + studentListPageSize.value);
  });

  const hasSelectedAdminStudents = computed(() => selectedAdminStudentIds.value.length > 0);

  watch(studentListPageSize, () => {
    const maxPage = Math.max(1, Math.ceil(filteredAdminStudents.value.length / studentListPageSize.value));
    if (studentListPage.value > maxPage) {
      studentListPage.value = maxPage;
    }
  });

  watch([adminStudentFilterClassId, adminStudentKeyword], () => {
    studentListPage.value = 1;
    selectedAdminStudentIds.value = [];
  });

  function extractFilename(disposition: string | null, fallback: string) {
    if (!disposition) {
      return fallback;
    }
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }
    const basicMatch = disposition.match(/filename="([^"]+)"/i);
    if (basicMatch?.[1]) {
      return basicMatch[1];
    }
    return fallback;
  }

  async function downloadStudentImportTemplateFile() {
    if (!authStore.token) {
      return;
    }
    try {
      const response = await apiGetBlob('/settings/admin/students/import-template', authStore.token);
      const blob = await response.blob();
      const filename = extractFilename(response.headers.get('content-disposition'), '学生导入模板.xlsx');
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '下载学生导入模板失败');
    }
  }

  async function showStudentImportSkippedDetails(result: StudentImportResult) {
    const skippedRows = result.skipped_rows ?? [];
    if (!skippedRows.length) {
      return;
    }

    const rows = skippedRows.map((item, index) => {
      const displayText = item.display_name || '未填写姓名';
      const studentNoText = item.student_no ? `学号 ${item.student_no}` : '';
      const usernameText = item.username ? `账号 ${item.username}` : '';
      const identityParts = [displayText, studentNoText, usernameText].filter((part) => part);
      const identity = identityParts.join(' / ');
      return `${index + 1}. 第 ${item.row_number} 行 ${escapeHtml(identity)}：${escapeHtml(item.reason || '未知原因')}`;
    });

    await ElMessageBox.alert(rows.join('<br/>'), '学生导入跳过明细', {
      confirmButtonText: '知道了',
      dangerouslyUseHTMLString: true,
      customClass: 'admin-batch-skip-dialog',
    });
  }

  async function showAdminStudentBatchSkippedDetails(
    action: AdminStudentBatchAction,
    result: AdminStudentBatchResult,
    selectedStudentsById: Map<number, BootstrapPayload['students'][number]>
  ) {
    const skippedItems = (result.items ?? []).filter((item) => item.status === 'skipped');
    if (!skippedItems.length) {
      return;
    }

    const title = action === 'force_delete' ? '强制删除跳过明细' : '批量操作跳过明细';
    const rows = skippedItems.map((item, index) => {
      const student = selectedStudentsById.get(item.student_id);
      const displayText = student?.display_name || `学生ID ${item.student_id}`;
      const studentNoText = student?.student_no ? `学号 ${student.student_no}` : '';
      const usernameText = student?.username ? `账号 ${student.username}` : '';
      const identityParts = [displayText, studentNoText, usernameText].filter((part) => part);
      const identity = identityParts.join(' / ');
      return `${index + 1}. ${escapeHtml(identity)}：${escapeHtml(item.reason || '未知原因')}`;
    });

    await ElMessageBox.alert(rows.join('<br/>'), title, {
      confirmButtonText: '知道了',
      dangerouslyUseHTMLString: true,
      customClass: 'admin-batch-skip-dialog',
    });
  }

  async function submitStudentImport(
    file: File,
    form: { update_existing: boolean; default_password: string }
  ): Promise<boolean> {
    if (!authStore.token) return false;
    const password = form.default_password.trim();
    if (password.length < 6) {
      ElMessage.warning('默认初始密码不能少于 6 位');
      return false;
    }

    isImportingStudents.value = true;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('update_existing', form.update_existing ? 'true' : 'false');
    formData.append('default_password', password);
    try {
      const payload = await apiUpload<
        BootstrapPayload & {
          import_result?: StudentImportResult;
        }
      >('/settings/admin/students/import', formData, authStore.token);
      bootstrap.value = payload;
      const result = payload.import_result;
      if (result) {
        const autoClassNote = result.created_class_count
          ? `，自动新建班级 ${result.created_class_count} 个（${(result.created_class_labels ?? []).join('、')}）`
          : '';
        const summary = `导入完成：新增 ${result.created_count}，更新 ${result.updated_count}，跳过 ${result.skipped_count}${autoClassNote}`;
        const successCount = result.created_count + result.updated_count;
        if (result.skipped_count > 0) {
          if (successCount > 0) {
            ElMessage.warning(`${summary}，请核对跳过原因`);
          } else {
            ElMessage.warning(`没有成功导入任何学生：跳过 ${result.skipped_count} 行`);
          }
          await showStudentImportSkippedDetails(result);
          return true;
        }
        ElMessage.success(summary);
      } else {
        ElMessage.success('学生导入完成');
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量导入学生失败';
      await ElMessageBox.alert(escapeHtml(message).replace(/\n/g, '<br/>'), '学生导入失败', {
        confirmButtonText: '知道了',
        dangerouslyUseHTMLString: true,
        customClass: 'admin-batch-skip-dialog',
      });
      return false;
    } finally {
      isImportingStudents.value = false;
    }
  }

  function handleAdminStudentSelectionChange(keys: Array<string | number>) {
    selectedAdminStudentIds.value = keys.map((key) => Number(key));
  }

  async function runAdminStudentBatchAction(action: AdminStudentBatchAction) {
    if (!authStore.token || !selectedAdminStudentIds.value.length) {
      return;
    }

    const selectedStudentsById = new Map(
      (bootstrap.value?.students ?? [])
        .filter((item) => selectedAdminStudentIds.value.includes(item.id))
        .map((item) => [item.id, item] as const)
    );

    if (action === 'reset_password' && adminStudentBatchPassword.value.trim().length < 6) {
      ElMessage.warning('批量重置密码至少需要 6 位');
      return;
    }

    const actionLabelMap: Record<AdminStudentBatchAction, string> = {
      activate: '恢复账号',
      deactivate: '停用账号',
      reset_password: '重置密码',
      delete: '删除学生',
      force_delete: '强制删除学生',
    };
    const actionLabel = actionLabelMap[action];

    try {
      if (action === 'delete') {
        await ElMessageBox.confirm(`确认批量删除已选的 ${selectedAdminStudentIds.value.length} 名学生吗？`);
      }
      if (action === 'force_delete') {
        await ElMessageBox.prompt(
          `此操作将永久清理已选 ${selectedAdminStudentIds.value.length} 名学生的学习数据并删除账号，无法恢复。\n请输入 DELETE 继续：`,
          '高风险操作确认',
          {
            confirmButtonText: '强制删除',
            cancelButtonText: '取消',
            inputPlaceholder: 'DELETE',
            inputValidator: (value) => value.trim() === 'DELETE' || '请输入 DELETE 才能继续',
          }
        );
      }

      const payload = await apiPost<
        BootstrapPayload & {
          batch_result?: AdminStudentBatchResult;
        }
      >(
        '/settings/admin/students/batch-action',
        {
          action,
          student_user_ids: [...selectedAdminStudentIds.value],
          password: action === 'reset_password' ? adminStudentBatchPassword.value.trim() : null,
        },
        authStore.token
      );
      bootstrap.value = payload;
      selectedAdminStudentIds.value = [];
      const result = payload.batch_result;
      if (result) {
        ElMessage.success(
          `批量${actionLabel}完成：成功 ${result.processed_count}，跳过 ${result.skipped_count}`
        );
        if ((action === 'force_delete' || action === 'delete') && result.skipped_count > 0) {
          await showAdminStudentBatchSkippedDetails(action, result, selectedStudentsById);
        }
        return;
      }
      ElMessage.success(`批量${actionLabel}已完成`);
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : `批量${actionLabel}失败`);
    }
  }

  async function toggleAdminStudentStatus(student: BootstrapPayload['students'][number]) {
    if (!authStore.token) {
      return;
    }
    const action: AdminStudentBatchAction = student.is_active ? 'deactivate' : 'activate';
    try {
      const payload = await apiPost<BootstrapPayload>(
        '/settings/admin/students/batch-action',
        {
          action,
          student_user_ids: [student.id],
        },
        authStore.token
      );
      bootstrap.value = payload;
      ElMessage.success(student.is_active ? '学生账号已停用' : '学生账号已恢复');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '更新学生状态失败');
    }
  }

  async function deleteStudent(studentUserId: number) {
    if (!authStore.token) return;
    const student = (bootstrap.value?.students ?? []).find((item) => item.id === studentUserId);
    const studentsById = new Map(
      student ? ([[studentUserId, student]] as [number, BootstrapPayload['students'][number]][]) : []
    );
    try {
      await ElMessageBox.confirm('确认删除这个学生账号吗？删除后不可恢复。');
      const payload = await apiPost<BootstrapPayload & { batch_result?: AdminStudentBatchResult }>(
        '/settings/admin/students/batch-action',
        { action: 'delete', student_user_ids: [studentUserId] },
        authStore.token
      );
      bootstrap.value = payload;
      selectedAdminStudentIds.value = selectedAdminStudentIds.value.filter((id) => id !== studentUserId);
      const result = payload.batch_result;
      if (result?.skipped_count) {
        await showAdminStudentBatchSkippedDetails('delete', result, studentsById);
        return;
      }
      ElMessage.success('学生已删除');
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : '删除学生失败');
    }
  }

  async function forceDeleteStudent(studentUserId: number) {
    if (!authStore.token) return;
    const student = (bootstrap.value?.students ?? []).find((item) => item.id === studentUserId);
    const studentsById = new Map(
      student ? ([[studentUserId, student]] as [number, BootstrapPayload['students'][number]][]) : []
    );
    try {
      await ElMessageBox.prompt(
        '此操作将永久清理该学生的学习数据并删除账号，无法恢复。\n请输入 DELETE 确认：',
        '高风险操作确认',
        {
          confirmButtonText: '强制删除',
          cancelButtonText: '取消',
          inputPlaceholder: 'DELETE',
          inputValidator: (value) => value.trim() === 'DELETE' || '请输入 DELETE 才能继续',
        }
      );
      const payload = await apiPost<BootstrapPayload & { batch_result?: AdminStudentBatchResult }>(
        '/settings/admin/students/batch-action',
        { action: 'force_delete', student_user_ids: [studentUserId] },
        authStore.token
      );
      bootstrap.value = payload;
      selectedAdminStudentIds.value = selectedAdminStudentIds.value.filter((id) => id !== studentUserId);
      const forceResult = payload.batch_result;
      if (forceResult?.skipped_count) {
        await showAdminStudentBatchSkippedDetails('force_delete', forceResult, studentsById);
        return;
      }
      ElMessage.success('学生已强制删除');
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : '强制删除学生失败');
    }
  }

  return {
    // state
    adminStudentFilterClassId,
    adminStudentKeyword,
    adminStudentBatchPassword,
    selectedAdminStudentIds,
    studentListPage,
    studentListPageSize,
    isImportingStudents,
    // computed
    filteredAdminStudents,
    pagedAdminStudents,
    hasSelectedAdminStudents,
    // actions
    downloadStudentImportTemplateFile,
    submitStudentImport,
    handleAdminStudentSelectionChange,
    runAdminStudentBatchAction,
    toggleAdminStudentStatus,
    deleteStudent,
    forceDeleteStudent,
  };
}
