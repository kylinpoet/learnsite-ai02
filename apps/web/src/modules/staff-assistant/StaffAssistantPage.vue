<template>
  <div class="page-stack">
    <StaffPageHead title="AI 助手" :sub="pageSummary">
      <template #actions>
        <n-button v-if="activeTab === 'agents'" type="primary" @click="openCreate">新建绑定</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <template v-else-if="payload">
      <StaffStatStrip :items="statItems" />

      <section class="sf-panel">
        <div class="sf-tabs">
          <button
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeTab === 'agents' }]"
            @click="activeTab = 'agents'"
          >
            课时学伴
            <span class="sf-tabs__count">{{ bindings.length }}</span>
          </button>
          <button
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeTab === 'audit' }]"
            @click="activeTab = 'audit'"
          >
            对话审计
            <span class="sf-tabs__count">{{ auditTotal }}</span>
          </button>
        </div>

        <template v-if="activeTab === 'agents'">
          <header class="sf-panel__head">
            <h2 class="sf-panel__title">
              已绑定课时学伴
              <span class="sf-panel__count">{{ bindings.length }} 个</span>
            </h2>
            <div class="sf-panel__actions">
              <span class="sf-quiet">按更新时间排序</span>
              <n-button :loading="isLoading" text @click="loadBindings">刷新</n-button>
            </div>
          </header>

          <p v-if="!bindings.length" class="sf-empty">
            还没有课时智能体绑定。点右上角「新建绑定」，为一个班级和一份学案创建学伴；学生的 AI 对话会使用这套提示词。
          </p>

          <template v-else>
            <div class="sf-rows__head sf-cols-agents">
              <span>学伴</span>
              <span>更新时间</span>
              <span>操作</span>
            </div>
            <div class="sf-rows">
              <article v-for="item in bindings" :key="item.binding_id" class="sf-row sf-row--cols sf-cols-agents">
                <div class="sf-row__main">
                  <p class="sf-row__title">
                    <span class="sf-row__title-text">{{ item.name }}</span>
                    <span :class="['sf-pill', item.is_enabled ? 'sf-pill--pos' : '']">
                      <span v-if="item.is_enabled" class="sf-pill__dot" />
                      {{ item.is_enabled ? '启用中' : '已停用' }}
                    </span>
                  </p>
                  <p class="sf-row__meta">
                    <span>{{ item.class_name }}</span>
                    <span>{{ item.plan_title }}</span>
                    <span v-if="item.lesson_title && item.lesson_title !== item.plan_title">{{ item.lesson_title }}</span>
                    <span>{{ item.knowledge_base_ids.length ? `${item.knowledge_base_ids.length} 个知识库` : '默认知识库' }}</span>
                  </p>
                </div>

                <span class="sf-row__num" data-label="更新时间">{{ formatDateTime(item.updated_at) }}</span>

                <div class="sf-row__action">
                  <n-button :disabled="!item.owner_editable" text type="primary" @click="editBinding(item)">编辑</n-button>
                  <n-button text @click="gotoClassroom(item)">进入课堂</n-button>
                  <n-button :disabled="!item.owner_editable" text type="error" @click="removeBinding(item)">删除</n-button>
                </div>
              </article>
            </div>
          </template>
        </template>

        <template v-else>
          <div class="sf-toolbar">
            <n-input
              v-model:value="auditFilter.search"
              class="sf-toolbar__search"
              clearable
              placeholder="搜索学生姓名 / 账号"
              @clear="refreshAudit"
              @keyup.enter="refreshAudit"
            />
            <n-select
              v-model:value="auditFilter.class_id"
              :options="auditClassOptions"
              class="filter-select"
              clearable
              placeholder="全部班级"
              @update:value="refreshAudit"
            />
            <n-checkbox v-model:checked="auditFilter.blocked_only" @update:checked="refreshAudit">
              仅看有拦截
            </n-checkbox>
            <div class="sf-toolbar__right">
              <span>{{ auditTotal }} 条对话</span>
              <n-button :loading="isAuditLoading" type="primary" @click="refreshAudit">查询</n-button>
            </div>
          </div>

          <p v-if="!auditItems.length && !isAuditLoading" class="sf-empty">
            {{
              auditFilter.search || auditFilter.class_id || auditFilter.blocked_only
                ? '当前筛选条件下没有对话记录。'
                : '还没有学生使用过 AI 学伴。'
            }}
          </p>

          <template v-else>
            <div class="sf-rows__head sf-cols-audit">
              <span>学生</span>
              <span>班级</span>
              <span>场景</span>
              <span>消息</span>
              <span>拦截</span>
              <span>最近活跃</span>
              <span>操作</span>
            </div>
            <div class="sf-rows">
              <article
                v-for="item in auditItems"
                :key="item.id"
                class="sf-row sf-row--cols sf-row--link sf-cols-audit"
                @click="openAuditConversation(item)"
              >
                <div class="sf-row__main">
                  <p class="sf-row__title">
                    <span class="sf-row__title-text">{{ item.student.display_name }}</span>
                  </p>
                  <p class="sf-row__meta"><span>{{ item.student.username }}</span></p>
                </div>

                <span class="audit-plain" data-label="班级">{{ item.class.name }}</span>
                <span class="audit-scope" data-label="场景">
                  <span class="sf-pill">{{ scopeLabel(item.scope) }}</span>
                  <span v-if="item.context_title && item.context_title !== scopeLabel(item.scope)" class="audit-scope__title">
                    {{ item.context_title }}
                  </span>
                </span>

                <span class="sf-row__num" data-label="消息">{{ item.message_count }}</span>
                <span class="audit-blocked" data-label="拦截">
                  <span v-if="item.blocked_count > 0" class="sf-pill sf-pill--neg">{{ item.blocked_count }}</span>
                  <span v-else class="sf-quiet">0</span>
                </span>
                <span class="sf-row__num" data-label="最近活跃">{{ formatDateTime(item.last_active_at) }}</span>

                <div class="sf-row__action" @click.stop>
                  <n-button text @click="openAuditConversation(item)">查看对话</n-button>
                </div>
              </article>
            </div>

            <div v-if="auditTotal > auditPageSize" class="audit-pagination">
              <n-pagination
                :item-count="auditTotal"
                :page="auditPage"
                :page-size="auditPageSize"
                @update:page="handleAuditPageChange"
              />
            </div>
          </template>
        </template>
      </section>
    </template>

    <n-drawer v-model:show="bindingDrawerVisible" :width="drawerWidth" placement="right">
      <n-drawer-content closable :title="form.binding_id ? '编辑课时学伴' : '新建课时学伴'">
        <n-form label-placement="top">
          <n-form-item label="绑定名称">
            <n-input v-model:value="form.name" placeholder="例如：701 班第 8 课学伴" />
          </n-form-item>
          <n-form-item label="班级">
            <n-select
              v-model:value="form.class_id"
              :options="classOptions"
              class="full-width"
              clearable
              placeholder="选择班级（管理员可留空表示全部班级）"
            />
          </n-form-item>
          <n-form-item label="学案">
            <n-select
              v-model:value="form.plan_id"
              :options="planOptions"
              class="full-width"
              filterable
              placeholder="选择学案"
            />
          </n-form-item>
          <n-form-item label="知识库">
            <n-select
              v-model:value="form.knowledge_base_ids"
              :max-tag-count="1"
              :options="knowledgeOptions"
              class="full-width"
              multiple
              placeholder="课时优先知识库"
            />
          </n-form-item>
          <n-form-item label="课时提示词">
            <n-input
              v-model:value="form.prompt_template"
              :rows="6"
              placeholder="写下这个课时学伴的角色、边界和追问方式"
              type="textarea"
            />
          </n-form-item>
          <n-form-item label="启用">
            <n-switch v-model:value="form.is_enabled" />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="bindingDrawerVisible = false">取消</n-button>
            <n-button :loading="isSaving" type="primary" @click="saveBinding">
              {{ form.binding_id ? '保存修改' : '创建绑定' }}
            </n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal
      v-model:show="auditDialogVisible"
      :title="auditDialogTitle"
      preset="card"
      style="width: min(720px, 94vw); margin-top: 6vh"
    >
      <div v-if="auditDetail" class="audit-dialog-body">
        <div
          v-for="message in auditDetail.messages"
          :key="message.id"
          class="audit-message"
          :class="message.role === 'user' ? 'is-student' : 'is-assistant'"
        >
          <div class="audit-message-meta">
            <n-tag :type="message.role === 'user' ? 'info' : 'success'" round size="small">
              {{ message.role === 'user' ? '学生' : 'AI 学伴' }}
            </n-tag>
            <n-tag v-if="message.is_blocked" round size="small" type="error">
              已拦截{{ message.blocked_category ? `：${message.blocked_category}` : '' }}
            </n-tag>
            <span class="table-note">{{ formatDateTime(message.created_at) }}</span>
          </div>
          <p class="audit-message-content">{{ message.content || '（附件消息）' }}</p>
          <p v-if="message.attachment_summary" class="table-note">附件：{{ message.attachment_summary }}</p>
          <p v-if="message.role === 'assistant' && message.provider_name" class="table-note">
            {{ message.provider_name }} · {{ message.provider_mode === 'live' ? '在线模型' : '预览模式' }}
          </p>
        </div>
        <p v-if="!auditDetail.messages.length" class="sf-empty">没有消息记录</p>
      </div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="auditDialogVisible = false">关闭</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPagination,
  NSelect,
  NSkeleton,
  NSpace,
  NSwitch,
  NTag,
} from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost } from '@/api/http';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime as formatDateTimeValue } from '@/utils/datetime';

