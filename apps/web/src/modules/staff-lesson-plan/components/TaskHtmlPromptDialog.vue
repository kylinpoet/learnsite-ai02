<template>
  <el-dialog v-model="dialogVisible" :close-on-click-modal="false" :title="title" width="960px">
    <template v-if="task">
      <el-form label-position="top">
        <el-form-item label="提示词模板">
          <el-radio-group v-model="templateIdValue" class="task-html-prompt-template-group">
            <el-radio-button v-for="option in currentTemplates" :key="option.id" :value="option.id">
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
          <p class="section-note">
            {{ selectedTemplateDescription || '请选择一个更贴合当前页面结构的提示词模板。' }}
          </p>
        </el-form-item>

        <el-form-item label="自定义提示词">
          <RichTextEditor
            v-model="customPromptValue"
            class="task-html-prompt-editor"
            :min-height="180"
            placeholder="可补充字段、交互方式、页面风格、配色、版式、图表形式、校验规则等要求。"
          />
        </el-form-item>

        <section class="task-html-provider-settings">
          <div class="task-html-provider-settings__head">
            <div>
              <strong>AI 生成设置</strong>
              <p class="section-note">与 AI 学伴共用模型服务配置，可临时切换本次网页生成使用的 API。</p>
            </div>
            <el-tag round type="info">{{ generationModeLabel }}</el-tag>
          </div>

          <el-alert
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
              <el-select
                v-model="providerIdValue"
                class="full-width"
                clearable
                :disabled="isGenerating || assistantBootstrapLoading || !assistantProviders.length"
                :value-on-clear="null"
                placeholder="跟随系统默认模型服务"
              >
                <el-option
                  v-for="item in assistantProviders"
                  :key="item.id"
                  :label="`${item.name} · ${item.model_name}`"
                  :value="item.id"
                />
              </el-select>
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
              <el-switch
                v-model="streamEnabledValue"
                :disabled="isGenerating || !streamCapabilityEnabled"
                active-text="流式"
                inactive-text="标准"
              />
            </div>

            <div class="task-html-provider-field">
              <div class="task-html-provider-field__head">
                <strong>推理模式</strong>
                <span>开启后会请求模型进行额外推理。</span>
              </div>
              <el-switch
                v-model="thinkingEnabledValue"
                :disabled="isGenerating"
                active-text="开启"
                inactive-text="关闭"
              />
            </div>

            <div class="task-html-provider-field task-html-provider-field--wide">
              <div class="task-html-provider-field__head">
                <strong>知识库</strong>
                <span>生成网页时会优先参考所选知识库。</span>
              </div>
              <el-select
                v-model="knowledgeBaseIdsValue"
                class="full-width"
                collapse-tags
                collapse-tags-tooltip
                multiple
                placeholder="请选择知识库"
              >
                <el-option
                  v-for="item in assistantKnowledgeBases"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                >
                  <div class="task-html-knowledge-option">
                    <strong>{{ item.name }}</strong>
                    <span>{{ item.description }}</span>
                  </div>
                </el-option>
              </el-select>
            </div>
          </div>
        </section>

        <el-form-item label="将发送给 AI 的提示词预览">
          <RichTextEditor
            :model-value="previewText"
            class="task-html-prompt-preview"
            :min-height="240"
            readonly
          />
        </el-form-item>

        <section v-if="hasGeneratedHtml" class="task-html-result-panel">
          <div class="task-html-result-panel__head">
            <div>
              <strong>生成结果</strong>
              <p class="section-note">接口返回内容会保留在这里，可复制、预览，确认后再写入下方源码编辑区。</p>
            </div>
            <div class="task-html-result-panel__actions">
              <el-tag round type="success">{{ generatedHtmlSource.length }} 字符</el-tag>
              <el-button :disabled="isGenerating || isContinuing" plain size="small" @click="$emit('copy')">
                复制源码
              </el-button>
              <el-button
                :disabled="generatedHtmlApplied || isGenerating || isContinuing"
                plain
                size="small"
                type="primary"
                @click="$emit('apply')"
              >
                {{ applyButtonLabel }}
              </el-button>
            </div>
          </div>
          <el-tabs v-model="resultTab" class="task-html-result-tabs">
            <el-tab-pane label="源码" name="source">
              <pre class="task-html-result-source"><code>{{ generatedHtmlSource }}</code></pre>
            </el-tab-pane>
            <el-tab-pane label="预览" name="preview">
              <iframe
                :key="generatedHtmlSource"
                class="task-html-result-preview"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                :srcdoc="generatedHtmlPreviewSrcdoc"
              ></iframe>
            </el-tab-pane>
          </el-tabs>
        </section>

        <section v-if="hasGeneratedHtml" class="task-html-followup-panel">
          <div class="task-html-followup-panel__head">
            <div>
              <strong>连续对话修改</strong>
              <p class="section-note">输入新的修改要求，AI 会基于当前 HTML 返回一份完整新版本。</p>
            </div>
            <el-tag v-if="conversation.length" round type="info">已对话 {{ conversation.length }} 条</el-tag>
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
          <el-input
            v-model="followupPromptValue"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :disabled="isGenerating || isContinuing"
            maxlength="2000"
            placeholder="例如：把表单字段改为姓名、班级、实验现象，并增加提交成功后的绿色提示。"
            show-word-limit
            type="textarea"
          />
          <div class="task-html-followup-actions">
            <el-button
              :disabled="!normalizedFollowupPrompt || !canContinue"
              :loading="isContinuing"
              plain
              type="primary"
              @click="$emit('continue')"
            >
              发送修改要求
            </el-button>
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
            <el-tag round :type="generationStatusTagType">
              {{ generationStatusTagLabel }}
            </el-tag>
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
            <el-button plain type="primary" @click="$emit('submit')">立即重试</el-button>
          </div>
        </section>
      </el-form>
    </template>

    <template #footer>
      <el-space wrap>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="hasGeneratedHtml" :disabled="isGenerating || isContinuing" plain @click="$emit('copy')">
          复制源码
        </el-button>
        <el-button :loading="isGenerating" type="primary" @click="$emit('submit')">
          {{ submitButtonLabel }}
        </el-button>
        <el-button
          v-if="hasGeneratedHtml"
          :disabled="isGenerating || isContinuing"
          type="success"
          @click="$emit('apply', true)"
        >
          {{ confirmApplyButtonLabel }}
        </el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

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
    return 'danger';
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
  color: #1f2a44;
  line-height: 1.4;
}

