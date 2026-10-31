<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>教材目录</h2>
        <p class="st-head__sub">
          {{ curriculumBooks.length }} 本教材 ·
          {{ lessonTotal }} 个课次。
          学案按「教材 → 单元 → 课次」绑定。
        </p>
      </div>
      <div class="st-head__actions">
        <input
          ref="curriculumImportInputRef"
          class="file-input"
          :accept="curriculumImportAccept"
          type="file"
          @change="handleCurriculumImportChange"
        />
        <n-button secondary @click="downloadCurriculumImportTemplateFile">下载模板</n-button>
        <n-button secondary @click="openCurriculumImportPicker">选择文件</n-button>
        <n-button
          :disabled="!selectedCurriculumImportFileName"
          :loading="isImportingCurriculum"
          secondary
          type="success"
          @click="submitCurriculumImportFromInput"
        >
          导入
        </n-button>
        <n-button type="primary" @click="openBookDialog()">新增教材</n-button>
      </div>
    </header>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">教材树</h3>
        <div class="sf-panel__actions">
          <span class="sf-quiet">当前文件：{{ selectedCurriculumImportFileName || '未选择' }}</span>
          <n-button text @click="loadCurriculum">刷新</n-button>
        </div>
      </header>

      <p v-if="!curriculumBooks.length" class="sf-empty">还没有教材数据，先新增一本教材或导入目录。</p>
      <div v-else class="st-books">
        <article v-for="book in curriculumBooks" :key="book.id" class="st-book">
          <header class="st-book__head">
            <div class="st-book__main">
              <h3 class="st-book__title">{{ book.name }}</h3>
              <p class="st-book__meta">
                {{ book.edition }} · {{ book.subject }}
                <template v-if="book.units.length">
                  · {{ book.units.length }} 个单元 /
                  {{ book.units.reduce((sum, unit) => sum + unit.lessons.length, 0) }} 个课次
                </template>
              </p>
            </div>
            <div class="st-book__actions">
              <n-button text type="primary" @click="openUnitDialog(book.id)">新增单元</n-button>
              <n-button text @click="openBookDialog(book)">编辑</n-button>
              <n-button text type="error" @click="deleteBook(book.id)">删除</n-button>
            </div>
          </header>

          <div v-for="unit in book.units" :key="unit.id" class="st-unit">
            <div class="st-unit__head">
              <h4 class="st-unit__title">{{ unit.title }}</h4>
              <span class="sf-quiet">{{ unit.lessons.length }} 个课次</span>
              <div class="st-unit__actions">
                <n-button text type="primary" @click="openLessonDialog(unit.id)">新增课次</n-button>
                <n-button text @click="openUnitDialog(book.id, unit)">编辑</n-button>
                <n-button text type="error" @click="deleteUnit(unit.id)">删除</n-button>
              </div>
            </div>
            <div class="st-lessons">
              <span v-for="lesson in unit.lessons" :key="lesson.id" class="st-lesson">
                <span class="st-lesson__title">{{ lesson.title }}</span>
                <button class="sf-link" type="button" @click="openLessonDialog(unit.id, lesson)">编辑</button>
                <button class="sf-link st-lesson__del" type="button" @click="deleteLesson(lesson.id)">删</button>
              </span>
              <span v-if="!unit.lessons.length" class="sf-quiet">这个单元还没有课次。</span>
            </div>
          </div>

          <p v-if="!book.units.length" class="st-book__empty sf-quiet">还没有单元</p>
        </article>
      </div>
    </section>

    <n-modal v-model:show="bookDialogVisible" :title="editingBookId ? '编辑教材' : '新增教材'" preset="card" style="width: 560px">
      <n-form label-placement="top">
        <n-form-item label="教材名称"><n-input v-model:value="bookForm.name" /></n-form-item>
        <n-form-item label="学科"><n-input v-model:value="bookForm.subject" /></n-form-item>
        <n-form-item label="版本"><n-input v-model:value="bookForm.edition" /></n-form-item>
        <n-form-item label="适用范围">
          <n-auto-complete
            :options="curriculumGradeScopeOptions"
            :value="bookForm.grade_scope"
            class="full-width"
            clearable
            placeholder="可手动输入或选择年级范围"
            @update:value="setBookGradeScope"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="bookDialogVisible = false">取消</n-button>
          <n-button type="primary" @click="saveBookForm">保存</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="unitDialogVisible" :title="editingUnitId ? '编辑单元' : '新增单元'" preset="card" style="width: 560px">
      <n-form label-placement="top">
        <n-form-item label="学期序号"><n-input-number v-model:value="unitForm.term_no" :max="4" :min="1" /></n-form-item>
        <n-form-item label="单元序号"><n-input-number v-model:value="unitForm.unit_no" :max="99" :min="1" /></n-form-item>
        <n-form-item label="单元标题"><n-input v-model:value="unitForm.title" /></n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="unitDialogVisible = false">取消</n-button>
          <n-button type="primary" @click="saveUnitForm">保存</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="lessonDialogVisible" :title="editingLessonId ? '编辑课次' : '新增课次'" preset="card" style="width: 560px">
      <n-form label-placement="top">
        <n-form-item label="课次序号"><n-input-number v-model:value="lessonForm.lesson_no" :max="99" :min="1" /></n-form-item>
        <n-form-item label="课次标题"><n-input v-model:value="lessonForm.title" /></n-form-item>
        <n-form-item label="课次摘要"><n-input v-model:value="lessonForm.summary" type="textarea" /></n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="lessonDialogVisible = false">取消</n-button>
          <n-button type="primary" @click="saveLessonForm">保存</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { NAutoComplete, NButton, NForm, NFormItem, NInput, NInputNumber, NModal } from 'naive-ui';
