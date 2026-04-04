<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">智能体中心</p>
        <h2>课时智能体绑定</h2>
        <p class="hero-copy">
          为班级 + 学案创建专属课时智能体，设置提示词和知识库。进入课堂会话或学案页后，AI 学伴会自动接入当前绑定配置。
        </p>
      </div>
      <el-button :loading="isLoading" type="primary" @click="loadBindings">刷新</el-button>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card"><el-skeleton :rows="10" /></el-card>
      </template>

      <template #default>
        <div v-if="payload" class="page-stack">
          <el-row :gutter="16">
            <el-col :lg="10" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="panel-head">
                    <h3>{{ form.binding_id ? '编辑绑定' : '新建绑定' }}</h3>
                    <el-button v-if="form.binding_id" text @click="resetForm">新建</el-button>
                  </div>
                </template>
                <el-form label-position="top">
                  <el-form-item label="绑定名称">
                    <el-input v-model="form.name" placeholder="例如：701 班第 8 课学伴" />
                  </el-form-item>
                  <el-form-item label="班级">
                    <el-select v-model="form.class_id" class="full-width" clearable placeholder="选择班级（管理员可留空表示全部班级）">
                      <el-option
                        v-for="item in payload.classes"
                        :key="item.id"
                        :label="item.class_name"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="学案">
                    <el-select v-model="form.plan_id" class="full-width" filterable placeholder="选择学案">
                      <el-option
                        v-for="item in payload.plans"
                        :key="item.id"
                        :label="`${item.title} · ${item.lesson_title}`"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="知识库">
                    <el-select v-model="form.knowledge_base_ids" class="full-width" collapse-tags multiple placeholder="课时优先知识库">
                      <el-option
                        v-for="item in payload.knowledge_bases"
                        :key="item.id"
                        :label="item.name"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="课时提示词">
                    <el-input v-model="form.prompt_template" :rows="6" type="textarea" />
                  </el-form-item>
                  <el-form-item label="启用">
                    <el-switch v-model="form.is_enabled" />
                  </el-form-item>
                  <el-button :loading="isSaving" type="primary" @click="saveBinding">
                    {{ form.binding_id ? '保存修改' : '创建绑定' }}
                  </el-button>
                </el-form>
              </el-card>
            </el-col>

            <el-col :lg="14" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="panel-head">
                    <h3>已绑定课时智能体</h3>
                    <el-tag round>{{ payload.bindings.length }} 个</el-tag>
                  </div>
                </template>

                <el-empty v-if="!payload.bindings.length" description="还没有课时智能体绑定" />

                <el-table v-else :data="payload.bindings" stripe>
                  <el-table-column label="名称" min-width="180" prop="name" />
                  <el-table-column label="班级" min-width="130">
                    <template #default="{ row }">{{ row.class_name }}</template>
                  </el-table-column>
                  <el-table-column label="学案" min-width="220">
                    <template #default="{ row }">
                      <div>
                        <strong>{{ row.plan_title }}</strong>
                        <p class="table-note">{{ row.lesson_title || '--' }}</p>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="知识库" min-width="150">
                    <template #default="{ row }">{{ row.knowledge_base_ids.join('、') || '默认' }}</template>
                  </el-table-column>
                  <el-table-column label="状态" min-width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.is_enabled ? 'success' : 'info'" round>
                        {{ row.is_enabled ? '启用' : '停用' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="更新时间" min-width="150">
                    <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
                  </el-table-column>
                  <el-table-column label="操作" fixed="right" min-width="220">
                    <template #default="{ row }">
                      <el-button link type="primary" :disabled="!row.owner_editable" @click="editBinding(row)">编辑</el-button>
                      <el-button link type="danger" :disabled="!row.owner_editable" @click="removeBinding(row)">删除</el-button>
                      <el-button link @click="gotoClassroom(row)">进入课堂会话</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost } from '@/api/http';
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

onMounted(loadBindings);
</script>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
