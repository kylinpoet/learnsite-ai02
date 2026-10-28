<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="为班级 + 学案创建课时智能体；查看学生 AI 学伴对话记录与拦截情况。"
      eyebrow="智能体中心"
      title="AI 学伴管理"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadBindings">刷新</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <n-tabs v-model:value="activeTab">
      <n-tab-pane name="agents" tab="课时智能体绑定">
        <SaPanel v-if="isLoading">
          <n-skeleton :rows="10" animated />
        </SaPanel>

        <div v-else-if="payload" class="split-grid">
          <SaPanel>
            <template #header>
              <div class="panel-head">
                <h3>{{ form.binding_id ? '编辑绑定' : '新建绑定' }}</h3>
                <n-button v-if="form.binding_id" text @click="resetForm">新建</n-button>
              </div>
            </template>
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
                <n-input v-model:value="form.prompt_template" :rows="6" type="textarea" />
              </n-form-item>
              <n-form-item label="启用">
                <n-switch v-model:value="form.is_enabled" />
              </n-form-item>
              <n-button :loading="isSaving" type="primary" @click="saveBinding">
                {{ form.binding_id ? '保存修改' : '创建绑定' }}
              </n-button>
            </n-form>
          </SaPanel>

          <SaPanel>
            <template #header>
              <div class="panel-head">
                <h3>已绑定课时智能体</h3>
                <n-tag round>{{ payload.bindings.length }} 个</n-tag>
              </div>
            </template>

            <SaDataTable
              :data="payload.bindings"
              :scroll-x="1150"
              empty-text="还没有课时智能体绑定"
              row-key="binding_id"
              stripe
            >
              <SaTableColumn label="名称" min-width="180" prop="name" />
              <SaTableColumn label="班级" min-width="130" prop="class_name" />
              <SaTableColumn label="学案" min-width="220">
                <template #default="{ row }">
                  <div>
                    <strong>{{ row.plan_title }}</strong>
                    <p class="table-note">{{ row.lesson_title || '--' }}</p>
                  </div>
                </template>
              </SaTableColumn>
              <SaTableColumn label="知识库" min-width="150">
                <template #default="{ row }">{{ row.knowledge_base_ids.join('、') || '默认' }}</template>
              </SaTableColumn>
              <SaTableColumn label="状态" min-width="100">
                <template #default="{ row }">
                  <n-tag :type="row.is_enabled ? 'success' : 'info'" round>
                    {{ row.is_enabled ? '启用' : '停用' }}
                  </n-tag>
                </template>
              </SaTableColumn>
              <SaTableColumn label="更新时间" min-width="150">
                <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
              </SaTableColumn>
              <SaTableColumn fixed="right" label="操作" min-width="220">
                <template #default="{ row }">
                  <n-button :disabled="!row.owner_editable" text type="primary" @click="editBinding(row)">
                    编辑
                  </n-button>
                  <n-button :disabled="!row.owner_editable" text type="error" @click="removeBinding(row)">
                    删除
                  </n-button>
                  <n-button text @click="gotoClassroom(row)">进入课堂会话</n-button>
                </template>
              </SaTableColumn>
            </SaDataTable>
          </SaPanel>
        </div>
      </n-tab-pane>

      <n-tab-pane name="audit">
        <template #tab>
          对话审计
          <n-tag v-if="auditBlockedTotal > 0" :bordered="false" round size="small" style="margin-left: 6px" type="error">
            {{ auditBlockedTotal }}
          </n-tag>
        </template>

        <SaPanel>
          <template #header>
            <div class="panel-head audit-toolbar">
              <h3>学生 AI 学伴对话记录</h3>
              <div class="audit-filter-row">
                <n-select
                  v-model:value="auditFilter.class_id"
                  :options="auditClassOptions"
                  clearable
                  placeholder="全部班级"
                  style="width: 150px"
                  @update:value="refreshAudit"
                />
                <n-input
                  v-model:value="auditFilter.search"
                  clearable
                  placeholder="搜索学生姓名 / 账号"
                  style="width: 200px"
                  @clear="refreshAudit"
                  @keyup.enter="refreshAudit"
                />
                <n-checkbox v-model:checked="auditFilter.blocked_only" @update:checked="refreshAudit">
                  仅看有拦截
                </n-checkbox>
                <n-button :loading="isAuditLoading" type="primary" @click="refreshAudit">查询</n-button>
              </div>
            </div>
          </template>

          <SaDataTable
            :data="auditItems"
            :loading="isAuditLoading && !auditItems.length"
            :pagination="{ page: auditPage, pageSize: auditPageSize, itemCount: auditTotal }"
            :scroll-x="860"
            empty-text="暂无学生 AI 对话记录"
            row-key="id"
            stripe
            @update:page="handleAuditPageChange"
          >
            <SaTableColumn label="学生" min-width="150">
              <template #default="{ row }">
                <div>
                  <strong>{{ row.student.display_name }}</strong>
                  <p class="table-note">{{ row.student.username }}</p>
                </div>
              </template>
            </SaTableColumn>
            <SaTableColumn label="班级" min-width="90">
              <template #default="{ row }">{{ row.class.name }}</template>
            </SaTableColumn>
            <SaTableColumn label="场景" min-width="220">
              <template #default="{ row }">
                <div>
                  <n-tag round size="small">{{ row.scope === 'lesson' ? '课程学伴' : '通用学伴' }}</n-tag>
                  <p class="table-note">{{ row.context_title || '--' }}</p>
                </div>
              </template>
            </SaTableColumn>
            <SaTableColumn label="消息数" min-width="80">
              <template #default="{ row }">{{ row.message_count }}</template>
            </SaTableColumn>
            <SaTableColumn label="拦截" min-width="70">
              <template #default="{ row }">
                <n-tag v-if="row.blocked_count > 0" round type="error">{{ row.blocked_count }}</n-tag>
                <span v-else>0</span>
              </template>
            </SaTableColumn>
            <SaTableColumn label="最近活跃" min-width="140">
              <template #default="{ row }">{{ formatDateTime(row.last_active_at) }}</template>
            </SaTableColumn>
            <SaTableColumn fixed="right" label="操作" min-width="110">
              <template #default="{ row }">
                <n-button text type="primary" @click="openAuditConversation(row)">查看对话</n-button>
              </template>
            </SaTableColumn>
          </SaDataTable>
        </SaPanel>
      </n-tab-pane>
    </n-tabs>

    <n-modal
      v-model:show="auditDialogVisible"
      :title="auditDialogTitle"
      preset="card"
      style="width: 720px; margin-top: 6vh"
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
        <n-empty v-if="!auditDetail.messages.length" description="没有消息记录" />
      </div>
      <template #footer>
        <n-button @click="auditDialogVisible = false">关闭</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCheckbox,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSkeleton,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useAuthStore } from '@/stores/auth';

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

const router = useRouter();
const authStore = useAuthStore();
const payload = ref<LessonAgentPayload | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref('');
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

const auditBlockedTotal = computed(() => auditItems.value.filter((item) => item.blocked_count > 0).length);

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
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
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
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.split-grid {
  display: grid;
  grid-template-columns: minmax(0, 10fr) minmax(0, 14fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1199px) {
  .split-grid {
    grid-template-columns: 1fr;
  }
}

.audit-toolbar {
  flex-wrap: wrap;
}

.audit-filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
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
  border-radius: 14px;
  background: var(--ls-card);
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
</style>
