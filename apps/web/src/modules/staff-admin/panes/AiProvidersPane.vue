<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>AI 模型服务</h2>
        <p class="st-head__sub">维护模型接入地址、学伴提示词与输出参数；同一时间只有一个默认服务被智能体使用。</p>
      </div>
    </header>

    <div class="sf-tabs">
      <button
        v-for="item in aiSubTabs"
        :key="item.value"
        :class="['sf-tabs__item', { 'is-active': aiSubTab === item.value }]"
        type="button"
        @click="aiSubTab = item.value"
      >
        {{ item.label }}
      </button>
    </div>

    <section v-if="aiSubTab === 'providers'" class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          服务列表
          <span class="sf-panel__count">{{ aiProviders.length }} 个</span>
        </h3>
        <div class="sf-panel__actions">
          <n-button secondary @click="loadAIProviders">刷新</n-button>
          <n-button type="primary" @click="openProviderDialog()">新增服务</n-button>
        </div>
      </header>

      <p v-if="!aiProviders.length" class="sf-empty">还没有模型服务配置。</p>
      <div v-else class="st-rows">
        <article v-for="provider in aiProviders" :key="provider.id" class="st-row">
          <div class="st-row__main">
            <p class="st-row__title">
              {{ provider.name }}
              <span v-if="provider.is_default" class="sf-pill sf-pill--accent">默认</span>
              <span :class="['sf-pill', provider.is_enabled ? 'sf-pill--pos' : 'sf-pill--hidden']">
                {{ provider.is_enabled ? '已启用' : '已停用' }}
              </span>
            </p>
            <p class="st-row__meta">
              <span>{{ provider.base_url }}</span>
              <span>{{ provider.model_name }}</span>
              <span>{{ provider.provider_type }}</span>
              <span>密钥：{{ provider.has_api_key ? provider.masked_api_key : '未配置' }}</span>
            </p>
          </div>
          <div class="st-row__actions">
            <n-button text type="primary" @click="openProviderDialog(provider)">编辑</n-button>
            <n-button text type="error" @click="deleteProvider(provider.id)">删除</n-button>
          </div>
        </article>
      </div>

      <footer class="st-proxy">
        <div class="st-proxy__main">
          <p class="st-switch-row__title">远程请求代理</p>
          <p class="st-switch-row__desc">用于获取模型列表与 AI 学伴访问外部服务；留空为直连（no_proxy）。</p>
        </div>
        <div class="st-proxy__field">
          <n-input v-model:value="systemForm.remote_proxy_url" placeholder="例如：http://127.0.0.1:7890" />
          <n-button :loading="isSavingSystem" secondary @click="saveSystemSettings">保存代理</n-button>
        </div>
      </footer>
    </section>

    <section v-if="aiSubTab === 'prompts'" class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">AI 学伴提示词</h3>
        <div class="sf-panel__actions">
          <n-button :loading="isSavingAssistantPrompts" type="primary" @click="saveAssistantPrompts">保存提示词</n-button>
        </div>
      </header>
      <div class="sf-panel__body">
        <n-form-item label="通用 AI 学伴提示词">
          <n-input v-model:value="assistantPromptForm.general_prompt" :rows="9" type="textarea" />
          <template #feedback>学生与教师在没有课程上下文时使用这段提示词。</template>
        </n-form-item>
        <n-form-item label="当前课程学案 AI 学伴提示词">
          <n-input v-model:value="assistantPromptForm.lesson_prompt" :rows="12" type="textarea" />
          <template #feedback>回答会结合当前学案、任务与课堂上下文。</template>
        </n-form-item>
      </div>
    </section>

    <section v-if="aiSubTab === 'runtime'" class="st-pane">
      <section class="sf-panel">
        <header class="sf-panel__head">
          <h3 class="sf-panel__title">
            基础参数
            <span class="sf-panel__count">稳定性与输出方式</span>
          </h3>
          <div class="sf-panel__actions">
            <n-button :loading="isSavingAssistantRuntimeSettings" type="primary" @click="saveAssistantRuntimeSettings">保存参数</n-button>
          </div>
        </header>
        <div class="sf-panel__body">
          <div class="st-fields st-fields--3">
            <n-form-item label="温度系数">
              <n-input-number
                v-model:value="assistantRuntimeForm.temperature"
                :max="2"
                :min="0"
                :precision="1"
                :step="0.1"
              />
              <template #feedback>越低越稳定，越高越发散；推荐 0.2 - 0.8。</template>
            </n-form-item>
            <n-form-item label="流式输出">
              <n-switch v-model:value="assistantRuntimeForm.streaming_enabled">
                <template #checked>启用</template>
                <template #unchecked>关闭</template>
              </n-switch>
              <template #feedback>关闭后统一使用标准输出。</template>
            </n-form-item>
            <n-form-item label="Thinking 模式">
              <n-switch v-model:value="assistantRuntimeForm.thinking_enabled">
                <template #checked>启用</template>
                <template #unchecked>关闭</template>
              </n-switch>
              <template #feedback>仅对支持 thinking 参数的模型生效。</template>
            </n-form-item>
          </div>
        </div>
      </section>

      <section class="sf-panel">
        <header class="sf-panel__head">
          <h3 class="sf-panel__title">
            高级参数
            <span class="sf-panel__count">留空时沿用模型服务的默认策略</span>
          </h3>
        </header>
        <div class="sf-panel__body">
          <div class="st-fields">
            <n-form-item label="Top P">
              <n-input-number v-model:value="assistantRuntimeForm.top_p" :max="1" :min="0" :precision="2" :step="0.05" />
              <template #feedback>控制采样范围，通常与温度系数二选一调节。</template>
            </n-form-item>
            <n-form-item label="Max Tokens">
              <n-input-number v-model:value="assistantRuntimeForm.max_tokens" :max="8192" :min="1" :step="64" />
              <template #feedback>限制单次回复长度；留空表示不额外限制。</template>
            </n-form-item>
            <n-form-item label="Presence Penalty">
              <n-input-number v-model:value="assistantRuntimeForm.presence_penalty" :max="2" :min="-2" :precision="1" :step="0.1" />
              <template #feedback>越高越倾向引入新话题。</template>
            </n-form-item>
            <n-form-item label="Frequency Penalty">
              <n-input-number v-model:value="assistantRuntimeForm.frequency_penalty" :max="2" :min="-2" :precision="1" :step="0.1" />
              <template #feedback>越高越抑制词语重复。</template>
            </n-form-item>
          </div>
        </div>
      </section>
    </section>

    <n-modal v-model:show="providerDialogVisible" :title="editingProviderId ? '编辑 AI 模型服务' : '新增 AI 模型服务'" preset="card" style="width: 620px">
      <n-form label-placement="top">
        <n-form-item label="服务名称"><n-input v-model:value="providerForm.name" /></n-form-item>
        <div class="admin-grid two-col">
          <n-form-item label="服务类型">
            <n-select v-model:value="providerForm.provider_type" :options="providerTypeOptions" class="full-width" />
          </n-form-item>
          <n-form-item class="provider-model-field" label="默认模型">
            <n-auto-complete
              :options="providerModelOptions"
              :value="providerForm.model_name"
              class="full-width"
              clearable
              placeholder="可自动获取，也可直接手动输入"
              @update:value="setProviderModelName"
            />
            <div class="provider-model-actions">
              <n-button :loading="isFetchingProviderModels" text type="primary" @click="discoverProviderModels">
                自动获取模型
              </n-button>
              <span class="section-note">
                {{ providerModelResolvedUrl ? `已从 ${providerModelResolvedUrl} 读取模型列表` : '如果暂时取不到模型列表，也可以直接手动填写模型名' }}
              </span>
            </div>
            <n-alert
              v-if="providerModelFetchError"
              class="provider-model-alert"
              :closable="false"
              show-icon
              title="自动获取失败"
              type="warning"
            >
              <p class="provider-model-alert-text">{{ providerModelFetchError }}</p>
            </n-alert>
          </n-form-item>
        </div>
        <n-form-item label="Base URL"><n-input v-model:value="providerForm.base_url" placeholder="https://api.openai.com/v1" /></n-form-item>
        <n-form-item :label="editingProviderId ? 'API Key（留空不更新）' : 'API Key'">
          <n-input v-model:value="providerForm.api_key" show-password-on="click" type="password" />
        </n-form-item>
        <div class="admin-grid two-col">
          <n-form-item label="设为默认"><n-switch v-model:value="providerForm.is_default" /></n-form-item>
          <n-form-item label="启用"><n-switch v-model:value="providerForm.is_enabled" /></n-form-item>
        </div>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="providerDialogVisible = false">取消</n-button>
          <n-button :loading="isSavingProvider" type="primary" @click="saveProvider">保存</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import {
  NAlert,
  NAutoComplete,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSwitch,
} from 'naive-ui';
import { ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';

import { apiDelete, apiPost, apiPut } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { AIProviderModelDiscoveryResult, AIProviderRecord, AssistantPromptSettings, AssistantRuntimeSettings } from '../adminTypes';
import { useAdminBootstrap, notifyAIProviderConfigUpdated, notifyAssistantRuntimeConfigUpdated } from '../composables/useAdminBootstrap';

const authStore = useAuthStore();
const {
  aiProviders,
  systemForm,
  assistantPromptForm,
  assistantRuntimeForm,
  isSavingSystem,
  loadAIProviders,
  saveSystemSettings,
} = useAdminBootstrap();

const providerTypeOptions = [
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
];

const aiSubTab = ref<'providers' | 'prompts' | 'runtime'>('providers');
const aiSubTabs = [
  { value: 'providers' as const, label: '模型服务' },
  { value: 'prompts' as const, label: '学伴提示词' },
  { value: 'runtime' as const, label: '运行参数' },
];

const providerDialogVisible = ref(false);
const editingProviderId = ref<number | null>(null);
const isSavingProvider = ref(false);
const isFetchingProviderModels = ref(false);
const isSavingAssistantPrompts = ref(false);
const isSavingAssistantRuntimeSettings = ref(false);
const providerForm = ref({
  name: '',
  provider_type: 'openai-compatible',
  base_url: '',
  api_key: '',
  model_name: '',
  is_default: false,
  is_enabled: true,
});
const providerModelOptions = ref<string[]>([]);
const providerModelResolvedUrl = ref('');
const providerModelFetchError = ref('');

function setProviderModelName(value: string | null) {
  providerForm.value.model_name = value ?? '';
}

function resetProviderModelDiscovery() {
  providerModelOptions.value = [];
  providerModelResolvedUrl.value = '';
  providerModelFetchError.value = '';
}

function formatProviderModelFetchError(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim() || String(error);
  }
  return String(error ?? '');
}