type LessonAgentPayload = {
  classes: Array<{ id: number; class_name: string; grade_no: number; class_no: number }>;
  plans: Array<{
    id: number;
    title: string;
    status: string;
    assigned_date: string;
    lesson_title: string;
    unit_title: string;
    book_title: string;
  }>;
  knowledge_bases: Array<{ id: string; name: string; description: string; scopes: string[] }>;
  bindings: Array<{
    binding_id: string;
    name: string;
    plan_id: number;
    class_id: number | null;
    class_name: string;
    plan_title: string;
    lesson_title: string | null;
    knowledge_base_ids: string[];
    prompt_template: string;
    is_enabled: boolean;
    owner_staff_id: number | null;
    owner_editable: boolean;
    updated_at: string;
  }>;
};

type AuditConversationItem = {
  id: number;
  student: { id: number; username: string; display_name: string };
  class: { id: number; name: string };
  scope: string;
  context_ref: string;
  context_title: string;
  message_count: number;
  blocked_count: number;
  last_active_at: string | null;
};

type AuditOverviewPayload = {
  classes: Array<{ id: number; class_name: string }>;
  items: AuditConversationItem[];
  total: number;
  limit: number;
  offset: number;
};

type AuditMessageItem = {
  id: number;
  role: string;
  content: string;
  provider_name: string | null;
  provider_mode: string | null;
  attachment_summary: string | null;
  is_blocked: boolean;
  blocked_category: string | null;
  blocked_keyword: string | null;
  created_at: string | null;
};

