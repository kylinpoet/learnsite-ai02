import { ref } from 'vue';

import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import type { CurriculumBook, CurriculumImportResult } from '../adminTypes';

export const curriculumImportAccept = '.csv,.txt,.tsv,.xlsx';

export type BookDialogForm = { name: string; subject: string; edition: string; grade_scope: string };
export type UnitDialogForm = { book_id: number; term_no: number; unit_no: number; title: string };
export type LessonDialogForm = { unit_id: number; lesson_no: number; title: string; summary: string };

const emptyBookForm = (): BookDialogForm => ({ name: '', subject: '信息科技', edition: '浙教版', grade_scope: '' });

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

// 模块级单例：nav 计数与 pane 共用同一份教材数据。
const curriculumBooks = ref<CurriculumBook[]>([]);

export function useAdminCurriculum() {
  const authStore = useAuthStore();

  async function loadCurriculum() {
    const payload = await apiGet<{ books: CurriculumBook[] }>('/curriculum/tree', authStore.token);
    curriculumBooks.value = payload.books;
  }

  async function submitCurriculumImport(file: File): Promise<boolean> {
    if (!authStore.token) {
      return false;
    }
    const formData = new FormData();
    formData.append('file', file);
    const payload = await apiUpload<{ books: CurriculumBook[]; import_result?: CurriculumImportResult }>(
      '/curriculum/import',
      formData,
      authStore.token
    );
    curriculumBooks.value = payload.books;
    if (payload.import_result) {
      ElMessage.success(
        `教材导入完成：处理 ${payload.import_result.processed_row_count} 行，新增教材 ${payload.import_result.created_book_count} 本，新增单元 ${payload.import_result.created_unit_count} 个，新增课次 ${payload.import_result.created_lesson_count} 个`
      );
      return true;
    }
    ElMessage.success('教材导入完成');
    return true;
  }

  async function saveBook(editingBookId: number | null, form: BookDialogForm) {
    const path = editingBookId ? `/curriculum/books/${editingBookId}` : '/curriculum/books';
    const method = editingBookId ? apiPut : apiPost;
    await method(path, form, authStore.token);
    ElMessage.success(editingBookId ? '教材已更新' : '教材已创建');
    await loadCurriculum();
  }

  async function deleteBook(bookId: number) {
    if (!authStore.token) return;
    try {
      await ElMessageBox.confirm('确认删除这本教材吗？');
      await apiDelete(`/curriculum/books/${bookId}`, authStore.token);
      await loadCurriculum();
      ElMessage.success('教材已删除');
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : '删除教材失败');
    }
  }

  async function saveUnit(editingUnitId: number | null, form: UnitDialogForm) {
    const path = editingUnitId ? `/curriculum/units/${editingUnitId}` : '/curriculum/units';
    const method = editingUnitId ? apiPut : apiPost;
    await method(path, form, authStore.token);
    ElMessage.success(editingUnitId ? '单元已更新' : '单元已创建');
    await loadCurriculum();
  }

  async function deleteUnit(unitId: number) {
    if (!authStore.token) return;
    try {
      await ElMessageBox.confirm('确认删除这个单元吗？');
      await apiDelete(`/curriculum/units/${unitId}`, authStore.token);
      await loadCurriculum();
      ElMessage.success('单元已删除');
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : '删除单元失败');
    }
  }

  async function saveLesson(editingLessonId: number | null, form: LessonDialogForm) {
    const path = editingLessonId ? `/curriculum/lessons/${editingLessonId}` : '/curriculum/lessons';
    const method = editingLessonId ? apiPut : apiPost;
    await method(path, form, authStore.token);
    ElMessage.success(editingLessonId ? '课次已更新' : '课次已创建');
    await loadCurriculum();
  }

  async function deleteLesson(lessonId: number) {
    if (!authStore.token) return;
    try {
      await ElMessageBox.confirm('确认删除这个课次吗？');
      await apiDelete(`/curriculum/lessons/${lessonId}`, authStore.token);
      await loadCurriculum();
      ElMessage.success('课次已删除');
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : '删除课次失败');
    }
  }

  return {
    curriculumBooks,
    emptyBookForm,
    loadCurriculum,
    submitCurriculumImport,
    saveBook,
    deleteBook,
    saveUnit,
    deleteUnit,
    saveLesson,
    deleteLesson,
  };
}
