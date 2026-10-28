<template>
  <div class="student-preview-task">
    <div class="sp-metrics">
      <article class="sp-metric">
        <p class="sp-metric__label">当前状态</p>
        <p class="sp-metric__value">预览中</p>
        <p class="sp-metric__note">学生打开任务时从这里开始作答与提交。</p>
      </article>
      <article class="sp-metric">
        <p class="sp-metric__label">{{ ruleLabel }}</p>
        <p class="sp-metric__value">{{ ruleValue }}</p>
        <p class="sp-metric__note">{{ ruleNote }}</p>
      </article>
      <article class="sp-metric">
        <p class="sp-metric__label">{{ assetLabel }}</p>
        <p class="sp-metric__value">{{ assetValue }}</p>
        <p class="sp-metric__note">{{ assetNote }}</p>
      </article>
    </div>

    <div class="sp-layout">
      <div class="sp-column">
        <SaPanel>
          <template #header>
            <div class="sp-info-row">
              <span>{{ isDataSubmit ? '任务内容' : '任务说明' }}</span>
              <n-tag round size="small">{{ taskTypeLabel(task.taskType) }}</n-tag>
            </div>
          </template>

          <div v-if="!isDataSubmit" class="sp-description">
            <RichTextContent :html="task.description" empty-text="当前任务还没有补充说明。" />
          </div>

          <n-divider v-if="!isDataSubmit" />

          <div v-if="isDiscussion" class="sp-section">
            <div class="sp-section__head">
              <h3>课堂讨论</h3>
              <span>围绕教师发布的主题直接回复，学生端只有一层主题回复。</span>
            </div>
            <n-alert
              :closable="false"
              :title="task.topic || '教师暂未填写讨论主题，学生阅读任务说明后回复。'"
              type="info"
            />
            <p class="sp-hint">预览模式不加载真实讨论内容，也不允许发布回复。</p>
          </div>

          <div v-else-if="isWebTask" class="sp-section">
            <div class="sp-section__head">
              <h3>任务页面</h3>
              <span>教师发布的网页内容会直接嵌入到学生任务页中。</span>
            </div>
            <iframe
              v-if="task.frames.web.mode === 'src'"
              :src="task.frames.web.value"
              :sandbox="frameSandbox(task.frames.web.value)"
              class="sp-embed-frame"
              title="网页任务"
            ></iframe>
            <iframe
              v-else-if="task.frames.web.mode === 'srcdoc'"
              :srcdoc="task.frames.web.value"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              class="sp-embed-frame"
              title="网页任务"
            ></iframe>
            <n-empty v-else description="教师暂未上传网页任务资源" />
          </div>

          <div v-else-if="isDataSubmit" class="sp-section">
            <div class="sp-section__head">
              <h3>数据提交任务</h3>
              <span>学生先在提交页完成数据上报，再切换到可视化页查看结果。</span>
            </div>
            <n-tabs v-model:value="dataSubmitTab">
              <n-tab-pane name="submit" tab="学生提交页">
                <div class="sp-section">
                  <RichTextContent :html="task.description" empty-text="当前任务还没有补充说明。" />
                  <iframe
                    v-if="task.frames.submit.mode === 'src'"
                    :src="task.frames.submit.value"
                    :sandbox="frameSandbox(task.frames.submit.value)"
                    class="sp-embed-frame"
                    title="数据提交页"
                  ></iframe>
                  <iframe
                    v-else-if="task.frames.submit.mode === 'srcdoc'"
                    :srcdoc="task.frames.submit.value"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    class="sp-embed-frame"
                    title="数据提交页"
                  ></iframe>
                  <n-empty v-else description="教师暂未上传数据提交页面" />
                </div>
              </n-tab-pane>
              <n-tab-pane name="visualization" tab="数据可视化页">
                <iframe
                  v-if="task.frames.visualization.mode === 'src'"
                  :src="task.frames.visualization.value"
                  :sandbox="frameSandbox(task.frames.visualization.value)"
                  class="sp-embed-frame"
                  title="数据可视化页"
                ></iframe>
                <iframe
                  v-else-if="task.frames.visualization.mode === 'srcdoc'"
                  :srcdoc="task.frames.visualization.value"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  class="sp-embed-frame"
                  title="数据可视化页"
                ></iframe>
                <n-empty v-else description="教师暂未上传可视化页面" />
              </n-tab-pane>
            </n-tabs>
            <p class="sp-hint">预览模式为只读：提交页不会写入数据，可视化页会读取真实课堂数据。</p>
          </div>

          <div v-if="usesSubmissionForm" class="sp-section">
            <div class="sp-section__head">
              <h3>{{ submissionTitle }}</h3>
              <span>{{ submissionHint }}</span>
            </div>
            <div class="sp-editor-placeholder">
              学生在这里使用富文本编辑器填写{{ isDiscussion || isWebTask ? '提交说明' : '作品说明' }}
            </div>
            <p class="sp-hint">预览模式不提供附件上传与提交按钮。</p>
          </div>
        </SaPanel>
      </div>

      <div class="sp-column">
        <SaPanel title="提交信息">
          <n-descriptions :column="1" bordered>
            <n-descriptions-item label="课程">{{ courseTitle }}</n-descriptions-item>
            <n-descriptions-item label="发布时间">{{ assignedDate || '暂无记录' }}</n-descriptions-item>
            <n-descriptions-item label="提交方式">
              {{ task.submissionScope === 'group' ? '小组共同提交' : '个人提交' }}
            </n-descriptions-item>
            <n-descriptions-item label="任务要求">{{ task.isRequired ? '必做' : '选做' }}</n-descriptions-item>
          </n-descriptions>
          <div class="sp-comment">
            <p class="sp-comment__title">教师评语</p>
            <p class="sp-comment__empty">教师评价后，学生在这里看到评语。</p>
          </div>
        </SaPanel>

        <SaPanel title="学案导读">
          <RichTextContent :html="planContent" empty-text="当前学案还没有补充导读内容。" />
        </SaPanel>

        <SaPanel v-if="task.resources.length" title="任务资源">
          <template #header>
            <div class="sp-info-row">
              <span>任务资源</span>
              <n-tag round size="small" type="info">{{ task.resources.length }} 项</n-tag>
            </div>
          </template>
          <div class="sp-resource-list">
            <article v-for="resource in task.resources" :key="resource.id" class="sp-resource">
              <p class="sp-resource__title">{{ resource.title }}</p>
              <p v-if="resource.summary" class="sp-resource__summary">{{ resource.summary }}</p>
              <n-tag v-if="resource.externalUrl" round size="small" type="warning">外链</n-tag>
            </article>
          </div>
        </SaPanel>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NEmpty,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';