import { computed, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import type { CurriculumBook } from '../adminTypes';
import {
  curriculumImportAccept as importAccept,
  useAdminCurriculum,
  type BookDialogForm,
  type LessonDialogForm,
  type UnitDialogForm,
} from '../composables/useAdminCurriculum';

const {
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
} = useAdminCurriculum();

const curriculumImportAccept = importAccept;

const curriculumGradeScopeOptions = [
  '一年级上册',
  '一年级下册',
  '二年级上册',
  '二年级下册',
  '三年级上册',
  '三年级下册',
  '七年级上册',
  '七年级下册',
  '八年级上册',
  '八年级下册',
  '九年级上册',
  '九年级下册',
];

const curriculumImportInputRef = ref<HTMLInputElement | null>(null);
const selectedCurriculumImportFileName = ref('');
const isImportingCurriculum = ref(false);

const bookDialogVisible = ref(false);
const unitDialogVisible = ref(false);
const lessonDialogVisible = ref(false);
const editingBookId = ref<number | null>(null);
const editingUnitId = ref<number | null>(null);
const editingLessonId = ref<number | null>(null);
const bookForm = ref<BookDialogForm>(emptyBookForm());
const unitForm = ref<UnitDialogForm>({ book_id: 0, term_no: 1, unit_no: 1, title: '' });
const lessonForm = ref<LessonDialogForm>({ unit_id: 0, lesson_no: 1, title: '', summary: '' });

const lessonTotal = computed(() =>
  curriculumBooks.value.reduce(
    (sum, book) => sum + book.units.reduce((unitSum, unit) => unitSum + unit.lessons.length, 0),
    0
  )
);

function setBookGradeScope(value: string | null) {
  bookForm.value.grade_scope = value ?? '';
}

function openBookDialog(book?: CurriculumBook) {
  editingBookId.value = book?.id ?? null;
  bookForm.value = book
    ? { name: book.name, subject: book.subject, edition: book.edition, grade_scope: book.grade_scope }
    : emptyBookForm();
  bookDialogVisible.value = true;
}

async function saveBookForm() {
  await saveBook(editingBookId.value, bookForm.value);
  bookDialogVisible.value = false;
}

function openUnitDialog(bookId: number, unit?: CurriculumBook['units'][number]) {
  editingUnitId.value = unit?.id ?? null;
  unitForm.value = unit
    ? { book_id: bookId, term_no: unit.term_no, unit_no: unit.unit_no, title: unit.title }
    : { book_id: bookId, term_no: 1, unit_no: 1, title: '' };
  unitDialogVisible.value = true;
}

async function saveUnitForm() {
  await saveUnit(editingUnitId.value, unitForm.value);
  unitDialogVisible.value = false;
}

function openLessonDialog(unitId: number, lesson?: CurriculumBook['units'][number]['lessons'][number]) {
  editingLessonId.value = lesson?.id ?? null;
  lessonForm.value = lesson
    ? { unit_id: unitId, lesson_no: lesson.lesson_no, title: lesson.title, summary: lesson.summary || '' }
    : { unit_id: unitId, lesson_no: 1, title: '', summary: '' };
  lessonDialogVisible.value = true;
}

async function saveLessonForm() {
  await saveLesson(editingLessonId.value, lessonForm.value);
  lessonDialogVisible.value = false;
}

function openCurriculumImportPicker() {
  curriculumImportInputRef.value?.click();
}

function handleCurriculumImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  selectedCurriculumImportFileName.value = input?.files?.[0]?.name || '';
}

async function submitCurriculumImportFromInput() {
  const file = curriculumImportInputRef.value?.files?.[0];
  if (!file) {
    ElMessage.warning('请先选择要导入的教材文件');
    return;
  }
  isImportingCurriculum.value = true;
  try {
    await submitCurriculumImport(file);
    if (curriculumImportInputRef.value) {
      curriculumImportInputRef.value.value = '';
    }
    selectedCurriculumImportFileName.value = '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '教材导入失败');
  } finally {
    isImportingCurriculum.value = false;
  }
}

async function downloadCurriculumImportTemplateFile() {
  const templatePath = `${import.meta.env.BASE_URL}templates/curriculum-import-template.csv`;
  const anchor = document.createElement('a');
  anchor.href = templatePath;
  anchor.download = '教材树导入模板.csv';
  anchor.click();
}

defineExpose({ loadCurriculum });
</script>
