<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">学案管理</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这里已经支持教师按课程体系创建学案、配置任务并发布。发布完成后，可直接进入“上课中控”
          把这份学案推送给班级，形成完整教学闭环。
        </p>
      </div>
      <el-space wrap>
        <el-button type="primary" @click="openCreateDialog">新建学案</el-button>
        <el-button plain @click="router.push('/staff/curriculum')">查看课程体系</el-button>
        <el-button plain @click="selectPlan(plans[0]?.id || null)">回到最新学案</el-button>
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
            <p class="metric-label">学案总数</p>
            <p class="metric-value">{{ plans.length }}</p>
            <p class="metric-note">包含草稿、已发布和已开课学案</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">任务总数</p>
            <p class="metric-value">{{ totalTaskCount }}</p>
            <p class="metric-note">阅读、上传、编程任务合计</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">待完成进度</p>
            <p class="metric-value">{{ totalPendingCount }}</p>
            <p class="metric-note">只会在开课后产生</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">已完成进度</p>
            <p class="metric-value">{{ totalCompletedCount }}</p>
            <p class="metric-note">便于教师快速判断班级推进情况</p>
          </article>
        </div>

        <el-card class="soft-card">
          <template #header>学案列表</template>
          <el-empty v-if="!plans.length" description="暂无学案数据" />
          <el-table v-else :data="plans" stripe @row-click="handleRowClick">
            <el-table-column label="学案标题" min-width="240" prop="title" />
            <el-table-column label="状态" min-width="110">
              <template #default="{ row }">
                <el-tag round :type="planStatusType(row.status)">{{ planStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="绑定课次" min-width="190">
              <template #default="{ row }">
                {{ row.lesson.title }}
              </template>
            </el-table-column>
            <el-table-column label="所属单元" min-width="220">
              <template #default="{ row }">
                {{ row.lesson.unit_title }}
              </template>
            </el-table-column>
            <el-table-column label="发布时间" min-width="120" prop="assigned_date" />
            <el-table-column label="任务数" min-width="88" prop="task_count" />
            <el-table-column label="待完成" min-width="88">
              <template #default="{ row }">
                {{ row.progress.pending_count }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="220">
              <template #default="{ row }">
                <el-space wrap>
                  <el-button link type="primary" @click.stop="selectPlan(row.id)">查看</el-button>
                  <el-button
                    link
                    type="warning"
                    :disabled="!canEditPlan(row)"
                    @click.stop="openEditDialog(row.id)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-if="row.status === 'draft'"
                    link
                    type="success"
                    @click.stop="publishPlan(row.id)"
                  >
                    发布
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    :disabled="!canEditPlan(row)"
                    :loading="deletingPlanId === row.id"
                    @click.stop="deletePlan(row.id)"
                  >
                    删除
                  </el-button>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="selectedPlanDetail" class="soft-card">
          <template #header>
            <div class="info-row">
              <span>当前选中学案</span>
              <el-tag round :type="planStatusType(selectedPlanDetail.status)">
                {{ planStatusLabel(selectedPlanDetail.status) }}
              </el-tag>
            </div>
          </template>

          <div class="stack-list">
            <div class="info-row">
              <strong>{{ selectedPlanDetail.title }}</strong>
              <el-space wrap>
                <el-button
                  plain
                  type="warning"
                  :disabled="!canEditPlan(selectedPlanDetail)"
                  @click="openEditDialog(selectedPlanDetail.id)"
                >
                  编辑学案
                </el-button>
                <el-button
                  v-if="selectedPlanDetail.status === 'draft'"
                  :loading="publishingPlanId === selectedPlanDetail.id"
                  type="success"
                  @click="publishPlan(selectedPlanDetail.id)"
                >
                  发布学案
                </el-button>
                <el-button
                  plain
                  type="danger"
                  :disabled="!canEditPlan(selectedPlanDetail)"
                  :loading="deletingPlanId === selectedPlanDetail.id"
                  @click="deletePlan(selectedPlanDetail.id)"
                >
                  删除学案
                </el-button>
                <el-button
                  :disabled="selectedPlanDetail.status === 'draft'"
                  type="primary"
                  @click="goToClassroom(selectedPlanDetail.id)"
                >
                  去开课
                </el-button>
              </el-space>
            </div>

            <p class="section-note">
              {{ selectedPlanDetail.lesson.book_name }} / {{ selectedPlanDetail.lesson.unit_title }} /
              {{ selectedPlanDetail.lesson.title }}
            </p>

            <el-space wrap>
              <el-tag round>发布日期 {{ selectedPlanDetail.assigned_date }}</el-tag>
              <el-tag round type="success">任务 {{ selectedPlanDetail.tasks.length }}</el-tag>
              <el-tag round type="warning">待完成 {{ selectedPlanDetail.progress.pending_count }}</el-tag>
              <el-tag round type="info">已完成 {{ selectedPlanDetail.progress.completed_count }}</el-tag>
            </el-space>

            <div class="content-panel">
              <div class="info-row">
                <strong>学案正文</strong>
                <el-tag round type="info">富文本</el-tag>
              </div>
              <RichTextContent
                :html="selectedPlanDetail.content"
                empty-text="当前学案还没有正文说明。"
              />
            </div>

            <div class="task-editor-list">
              <article v-for="task in selectedPlanDetail.tasks" :key="task.id" class="task-preview-card">
                <div class="info-row">
                  <strong>任务 {{ task.sort_order }} · {{ task.title }}</strong>
                  <el-space wrap>
                    <el-tag round type="info">{{ taskTypeLabel(task.task_type) }}</el-tag>
                    <el-tag round :type="task.submission_scope === 'group' ? 'warning' : 'success'">
                      {{ task.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
                    </el-tag>
                    <el-tag round :type="task.is_required ? 'success' : 'warning'">
                      {{ task.is_required ? '必做' : '选做' }}
                    </el-tag>
                  </el-space>
                </div>
                <p class="section-note">
                  {{ richTextToExcerpt(task.description, 160) || '当前任务还没有补充说明。' }}
                </p>
              </article>
            </div>
          </div>
        </el-card>
      </template>
    </el-skeleton>

    <el-dialog
      v-model="editorVisible"
      :close-on-click-modal="false"
      :title="editingPlanId ? '编辑学案' : '新建学案'"
      width="960px"
    >
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :md="12" :sm="24">
            <el-form-item label="学案标题">
              <el-input v-model="planForm.title" maxlength="120" placeholder="例如：八下第一单元 第4课 智能感知体验" />
            </el-form-item>
          </el-col>
          <el-col :md="6" :sm="12">
            <el-form-item label="发布日期">
              <el-date-picker
                v-model="planForm.assigned_date"
                class="full-width"
                type="date"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :md="6" :sm="12">
            <el-form-item label="保存状态">
              <el-select v-model="planForm.status" class="full-width">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
                <el-option :disabled="!editingPlanId" label="上课中" value="active" />
                <el-option :disabled="!editingPlanId" label="已完成" value="completed" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="绑定课次">
          <el-select v-model="planForm.lesson_id" class="full-width" filterable placeholder="请选择课次">
            <el-option-group
              v-for="group in lessonOptions"
              :key="group.label"
              :label="group.label"
            >
              <el-option
                v-for="lesson in group.lessons"
                :key="lesson.id"
                :label="lesson.label"
                :value="lesson.id"
              />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-form-item label="学案正文">
          <RichTextEditor
            v-model="planForm.content"
            :min-height="260"
            placeholder="参考旧站 courseedit.aspx 的学案正文区域，可填写导读、步骤、图片、重点提示等。"
          />
        </el-form-item>

        <div class="dialog-task-head">
          <div>
            <h3>任务配置</h3>
            <p class="section-note">建议至少配置一个阅读任务或作品任务，学生开课后才能进入学习与提交。</p>
          </div>
          <el-button plain @click="addTaskRow">新增任务</el-button>
        </div>

        <div class="task-editor-list">
          <article v-for="(task, index) in planForm.tasks" :key="task.key" class="task-editor-card">
            <div class="info-row">
              <strong>任务 {{ index + 1 }}</strong>
              <el-button
                :disabled="planForm.tasks.length === 1"
                link
                type="danger"
                @click="removeTaskRow(task.key)"
              >
                删除
              </el-button>
            </div>

            <el-row :gutter="16">
              <el-col :md="12" :sm="24">
                <el-form-item label="任务标题">
                  <el-input v-model="task.title" maxlength="120" placeholder="例如：活动一、智能翻译体验" />
                </el-form-item>
              </el-col>
              <el-col :md="6" :sm="12">
                <el-form-item label="任务类型">
                  <el-select v-model="task.task_type" class="full-width">
                    <el-option label="阅读任务" value="reading" />
                    <el-option label="上传作品" value="upload_image" />
                    <el-option label="编程任务" value="programming" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :md="6" :sm="12">
                <el-form-item label="任务要求">
                  <el-switch
                    v-model="task.is_required"
                    active-text="必做"
                    inactive-text="选做"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="提交方式">
              <el-radio-group v-model="task.submission_scope" :disabled="task.task_type === 'reading'">
                <el-radio-button label="individual">个人提交</el-radio-button>
                <el-radio-button label="group">小组共同提交</el-radio-button>
              </el-radio-group>
              <p class="section-note">
                {{ task.task_type === 'reading' ? '阅读任务固定为个人完成。' : '小组共同提交时，同组成员共享同一份提交结果。' }}
              </p>
            </el-form-item>

            <el-form-item label="任务说明">
              <RichTextEditor
                v-model="task.description"
                :min-height="220"
                placeholder="参考旧站 missionadd.aspx 的活动说明区域，可写学习目标、步骤、图片、链接和提交要求。"
              />
            </el-form-item>
          </article>
        </div>
      </el-form>

      <template #footer>
        <el-space wrap>
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button :loading="isSavingPlan" type="primary" @click="savePlan">
            {{ editingPlanId ? '保存修改' : '创建学案' }}
          </el-button>
        </el-space>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';
import { normalizeRichTextHtml, richTextToExcerpt } from '@/utils/richText';

type PlanSummary = {
  id: number;
  title: string;
  status: string;
  assigned_date: string;
  task_count: number;
  lesson: {
    id: number;
    title: string;
    lesson_no: number;
    unit_title: string;
    book_name: string;
  };
  progress: {
    pending_count: number;
    completed_count: number;
  };
};

type PlanDetail = PlanSummary & {
  content: string | null;
  tasks: Array<{
    id: number;
    title: string;
    task_type: string;
    submission_scope: string;
    description: string | null;
    sort_order: number;
    is_required: boolean;
  }>;
};

type CurriculumBook = {
  id: number;
  name: string;
  edition: string;
  units: Array<{
    id: number;
    title: string;
    lessons: Array<{
      id: number;
      title: string;
      lesson_no: number;
    }>;
  }>;
};

type LessonOptionGroup = {
  label: string;
  lessons: Array<{
    id: number;
    label: string;
  }>;
};

type PlanFormTask = {
  id: number | null;
  key: string;
  title: string;
  task_type: string;
  submission_scope: string;
  description: string;
  is_required: boolean;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const plans = ref<PlanSummary[]>([]);
const curriculumBooks = ref<CurriculumBook[]>([]);
const selectedPlanDetail = ref<PlanDetail | null>(null);
const isLoading = ref(true);
const isSavingPlan = ref(false);
const publishingPlanId = ref<number | null>(null);
const deletingPlanId = ref<number | null>(null);
const errorMessage = ref('');
const editorVisible = ref(false);
const editingPlanId = ref<number | null>(null);
const taskSeed = ref(1);

const planForm = ref({
  lesson_id: null as number | null,
  title: '',
  content: '',
  assigned_date: new Date().toISOString().slice(0, 10),
  status: 'draft',
  tasks: [] as PlanFormTask[],
});

const selectedPlanId = computed(() => {
  const routePlanId = Number(route.params.planId);
  if (Number.isFinite(routePlanId) && routePlanId > 0) {
    return routePlanId;
  }
  return plans.value[0]?.id || null;
});

const pageTitle = computed(() => selectedPlanDetail.value?.title || '教师学案管理');
const totalTaskCount = computed(() => plans.value.reduce((sum, item) => sum + item.task_count, 0));
const totalPendingCount = computed(() =>
  plans.value.reduce((sum, item) => sum + item.progress.pending_count, 0)
);
const totalCompletedCount = computed(() =>
  plans.value.reduce((sum, item) => sum + item.progress.completed_count, 0)
);
const lessonOptions = computed<LessonOptionGroup[]>(() =>
  curriculumBooks.value.flatMap((book) =>
    book.units.map((unit) => ({
      label: `${book.name} · ${unit.title}`,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        label: `第 ${lesson.lesson_no} 课次 · ${lesson.title}`,
      })),
    }))
  )
);

function createEmptyTask(): PlanFormTask {
  const currentSeed = taskSeed.value++;
  return {
    id: null,
    key: `task-${currentSeed}`,
    title: '',
    task_type: 'upload_image',
    submission_scope: 'individual',
    description: '',
    is_required: true,
  };
}

function resetPlanForm() {
  planForm.value = {
    lesson_id: null,
    title: '',
    content: '',
    assigned_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    tasks: [createEmptyTask()],
  };
}

function taskTypeLabel(taskType: string) {
  if (taskType === 'reading') {
    return '阅读任务';
  }
  if (taskType === 'programming') {
    return '编程任务';
  }
  return '上传作品';
}

function planStatusLabel(status: string) {
  if (status === 'draft') {
    return '草稿';
  }
  if (status === 'published') {
    return '已发布';
  }
  if (status === 'active') {
    return '上课中';
  }
  if (status === 'completed') {
    return '已完成';
  }
  return status;
}

function planStatusType(status: string) {
  if (status === 'draft') {
    return 'info';
  }
  if (status === 'published') {
    return 'success';
  }
  if (status === 'active') {
    return 'warning';
  }
  return 'info';
}

function canEditPlan(plan: Pick<PlanSummary, 'status' | 'progress'>) {
  void plan;
  return true;
}

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

async function loadPlans() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    isLoading.value = false;
    return;
  }

  const [planPayload, curriculumPayload] = await Promise.all([
    apiGet<{ plans: PlanSummary[] }>('/lesson-plans/staff/list', authStore.token),
    apiGet<{ books: CurriculumBook[] }>('/curriculum/tree', authStore.token),
  ]);

  plans.value = planPayload.plans;
  curriculumBooks.value = curriculumPayload.books;

  if (!selectedPlanId.value && planPayload.plans[0]) {
    await router.replace(`/staff/lesson-plans/${planPayload.plans[0].id}`);
  }
}

async function loadPlanDetail(planId: number | null) {
  if (!planId || !authStore.token) {
    selectedPlanDetail.value = null;
    return;
  }

  const payload = await apiGet<{ plan: PlanDetail }>(`/lesson-plans/staff/${planId}`, authStore.token);
  selectedPlanDetail.value = payload.plan;
}

async function loadPage() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    await loadPlans();
    await loadPlanDetail(selectedPlanId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载学案数据失败';
  } finally {
    isLoading.value = false;
  }
}

