<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 720px; max-width: 94vw"
    :title="isEditable ? '编辑画像模板' : '查看画像模板'"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div class="template-dialog">
      <n-alert v-if="!isEditable" :closable="false" type="info">
        系统模板不能直接修改。复制一份成为你的模板后即可调整维度、名称和阈值。
      </n-alert>

      <div class="template-dialog__meta">
        <n-form-item label="模板名称">
          <n-input v-model:value="form.name" :disabled="!isEditable" maxlength="80" placeholder="例如：七年级综合素质画像" />
        </n-form-item>
        <n-form-item label="说明">
          <n-input
            v-model:value="form.description"
            :disabled="!isEditable"
            maxlength="255"
            placeholder="一句话说明这个模板的用途"
          />
        </n-form-item>
      </div>

      <div class="template-dialog__dimensions">
        <header class="template-dialog__head">
          <span>展示维度</span>
          <span>名称</span>
          <span>达标线</span>
          <span>优秀线</span>
        </header>
        <div v-for="dimension in form.dimensions" :key="dimension.key" class="template-dialog__row">
          <n-switch v-model:value="dimension.enabled" :disabled="!isEditable" size="small" />
          <n-input v-model:value="dimension.label" :disabled="!isEditable" maxlength="40" size="small" />
          <n-input-number
            v-model:value="dimension.pass"
            :disabled="!isEditable"
            :min="0"
            :max="100"
            size="small"
          />
          <n-input-number
            v-model:value="dimension.excellent"
            :disabled="!isEditable"
            :min="0"
            :max="100"
            size="small"
          />
        </div>
      </div>

      <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    </div>

    <template #footer>
      <div class="template-dialog__footer">
        <n-button v-if="!isEditable" type="primary" :loading="saving" @click="duplicateTemplate">
          复制为我的模板
        </n-button>
        <template v-else>
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" :loading="saving" @click="saveTemplate">保存模板</n-button>
        </template>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { NAlert, NButton, NFormItem, NInput, NInputNumber, NModal, NSwitch } from 'naive-ui';
import { computed, ref, watch } from 'vue';

import { apiPost, apiPut } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

export type PortraitDimensionConfig = {
  key: string;
  label: string;
  enabled: boolean;
  excellent: number;
  pass: number;
};

export type PortraitTemplateItem = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  is_owned: boolean;
  owner_staff_id: number | null;
  sort_order: number;
  config: { dimensions: PortraitDimensionConfig[] };
};

const props = defineProps<{
  show: boolean;
  template: PortraitTemplateItem | null;
}>();

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void;
  (event: 'saved', template: PortraitTemplateItem): void;
}>();

const authStore = useAuthStore();
const saving = ref(false);
const errorMessage = ref('');
const currentTemplate = ref<PortraitTemplateItem | null>(null);
const form = ref({
  name: '',
  description: '',
  dimensions: [] as PortraitDimensionConfig[],
});

const isEditable = computed(() => Boolean(currentTemplate.value?.is_owned && !currentTemplate.value?.is_system));

function resetForm(template: PortraitTemplateItem | null) {
  currentTemplate.value = template;
  errorMessage.value = '';
  form.value = {
    name: template?.name ?? '',
    description: template?.description ?? '',
    dimensions: (template?.config.dimensions ?? []).map((item) => ({ ...item })),
  };
}

watch(
  () => [props.show, props.template?.id] as const,
  ([show]) => {
    if (show) {
      resetForm(props.template);
    }
  }
);

async function duplicateTemplate() {
  if (!authStore.token || !currentTemplate.value) {
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    const response = await apiPost<{ template: PortraitTemplateItem }>(
      `/portraits/templates/${currentTemplate.value.id}/duplicate`,
      {},
      authStore.token
    );
    resetForm(response.template);
    emit('saved', response.template);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '复制模板失败';
  } finally {
    saving.value = false;
  }
}

async function saveTemplate() {
  if (!authStore.token || !currentTemplate.value) {
    return;
  }
  if (!form.value.name.trim()) {
    errorMessage.value = '请填写模板名称';
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      config: { dimensions: form.value.dimensions },
    };
    const response = await apiPut<{ template: PortraitTemplateItem }>(
      `/portraits/templates/${currentTemplate.value.id}`,
      payload,
      authStore.token
    );
    currentTemplate.value = response.template;
    emit('saved', response.template);
    emit('update:show', false);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存模板失败';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.template-dialog {
  display: grid;
  gap: 14px;
}

.template-dialog__meta {
  display: grid;
  gap: 4px;
}

.template-dialog__dimensions {
  display: grid;
  gap: 6px;
}

.template-dialog__head,
.template-dialog__row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 110px 110px;
  align-items: center;
  gap: 10px;
}

.template-dialog__head {
  padding: 0 2px;
  color: var(--ls-muted);
  font-size: 12px;
}

.template-dialog__row {
  padding: 6px 2px;
  border-bottom: 1px dashed var(--ls-border);
}

.template-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 640px) {
  .template-dialog__head,
  .template-dialog__row {
    grid-template-columns: 56px minmax(0, 1fr) 88px 88px;
  }
}
</style>