type AuditConversationDetail = {
  conversation: AuditConversationItem;
  messages: AuditMessageItem[];
};

const drawerWidth = 'min(560px, 94vw)';

const router = useRouter();
const authStore = useAuthStore();
const payload = ref<LessonAgentPayload | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref('');
const bindingDrawerVisible = ref(false);
const form = ref({
  binding_id: '' as string | null,
  name: '',
  class_id: null as number | null,
  plan_id: undefined as number | undefined,
  knowledge_base_ids: [] as string[],
  prompt_template: '',
  is_enabled: true,
});

const activeTab = ref<'agents' | 'audit'>('agents');
const auditClasses = ref<Array<{ id: number; class_name: string }>>([]);
const auditItems = ref<AuditConversationItem[]>([]);
const auditTotal = ref(0);
const auditPage = ref(1);
const auditPageSize = 20;
const isAuditLoading = ref(false);
const auditFilter = ref({
  class_id: null as number | null,
  search: '',
  blocked_only: false,
});
const auditDialogVisible = ref(false);
const auditDialogTitle = ref('');
const auditDetail = ref<AuditConversationDetail | null>(null);

const bindings = computed(() => payload.value?.bindings || []);

const enabledBindingCount = computed(() => bindings.value.filter((item) => item.is_enabled).length);

const coveredPlanCount = computed(() => new Set(bindings.value.map((item) => item.plan_id)).size);

