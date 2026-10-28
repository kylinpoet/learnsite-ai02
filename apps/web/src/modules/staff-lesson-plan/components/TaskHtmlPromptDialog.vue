<template>
  <n-modal
    v-model:show="dialogVisible"
    preset="card"
    :title="title"
    :mask-closable="false"
    style="width: min(960px, 96vw)"
  >
    <template v-if="task">
      <n-form label-placement="top">
        <n-form-item label="提示词模板">
          <n-radio-group v-model:value="templateIdValue" class="task-html-prompt-template-group">
            <n-radio-button v-for="option in currentTemplates" :key="option.id" :value="option.id">
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
          <p class="section-note">
            {{ selectedTemplateDescription || '请选择一个更贴合当前页面结构的提示词模板。' }}
          </p>
        </n-form-item>

        <n-form-item label="自定义提示词">
          <RichTextEditor
            v-model="customPromptValue"
            class="task-html-prompt-editor"
            :min-height="180"
            placeholder="可补充字段、交互方式、页面风格、配色、版式、图表形式、校验规则等要求。"
          />
        </n-form-item>

        <section class="task-html-provider-settings">
          <div class="task-html-provider-settings__head">
            <div>
              <strong>AI 生成设置</strong>
              <p class="section-note">与 AI 学伴共用模型服务配置，可临时切换本次网页生成使用的 API。</p>
            </div>
            <n-tag round type="info">{{ generationModeLabel }}</n-tag>
          </div>

          <n-alert
            v-if="assistantBootstrapError"
            :closable="false"
            :title="assistantBootstrapError"
            type="warning"
          />

          <div class="task-html-provider-settings__grid">
            <div class="task-html-provider-field task-html-provider-field--wide">
              <div class="task-html-provider-field__head">
                <strong>模型服务</strong>
                <span>默认跟随系统配置，也可选择指定 API。</span>
              </div>
              <n-select
                v-model:value="providerIdValue"
                class="full-width"
                clearable
                :disabled="isGenerating || assistantBootstrapLoading || !assistantProviders.length"
                :options="providerOptions"
                placeholder="跟随系统默认模型服务"
              />
              <p v-if="!assistantProviders.length && !assistantBootstrapLoading" class="section-note">
                当前未启用外部模型服务，将使用系统默认学伴。
              </p>
              <p v-else-if="assistantActiveProvider" class="section-note">
                系统默认：{{ assistantActiveProvider.name }} · {{ assistantActiveProvider.model_name }}
              </p>
            </div>

            <div class="task-html-provider-field">
              <div class="task-html-provider-field__head">
                <strong>生成模式</strong>
                <span>流式会逐段接收模型内容。</span>
              </div>
              <n-switch v-model:value="streamEnabledValue" :disabled="isGenerating || !streamCapabilityEnabled">
                <template #checked>流式</template>
                <template #unchecked>标准</template>
              </n-switch>
            </div>

            <div class="task-html-provider-field">
              <div class="task-html-provider-field__head">
                <strong>推理模式</strong>
                <span>开启后会请求模型进行额外推理。</span>
              </div>
              <n-switch v-model:value="thinkingEnabledValue" :disabled="isGenerating">
                <template #checked>开启</template>
                <template #unchecked>关闭</template>
              </n-switch>
            </div>

            <div class="task-html-provider-field task-html-provider-field--wide">
              <div class="task-html-provider-field__head">
                <strong>知识库</strong>
                <span>生成网页时会优先参考所选知识库。</span>
              </div>
              <n-select
                v-model:value="knowledgeBaseIdsValue"
                class="full-width"
                multiple
                :max-tag-count="2"
                :options="knowledgeBaseOptions"
                placeholder="请选择知识库"
                :render-option="renderKnowledgeBaseOption"
              />
            </div>
          </div>
        </section>

        <n-form-item label="将发送给 AI 的提示词预览">
          <RichTextEditor
            :model-value="previewText"
            class="task-html-prompt-preview"
            :min-height="240"
            readonly
          />
        </n-form-item>

        <section v-if="hasGeneratedHtml" class="task-html-result-panel">
          <div class="task-html-result-panel__head">
            <div>
              <strong>生成结果</strong>
              <p class="section-note">接口返回内容会保留在这里，可复制、预览，确认后再写入下方源码编辑区。</p>
            </div>
            <div class="task-html-result-panel__actions">
              <n-tag round type="success">{{ generatedHtmlSource.length }} 字符</n-tag>
              <n-button :disabled="isGenerating || isContinuing" secondary size="small" @click="$emit('copy')">
                复制源码
              </n-button>
              <n-button
                :disabled="generatedHtmlApplied || isGenerating || isContinuing"
                secondary
                size="small"
                type="primary"
                @click="$emit('apply')"
              >
                {{ applyButtonLabel }}
              </n-button>
            </div>
          </div>
          <n-tabs v-model:value="resultTab" class="task-html-result-tabs">
            <n-tab-pane name="source" tab="源码" display-directive="show">
              <pre class="task-html-result-source"><code>{{ generatedHtmlSource }}</code></pre>
            </n-tab-pane>
            <n-tab-pane name="preview" tab="预览" display-directive="show">
              <iframe
                :key="generatedHtmlSource"
                class="task-html-result-preview"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                :srcdoc="generatedHtmlPreviewSrcdoc"
              ></iframe>
            </n-tab-pane>
          </n-tabs>
        </section>

        <section v-if="hasGeneratedHtml" class="task-html-followup-panel">
          <div class="task-html-followup-panel__head">
            <div>
              <strong>连续对话修改</strong>
              <p class="section-note">输入新的修改要求，AI 会基于当前 HTML 返回一份完整新版本。</p>
            </div>
            <n-tag v-if="conversation.length" round type="info">已对话 {{ conversation.length }} 条</n-tag>
          </div>
          <div v-if="conversation.length" class="task-html-followup-history">
            <article
              v-for="(message, index) in visibleConversation"
              :key="`${message.created_at}:${index}`"
              class="task-html-followup-message"
              :class="`task-html-followup-message--${message.role}`"
            >
              <strong>{{ message.role === 'user' ? '我' : 'AI' }}</strong>
              <p>{{ conversationExcerpt(message.content) }}</p>
            </article>
          </div>
          <n-input
            v-model:value="followupPromptValue"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :disabled="isGenerating || isContinuing"
            :maxlength="2000"
            placeholder="例如：把表单字段改为姓名、班级、实验现象，并增加提交成功后的绿色提示。"
            show-count
            type="textarea"
          />
          <div class="task-html-followup-actions">
            <n-button
              :disabled="!normalizedFollowupPrompt || !canContinue"
              :loading="isContinuing"
              secondary
              type="primary"
              @click="$emit('continue')"
            >
              发送修改要求
            </n-button>
          </div>
        </section>

        <section
          v-if="showGenerationStatus"
          class="task-html-generation-status"
          :class="`task-html-generation-status--${generationStatus.state}`"
        >
          <div class="task-html-generation-status__head">
            <div>
              <strong>{{ generationStatusTitle }}</strong>
              <p>{{ generationStatusSummary }}</p>
            </div>
            <n-tag round :type="generationStatusTagType">
              {{ generationStatusTagLabel }}
            </n-tag>
          </div>

          <div class="task-html-generation-status__grid">
            <article class="task-html-generation-status__item">
              <span>模型服务</span>
              <strong>{{ providerDisplayName }}</strong>
            </article>
            <article class="task-html-generation-status__item">
              <span>服务模式</span>
              <strong>{{ providerModeLabel }}</strong>
            </article>
            <article class="task-html-generation-status__item">
              <span>生成模式</span>
              <strong>{{ statusGenerationModeLabel }}</strong>
            </article>
            <article class="task-html-generation-status__item">
              <span>推理模式</span>
              <strong>{{ generationStatus.thinking_enabled ? '开启' : '关闭' }}</strong>
            </article>
            <article class="task-html-generation-status__item">
              <span>尝试次数</span>
              <strong>{{ attemptDisplayLabel }}</strong>
            </article>
            <article v-if="generationStatus.received_chars" class="task-html-generation-status__item">
              <span>已接收</span>
              <strong>{{ generationStatus.received_chars }} 字符</strong>
            </article>
          </div>

          <p v-if="generationStatus.warning" class="task-html-generation-status__warning">
            上游提示：{{ generationStatus.warning }}
          </p>
          <p v-if="generationStatus.error_message" class="task-html-generation-status__error">
            {{ generationStatus.error_message }}
          </p>

          <div v-if="generationStatus.state === 'error'" class="task-html-generation-status__actions">
            <n-button secondary type="primary" @click="$emit('submit')">立即重试</n-button>
          </div>
        </section>
      </n-form>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <n-button @click="dialogVisible = false">取消</n-button>
        <n-button v-if="hasGeneratedHtml" :disabled="isGenerating || isContinuing" secondary @click="$emit('copy')">
          复制源码
        </n-button>
        <n-button :loading="isGenerating" type="primary" @click="$emit('submit')">
          {{ submitButtonLabel }}
        </n-button>
        <n-button
          v-if="hasGeneratedHtml"
          :disabled="isGenerating || isContinuing"
          type="success"
          @click="$emit('apply', true)"
        >
          {{ confirmApplyButtonLabel }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import type { SelectRenderOption } from 'naive-ui';
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';
import { computed, h, ref } from 'vue';

import RichTextEditor from '@/components/RichTextEditor.vue';
import { richTextToPlainText } from '@/utils/richText';

import type {
  PlanFormTask,
  TaskHtmlPromptConversationMessage,
  TaskHtmlPromptKnowledgeBaseOption,
  TaskHtmlPromptProviderOption,
  TaskHtmlPromptDialogState,
  TaskHtmlPromptGenerationStatus,
  TaskHtmlPromptTemplateOption,
} from '../lessonPlan.types';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  task: PlanFormTask | null;
  dialogState: TaskHtmlPromptDialogState;
  currentTemplates: TaskHtmlPromptTemplateOption[];
  selectedTemplateDescription: string;
  previewText: string;
  isGenerating: boolean;
  isContinuing: boolean;
  generationStatus: TaskHtmlPromptGenerationStatus;
  generatedHtmlApplied: boolean;
  followupPrompt: string;
  conversation: TaskHtmlPromptConversationMessage[];
  assistantBootstrapLoading: boolean;
  assistantBootstrapError: string;
  assistantProviders: TaskHtmlPromptProviderOption[];
  assistantKnowledgeBases: TaskHtmlPromptKnowledgeBaseOption[];
  assistantActiveProvider: TaskHtmlPromptProviderOption | null;
  streamCapabilityEnabled: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:dialogState', value: TaskHtmlPromptDialogState): void;
  (e: 'update:followupPrompt', value: string): void;
  (e: 'submit'): void;
  (e: 'continue'): void;
  (e: 'copy'): void;
  (e: 'apply', closeAfterApply?: boolean): void;
}>();