function resetProviderForm() {
  resetProviderModelDiscovery();
  providerForm.value = {
    name: '',
    provider_type: 'openai-compatible',
    base_url: '',
    api_key: '',
    model_name: '',
    is_default: false,
    is_enabled: true,
  };
}

function openProviderDialog(provider?: AIProviderRecord) {
  editingProviderId.value = provider?.id ?? null;
  resetProviderModelDiscovery();
  if (provider) {
    providerForm.value = {
      name: provider.name,
      provider_type: provider.provider_type,
      base_url: provider.base_url,
      api_key: '',
      model_name: provider.model_name,
      is_default: provider.is_default,
      is_enabled: provider.is_enabled,
    };
    providerModelOptions.value = provider.model_name ? [provider.model_name] : [];
  } else {
    resetProviderForm();
  }
  providerDialogVisible.value = true;
}

async function discoverProviderModels() {
  if (!authStore.token) return;

  const payload = {
    provider_type: providerForm.value.provider_type.trim(),
    base_url: providerForm.value.base_url.trim(),
    api_key: providerForm.value.api_key.trim() || undefined,
    provider_id: editingProviderId.value ?? undefined,
  };

  if (!payload.base_url) {
    ElMessage.warning('请先填写 Base URL，再自动获取模型，例如 https://your-host/v1');
    return;
  }

  isFetchingProviderModels.value = true;
  providerModelFetchError.value = '';
  providerModelResolvedUrl.value = '';

  try {
    const response = await apiPost<AIProviderModelDiscoveryResult>(
      '/settings/ai-providers/discover-models',
      payload,
      authStore.token
    );
    providerModelOptions.value = [...response.items];
    providerModelResolvedUrl.value = response.resolved_url;
    if (!providerForm.value.model_name.trim() && response.items.length) {
      providerForm.value.model_name = response.items[0];
    }
    ElMessage.success(`已获取 ${response.items.length} 个可用模型`);
  } catch (error) {
    providerModelOptions.value = [];
    providerModelResolvedUrl.value = '';
    providerModelFetchError.value = formatProviderModelFetchError(error);
    ElMessage.warning('自动获取失败，请根据下方提示检查配置');
  } finally {
    isFetchingProviderModels.value = false;
  }
}