.task-html-provider-field__head span {
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.5;
}

.task-html-knowledge-option {
  display: grid;
  gap: 2px;
  line-height: 1.4;
}

.task-html-knowledge-option strong,
.task-html-knowledge-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-html-knowledge-option span {
  color: var(--ls-muted);
  font-size: 12px;
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
  background: rgba(255, 255, 255, 0.92);
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

.task-html-result-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.task-html-result-source {
  max-height: 360px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid rgba(66, 97, 162, 0.14);
  border-radius: 14px;
  background: #101827;
  color: #f7fafc;
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
  background: rgba(24, 39, 75, 0.05);
}

.task-html-followup-message--user {
  background: rgba(66, 97, 162, 0.09);
}

.task-html-followup-message strong {
  color: #1f2a44;
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
  background: rgba(248, 251, 255, 0.96);
}

.task-html-generation-status--error {
  border-color: rgba(215, 74, 74, 0.24);
  background: rgba(255, 246, 246, 0.96);
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
  background: rgba(24, 39, 75, 0.05);
}

.task-html-generation-status__item span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-html-generation-status__item strong {
  font-size: 14px;
  color: #1f2a44;
  line-height: 1.5;
  word-break: break-word;
}

.task-html-generation-status__warning,
.task-html-generation-status__error {
  margin: 0;
  line-height: 1.7;
}

.task-html-generation-status__warning {
  color: #8a5a00;
}

.task-html-generation-status__error {
  color: #c0392b;
}

.task-html-generation-status__actions {
  display: flex;
  justify-content: flex-start;
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