const resultTab = ref<'source' | 'preview'>('source');

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const templateIdValue = computed({
  get: () => props.dialogState.template_id,
  set: (value: string) =>
    emit('update:dialogState', {
      ...props.dialogState,
      template_id: value,
    }),
});

const customPromptValue = computed({
  get: () => props.dialogState.custom_prompt,
  set: (value: string) =>
    emit('update:dialogState', {
      ...props.dialogState,
      custom_prompt: value,
    }),
});

const providerIdValue = computed({
  get: () => props.dialogState.provider_id,
  set: (value: number | null) =>
    emit('update:dialogState', {
      ...props.dialogState,
      provider_id: value ?? null,
    }),
});

const streamEnabledValue = computed({
  get: () => props.dialogState.stream_enabled,
  set: (value: boolean) =>
    emit('update:dialogState', {
      ...props.dialogState,
      stream_enabled: value,
    }),
});

const thinkingEnabledValue = computed({
  get: () => props.dialogState.thinking_enabled,
  set: (value: boolean) =>
    emit('update:dialogState', {
      ...props.dialogState,
      thinking_enabled: value,
    }),
});

const knowledgeBaseIdsValue = computed({
  get: () => props.dialogState.knowledge_base_ids,
  set: (value: string[]) =>
    emit('update:dialogState', {
      ...props.dialogState,
      knowledge_base_ids: value,
    }),
});