async function selectPlan(planId: number | null) {
  if (!planId) {
    return;
  }
  await router.push(`/staff/lesson-plans/${planId}`);
}

function handleRowClick(row: PlanSummary) {
  void selectPlan(row.id);
}

function openCreateDialog() {
  editingPlanId.value = null;
  resetPlanForm();
  editorVisible.value = true;
}

async function openEditDialog(planId: number) {
  try {
    let targetPlan = planId === selectedPlanDetail.value?.id ? selectedPlanDetail.value : null;
    if (!targetPlan) {
      await selectPlan(planId);
      await loadPlanDetail(planId);
      targetPlan = selectedPlanDetail.value;
    }

    if (!targetPlan) {
      errorMessage.value = '加载学案详情失败';
      return;
    }

    fillFormWithPlan(targetPlan);
    editingPlanId.value = targetPlan.id;
    editorVisible.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打开编辑器失败';
  }
}

function fillFormWithPlan(plan: PlanDetail) {
  planForm.value = {
    lesson_id: plan.lesson.id,
    title: plan.title,
    content: plan.content || '',
    assigned_date: plan.assigned_date,
    status: plan.status,
    tasks: plan.tasks.map((task) => ({
      id: task.id,
      key: `task-${task.id}`,
      title: task.title,
      task_type: task.task_type,
      submission_scope: task.submission_scope || 'individual',
      description: task.description || '',
      is_required: task.is_required,
    })),
  };
}