async function saveProvider() {
  if (!authStore.token) return;

  const payload = {
    ...providerForm.value,
    name: providerForm.value.name.trim(),
    provider_type: providerForm.value.provider_type.trim(),
    base_url: providerForm.value.base_url.trim(),
    api_key: providerForm.value.api_key.trim(),
    model_name: providerForm.value.model_name.trim(),
  };

  if (!payload.name || !payload.base_url || !payload.model_name) {
    ElMessage.warning('请填写完整的服务名称、Base URL 和模型名称');
    return;
  }
  if (!editingProviderId.value && !payload.api_key) {
    ElMessage.warning('新建服务时必须提供 API Key');
    return;
  }

  isSavingProvider.value = true;
  try {
    const path = editingProviderId.value ? `/settings/ai-providers/${editingProviderId.value}` : '/settings/ai-providers';
    const method = editingProviderId.value ? apiPut : apiPost;
    const response = await method<{ items: AIProviderRecord[] }>(path, payload, authStore.token);
    aiProviders.value = response.items;
    notifyAIProviderConfigUpdated();
    providerDialogVisible.value = false;
    ElMessage.success(editingProviderId.value ? 'AI 模型服务已更新' : 'AI 模型服务已创建');
  } finally {
    isSavingProvider.value = false;
  }
}