import { computed, ref } from 'vue';

import RichTextContent from '@/components/RichTextContent.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import { resolveIframeSandbox } from '@/utils/iframeTrust';

import { taskTypeLabel } from '../../lessonPlanTask.utils';
import type { StudentPreviewTask } from './studentViewPreview.types';

const props = defineProps<{
  task: StudentPreviewTask;
  planContent: string;
  courseTitle: string;
  assignedDate: string;
}>();

const dataSubmitTab = ref<'submit' | 'visualization'>('submit');

const isDiscussion = computed(() => props.task.taskType === 'discussion');
const isWebTask = computed(() => props.task.taskType === 'web_page');
const isDataSubmit = computed(() => props.task.taskType === 'data_submit');
const usesSubmissionForm = computed(() => !isDataSubmit.value);

const ruleLabel = computed(() => {
  if (isDiscussion.value) return '互动方式';
  if (isWebTask.value) return '任务形态';
  if (isDataSubmit.value) return '任务形态';
  return '提交规则';
});
const ruleValue = computed(() => {
  if (isDiscussion.value) return '主题回复';
  if (isWebTask.value) return '网页互动';
  if (isDataSubmit.value) return '数据提交';
  return '直接提交即保存';
});
const ruleNote = computed(() => {
  if (isDiscussion.value) return '围绕教师主题直接回复，不需要上传附件。';
  if (isWebTask.value) return '任务内容通过嵌入网页展示。';
  if (isDataSubmit.value) return '提交页与可视化页都在当前任务中打开。';
  return '教师评价前，学生可以再次提交覆盖作品。';
});