function addTaskRow() {
  planForm.value.tasks.push(createEmptyTask());
}

function removeTaskRow(taskKey: string) {
  planForm.value.tasks = planForm.value.tasks.filter((task) => task.key !== taskKey);
}

function buildPayload() {
  if (!planForm.value.lesson_id) {
    throw new Error('请先选择绑定课次');
  }
  if (!planForm.value.title.trim()) {
    throw new Error('请先填写学案标题');
  }

  const tasks = planForm.value.tasks.map((task, index) => {
    if (!task.title.trim()) {
      throw new Error(`请填写任务 ${index + 1} 的标题`);
    }
    const submissionScope = task.task_type === 'reading' ? 'individual' : task.submission_scope;
    return {
      id: task.id,
      title: task.title.trim(),
      task_type: task.task_type,
      submission_scope: submissionScope,
      description: normalizeRichTextHtml(task.description) || null,
      sort_order: index + 1,
      is_required: task.is_required,
    };
  });

  return {
    lesson_id: planForm.value.lesson_id,
    title: planForm.value.title.trim(),
    content: normalizeRichTextHtml(planForm.value.content) || null,
    assigned_date: planForm.value.assigned_date,
    status: planForm.value.status,
    tasks,
  };
}

async function savePlan() {
  if (!authStore.token) {
    return;
  }

  isSavingPlan.value = true;
  errorMessage.value = '';

  try {
    const payload = buildPayload();
    const response = editingPlanId.value
      ? await apiPut<{ plan: PlanDetail }>(
          `/lesson-plans/staff/${editingPlanId.value}`,
          payload,
          authStore.token
        )
      : await apiPost<{ plan: PlanDetail }>(
          '/lesson-plans/staff',
          payload,
          authStore.token
        );

    ElMessage.success(editingPlanId.value ? '学案已更新' : '学案已创建');
    editorVisible.value = false;
    await loadPlans();
    await selectPlan(response.plan.id);
    await loadPlanDetail(response.plan.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存学案失败';
  } finally {
    isSavingPlan.value = false;
  }
}

async function publishPlan(planId: number) {
  if (!authStore.token) {
    return;
  }

  publishingPlanId.value = planId;
  errorMessage.value = '';

  try {
    const response = await apiPost<{ plan: PlanDetail }>(
      `/lesson-plans/staff/${planId}/publish`,
      {},
      authStore.token
    );
    ElMessage.success('学案已发布，可以去开课了');
    await loadPlans();
    await selectPlan(response.plan.id);
    await loadPlanDetail(response.plan.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发布学案失败';
  } finally {
    publishingPlanId.value = null;
  }
}

async function deletePlan(planId: number) {
  if (!authStore.token) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      '确认删除这个学案吗？删除后不可恢复，且会一并清理相关学习进度和开课记录。',
      '删除学案',
      { type: 'warning' }
    );
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : '删除学案失败';
    return;
  }

  deletingPlanId.value = planId;
  errorMessage.value = '';
  try {
    await apiDelete<{ deleted_id: number }>(`/lesson-plans/staff/${planId}`, authStore.token);
    ElMessage.success('学案已删除');
    const deletingCurrent =
      selectedPlanDetail.value?.id === planId ||
      Number(route.params.planId) === planId;

    await loadPlans();
    if (deletingCurrent) {
      const nextPlanId = plans.value[0]?.id ?? null;
      if (nextPlanId) {
        await router.replace(`/staff/lesson-plans/${nextPlanId}`);
        await loadPlanDetail(nextPlanId);
      } else {
        selectedPlanDetail.value = null;
        await router.replace('/staff/lesson-plans');
      }
      return;
    }
    await loadPlanDetail(selectedPlanId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除学案失败';
  } finally {
    deletingPlanId.value = null;
  }
}

async function goToClassroom(planId: number) {
  await router.push({ path: '/staff/classroom', query: { planId: String(planId) } });
}

watch(
  () => route.params.planId,
  () => {
    void loadPlanDetail(selectedPlanId.value);
  }
);

onMounted(() => {
  resetPlanForm();
  void loadPage();
});
</script>

<style scoped>
.task-editor-list {
  display: grid;
  gap: 14px;
}

.task-preview-card,
.task-editor-card {
  padding: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
}

.content-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.8);
}

.dialog-task-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin: 8px 0 12px;
}

.dialog-task-head h3,
.section-note {
  margin: 0;
}

.section-note {
  color: var(--ls-muted);
  line-height: 1.7;
}

.full-width {
  width: 100%;
}

@media (max-width: 768px) {
  .dialog-task-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
