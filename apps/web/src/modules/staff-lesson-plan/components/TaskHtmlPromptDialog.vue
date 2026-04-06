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
            {{ selectedTemplateDescription || '请选择一个适合当前页面结构的提示词模板。' }}
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
      </el-form>
    </template>

    <template #footer>
      <el-space wrap>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button :loading="isGenerating" type="primary" @click="$emit('submit')">生成网页源码</el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type {
  PlanFormTask,
  TaskHtmlPromptDialogState,
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
</style>
