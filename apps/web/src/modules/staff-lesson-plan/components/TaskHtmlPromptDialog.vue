<template>
  <el-dialog v-model="dialogVisible" :close-on-click-modal="false" :title="title" width="720px">
    <template v-if="task">
      <el-form label-position="top">
        <el-form-item label="提示词模板">
          <el-radio-group v-model="templateIdValue" class="task-html-prompt-template-group">
            <el-radio-button v-for="option in currentTemplates" :key="option.id" :label="option.id">
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
          <p class="section-note">
            {{ selectedTemplateDescription || '请选择一个更贴合当前页面结构的提示词模板。' }}
          </p>
        </el-form-item>

        <el-form-item v-if="task.task_type === 'data_submit'" label="当前数据接口">
          <div class="task-html-prompt-endpoints">
            <article class="task-html-prompt-endpoints__card">
              <strong>提交接口</strong>
              <code>{{ submitApiPath }}</code>
            </article>
            <article class="task-html-prompt-endpoints__card">
              <strong>读取接口</strong>
              <code>{{ recordsApiPath }}</code>
            </article>
          </div>
          <p class="section-note">
            数据提交任务会先预生成真实任务编号，因此这里展示的就是最终可用的正式接口地址；生成完成后也可以直接在下方预览网页。
          </p>
        </el-form-item>

        <el-form-item label="自定义提示词">
          <el-input
            v-model="customPromptValue"
            :autosize="{ minRows: 5, maxRows: 9 }"
            maxlength="4000"
            show-word-limit
            type="textarea"
            placeholder="可补充字段、交互方式、页面风格、配色、版式、图表形式、校验规则等要求。"
          />
        </el-form-item>

        <el-form-item label="将发送给 AI 的提示词预览">
          <el-input
            :model-value="previewText"
            :autosize="{ minRows: 10, maxRows: 18 }"
            readonly
            type="textarea"
          />
        </el-form-item>

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
              <span>Provider</span>
              <strong>{{ providerDisplayName }}</strong>
            </article>
            <article class="task-html-generation-status__item">
              <span>Provider 模式</span>
              <strong>{{ providerModeLabel }}</strong>
            </article>
            <article class="task-html-generation-status__item">
              <span>尝试次数</span>
              <strong>{{ attemptDisplayLabel }}</strong>
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
        <el-button :loading="isGenerating" type="primary" @click="$emit('submit')">
          {{ submitButtonLabel }}
        </el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type {
  PlanFormTask,
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
  generationStatus: TaskHtmlPromptGenerationStatus;
  submitApiPath: string;
  recordsApiPath: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:dialogState', value: TaskHtmlPromptDialogState): void;
  (e: 'submit'): void;
}>();

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
    return '实时 Provider';
  }
  if (normalized === 'preview') {
    return '预览兜底';
  }
  if (normalized === 'pending') {
    return '请求中';
  }
  return '未返回';
});

const providerDisplayName = computed(() => props.generationStatus.provider_name.trim() || '当前 Provider');

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
      : '系统正在请求当前 Provider 返回可直接运行的 HTML 页面源码。';
  }
  if (props.generationStatus.state === 'error') {
    return '你可以调整提示词后再次尝试，或者直接点击下方重试按钮。';
  }
  return '当前弹窗会显示最近一次网页生成的 Provider 反馈。';
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

.task-html-prompt-endpoints {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.task-html-prompt-endpoints__card {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid rgba(66, 97, 162, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
}

.task-html-prompt-endpoints__card code {
  display: block;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(24, 39, 75, 0.06);
  color: #1f2a44;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.task-html-prompt-template-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  .task-html-generation-status__head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