const followupPromptValue = computed({
  get: () => props.followupPrompt,
  set: (value: string) => emit('update:followupPrompt', value),
});

const providerOptions = computed(() =>
  props.assistantProviders.map((item) => ({
    label: `${item.name} · ${item.model_name}`,
    value: item.id,
  }))
);

const knowledgeBaseOptions = computed(() =>
  props.assistantKnowledgeBases.map((item) => ({
    label: item.name,
    value: item.id,
  }))
);

const knowledgeBaseDescriptions = computed(() => {
  const map = new Map<string, string>();
  for (const item of props.assistantKnowledgeBases) {
    map.set(item.id, item.description);
  }
  return map;
});

/** 下拉项由下拉层渲染，scoped 样式不会命中，排版改用行内样式。 */
const renderKnowledgeBaseOption: SelectRenderOption = (info) => {
  const option = info.option as { value?: string | number; label?: string };
  const description = knowledgeBaseDescriptions.value.get(String(option.value)) || '';
  return h('div', { style: 'display: grid; gap: 2px; line-height: 1.4; white-space: normal;' }, [
    h('strong', { style: 'display: block; font-size: 13px; color: var(--ls-text);' }, option.label || ''),
    h('span', { style: 'display: block; font-size: 12px; color: var(--ls-muted);' }, description),
  ]);
};