const assetLabel = computed(() => {
  if (isDiscussion.value) return '讨论回复';
  if (isWebTask.value) return '页面资源';
  if (isDataSubmit.value) return '任务页面';
  return '已保存附件';
});
const assetValue = computed(() => {
  if (isDiscussion.value) return '0';
  if (isWebTask.value) return props.task.frames.web.mode === 'none' ? '0' : '1';
  if (isDataSubmit.value) {
    return String(
      Number(props.task.frames.submit.mode !== 'none') + Number(props.task.frames.visualization.mode !== 'none')
    );
  }
  return '0';
});
const assetNote = computed(() => {
  if (isDiscussion.value) return '预览模式不加载讨论回复。';
  if (isWebTask.value) return '网页任务会直接嵌入展示。';
  if (isDataSubmit.value) return '提交页与可视化页都可直接打开。';
  return '学生提交后在这里看到附件数量。';
});

const submissionTitle = computed(() => (isDiscussion.value || isWebTask.value ? '提交说明' : '作品说明'));
const submissionHint = computed(() => {
  if (isDiscussion.value) return '可整理讨论结论、观点总结或课后反思，提交后教师可直接评分。';
  if (isWebTask.value) return '完成网页互动后，补充完成说明、结果截图说明或学习总结。';
  return '支持富文本排版，提交后即保存，教师评价前可再次提交。';
});

function frameSandbox(src: string) {
  return resolveIframeSandbox(src);
}
</script>

<style scoped>
.student-preview-task {
  display: grid;
  gap: 16px;
}

.sp-metrics {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.sp-metric {
  border: 1px solid var(--ls-border);
  border-radius: 16px;
  background: var(--ls-card, var(--ls-surface));
  padding: 12px 14px;
  display: grid;
  gap: 4px;
  align-content: start;
}

.sp-metric__label {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.sp-metric__value {
  margin: 0;
  color: var(--ls-ink);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.25;
}

.sp-metric__note {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.5;
}

.sp-layout {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.sp-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.sp-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sp-description {
  min-height: 120px;
}

.sp-section {
  display: grid;
  gap: 12px;
}

.sp-section__head {
  display: grid;
  gap: 2px;
}

.sp-section__head h3 {
  margin: 0;
  color: var(--ls-ink);
  font-size: 14px;
  font-weight: 700;
}

.sp-section__head span {
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.6;
}

.sp-embed-frame {
  width: 100%;
  min-height: 420px;
  border: 1px solid var(--ls-border);
  border-radius: 14px;
  background: var(--ls-surface);
}

.sp-editor-placeholder {
  border: 1px dashed var(--ls-border);
  border-radius: 14px;
  background: var(--ls-input-bg);
  color: var(--ls-muted);
  font-size: 12px;
  padding: 26px 16px;
  text-align: center;
}

.sp-hint {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.6;
}

.sp-comment {
  margin-top: 12px;
  border: 1px dashed var(--ls-border);
  border-radius: 12px;
  padding: 10px 12px;
}

.sp-comment__title {
  margin: 0 0 4px;
  color: var(--ls-text);
  font-size: 12.5px;
  font-weight: 700;
}

.sp-comment__empty {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
}

.sp-resource-list {
  display: grid;
  gap: 8px;
}

.sp-resource {
  border: 1px solid var(--ls-border);
  border-radius: 12px;
  background: var(--ls-input-bg);
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  justify-items: start;
}

.sp-resource__title {
  margin: 0;
  color: var(--ls-text);
  font-size: 13px;
  font-weight: 700;
}

.sp-resource__summary {
  margin: 0;
  color: var(--ls-muted);
  font-size: 11.5px;
  line-height: 1.6;
}

@media (min-width: 1100px) {
  .sp-layout {
    grid-template-columns: minmax(0, 15fr) minmax(0, 9fr);
  }
}
</style>
