<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">课程体系</p>
        <h2>教材、单元与课次绑定</h2>
        <p class="hero-copy">
          这是新平台相对旧站最重要的增强能力之一。教师在创建学案前，先从课程体系里确认年级、
          单元和具体课次，后续再把学案、资源和任务挂到对应课次上。
        </p>
      </div>
      <el-space wrap>
        <el-button type="primary" @click="router.push('/staff/lesson-plans')">查看关联学案</el-button>
        <el-button
          v-if="authStore.isAdmin"
          plain
          @click="router.push({ path: '/staff/admin/system', query: { tab: 'curriculum' } })"
        >
          手动导入维护
        </el-button>
        <el-button plain @click="expandAllBooks">
          展开全部教材
        </el-button>
        <el-button plain @click="collapseAllBooks">
          收起全部教材
        </el-button>
        <el-button plain @click="expandAllUnits">
          展开全部单元
        </el-button>
        <el-button plain @click="collapseAllUnits">
          收起全部单元
        </el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="8" />
        </el-card>
      </template>

      <template #default>
        <div class="metric-grid">
          <article class="metric-tile">
            <p class="metric-label">教材数</p>
            <p class="metric-value">{{ books.length }}</p>
            <p class="metric-note">当前已纳入维护的教材版本</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">单元数</p>
            <p class="metric-value">{{ totalUnitCount }}</p>
            <p class="metric-note">按教材汇总得到</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">课次数</p>
            <p class="metric-value">{{ totalLessonCount }}</p>
            <p class="metric-note">后续学案必须绑定到课次</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">已关联学案</p>
            <p class="metric-value">{{ totalPlanCount }}</p>
            <p class="metric-note">可直接跳转到学案管理继续细化</p>
          </article>
        </div>

        <el-empty v-if="!books.length" description="暂无课程体系数据" />
        <el-collapse v-else v-model="expandedBooks">
          <el-collapse-item
            v-for="book in books"
            :key="book.id"
            :name="String(book.id)"
            :title="`${book.name} · ${book.edition}`"
          >
            <div class="stack-list">
              <section class="mini-panel">
                <div class="info-row">
                  <strong>{{ book.subject }}</strong>
                  <span>{{ book.grade_scope }}</span>
                </div>
                <el-space wrap class="unit-actions">
                  <el-tag round>单元 {{ book.unit_count }}</el-tag>
                  <el-tag round type="success">课次 {{ book.lesson_count }}</el-tag>
                  <el-tag round type="warning">关联学案 {{ book.plan_count }}</el-tag>
                  <el-button link type="primary" @click="expandUnits(book)">展开单元</el-button>
                  <el-button link type="primary" @click="collapseUnits(book)">收起单元</el-button>
                </el-space>
              </section>

              <el-collapse v-model="expandedUnitsByBook[String(book.id)]" class="unit-collapse">
                <el-collapse-item
                  v-for="unit in book.units"
                  :key="unit.id"
                  :name="String(unit.id)"
                  class="unit-collapse-item"
                  :title="`${unit.title} · 课次 ${unit.lesson_count}`"
                >
                  <el-table :data="unit.lessons" size="small" stripe>
                    <el-table-column label="课次" min-width="90">
                      <template #default="{ row }">
                        第 {{ row.lesson_no }} 课
                      </template>
                    </el-table-column>
                    <el-table-column label="课题" min-width="240" prop="title" />
                    <el-table-column label="关联学案" min-width="100" prop="plan_count" />
                    <el-table-column label="最新学案" min-width="280">
                      <template #default="{ row }">
                        <span v-if="row.latest_plan">
                          {{ row.latest_plan.title }} ({{ row.latest_plan.assigned_date }})
                        </span>
                        <span v-else>尚未创建学案</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" min-width="120">
                      <template #default="{ row }">
                        <el-button
                          v-if="row.latest_plan"
                          link
                          type="primary"
                          @click="router.push(`/staff/lesson-plans/${row.latest_plan.id}`)"
                        >
                          查看学案
                        </el-button>
                        <span v-else>待创建</span>
                      </template>
                    </el-table-column>
                  </el-table>
                </el-collapse-item>
              </el-collapse>
            </div>
          </el-collapse-item>
        </el-collapse>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
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
const expandedBooks = ref<string[]>([]);
const expandedUnitsByBook = ref<Record<string, string[]>>({});
const isLoading = ref(true);
const errorMessage = ref('');

const totalUnitCount = computed(() =>
  books.value.reduce((sum, book) => sum + book.unit_count, 0)
);
const totalLessonCount = computed(() =>
  books.value.reduce((sum, book) => sum + book.lesson_count, 0)
);
const totalPlanCount = computed(() =>
  books.value.reduce((sum, book) => sum + book.plan_count, 0)
);

function expandAllBooks() {
  expandedBooks.value = books.value.map((book) => String(book.id));
}

function collapseAllBooks() {
  expandedBooks.value = [];
}

function expandAllUnits() {
  const next: Record<string, string[]> = {};
  for (const book of books.value) {
    next[String(book.id)] = book.units.map((unit) => String(unit.id));
  }
  expandedUnitsByBook.value = next;
}

function collapseAllUnits() {
  const next: Record<string, string[]> = { ...expandedUnitsByBook.value };
  for (const book of books.value) {
    next[String(book.id)] = [];
  }
  expandedUnitsByBook.value = next;
}

function expandUnits(book: CurriculumBook) {
  expandedUnitsByBook.value = {
    ...expandedUnitsByBook.value,
    [String(book.id)]: book.units.map((unit) => String(unit.id)),
  };
}

function collapseUnits(book: CurriculumBook) {
  expandedUnitsByBook.value = {
    ...expandedUnitsByBook.value,
    [String(book.id)]: [],
  };
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
    expandAllBooks();
    expandAllUnits();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课程体系失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadCurriculum);
</script>

<style scoped>
.unit-actions {
  row-gap: 4px;
}

.unit-collapse {
  border: none;
}

:deep(.unit-collapse-item) {
  margin-bottom: 10px;
  border: 1px solid var(--ls-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  overflow: hidden;
}

:deep(.unit-collapse-item .el-collapse-item__header) {
  padding: 0 14px;
  font-weight: 600;
  border-bottom: 1px solid transparent;
}

:deep(.unit-collapse-item .el-collapse-item__content) {
  padding: 10px 14px 14px;
}

:deep(.unit-collapse-item .el-collapse-item__wrap) {
  border-bottom: none;
}
</style>