const generationModeLabel = computed(() =>
  props.dialogState.stream_enabled && props.streamCapabilityEnabled ? '流式生成' : '标准生成'
);

const statusGenerationModeLabel = computed(() =>
  props.generationStatus.stream_enabled ? '流式生成' : '标准生成'
);

const generatedHtmlSource = computed(() => props.generationStatus.html_source.trim());
const hasGeneratedHtml = computed(() => Boolean(generatedHtmlSource.value));
const generatedHtmlPreviewSrcdoc = computed(() => generatedHtmlSource.value);
const applyButtonLabel = computed(() => (props.generatedHtmlApplied ? '已更新到源码编辑区' : '更新到源码编辑区'));
const confirmApplyButtonLabel = computed(() => (props.generatedHtmlApplied ? '确定' : '确定并更新源码'));
const normalizedFollowupPrompt = computed(() => richTextToPlainText(props.followupPrompt).trim());
const canContinue = computed(() => Boolean(hasGeneratedHtml.value) && !props.isGenerating && !props.isContinuing);
const visibleConversation = computed(() => props.conversation.slice(-6));

function conversationExcerpt(value: string) {
  const text = richTextToPlainText(value).trim().replace(/\s+/g, ' ');
  if (text.length <= 220) {
    return text;
  }
  return `${text.slice(0, 220)}...`;
}

const showGenerationStatus = computed(
  () =>
    props.generationStatus.state !== 'idle' ||
    Boolean(props.generationStatus.provider_name) ||
    Boolean(props.generationStatus.warning) ||
    Boolean(props.generationStatus.error_message)
);

const providerModeLabel = computed(() => {
  const normalized = props.generationStatus.provider_mode.trim().toLowerCase();
  if (normalized === 'live') {
    return '实时服务';
  }
  if (normalized === 'preview') {
    return '系统兜底';
  }
  if (normalized === 'pending') {
    return '请求中';
  }
  return '未返回';
});

const providerDisplayName = computed(() => props.generationStatus.provider_name.trim() || '当前模型服务');

const attemptDisplayLabel = computed(() => {
  const attempt = props.generationStatus.attempt;
  const totalAttempts = props.generationStatus.total_attempts;
  if (!attempt) {
    return `最多 ${totalAttempts} 次`;
  }
  return `第 ${attempt} / ${totalAttempts} 次`;
});

const generationStatusTitle = computed(() => {
  if (props.generationStatus.state === 'loading') {
    return props.generationStatus.attempt > 1 ? '正在自动重试生成网页' : '正在请求 AI 生成网页';
  }
  if (props.generationStatus.state === 'error') {
    return '最近一次生成失败';
  }
  return 'AI 生成状态';
});

const generationStatusSummary = computed(() => {
  if (props.generationStatus.state === 'loading') {
    return props.generationStatus.attempt > 1
      ? '上一次返回的内容不可直接渲染，系统正在自动重试。'
      : '系统正在请求当前模型服务返回可直接运行的 HTML 页面源码。';
  }
  if (props.generationStatus.state === 'error') {
    return '你可以调整提示词后再次尝试，或者直接点击下方重试按钮。';
  }
  return '当前弹窗会显示最近一次网页生成的服务反馈。';
});

const generationStatusTagLabel = computed(() => {
  if (props.generationStatus.state === 'loading') {
    return props.generationStatus.attempt > 1 ? '重试中' : '生成中';
  }
  if (props.generationStatus.state === 'error') {
    return '需重试';
  }
  return '就绪';
});

const generationStatusTagType = computed(() => {
  if (props.generationStatus.state === 'loading') {
    return 'info';
  }
  if (props.generationStatus.state === 'error') {
    return 'error';
  }
  return 'success';
});