const coveredClassCount = computed(() => {
  if (bindings.value.some((item) => item.class_id === null)) {
    return payload.value?.classes.length || 0;
  }
  return new Set(bindings.value.map((item) => item.class_id)).size;
});

const auditBlockedTotal = computed(() => auditItems.value.filter((item) => item.blocked_count > 0).length);
const auditMessageTotal = computed(() => auditItems.value.reduce((sum, item) => sum + item.message_count, 0));

const pageSummary = computed(() => {
  if (!bindings.value.length) {
    return '还没有课时智能体绑定。为一个班级和一份学案创建学伴后，学生的 AI 对话会使用这套提示词。';
  }
  return `已绑定 ${bindings.value.length} 个课时学伴，其中 ${enabledBindingCount.value} 个启用；学生 AI 对话 ${auditTotal.value} 条。`;
});

const agentStatItems = computed<StaffStatItem[]>(() => [
  { label: '课时学伴', value: bindings.value.length, unit: '个', note: '按更新时间排序' },
  {
    label: '启用中',
    value: enabledBindingCount.value,
    unit: '个',
    note: enabledBindingCount.value ? '学生对话会优先命中' : '全部停用',
  },
  { label: '覆盖学案', value: coveredPlanCount.value, unit: '份', note: '已绑定学案数量' },
  { label: '覆盖班级', value: coveredClassCount.value, unit: '个', note: '留空绑定时覆盖全部班级' },
]);

const auditStatItems = computed<StaffStatItem[]>(() => [
  { label: '对话记录', value: auditTotal.value, unit: '条', note: '按当前筛选统计' },
  {
    label: '本页有拦截',
    value: auditBlockedTotal.value,
    unit: '个',
    note: auditBlockedTotal.value ? '需要回看这些对话' : '当前页没有拦截',
  },
  { label: '本页消息', value: auditMessageTotal.value, unit: '条', note: '当前页合计' },
  { label: '可查看班级', value: auditClasses.value.length, unit: '个', note: '当前账号权限内' },
]);

const statItems = computed(() => (activeTab.value === 'agents' ? agentStatItems.value : auditStatItems.value));

const classOptions = computed(() =>
  (payload.value?.classes || []).map((item) => ({ label: item.class_name, value: item.id })),
);

const planOptions = computed(() =>
  (payload.value?.plans || []).map((item) => ({
    label: `${item.title} · ${item.lesson_title}`,
    value: item.id,
  })),
);

const knowledgeOptions = computed(() =>
  (payload.value?.knowledge_bases || []).map((item) => ({ label: item.name, value: item.id })),
);

const auditClassOptions = computed(() =>
  auditClasses.value.map((item) => ({ label: item.class_name, value: item.id })),
);

function formatDateTime(value: string | null) {
  return formatDateTimeValue(value, { fallback: '--', sliceStart: 0, sliceEnd: 16 });
}

function scopeLabel(scope: string) {
  return scope === 'lesson' ? '课程学伴' : '通用学伴';
}

function resetForm() {
  form.value = {
    binding_id: null,
    name: '',
    class_id: null,
    plan_id: undefined,
    knowledge_base_ids: [],
    prompt_template: '',
    is_enabled: true,
  };
}

function openCreate() {
  resetForm();
  bindingDrawerVisible.value = true;
}

async function loadBindings() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教职工账号';
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    payload.value = await apiGet<LessonAgentPayload>('/assistants/staff/lesson-agents', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载课时智能体数据失败';
  } finally {
    isLoading.value = false;
  }
}

function editBinding(item: LessonAgentPayload['bindings'][number]) {
  form.value = {
    binding_id: item.binding_id,
    name: item.name,
    class_id: item.class_id,
    plan_id: item.plan_id,
    knowledge_base_ids: [...item.knowledge_base_ids],
    prompt_template: item.prompt_template || '',
    is_enabled: item.is_enabled,
  };
  bindingDrawerVisible.value = true;
}

