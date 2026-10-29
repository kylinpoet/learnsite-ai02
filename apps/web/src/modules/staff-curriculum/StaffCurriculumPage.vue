<template>
  <div class="page-stack">
    <StaffPageHead title="课程内容" :sub="pageSummary">
      <template #actions>
        <n-button type="primary" @click="router.push('/staff/lesson-plans/new')">新建学案</n-button>
        <n-button secondary @click="router.push('/staff/lesson-plans')">查看关联学案</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else>
      <StaffStatStrip :items="statItems" />

      <div v-if="!books.length" class="sf-empty sf-empty--box">当前还没有课程体系数据。</div>

      <section v-else class="sf-panel">
        <div class="sf-tabs">
          <button
            v-for="book in catalogBooks"
            :key="book.id"
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeTab === String(book.id) }]"
            @click="activeTab = String(book.id)"
          >
            {{ book.name }}
            <span class="sf-tabs__count">{{ book.lesson_count }}</span>
          </button>
          <button
            v-if="emptyBooks.length"
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeTab === 'pending' }]"
            @click="activeTab = 'pending'"
          >
            待录入目录
            <span class="sf-tabs__count">{{ emptyBooks.length }}</span>
          </button>
        </div>

        <template v-if="activeTab === 'pending'">
          <header class="sf-panel__head">
            <h2 class="sf-panel__title">
              待录入教材
              <span class="sf-panel__count">这些教材还没有单元与课次，无法绑定学案</span>
            </h2>
          </header>
          <div class="sf-panel__body sf-panel__body--flush">
            <div class="sf-rows">
              <div v-for="book in emptyBooks" :key="book.id" class="sf-row">
                <span class="sf-row__main">
                  <span class="sf-row__title">
                    <span class="sf-row__title-text">{{ book.name }} · {{ book.edition }}</span>
                  </span>
                  <span class="sf-row__meta"><span>{{ book.subject }}</span><span>{{ book.grade_scope }}</span></span>
                </span>
                <span class="sf-row__action">
                  <n-button
                    v-if="authStore.isAdmin"
                    text
                    type="primary"
                    @click="router.push({ path: '/staff/admin/system', query: { tab: 'curriculum' } })"
                  >
                    录入目录
                  </n-button>
                </span>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="selectedBook">
          <header class="sf-panel__head">
            <h2 class="sf-panel__title">
              {{ selectedBook.name }} · {{ selectedBook.edition }}
              <span class="sf-panel__count">{{ selectedBook.unit_count }} 个单元 / {{ selectedBook.lesson_count }} 个课次</span>
            </h2>
            <div class="sf-panel__actions">
              <span class="sf-quiet">已关联 {{ selectedBook.plan_count }} 份学案</span>
            </div>
          </header>
          <div class="sf-panel__body sf-panel__body--flush">
            <p v-if="!selectedBook.units.length" class="sf-empty sf-empty--box">
              {{ selectedBook.name }} 还没有录入单元与课次。录入目录后，每个课次会出现在这里，并显示是否已关联学案。
            </p>

            <div v-else class="unit-blocks">
              <section v-for="unit in selectedBook.units" :key="unit.id" class="unit-block">
                <header class="unit-block__head">
                  <h3 class="unit-block__title">{{ unit.title }}</h3>
                  <span class="sf-quiet">{{ unit.lesson_count }} 个课次</span>
                </header>
                <div class="sf-rows">
                  <article v-for="lesson in unit.lessons" :key="lesson.id" class="sf-row">
                    <span class="sf-row__main">
                      <span class="sf-row__title">
                        <span class="sf-row__title-text">{{ lessonLabel(lesson) }}</span>
                        <span v-if="lesson.latest_plan" class="sf-pill sf-pill--pos">已关联</span>
                      </span>
                      <span class="sf-row__meta">
                        <span v-if="lesson.latest_plan">
                          最新学案：{{ lesson.latest_plan.title }}（{{ lesson.latest_plan.assigned_date }}）
                        </span>
                        <span v-else>还没有学案</span>
                      </span>
                    </span>
                    <span class="sf-row__action">
                      <n-button
                        v-if="lesson.latest_plan"
                        text
                        @click="router.push(`/staff/lesson-plans/${lesson.latest_plan.id}`)"
                      >
                        查看学案
                      </n-button>
                      <n-button v-else text @click="router.push('/staff/lesson-plans/new')">
                        新建学案
                      </n-button>
                    </span>
                  </article>
                </div>
              </section>
            </div>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';