const submitButtonLabel = computed(() => {
  if (props.isGenerating) {
    return props.generationStatus.attempt > 1 ? '正在重试网页生成' : '正在生成网页源码';
  }
  if (props.generationStatus.state === 'error') {
    return '重新生成网页源码';
  }
  return '生成网页源码';
});
</script>

<style scoped>
.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.task-html-prompt-template-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-html-provider-settings {
  display: grid;
  gap: 14px;
  margin: 4px 0 18px;
  padding: 16px;
  border: 1px solid rgba(66, 97, 162, 0.16);
  border-radius: 18px;
  background: rgba(248, 251, 255, 0.92);
}

.task-html-provider-settings__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.task-html-provider-settings__head strong {
  display: block;
  color: var(--ls-text);
}

.task-html-provider-settings__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.task-html-provider-field {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.task-html-provider-field--wide {
  grid-column: 1 / -1;
}

.task-html-provider-field__head {
  display: grid;
  gap: 4px;
}

.task-html-provider-field__head strong {
  color: var(--ls-ink);
  line-height: 1.4;
}

.task-html-provider-field__head span {
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.5;
}

.full-width {
  width: 100%;
}

.task-html-prompt-editor :deep(.ck-editor__editable),
.task-html-prompt-preview :deep(.ck-editor__editable) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  line-height: 1.6;
}

.task-html-result-panel,
.task-html-followup-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid rgba(66, 97, 162, 0.16);
  border-radius: 18px;
  background: var(--ls-card);
}

.task-html-result-panel__head,
.task-html-followup-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.task-html-result-panel__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.task-html-result-panel__head strong,
.task-html-followup-panel__head strong {
  display: block;
  color: var(--ls-text);
}

.task-html-result-tabs :deep(.n-tabs-nav) {
  margin-bottom: 12px;
}

.task-html-result-source {
  max-height: 360px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid rgba(66, 97, 162, 0.14);
  border-radius: 14px;
  background: var(--ls-code-bg);
  color: var(--ls-code-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-html-result-preview {
  width: 100%;
  min-height: 420px;
  border: 1px solid rgba(66, 97, 162, 0.14);
  border-radius: 14px;
  background: #fff;
}

.task-html-followup-history {
  display: grid;
  gap: 10px;
}

.task-html-followup-message {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--ls-panel-soft);
}

.task-html-followup-message--user {
  background: var(--ls-primary-soft);
}

.task-html-followup-message strong {
  color: var(--ls-ink);
}

.task-html-followup-message p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.6;
}

.task-html-followup-actions {
  display: flex;
  justify-content: flex-end;
}

.task-html-generation-status {
  display: grid;
  gap: 14px;
  margin-top: 4px;
  padding: 16px;
  border: 1px solid rgba(66, 97, 162, 0.18);
  border-radius: 18px;
  background: var(--ls-panel-soft);
}

.task-html-generation-status--error {
  border-color: rgba(215, 74, 74, 0.24);
  background: rgba(215, 74, 74, 0.12);
}

.task-html-generation-status__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.task-html-generation-status__head strong {
  display: block;
  font-size: 15px;
  color: var(--ls-text);
}

.task-html-generation-status__head p {
  margin: 6px 0 0;
  color: var(--ls-muted);
  line-height: 1.6;
}

.task-html-generation-status__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.task-html-generation-status__item {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--ls-chip-bg);
}

.task-html-generation-status__item span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-html-generation-status__item strong {
  font-size: 14px;
  color: var(--ls-ink);
  line-height: 1.5;
  word-break: break-word;
}

.task-html-generation-status__warning,
.task-html-generation-status__error {
  margin: 0;
  line-height: 1.7;
}

.task-html-generation-status__warning {
  color: var(--ls-warning-text);
}

.task-html-generation-status__error {
  color: var(--ls-error-text);
}

.task-html-generation-status__actions {
  display: flex;
  justify-content: flex-start;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}

@media (max-width: 768px) {
  .task-html-provider-settings__head,
  .task-html-result-panel__head,
  .task-html-followup-panel__head {
    flex-direction: column;
  }

  .task-html-result-panel__actions {
    justify-content: flex-start;
  }

  .task-html-provider-settings__grid {
    grid-template-columns: 1fr;
  }

  .task-html-generation-status__head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