async function saveBinding() {
  if (!authStore.token || !payload.value) {
    return;
  }
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写绑定名称');
    return;
  }
  if (!form.value.plan_id) {
    ElMessage.warning('请选择学案');
    return;
  }

  isSaving.value = true;
  try {
    const nextPayload = await apiPost<LessonAgentPayload>(
      '/assistants/staff/lesson-agents',
      {
        binding_id: form.value.binding_id,
        name: form.value.name.trim(),
        class_id: form.value.class_id,
        plan_id: form.value.plan_id,
        knowledge_base_ids: form.value.knowledge_base_ids,
        prompt_template: form.value.prompt_template,
        is_enabled: form.value.is_enabled,
      },
      authStore.token
    );
    payload.value = nextPayload;
    bindingDrawerVisible.value = false;
    resetForm();
    ElMessage.success('课时智能体绑定已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存课时智能体绑定失败');
  } finally {
    isSaving.value = false;
  }
}

async function removeBinding(item: LessonAgentPayload['bindings'][number]) {
  if (!authStore.token) {
    return;
  }
  try {
    await ElMessageBox.confirm(`确认删除“${item.name}”吗？`);
    payload.value = await apiDelete<LessonAgentPayload>(
      `/assistants/staff/lesson-agents/${item.binding_id}`,
      authStore.token
    );
    if (form.value.binding_id === item.binding_id) {
      resetForm();
    }
    ElMessage.success('已删除课时智能体绑定');
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除课时智能体绑定失败');
  }
}

async function gotoClassroom(item: LessonAgentPayload['bindings'][number]) {
  const query: Record<string, string> = { planId: String(item.plan_id) };
  if (item.class_id) {
    query.classId = String(item.class_id);
  }
  await router.push({ path: '/staff/classroom', query });
}

async function loadAudit() {
  if (!authStore.token) {
    return;
  }
  isAuditLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('limit', String(auditPageSize));
    params.set('offset', String((auditPage.value - 1) * auditPageSize));
    if (auditFilter.value.class_id) {
      params.set('class_id', String(auditFilter.value.class_id));
    }
    if (auditFilter.value.search.trim()) {
      params.set('search', auditFilter.value.search.trim());
    }
    if (auditFilter.value.blocked_only) {
      params.set('blocked_only', 'true');
    }
    const overview = await apiGet<AuditOverviewPayload>(
      `/assistants/staff/audit/overview?${params.toString()}`,
      authStore.token
    );
    auditClasses.value = overview.classes;
    auditItems.value = overview.items;
    auditTotal.value = overview.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载对话审计数据失败');
  } finally {
    isAuditLoading.value = false;
  }
}

function refreshAudit() {
  auditPage.value = 1;
  void loadAudit();
}

function handleAuditPageChange(page: number) {
  auditPage.value = page;
  void loadAudit();
}

async function openAuditConversation(row: AuditConversationItem) {
  if (!authStore.token) {
    return;
  }
  try {
    auditDetail.value = await apiGet<AuditConversationDetail>(
      `/assistants/staff/audit/conversations/${row.id}`,
      authStore.token
    );
    auditDialogTitle.value = `${row.student.display_name}（${row.class.name}）的 AI 对话`;
    auditDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载对话详情失败');
  }
}

onMounted(() => {
  void loadBindings();
  void loadAudit();
});
</script>

<style scoped>
.full-width {
  width: 100%;
}

.filter-select {
  flex: none;
  width: 150px;
}

.sf-cols-agents {
  grid-template-columns: minmax(0, 1fr) 150px 210px;
}

.sf-cols-audit {
  grid-template-columns: minmax(0, 1fr) 84px 210px 64px 64px 140px 96px;
}

.audit-plain {
  overflow: hidden;
  color: var(--sf-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-scope {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.audit-scope__title {
  overflow: hidden;
  color: var(--sf-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-blocked {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.audit-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--sf-line-soft);
}

.audit-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

.audit-message {
  padding: 12px 14px;
  border: 1px solid var(--ls-border, #dcdfe6);
  border-radius: var(--sf-r-card);
  background: var(--sf-surface-2);
}

.audit-message.is-student {
  border-color: rgba(103, 194, 58, 0.35);
}

.audit-message.is-assistant {
  border-color: rgba(64, 158, 255, 0.35);
}

.audit-message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.audit-message-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 860px) {
  .audit-plain::before,
  .audit-scope::before,
  .audit-blocked::before {
    content: attr(data-label);
    margin-right: 4px;
    color: var(--sf-muted);
    font-weight: 400;
  }
}

@media (max-width: 900px) {
  .filter-select {
    flex: 1 1 130px;
    width: auto;
  }
}
</style>