type CurriculumBook = {
  id: number;
  name: string;
  subject: string;
  edition: string;
  grade_scope: string;
  unit_count: number;
  lesson_count: number;
  plan_count: number;
  units: Array<{
    id: number;
    title: string;
    term_no: number;
    unit_no: number;
    lesson_count: number;
    lessons: Array<{
      id: number;
      title: string;
      lesson_no: number;
      plan_count: number;
      latest_plan: {
        id: number;
        title: string;
        assigned_date: string;
      } | null;
    }>;
  }>;
};

const router = useRouter();
const authStore = useAuthStore();
const books = ref<CurriculumBook[]>([]);
const activeTab = ref('');
const isLoading = ref(true);
const errorMessage = ref('');

const catalogBooks = computed(() => books.value.filter((book) => book.units.length > 0));
const emptyBooks = computed(() => books.value.filter((book) => !book.units.length));

const totalUnitCount = computed(() => books.value.reduce((sum, book) => sum + book.unit_count, 0));
const totalLessonCount = computed(() => books.value.reduce((sum, book) => sum + book.lesson_count, 0));
const totalPlanCount = computed(() => books.value.reduce((sum, book) => sum + book.plan_count, 0));
const unboundLessonCount = computed(() =>
  books.value.reduce(
    (sum, book) =>
      sum + book.units.reduce((unitSum, unit) => unitSum + unit.lessons.filter((lesson) => !lesson.latest_plan).length, 0),
    0
  )
);

const selectedBook = computed(() => books.value.find((book) => String(book.id) === activeTab.value) || null);

/** 标题下一行只写结论：数字在统计带里，这里说清是哪套教材 */
const pageSummary = computed(() => {
  if (!books.value.length) {
    return '还没有课程体系数据。';
  }
  if (!totalUnitCount.value) {
    return '所有教材都还没录入单元与课次，先到「手动导入维护」补齐目录。';
  }
  const focusBook = catalogBooks.value.find((book) =>
    book.units.some((unit) => unit.lessons.some((lesson) => !lesson.latest_plan))
  );
  if (focusBook) {
    const unbound = focusBook.units.reduce(
      (sum, unit) => sum + unit.lessons.filter((lesson) => !lesson.latest_plan).length,
      0
    );
    return `「${focusBook.name}」还有 ${unbound} 个课次没有学案，补齐后才能开课。`;
  }
  return '每个课次都已关联学案。';
});

const statItems = computed<StaffStatItem[]>(() => [
  { label: '教材', value: books.value.length, unit: '套' },
  { label: '单元', value: totalUnitCount.value, unit: '个' },
  { label: '课次', value: totalLessonCount.value, unit: '个' },
  {
    label: '未关联学案',
    value: unboundLessonCount.value,
    unit: '个课次',
    note: unboundLessonCount.value ? '这些课次还不能开课' : '全部课次都已关联',
  },
]);

function selectBook(bookId: number) {
  activeTab.value = String(bookId);
}

function lessonLabel(lesson: { lesson_no: number; title: string }) {
  // 目录里的课题常自带「第N课」，避免与序号重复
  const hasOwnNumber = /^第\s*\d+\s*课/.test(lesson.title.trim());
  return hasOwnNumber ? lesson.title : `第 ${lesson.lesson_no} 课 · ${lesson.title}`;
}

async function loadCurriculum() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    isLoading.value = false;
    return;
  }

  try {
    const payload = await apiGet<{ books: CurriculumBook[] }>('/curriculum/tree', authStore.token);
    books.value = payload.books;
    // 默认选中第一套有目录的教材，让主区直接显示可推进的课次
    const firstWithUnits = payload.books.find((book) => book.units.length);
    activeTab.value = firstWithUnits ? String(firstWithUnits.id) : payload.books.length ? 'pending' : '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课程体系失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadCurriculum);
</script>

<style scoped>
.unit-blocks {
  display: flex;
  flex-direction: column;
}

.unit-block + .unit-block {
  border-top: 1px solid var(--sf-line);
}

.unit-block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 8px;
  background: var(--sf-surface-2);
}

.unit-block__title {
  margin: 0;
  color: var(--sf-ink);
  font-size: 13px;
  font-weight: 600;
}
</style>
