<template>
  <n-drawer :show="show" :width="820" placement="right" @update:show="(value: boolean) => emit('update:show', value)">
    <n-drawer-content :title="student ? `${student.display_name} · 学生画像` : '学生画像'" closable>
      <div class="portrait-drawer">
        <div class="portrait-drawer__toolbar">
          <div class="portrait-drawer__field">
            <span class="portrait-drawer__label">画像模板</span>
            <n-select
              v-model:value="activeTemplateId"
              :options="templateOptions"
              class="portrait-drawer__select"
              :loading="templatesLoading"
              placeholder="选择模板"
              @update:value="loadPortrait"
            />
          </div>
          <div class="portrait-drawer__actions">
            <n-button secondary :disabled="!activeTemplate" @click="openTemplateEditor">编辑模板</n-button>
            <n-button secondary :disabled="!student?.class_id || !activeTemplateId" @click="bindToClass">
              设为本班模板
            </n-button>
            <n-tag v-if="boundTemplateId && boundTemplateId === activeTemplateId" round type="success">
              班级当前模板
            </n-tag>
          </div>
        </div>

        <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

        <div v-if="portraitLoading" class="portrait-drawer__loading">
          <n-skeleton :rows="8" animated />
        </div>
        <PortraitSheet v-else-if="portrait" :portrait="portrait" compact />
        <n-empty v-else description="暂无画像数据" />

        <PortraitTemplateDialog
          v-if="editingTemplate"
          v-model:show="templateDialogVisible"
          :template="editingTemplate"
          @saved="handleTemplateSaved"
        />
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { apiGet, apiPut } from '@/api/http';
import PortraitSheet, { type PortraitPayload } from '@/components/PortraitSheet.vue';
import { useAuthStore } from '@/stores/auth';
import { notify } from '@/ui/feedback';

import PortraitTemplateDialog, { type PortraitTemplateItem } from './PortraitTemplateDialog.vue';

export type PortraitStudentRef = {
  user_id: number;
  display_name: string;
  student_no: string | null;
  class_id: number | null;
};

const props = defineProps<{
  show: boolean;
  student: PortraitStudentRef | null;
}>();

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void;
}>();

const authStore = useAuthStore();

const templates = ref<PortraitTemplateItem[]>([]);
const templatesLoading = ref(false);
const portrait = ref<PortraitPayload | null>(null);
const portraitLoading = ref(false);
const errorMessage = ref('');
const activeTemplateId = ref<number | null>(null);
const boundTemplateId = ref<number | null>(null);
const templateDialogVisible = ref(false);
const editingTemplate = ref<PortraitTemplateItem | null>(null);

const templateOptions = computed(() =>
  templates.value.map((item) => ({
    label: item.is_system ? `${item.name}（系统）` : item.name,
    value: item.id,
  }))
);

const activeTemplate = computed(
  () => templates.value.find((item) => item.id === activeTemplateId.value) ?? null
);

async function loadTemplates() {
  if (!authStore.token) {
    return;
  }
  templatesLoading.value = true;
  try {
    const response = await apiGet<{ templates: PortraitTemplateItem[] }>('/portraits/templates', authStore.token);
    templates.value = response.templates;
    if (activeTemplateId.value === null) {
      activeTemplateId.value = response.templates[0]?.id ?? null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载画像模板失败';
  } finally {
    templatesLoading.value = false;
  }
}

async function loadBoundTemplate() {
  if (!authStore.token || !props.student?.class_id) {
    boundTemplateId.value = null;
    return;
  }
  try {
    const response = await apiGet<{ template_id: number | null }>(
      `/portraits/staff/class-binding?class_id=${props.student.class_id}`,
      authStore.token
    );
    boundTemplateId.value = response.template_id;
  } catch {
    boundTemplateId.value = null;
  }
}

async function loadPortrait() {
  if (!authStore.token || !props.student) {
    return;
  }
  portraitLoading.value = true;
  errorMessage.value = '';
  try {
    const query = activeTemplateId.value ? `?template_id=${activeTemplateId.value}` : '';
    const response = await apiGet<{ portrait: PortraitPayload }>(
      `/portraits/staff/students/${props.student.user_id}${query}`,
      authStore.token
    );
    portrait.value = response.portrait;
  } catch (error) {
    portrait.value = null;
    errorMessage.value = error instanceof Error ? error.message : '加载画像失败';
  } finally {
    portraitLoading.value = false;
  }
}

function openTemplateEditor() {
  editingTemplate.value = activeTemplate.value;
  templateDialogVisible.value = true;
}

async function handleTemplateSaved(template: PortraitTemplateItem) {
  await loadTemplates();
  activeTemplateId.value = template.id;
  await loadPortrait();
}

async function bindToClass() {
  if (!authStore.token || !props.student?.class_id || !activeTemplateId.value) {
    return;
  }
  try {
    await apiPut(
      '/portraits/staff/class-binding',
      { class_id: props.student.class_id, template_id: activeTemplateId.value },
      authStore.token
    );
    boundTemplateId.value = activeTemplateId.value;
    notify.success('已设为本班画像模板');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '设置班级模板失败';
  }
}

watch(
  () => [props.show, props.student?.user_id] as const,
  async ([show, studentId]) => {
    if (!show || !studentId) {
      return;
    }
    errorMessage.value = '';
    activeTemplateId.value = null;
    await loadTemplates();
    await loadBoundTemplate();
    await loadPortrait();
  }
);
</script>

<style scoped>
.portrait-drawer {
  display: grid;
  gap: 14px;
}

.portrait-drawer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.portrait-drawer__field {
  display: grid;
  gap: 4px;
}

.portrait-drawer__label {
  color: var(--ls-muted);
  font-size: 12px;
}

.portrait-drawer__select {
  width: 260px;
}

.portrait-drawer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.portrait-drawer__loading {
  padding: 12px 0;
}
</style>