async function deleteProvider(providerId: number) {
  if (!authStore.token) return;
  await ElMessageBox.confirm('确认删除这个 AI 模型服务吗？');
  const response = await apiDelete<{ items: AIProviderRecord[] }>(`/settings/ai-providers/${providerId}`, authStore.token);
  aiProviders.value = response.items;
  notifyAIProviderConfigUpdated();
  ElMessage.success('AI 模型服务已删除');
}

async function saveAssistantPrompts() {
  if (!authStore.token) return;
  isSavingAssistantPrompts.value = true;
  try {
    const payload = await apiPut<AssistantPromptSettings>(
      '/settings/assistant-prompts',
      assistantPromptForm.value,
      authStore.token
    );
    assistantPromptForm.value = { ...payload };
    ElMessage.success('AI 学伴提示词已更新');
  } finally {
    isSavingAssistantPrompts.value = false;
  }
}

async function saveAssistantRuntimeSettings() {
  if (!authStore.token) return;
  isSavingAssistantRuntimeSettings.value = true;
  try {
    const payload = await apiPut<AssistantRuntimeSettings>(
      '/settings/assistant-runtime',
      assistantRuntimeForm.value,
      authStore.token
    );
    assistantRuntimeForm.value = { ...payload };
    notifyAssistantRuntimeConfigUpdated();
    ElMessage.success('AI 学伴运行参数已更新');
  } finally {
    isSavingAssistantRuntimeSettings.value = false;
  }
}

watch(
  () => [providerForm.value.provider_type, providerForm.value.base_url, providerForm.value.api_key],
  (nextValues, previousValues) => {
    if (!providerDialogVisible.value || !previousValues) {
      return;
    }
    const changed = nextValues.some((value, index) => value !== previousValues[index]);
    if (!changed) {
      return;
    }
    resetProviderModelDiscovery();
    if (providerForm.value.model_name.trim()) {
      providerModelOptions.value = [providerForm.value.model_name.trim()];
    }
  }
);
</script>
