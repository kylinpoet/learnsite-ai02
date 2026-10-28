<template>
  <div class="page-stack lesson-plan-page">
    <SaPageHeader
      compact
      eyebrow="教师学案管理"
      :title="pageTitle"
      description="按课程体系创建学案、配置任务并发布；发布后可直接把这份学案推送给班级开课。"
    >
      <template #actions>
        <div class="lesson-plan-hero__actions">
          <div class="lesson-plan-hero__buttons">
            <n-button v-if="!isEditorRoute" type="primary" @click="openCreateDialog">新建学案</n-button>
            <n-button v-else secondary type="primary" @click="goToPlanList">返回学案清单</n-button>
            <n-button v-if="isEditorRoute" secondary @click="openStudentPreview">预览学生端</n-button>
            <n-button secondary @click="router.push('/staff/curriculum')">查看课程体系</n-button>
            <n-button v-if="!isEditorRoute" secondary @click="selectPlan(plans[0]?.id || null)">
              编辑最新学案
            </n-button>
          </div>
        </div>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="8" animated />
    </SaPanel>

    <div v-if="!isLoading && !isEditorRoute" class="page-stack">
        <div class="ls-row">
          <article class="metric-tile">
            <p class="metric-label">学案总数</p>
            <p class="metric-value">{{ plans.length }}</p>
            <p class="metric-note">包含草稿、已发布和已开课学案</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">任务总数</p>
            <p class="metric-value">{{ totalTaskCount }}</p>
            <p class="metric-note">阅读、上传、编程任务合计</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">待完成进度</p>
            <p class="metric-value">{{ totalPendingCount }}</p>
            <p class="metric-note">只会在开课后产生</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">已完成进度</p>
            <p class="metric-value">{{ totalCompletedCount }}</p>
            <p class="metric-note">便于教师快速判断班级推进情况</p>
          </article>
        </div>

        <div class="plan-charts">
          <SaPanel>
            <template #header>
              <div class="plan-chart-head">
                <div>
                  <strong>整体进度</strong>
                  <p class="section-note">已完成与待完成的学案及任务进度汇总。</p>
                </div>
              </div>
            </template>
            <n-empty v-if="!totalPendingCount && !totalCompletedCount" description="开课并产生学生进度后这里会显示图表。" />
            <AppChart v-else :height="260" :option="overallProgressOption" />
          </SaPanel>

          <SaPanel>
            <template #header>
              <div class="plan-chart-head">
                <div>
                  <strong>各学案进度对比</strong>
                  <p class="section-note">按学案查看已完成 / 待完成进度，快速定位推进较慢的学案。</p>
                </div>
              </div>
            </template>
            <n-empty v-if="!plans.length" description="暂无可对比的学案。" />
            <AppChart v-else :height="260" :option="planProgressOption" />
          </SaPanel>
        </div>

        <SaPanel title="学案列表">
          <SaDataTable
            :data="plans"
            empty-text="暂无学案数据"
            row-key="id"
            :scroll-x="1400"
            stripe
            @row-click="handleRowClick"
          >
            <SaTableColumn label="学案" min-width="360">
              <template #default="{ row }">
                <div class="plan-title-cell">
                  <div class="plan-title-cell__thumb-wrap">
                    <img
                      v-if="row.preview_image_url"
                      :src="row.preview_image_url"
                      alt="学案缩略图"
                      class="plan-title-cell__thumb"
                    />
                    <div v-else class="plan-title-cell__thumb plan-title-cell__thumb--placeholder">
                      {{ row.title.slice(0, 1) || '学' }}
                    </div>
                  </div>
                  <div class="plan-title-cell__meta">
                    <p class="plan-title-cell__title">{{ row.title }}</p>
                    <p class="plan-title-cell__desc">{{ row.content_excerpt || '当前学案暂未添加导读摘要' }}</p>
                  </div>
                </div>
              </template>
            </SaTableColumn>
          <SaTableColumn label="状态" min-width="110">
            <template #default="{ row }">
              <n-tag round :type="planStatusType(row.status)">{{ planStatusLabel(row.status) }}</n-tag>
            </template>
          </SaTableColumn>
          <SaTableColumn label="绑定课次" min-width="190">
            <template #default="{ row }">
              {{ planLessonDisplayLabel(row) }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="所属单元" min-width="220">
            <template #default="{ row }">
              {{ row.lesson?.unit_title || '暂未绑定' }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="发布时间" min-width="120" prop="assigned_date" />
          <SaTableColumn label="任务数" min-width="88" prop="task_count" />
          <SaTableColumn label="待完成" min-width="88">
            <template #default="{ row }">
              {{ row.progress.pending_count }}
            </template>
          </SaTableColumn>
          <SaTableColumn label="操作" min-width="220">
            <template #default="{ row }">
              <div class="chip-row">
                <n-button text type="primary" @click.stop="openEditDialog(row.id)">进入编辑</n-button>
                <n-button
                  text
                  type="warning"
                  :disabled="!canEditPlan(row)"
                  @click.stop="openEditDialog(row.id)"
                >
                  快速编辑
                </n-button>
                <n-button
                  v-if="row.status === 'draft'"
                  text
                  type="success"
                  :disabled="!row.lesson"
                  @click.stop="publishPlan(row.id)"
                >
                  发布
                </n-button>
                <n-button
                  text
                  type="error"
                  :disabled="!canEditPlan(row)"
                  :loading="deletingPlanId === row.id"
                  @click.stop="deletePlan(row.id)"
                >
                  删除
                </n-button>
              </div>
            </template>
          </SaTableColumn>
          </SaDataTable>
        </SaPanel>
    </div>
    <SaPanel
      v-if="!isLoading && isEditorRoute && editorVisible"
      id="plan-editor-card"
      body-class="plan-editor-body"
      panel-class="plan-editor-card"
    >
      <template #header>
        <div class="info-row">
          <div class="plan-editor-card__header">
            <strong>{{ editingPlanId ? '编辑学案' : '新建学案' }}</strong>
            <p class="section-note">
              {{
                editingPlanId
                  ? '可以直接在当前页面修改学案导读、任务与资源，保存后立即同步。'
                  : '可以先不绑定课次保存草稿；绑定课次后即可继续发布或开课。'
              }}
            </p>
          </div>
          <div class="chip-row">
            <n-tag round type="info">{{ editingPlanId ? '编辑中' : '新建中' }}</n-tag>
            <n-tag v-if="editingPlanId && selectedPlanDetail?.lesson" round>
              {{ selectedPlanDetail.lesson?.title }}
            </n-tag>
            <n-tag v-else-if="editingPlanId && selectedPlanDetail" round type="warning">未绑定课次</n-tag>
            <n-tag v-if="hasUnsavedChanges" round type="warning">未保存</n-tag>
          </div>
        </div>
      </template>
      <n-form label-placement="top">
        <div class="plan-form-grid">
          <n-form-item label="学案标题">
            <n-input v-model:value="planForm.title" maxlength="120" placeholder="例如：八下第一单元 第4课 智能感知体验" />
          </n-form-item>
          <n-form-item label="发布日期">
            <n-date-picker
              v-model:formatted-value="planForm.assigned_date"
              class="full-width"
              format="yyyy-MM-dd"
              type="date"
              value-format="yyyy-MM-dd"
            />
          </n-form-item>
          <n-form-item label="保存状态">
            <n-select v-model:value="planForm.status" class="full-width" :options="planStatusOptions" />
          </n-form-item>
        </div>

        <n-form-item label="绑定课次">
          <n-select
            v-model:value="planForm.lesson_id"
            class="full-width"
            clearable
            filterable
            :options="lessonSelectOptions"
            placeholder="可暂不选择课次"
          />
          <p class="section-note">
            {{
              planForm.lesson_id
                ? '已绑定课次，保存后可以发布并用于开课。'
                : '暂不绑定课次也可以保存草稿；绑定课次后才能发布、开课和进入学生端。'
            }}
          </p>
        </n-form-item>

        <div class="dialog-task-head editor-task-toolbar">
          <div>
            <h3>学案导读与任务配置</h3>
            <p class="section-note">按“学案导读、任务 1、任务 2...”逐项配置，减少来回跳转。</p>
          </div>
          <div class="chip-row">
            <n-button secondary @click="addTaskRow">新增空白任务</n-button>
            <TaskTemplatePickerDropdown
              :custom-task-templates-loading="customTaskTemplatesLoading"
              :custom-task-templates="customTaskTemplates"
              :dropdown-pinned-custom-task-templates="dropdownPinnedCustomTaskTemplates"
              :dropdown-recent-custom-task-templates="dropdownRecentCustomTaskTemplates"
              :custom-task-template-dropdown-groups="customTaskTemplateDropdownGroups"
              :task-type-label="taskTypeLabel"
              :handle-task-template-command="handleTaskTemplateCommand"
            />
            <n-button secondary @click="openTaskTemplateLibrary">模板库</n-button>
          </div>
        </div>

        <n-tabs v-model:value="editorTaskTabKey" class="editor-tabs editor-tabs--unified" type="card">
          <n-tab-pane name="content" tab="学案导读" display-directive="show">
            <div class="dialog-task-head">
              <div>
                <h3>学案导读</h3>
                <p class="section-note">使用 CKEditor 富文本编辑；如需改源码，可在编辑器工具栏里切换源码视图。</p>
              </div>
              <div class="chip-row">
                <n-button :loading="generatingPlanHtml" secondary @click="generatePlanHtmlDraft">AI 生成导读初稿</n-button>
              </div>
            </div>
            <div class="content-mode-panel">
              <RichTextEditor
                v-model="planForm.content"
                :min-height="320"
                placeholder="填写学案导读、课堂流程、重点提示、参考链接等。"
              />
            </div>
          </n-tab-pane>

          <n-tab-pane
            v-for="(task, index) in planForm.tasks"
            :key="task.key"
            :tab="taskEditorTabTitle(task, index)"
            :name="`task:${task.key}`"
            display-directive="show:lazy"
          >
            <LessonPlanTaskEditorCard
              :task="task"
              :index="index"
              :task-count="planForm.tasks.length"
              :generating-task-html-key="generatingTaskHtmlKey"
              :task-type-label="taskTypeLabel"
              :task-template-button-label="taskTemplateButtonLabel"
              :is-task-scope-fixed="isTaskScopeFixed"
              :can-upload-task-assets="canUploadTaskAssets"
              :task-asset-generation-key="taskAssetGenerationKey"
              :task-description-generation-key="taskDescriptionGenerationKey"
              :asset-bindings="taskAssetBindings"
              :data-submit-bindings="taskDataSubmitBindings"
              :move-task-row="moveTaskRow"
              :copy-task-row="copyTaskRow"
              :remove-task-row="removeTaskRow"
              :open-save-task-template-dialog="openSaveTaskTemplateDialog"
              :handle-task-type-change="handleTaskTypeChange"
              :generate-task-description-draft="generateTaskDescriptionDraft"
            />
          </n-tab-pane>
        </n-tabs>

      </n-form>

      <n-alert
        v-if="errorMessage"
        class="editor-save-alert"
        :closable="false"
        :title="errorMessage"
        type="error"
      />

      <div class="plan-editor-actions">
        <div class="chip-row">
          <n-button @click="cancelPlanEditing">
            {{ editingPlanId ? '重置修改' : '取消新建' }}
          </n-button>
          <n-button :loading="isSavingPlan" type="primary" @click="savePlan">
            {{ editingPlanId ? '保存修改' : '创建学案' }}
          </n-button>
        </div>
      </div>
    </SaPanel>

    <TaskHtmlPromptDialog
      v-model="taskHtmlPromptDialogVisible"
      v-model:dialog-state="taskHtmlPromptDialogState"
      :title="taskHtmlPromptDialogTitle"
      :task="taskHtmlPromptDialogTask"
      :current-templates="currentTaskHtmlPromptTemplates"
      :selected-template-description="selectedTaskHtmlPromptTemplateDescription"
      :preview-text="taskHtmlPromptPreview"
      :is-generating="generatingTaskHtmlKey === currentTaskHtmlPromptGenerationKey"
      :is-continuing="continuingTaskHtmlPrompt"
      :generation-status="taskHtmlPromptGenerationStatus"
      :generated-html-applied="taskHtmlPromptGeneratedHtmlApplied"
      v-model:followup-prompt="taskHtmlPromptFollowupPrompt"
      :conversation="taskHtmlPromptConversation"
      :assistant-bootstrap-loading="taskHtmlPromptAssistantBootstrapLoading"
      :assistant-bootstrap-error="taskHtmlPromptAssistantBootstrapError"
      :assistant-providers="taskHtmlPromptAssistantBootstrap?.providers || []"
      :assistant-knowledge-bases="taskHtmlPromptGeneralKnowledgeBases"
      :assistant-active-provider="taskHtmlPromptAssistantBootstrap?.active_provider || null"
      :stream-capability-enabled="taskHtmlPromptStreamCapabilityEnabled"
      @submit="submitTaskHtmlPromptDialog"
      @continue="continueTaskHtmlPromptDialog"
      @copy="copyTaskHtmlPromptGeneratedSource"
      @apply="applyTaskHtmlPromptGeneratedSource"
    />

    <TaskTemplateSaveDialog
      v-model="taskTemplateDialogVisible"
      v-model:form="taskTemplateForm"
      :title="taskTemplateDialogTitle"
      :source-task="taskTemplateSourceTask"
      :custom-templates="customTaskTemplates"
      :group-options="taskTemplateGroupOptions"
      :saving="savingTaskTemplate"
      :save-button-label="taskTemplateSaveButtonLabel"
      :task-type-label="taskTypeLabel"
      @mode-change="handleTaskTemplateModeChange"
      @target-change="handleTaskTemplateTargetChange"
      @save="saveCurrentTaskAsTemplate"
    />

    <TaskTemplateLibraryDialog
      v-model="taskTemplateLibraryVisible"
      v-model:filter="taskTemplateLibraryFilter"
      v-model:batch-group-name="taskTemplateBatchGroupName"
      :loading="customTaskTemplatesLoading"
      :templates="customTaskTemplates"
      :filtered-templates="filteredCustomTaskTemplates"
      :pinned-templates="pinnedCustomTaskTemplates"
      :recent-templates="recentCustomTaskTemplates"
      :group-sections="filteredTaskTemplateGroupSections"
      :group-options="taskTemplateGroupOptions"
      :selected-ids="selectedCustomTaskTemplateIds"
      :selected-filtered-count="selectedFilteredCustomTaskTemplateCount"
      :all-filtered-selected="allFilteredCustomTaskTemplatesSelected"
      :batch-busy="taskTemplateBatchBusy"
      :batch-updating-groups="batchUpdatingTaskTemplateGroups"
      :batch-updating-pins="batchUpdatingTaskTemplatePins"
      :sorting-task-templates="sortingTaskTemplates"
      :deleting-task-template-id="deletingTaskTemplateId"
      :dragging-task-template-id="draggingTaskTemplateId"
      :drag-over-task-template-id="dragOverTaskTemplateId"
      :drag-over-task-template-group-key="dragOverTaskTemplateGroupKey"
      :task-template-group-drop-key="taskTemplateGroupDropKey"
      :task-template-id-list="taskTemplateIdList"
      :task-type-label="taskTypeLabel"
      :format-task-template-updated-at="formatTaskTemplateUpdatedAt"
      :rich-text-to-excerpt="richTextToExcerpt"
      :is-template-selected="isCustomTaskTemplateSelected"
      :set-template-selected="setCustomTaskTemplateSelected"
      :toggle-selection-for-list="toggleCustomTaskTemplateSelectionForList"
      :are-all-selected="areAllCustomTaskTemplatesSelected"
      :select-all-filtered="selectAllFilteredCustomTaskTemplates"
      :clear-selected="clearSelectedCustomTaskTemplates"
      :apply-batch-group="applyBatchTaskTemplateGroup"
      :clear-batch-group="clearBatchTaskTemplateGroup"
      :apply-batch-pinned="applyBatchTaskTemplatePinned"
      :handle-group-drag-over="handleTaskTemplateGroupDragOver"
      :handle-group-drop="handleTaskTemplateGroupDrop"
      :handle-drag-over="handleTaskTemplateDragOver"
      :handle-drop="handleTaskTemplateDrop"
      :handle-drag-start="handleTaskTemplateDragStart"
      :handle-drag-end="handleTaskTemplateDragEnd"
      :can-move="canMoveCustomTaskTemplate"
      :move-template="moveCustomTaskTemplate"
      :apply-template="applyCustomTaskTemplate"
      :edit-template="editCustomTaskTemplate"
      :toggle-pinned="toggleCustomTaskTemplatePinned"
      :delete-template="deleteCustomTaskTemplate"
    />

    <StudentViewPreviewDrawer
      v-model:show="studentPreviewVisible"
      :initial-task-key="studentPreviewTaskKey"
      :plan="studentPreviewPlan"
      :refreshable="false"
      :token="authStore.token || null"
    />
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NDatePicker, NEmpty, NForm, NFormItem, NInput, NSelect, NSkeleton, NTabPane, NTabs, NTag } from 'naive-ui';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import RichTextEditor from '@/components/RichTextEditor.vue';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { streamCompanionReply } from '@/utils/companionStream';
import { richTextToExcerpt, richTextToPlainText } from '@/utils/richText';
import TaskHtmlPromptDialog from './components/TaskHtmlPromptDialog.vue';
import LessonPlanTaskEditorCard from './components/LessonPlanTaskEditorCard.vue';
import StudentViewPreviewDrawer from './components/student-view/StudentViewPreviewDrawer.vue';
import {
  buildStudentPreviewPlanFromForm,
  collectStudentPreviewResources,
} from './components/student-view/studentViewPreview.utils';
import type { StudentPreviewPlan } from './components/student-view/studentViewPreview.types';
import TaskTemplatePickerDropdown from './components/TaskTemplatePickerDropdown.vue';
import TaskTemplateLibraryDialog from './components/TaskTemplateLibraryDialog.vue';
import TaskTemplateSaveDialog from './components/TaskTemplateSaveDialog.vue';
import { taskHtmlPromptTemplateOptions } from './lessonPlan.constants';
import { useLessonPlanEditorState } from './composables/useLessonPlanEditorState';
import { useLessonPlanTaskRows } from './composables/useLessonPlanTaskRows';
import { useTaskPreviewAssets } from './composables/useTaskPreviewAssets';
import { useTaskTemplateLibrary } from './composables/useTaskTemplateLibrary';
import {
  buildDataSubmitFormStarterHtml,
  buildDataSubmitVisualizationStarterHtml,
  buildSuggestedTaskTemplateName,
  buildSuggestedTaskTemplateSummary,
  buildTaskConfigPayload,
  buildTaskTemplateConfigPayload,
  buildWebTaskStarterHtml,
  createTaskFromCustomTemplate as createTaskFromCustomTemplatePreset,
  createTaskFromTemplate as createTaskFromTemplatePreset,
  defaultTaskHtmlPromptTemplateId,
  isTaskScopeFixed,
  normalizeHtmlValue,
  planStatusLabel,
  planStatusType,
  taskAssetGenerationKey,
  taskAssetSlotLabel,
  taskDescriptionGenerationKey,
  taskEditorTabTitle,
  taskTypeLabel,
} from './lessonPlanTask.utils';
import type {
  CustomTaskTemplate,
  CurriculumBook,
  LessonOptionGroup,
  PlanDetail,
  PlanFormTask,
  PlanSummary,
  TaskAssetEditorBindings,
  TaskAssetSlot,
  TaskDataSubmitEndpointBindings,
  TaskHtmlPromptAssistantBootstrap,
  TaskHtmlPromptBuildOptions,
  TaskHtmlPromptConversationMessage,
  TaskHtmlPromptDialogState,
  TaskHtmlPromptGenerationStatus,
  TaskSlotEditorTab,
  TaskTemplatePresetId,
} from './lessonPlan.types';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();
const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const AI_PROVIDER_CONFIG_UPDATED_EVENT = 'learnsite:ai-provider-config-updated';
const ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT = 'learnsite:assistant-runtime-config-updated';

function generateTaskEndpointToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildAbsoluteApiUrl(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  const apiRoot = new URL(apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`, window.location.origin);
  if (normalized.startsWith('/')) {
    return new URL(normalized, apiRoot.origin).toString();
  }
  return new URL(normalized.replace(/^\/+/, ''), apiRoot).toString();
}

const plans = ref<PlanSummary[]>([]);
const curriculumBooks = ref<CurriculumBook[]>([]);
const selectedPlanDetail = ref<PlanDetail | null>(null);
const isLoading = ref(true);
const isSavingPlan = ref(false);
const publishingPlanId = ref<number | null>(null);
const deletingPlanId = ref<number | null>(null);
const errorMessage = ref('');
const generatingPlanHtml = ref(false);
const generatingTaskHtmlKey = ref<string | null>(null);
const taskHtmlPromptDialogVisible = ref(false);
const taskHtmlPromptSelections = ref<Record<TaskAssetSlot, string>>({
  web: 'web_interactive_guide',
  data_submit_form: 'data_submit_form_basic',
  data_submit_visualization: 'data_submit_visualization_dashboard',
});
const taskHtmlPromptCustomizations = ref<Record<TaskAssetSlot, string>>({
  web: '',
  data_submit_form: '',
  data_submit_visualization: '',
});
const taskHtmlPromptFollowupPrompt = ref('');
const taskHtmlPromptConversation = ref<TaskHtmlPromptConversationMessage[]>([]);
const continuingTaskHtmlPrompt = ref(false);
const taskHtmlPromptDialogState = ref<TaskHtmlPromptDialogState>({
  task_key: '',
  slot: 'web',
  template_id: 'web_interactive_guide',
  custom_prompt: '',
  provider_id: null,
  stream_enabled: true,
  thinking_enabled: false,
  knowledge_base_ids: [],
});
const taskHtmlDraftRetryCount = 1;
const reservingTaskIdKeys = ref<string[]>([]);
const reservingTaskIdPromises = new Map<string, Promise<number | null>>();
const taskHtmlPromptAssistantBootstrap = ref<TaskHtmlPromptAssistantBootstrap | null>(null);
const taskHtmlPromptAssistantBootstrapLoading = ref(false);
const taskHtmlPromptAssistantBootstrapError = ref('');

type TaskIdReservationResponse = {
  task_ids: number[];
};

type AssistantHtmlDraftResponse = {
  reply?: {
    content?: string;
    provider_name?: string | null;
    provider_mode?: string | null;
    warning?: string | null;
    reasoning_content?: string | null;
  };
  active_provider?: TaskHtmlPromptAssistantBootstrap['active_provider'];
};

type HtmlDraftRequestOptions = {
  remainingRetries?: number;
  attempt?: number;
  totalAttempts?: number;
  onStatusChange?: (status: TaskHtmlPromptGenerationStatus) => void;
  providerId?: number | null;
  streamEnabled?: boolean;
  thinkingEnabled?: boolean;
  knowledgeBaseIds?: string[];
  conversation?: TaskHtmlPromptConversationMessage[];
};

function createTaskHtmlPromptGenerationStatus(
  overrides: Partial<TaskHtmlPromptGenerationStatus> = {}
): TaskHtmlPromptGenerationStatus {
  return {
    state: 'idle',
    provider_name: '',
    provider_mode: '',
    warning: '',
    error_message: '',
    html_source: '',
    attempt: 0,
    total_attempts: taskHtmlDraftRetryCount + 1,
    stream_enabled: taskHtmlPromptDialogState.value.stream_enabled,
    thinking_enabled: taskHtmlPromptDialogState.value.thinking_enabled,
    received_chars: 0,
    ...overrides,
  };
}

const taskHtmlPromptGenerationStatus = ref<TaskHtmlPromptGenerationStatus>(
  createTaskHtmlPromptGenerationStatus()
);

const {
  editorVisible,
  editingPlanId,
  editorActiveTab,
  activeTaskEditorKey,
  planForm,
  currentEditorSnapshot,
  hasUnsavedChanges,
  normalizeTaskConfigState,
  createEmptyTask,
  duplicateTaskTitle,
  cloneTaskConfigState,
  clearLessonPlanDraft,
  persistCurrentEditorDraft,
  clearDraftAutoSaveTimer,
  scheduleDraftAutoSave,
  markEditorCommitted,
  resetPlanForm: resetPlanFormState,
  activateBlankPlanEditor: activateBlankPlanEditorState,
  activatePlanEditor: activatePlanEditorState,
  cancelPlanEditing: cancelPlanEditingState,
} = useLessonPlanEditorState({
  normalizeTaskSubmissionScope,
  generateTaskEndpointToken,
  ensureDataSubmitTaskConfig,
});

const {
  appendTaskToEditor,
  addTaskRow,
  handleTaskTabDragEnd,
  moveTaskRow,
  copyTaskRow,
  removeTaskRow,
} = useLessonPlanTaskRows({
  planForm,
  editorActiveTab,
  activeTaskEditorKey,
  createEmptyTask,
  cloneTaskConfigState,
  duplicateTaskTitle,
  ensureDataSubmitTaskConfig,
  ensureTaskIdReserved,
  seedTaskTypeStarterSources,
  onTaskCopyWithReset: () => {
    ElMessage.warning('已复制任务结构，但资源文件和接口地址不会自动复用，请按需重新上传或生成。');
  },
  onTaskCopied: () => {
    ElMessage.success('任务已复制');
  },
});

const {
  customTaskTemplates,
  customTaskTemplatesLoading,
  taskTemplateDialogVisible,
  taskTemplateLibraryVisible,
  savingTaskTemplate,
  deletingTaskTemplateId,
  sortingTaskTemplates,
  draggingTaskTemplateId,
  dragOverTaskTemplateId,
  dragOverTaskTemplateGroupKey,
  selectedCustomTaskTemplateIds,
  taskTemplateBatchGroupName,
  batchUpdatingTaskTemplateGroups,
  batchUpdatingTaskTemplatePins,
  taskTemplateLibraryFilter,
  taskTemplateForm,
  taskTemplateSourceTask,
  taskTemplateDialogTitle,
  taskTemplateSaveButtonLabel,
  taskTemplateGroupOptions,
  filteredCustomTaskTemplates,
  filteredTaskTemplateGroupSections,
  selectedFilteredCustomTaskTemplateCount,
  taskTemplateBatchBusy,
  allFilteredCustomTaskTemplatesSelected,
  pinnedCustomTaskTemplates,
  recentCustomTaskTemplates,
  dropdownPinnedCustomTaskTemplates,
  dropdownRecentCustomTaskTemplates,
  customTaskTemplateDropdownGroups,
  loadCustomTaskTemplates,
  taskTemplateGroupDropKey,
  taskTemplateIdList,
  isCustomTaskTemplateSelected,
  setCustomTaskTemplateSelected,
  toggleCustomTaskTemplateSelectionForList,
  areAllCustomTaskTemplatesSelected,
  selectAllFilteredCustomTaskTemplates,
  clearSelectedCustomTaskTemplates,
  canMoveCustomTaskTemplate,
  moveCustomTaskTemplate,
  handleTaskTemplateDragStart,
  handleTaskTemplateDragOver,
  handleTaskTemplateDrop,
  handleTaskTemplateGroupDragOver,
  handleTaskTemplateGroupDrop,
  handleTaskTemplateDragEnd,
  applyBatchTaskTemplateGroup,
  clearBatchTaskTemplateGroup,
  applyBatchTaskTemplatePinned,
  taskTemplateButtonLabel,
  formatTaskTemplateUpdatedAt,
  openTaskTemplateLibrary,
  openSaveTaskTemplateDialog,
  handleTaskTemplateModeChange,
  handleTaskTemplateTargetChange,
  saveCurrentTaskAsTemplate,
  applyCustomTaskTemplate,
  editCustomTaskTemplate,
  toggleCustomTaskTemplatePinned,
  deleteCustomTaskTemplate,
  handleTaskTemplateCommand,
} = useTaskTemplateLibrary({
  authToken: computed(() => authStore.token),
  errorMessage,
  planForm,
  createTaskFromTemplate,
  createTaskFromCustomTemplate,
  appendTaskToEditor,
  buildSuggestedTaskTemplateName,
  buildSuggestedTaskTemplateSummary,
  buildTaskTemplateConfigPayload,
  normalizeTaskSubmissionScope,
  normalizeHtmlValue,
  taskTypeLabel,
  isDialogCancelled,
});

const {
  taskAssetInputId,
  openTaskAssetPicker,
  taskPreviewFrameKey,
  taskAssetPreviewUrl,
  hasTaskInlinePreview,
  taskPreviewFeedback,
  taskPreviewDisplayDetail,
  taskPreviewDetailToggleLabel,
  toggleTaskPreviewDetail,
  copyTaskPreviewDetail,
  retryTaskPreview,
  handleTaskPreviewLoad,
  handleTaskPreviewError,
  taskInlinePreviewSrcdoc,
  handleTaskAssetChange,
  uploadTaskHtmlSource,
} = useTaskPreviewAssets({
  authToken: computed(() => authStore.token),
  apiBaseUrl,
  errorMessage,
  generatingTaskHtmlKey,
  getTaskAssetEntryPath,
  setTaskAssetEntryPath,
  getTaskHtmlSource,
  setTaskHtmlSource,
  taskAssetGenerationKey,
  buildAbsoluteApiUrl,
  copyPlainText,
  requestHtmlDraft,
  buildTaskHtmlPrompt,
  taskDataSubmitApiPath,
  taskDataSubmitRecordsPath,
  canUploadTaskAssets,
  mergeTaskConfigFromServer,
  revealTaskPreview,
  isTaskPersisted,
});

const taskAssetBindings: TaskAssetEditorBindings = {
  getTaskAssetEntryPath,
  setTaskAssetEntryPath,
  getTaskHtmlSource,
  setTaskHtmlSource,
  taskAssetInputId,
  openTaskAssetPicker,
  handleTaskAssetChange,
  openTaskHtmlPromptDialog,
  uploadTaskHtmlSource,
  taskPreviewFeedback,
  taskPreviewDisplayDetail,
  taskPreviewDetailToggleLabel,
  hasTaskInlinePreview,
  taskInlinePreviewSrcdoc,
  taskAssetPreviewUrl,
  taskPreviewFrameKey,
  toggleTaskPreviewDetail,
  copyTaskPreviewDetail,
  retryTaskPreview,
  handleTaskPreviewLoad,
  handleTaskPreviewError,
};

const taskDataSubmitBindings: TaskDataSubmitEndpointBindings = {
  copyTaskDataSubmitEndpoint,
  taskDataSubmitPromptApiPath,
  taskDataSubmitPromptRecordsPath,
  taskDataSubmitEndpointTagType,
  taskDataSubmitEndpointStatusLabel,
  taskDataSubmitAlertTitle,
  taskDataSubmitAlertDescription,
};

const studentPreviewVisible = ref(false);
const studentPreviewTaskKey = ref<string | null>(null);

/** 学生端预览用的课次信息：优先取已保存学案，其次按当前选择的课次在课程体系里查 */
const studentPreviewLessonMeta = computed(() => {
  const lessonId = planForm.value.lesson_id;
  const detailLesson = selectedPlanDetail.value?.lesson;
  if (detailLesson && (!lessonId || detailLesson.id === lessonId)) {
    return {
      bookTitle: detailLesson.book_name || '',
      unitTitle: detailLesson.unit_title || '',
      lessonTitle: detailLesson.title || '',
    };
  }
  if (lessonId) {
    for (const book of curriculumBooks.value) {
      for (const unit of book.units) {
        const hit = unit.lessons.find((lesson) => lesson.id === lessonId);
        if (hit) {
          return { bookTitle: book.name, unitTitle: unit.title, lessonTitle: hit.title };
        }
      }
    }
  }
  return { bookTitle: '', unitTitle: '', lessonTitle: '' };
});

const studentPreviewPlan = computed<StudentPreviewPlan | null>(() => {
  // 未打开预览时不构建（内联 srcdoc 拼接较重），避免每次表单输入都重复计算
  if (!studentPreviewVisible.value) {
    return null;
  }
  return buildStudentPreviewPlanFromForm({
    title: planForm.value.title,
    content: planForm.value.content,
    assignedDate: planForm.value.assigned_date,
    bookTitle: studentPreviewLessonMeta.value.bookTitle,
    unitTitle: studentPreviewLessonMeta.value.unitTitle,
    lessonTitle: studentPreviewLessonMeta.value.lessonTitle,
    tasks: planForm.value.tasks,
    assetBindings: taskAssetBindings,
    resourcesByTaskId: collectStudentPreviewResources(selectedPlanDetail.value),
  });
});

/** 从当前编辑的任务标签直接跳到对应任务的学生视角 */
function openStudentPreview() {
  const activeTabKey = editorTaskTabKey.value;
  studentPreviewTaskKey.value = activeTabKey.startsWith('task:') ? activeTabKey.slice('task:'.length) : null;
  studentPreviewVisible.value = true;
}

const routePlanId = computed(() => {
  const parsed = Number(route.params.planId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
});
const isCreateRoute = computed(() => route.path === '/staff/lesson-plans/new');
const isEditorRoute = computed(() => isCreateRoute.value || routePlanId.value !== null);
const selectedPlanId = computed(() => routePlanId.value);

const pageTitle = computed(() => {
  if (!isEditorRoute.value) {
    return '教师学案管理';
  }
  if (isCreateRoute.value) {
    return '新建学案';
  }
  return planForm.value.title.trim() || selectedPlanDetail.value?.title || '编辑学案';
});
const heroSummaryTitle = computed(() => {
  if (!isEditorRoute.value) {
    return plans.value[0]?.title || '还没有学案';
  }
  if (isCreateRoute.value) {
    return planForm.value.title.trim() || '新建学案';
  }
  return planForm.value.title.trim() || selectedPlanDetail.value?.title || '学案编辑';
});
const heroSummarySubtitle = computed(() => {
  if (!isEditorRoute.value) {
    return plans.value[0]
      ? `${planLessonDisplayLabel(plans.value[0])} · ${planStatusLabel(plans.value[0].status)}`
      : '可以先创建草稿，再按需要绑定课次。';
  }
  if (isCreateRoute.value) {
    return '可先保存草稿；绑定课次后再发布或开课。';
  }
  if (selectedPlanDetail.value) {
    return `${planLessonDisplayLabel(selectedPlanDetail.value)} · ${planStatusLabel(selectedPlanDetail.value.status)}`;
  }
  return '正在加载学案详情...';
});

function planLessonDisplayLabel(plan: Pick<PlanSummary, 'lesson'>) {
  return plan.lesson?.title || '暂未绑定课次';
}

const totalTaskCount = computed(() => plans.value.reduce((sum, item) => sum + item.task_count, 0));
const totalPendingCount = computed(() =>
  plans.value.reduce((sum, item) => sum + item.progress.pending_count, 0)
);
const totalCompletedCount = computed(() =>
  plans.value.reduce((sum, item) => sum + item.progress.completed_count, 0)
);

const overallProgressOption = computed(() => {
  const pending = totalPendingCount.value;
  const completed = totalCompletedCount.value;
  const total = pending + completed;
  const rate = total ? Math.round((completed / total) * 100) : 0;

  return base({
    tooltip: tooltip('item'),
    legend: legend({ bottom: 0, top: 'auto' }),
    series: [
      {
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 12, borderColor: tokens.value.surface, borderWidth: 3 },
        label: { show: false },
        data: [
          { value: completed, name: '已完成', itemStyle: { color: palette.value[2] } },
          { value: pending, name: '待完成', itemStyle: { color: tokens.value.warning } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: `${rate}%`, fill: tokens.value.ink, fontSize: 28, fontWeight: 700 },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: { text: '完成率', fill: tokens.value.muted, fontSize: 12 },
      },
    ],
  });
});

const planProgressOption = computed(() => {
  const items = plans.value.slice(0, 10);
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(items.map((item) => item.title), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 72, overflow: 'truncate', interval: 0 },
    }),
    yAxis: axisY(),
    series: [
      {
        name: '已完成',
        type: 'bar',
        stack: 'plan',
        barMaxWidth: 30,
        itemStyle: { color: palette.value[2] },
        data: items.map((item) => item.progress.completed_count),
      },
      {
        name: '待完成',
        type: 'bar',
        stack: 'plan',
        barMaxWidth: 30,
        itemStyle: { color: tokens.value.warning, borderRadius: [6, 6, 0, 0] },
        data: items.map((item) => item.progress.pending_count),
      },
    ],
  });
});
const lessonOptions = computed<LessonOptionGroup[]>(() =>
  curriculumBooks.value.flatMap((book) =>
    book.units.map((unit) => ({
      label: `${book.name} · ${unit.title}`,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        label: `第 ${lesson.lesson_no} 课次 · ${lesson.title}`,
      })),
    }))
  )
);
const lessonSelectOptions = computed(() =>
  lessonOptions.value.map((group) => ({
    type: 'group' as const,
    key: group.label,
    label: group.label,
    children: group.lessons.map((lesson) => ({
      label: lesson.label,
      value: lesson.id,
    })),
  }))
);
const planStatusOptions = computed(() => [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published', disabled: !planForm.value.lesson_id },
  {
    label: '上课中',
    value: 'active',
    disabled: !editingPlanId.value || !planForm.value.lesson_id,
  },
  {
    label: '已完成',
    value: 'completed',
    disabled: !editingPlanId.value || !planForm.value.lesson_id,
  },
]);
const taskHtmlPromptDialogTask = computed(
  () => planForm.value.tasks.find((task) => task.key === taskHtmlPromptDialogState.value.task_key) || null
);
const persistedTaskIdSet = computed(() => {
  if (!editingPlanId.value || selectedPlanDetail.value?.id !== editingPlanId.value) {
    return new Set<number>();
  }
  return new Set(selectedPlanDetail.value.tasks.map((task) => task.id));
});
const currentTaskHtmlPromptTemplates = computed(() =>
  taskHtmlPromptTemplateOptions.filter((option) => option.slot === taskHtmlPromptDialogState.value.slot)
);
const selectedTaskHtmlPromptTemplate = computed(
  () =>
    currentTaskHtmlPromptTemplates.value.find((option) => option.id === taskHtmlPromptDialogState.value.template_id) ||
    currentTaskHtmlPromptTemplates.value[0] ||
    null
);
const taskHtmlPromptDialogTitle = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task) {
    return 'AI 网页生成';
  }
  return `${task.title.trim() || taskTypeLabel(task.task_type)} · ${taskAssetSlotLabel(taskHtmlPromptDialogState.value.slot)} AI 生成`;
});
const currentTaskHtmlPromptGenerationKey = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task) {
    return '';
  }
  return taskAssetGenerationKey(task, taskHtmlPromptDialogState.value.slot);
});
const selectedTaskHtmlPromptTemplateDescription = computed(
  () => selectedTaskHtmlPromptTemplate.value?.description || ''
);
const editorTaskTabKey = computed({
  get() {
    if (editorActiveTab.value === 'content') {
      return 'content';
    }
    return activeTaskEditorKey.value ? `task:${activeTaskEditorKey.value}` : 'content';
  },
  set(value: string) {
    if (value === 'content') {
      editorActiveTab.value = 'content';
      return;
    }
    if (!value.startsWith('task:')) {
      return;
    }
    const taskKey = value.slice(5);
    if (!taskKey) {
      return;
    }
    editorActiveTab.value = 'tasks';
    activeTaskEditorKey.value = taskKey;
  },
});
const taskHtmlPromptPreview = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task) {
    return '';
  }
  return buildTaskHtmlPrompt(task, taskHtmlPromptDialogState.value.slot, {
    template_prompt: selectedTaskHtmlPromptTemplate.value?.prompt,
    custom_prompt: taskHtmlPromptDialogState.value.custom_prompt,
  });
});
const taskHtmlPromptStreamCapabilityEnabled = computed(
  () => taskHtmlPromptAssistantBootstrap.value?.capabilities.streaming ?? true
);
const taskHtmlPromptGeneralKnowledgeBases = computed(() =>
  (taskHtmlPromptAssistantBootstrap.value?.knowledge_bases || []).filter((item) => item.scopes.includes('general'))
);
const taskHtmlPromptGeneratedHtmlApplied = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  const generatedHtml = taskHtmlPromptGenerationStatus.value.html_source.trim();
  if (!task || !generatedHtml) {
    return false;
  }
  return getTaskHtmlSource(task, taskHtmlPromptDialogState.value.slot).trim() === generatedHtml;
});

function resetTaskHtmlPromptGenerationStatus() {
  taskHtmlPromptGenerationStatus.value = createTaskHtmlPromptGenerationStatus();
}

function setTaskHtmlPromptGenerationStatus(status: Partial<TaskHtmlPromptGenerationStatus>) {
  taskHtmlPromptGenerationStatus.value = createTaskHtmlPromptGenerationStatus({
    ...taskHtmlPromptGenerationStatus.value,
    ...status,
  });
}

function nextTemplateSequence(taskType?: string) {
  if (!taskType) {
    return planForm.value.tasks.length + 1;
  }
  return planForm.value.tasks.filter((task) => task.task_type === taskType).length + 1;
}

function createTaskFromTemplate(templateId: TaskTemplatePresetId): PlanFormTask {
  return createTaskFromTemplatePreset(templateId, {
    createEmptyTask,
    nextTemplateSequence,
    normalizeTaskSubmissionScope,
    ensureDataSubmitTaskConfig,
  });
}

function createTaskFromCustomTemplate(
  template: CustomTaskTemplate,
  options?: {
    linkTemplate?: boolean;
  }
): PlanFormTask {
  return createTaskFromCustomTemplatePreset(
    template,
    {
      createEmptyTask,
      normalizeTaskSubmissionScope,
      normalizeTaskConfigState,
      ensureDataSubmitTaskConfig,
    },
    options
  );
}

function resetPlanForm() {
  resetPlanFormState();
  handleTaskTabDragEnd();
}

function activateBlankPlanEditor(options?: { skipDraftRestore?: boolean }) {
  activateBlankPlanEditorState(options);
  handleTaskTabDragEnd();
}

function normalizeEditorDataSubmitTaskSources() {
  planForm.value.tasks.forEach((task) => {
    syncDataSubmitTaskHtmlSources(task);
  });
}

function activatePlanEditor(plan: PlanDetail, options?: { skipDraftRestore?: boolean }) {
  activatePlanEditorState(plan, options);
  normalizeEditorDataSubmitTaskSources();
  handleTaskTabDragEnd();
}

function cancelPlanEditing() {
  cancelPlanEditingState(selectedPlanDetail.value);
  normalizeEditorDataSubmitTaskSources();
  handleTaskTabDragEnd();
}

function isTaskIdReservationPending(task: Pick<PlanFormTask, 'key'>) {
  return reservingTaskIdKeys.value.includes(task.key);
}

function isTaskPersisted(task: Pick<PlanFormTask, 'id'>) {
  return typeof task.id === 'number' && persistedTaskIdSet.value.has(task.id);
}

function canUploadTaskAssets(task: Pick<PlanFormTask, 'id'>) {
  return isTaskPersisted(task);
}

async function ensureTaskIdReserved(task: PlanFormTask) {
  if (task.task_type !== 'data_submit') {
    return task.id;
  }
  if (task.id) {
    ensureDataSubmitTaskConfig(task);
    return task.id;
  }
  if (!authStore.token) {
    return null;
  }

  const existingPromise = reservingTaskIdPromises.get(task.key);
  if (existingPromise) {
    return existingPromise;
  }

  const reservationPromise = (async () => {
    reservingTaskIdKeys.value = Array.from(new Set([...reservingTaskIdKeys.value, task.key]));
    const previousSubmitApiPath = taskDataSubmitApiPath(task);
    const previousRecordsApiPath = taskDataSubmitRecordsPath(task);
    try {
      const response = await apiPost<TaskIdReservationResponse>(
        '/lesson-plans/staff/task-ids/reserve',
        { count: 1 },
        authStore.token
      );
      const reservedId = response.task_ids[0] ?? null;
      if (reservedId) {
        task.id = reservedId;
        ensureDataSubmitTaskConfig(task);
        syncDataSubmitTaskHtmlSources(task, {
          previous_submit_api_path: previousSubmitApiPath,
          previous_records_api_path: previousRecordsApiPath,
          seed_if_empty: true,
        });
      }
      return reservedId;
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成任务接口失败';
      errorMessage.value = message;
      ElMessage.error(message);
      return null;
    } finally {
      reservingTaskIdKeys.value = reservingTaskIdKeys.value.filter((key) => key !== task.key);
      reservingTaskIdPromises.delete(task.key);
    }
  })();

  reservingTaskIdPromises.set(task.key, reservationPromise);
  return reservationPromise;
}

function taskDataSubmitPromptApiPath(task: PlanFormTask) {
  return taskDataSubmitApiPath(task);
}

function taskDataSubmitPromptRecordsPath(task: PlanFormTask) {
  return taskDataSubmitRecordsPath(task);
}

function taskDataSubmitEndpointStatusLabel(task: PlanFormTask) {
  if (isTaskIdReservationPending(task)) {
    return '生成中';
  }
  if (task.id) {
    return isTaskPersisted(task) ? '已启用' : '待保存';
  }
  return '未生成';
}

function taskDataSubmitEndpointTagType(task: PlanFormTask) {
  if (isTaskIdReservationPending(task)) {
    return 'info';
  }
  return task.id ? 'success' : 'warning';
}

function taskDataSubmitAlertTitle(task: PlanFormTask) {
  if (isTaskIdReservationPending(task)) {
    return '正在生成数据提交接口';
  }
  if (task.id && !isTaskPersisted(task)) {
    return '数据提交接口已预生成，保存学案后即可正式启用';
  }
  if (task.id) {
    return '数据提交接口已就绪，可直接生成网页并即时预览';
  }
  return '切换为数据提交任务后会自动生成正式接口地址';
}

function taskDataSubmitAlertDescription(task: PlanFormTask) {
  if (task.id && !isTaskPersisted(task)) {
    return '当前接口 ID 已预生成，可以先复制给 AI 生成学生提交页和可视化页；保存学案后学生即可正式访问。';
  }
  if (task.id) {
    return '接口已经可用，可直接复制给 AI 生成网页，或继续手动调整提交页与可视化页。';
  }
  return '切换到数据提交任务后，系统会自动生成提交接口与读取接口。';
}

function canEditPlan(plan: Pick<PlanSummary, 'status' | 'progress'>) {
  void plan;
  return true;
}

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

function normalizeTaskSubmissionScope(taskType: string, currentScope?: string) {
  if (isTaskScopeFixed(taskType)) {
    return 'individual';
  }
  return currentScope === 'group' ? 'group' : 'individual';
}

function rewriteDataSubmitApiUrls(htmlSource: string, submitApiPath: string, recordsApiPath: string) {
  if (!htmlSource.trim()) {
    return htmlSource;
  }

  let nextSource = htmlSource;
  if (recordsApiPath) {
    nextSource = nextSource.replace(
      /(?:https?:\/\/[^"'`\s<]+)?\/api\/v1\/tasks\/\d+\/data-submit\/[^"'`\s<]+\/records/g,
      recordsApiPath
    );
  }
  if (submitApiPath || recordsApiPath) {
    nextSource = nextSource.replace(
      /(?:https?:\/\/[^"'`\s<]+)?\/api\/v1\/tasks\/\d+\/data-submit\/[^"'`\s<]+/g,
      (matched) => {
        if (matched.endsWith('/records')) {
          return recordsApiPath || matched;
        }
        return submitApiPath || matched;
      }
    );
  }
  return nextSource;
}

function syncDataSubmitTaskHtmlSources(
  task: PlanFormTask,
  options?: {
    previous_submit_api_path?: string;
    previous_records_api_path?: string;
    seed_if_empty?: boolean;
  }
) {
  if (task.task_type !== 'data_submit' || !task.id) {
    return;
  }

  const title = task.title.trim() || taskTypeLabel(task.task_type) || '任务';
  const submitApiPath = taskDataSubmitApiPath(task);
  const recordsApiPath = taskDataSubmitRecordsPath(task);
  const replaceKnownPaths = (source: string) => {
    let nextSource = source;
    if (
      options?.previous_submit_api_path &&
      submitApiPath &&
      options.previous_submit_api_path !== submitApiPath
    ) {
      nextSource = nextSource.split(options.previous_submit_api_path).join(submitApiPath);
    }
    if (
      options?.previous_records_api_path &&
      recordsApiPath &&
      options.previous_records_api_path !== recordsApiPath
    ) {
      nextSource = nextSource.split(options.previous_records_api_path).join(recordsApiPath);
    }
    return rewriteDataSubmitApiUrls(nextSource, submitApiPath, recordsApiPath);
  };

  if (task.config.submit_html_source.trim()) {
    task.config.submit_html_source = replaceKnownPaths(task.config.submit_html_source);
  } else if (options?.seed_if_empty) {
    task.config.submit_html_source = buildDataSubmitFormStarterHtml(title, submitApiPath);
  }

  if (task.config.visualization_html_source.trim()) {
    task.config.visualization_html_source = replaceKnownPaths(task.config.visualization_html_source);
  } else if (options?.seed_if_empty) {
    task.config.visualization_html_source = buildDataSubmitVisualizationStarterHtml(title, recordsApiPath);
  }
}

function seedTaskTypeStarterSources(task: PlanFormTask) {
  const title = task.title.trim() || taskTypeLabel(task.task_type) || '任务';
  if (task.task_type === 'web_page' && !task.config.entry_html_source.trim()) {
    task.config.entry_html_source = buildWebTaskStarterHtml(title);
    task.config.entry_path = task.config.entry_path.trim() || 'index.html';
    return;
  }

  if (task.task_type === 'data_submit') {
    task.config.submit_entry_path = task.config.submit_entry_path.trim() || 'index.html';
    task.config.visualization_entry_path = task.config.visualization_entry_path.trim() || 'index.html';
    if (!task.id) {
      return;
    }
    if (!task.config.submit_html_source.trim()) {
      task.config.submit_html_source = buildDataSubmitFormStarterHtml(title, taskDataSubmitApiPath(task));
    }
    if (!task.config.visualization_html_source.trim()) {
      task.config.visualization_html_source = buildDataSubmitVisualizationStarterHtml(
        title,
        taskDataSubmitRecordsPath(task)
      );
    }
    syncDataSubmitTaskHtmlSources(task);
  }
}

async function handleTaskTypeChange(task: PlanFormTask) {
  task.submission_scope = normalizeTaskSubmissionScope(task.task_type, task.submission_scope);
  task.config = normalizeTaskConfigState(task.task_type, task.config);
  ensureDataSubmitTaskConfig(task);
  if (task.task_type === 'data_submit') {
    await ensureTaskIdReserved(task);
  }
  seedTaskTypeStarterSources(task);
}

function currentLessonLabel() {
  if (!planForm.value.lesson_id) {
    return '暂未绑定课次';
  }
  for (const book of curriculumBooks.value) {
    for (const unit of book.units) {
      for (const lesson of unit.lessons) {
        if (lesson.id === planForm.value.lesson_id) {
          return `${book.name} / ${unit.title} / 第 ${lesson.lesson_no} 课次 / ${lesson.title}`;
        }
      }
    }
  }
  return '';
}

function extractHtmlDraft(rawContent: string) {
  const trimmed = rawContent.trim();
  const fenced = rawContent.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function isRenderableHtmlDraft(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  return /<(?:!doctype\s+html|html|head|body|main|section|article|div|p|h[1-6]|form|table|svg|canvas|button|input|style|script)\b/i.test(
    normalized
  );
}

function buildHtmlDraftErrorMessage(providerMode: string | null | undefined, warning: string | null | undefined) {
  const parts = [
    providerMode === 'preview'
      ? 'AI 服务暂时返回了说明文本，而不是可渲染的 HTML 源码。'
      : 'AI 未返回可用的 HTML 内容。',
  ];
  const normalizedWarning = String(warning || '').trim();
  if (normalizedWarning) {
    parts.push(`上游提示：${normalizedWarning}`);
  }
  parts.push('请稍后重试，或缩短提示词后重新生成。');
  return parts.join(' ');
}

function resolveAssistantProviderName(response: AssistantHtmlDraftResponse) {
  const replyName = String(response.reply?.provider_name || '').trim();
  if (replyName) {
    return replyName;
  }
  return String(response.active_provider?.name || '').trim();
}

function copyTextWithFallback(value: string) {
  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  return copied;
}

async function copyPlainText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    ElMessage.warning(`${label}为空，暂时无法复制`);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalized);
    } else if (!copyTextWithFallback(normalized)) {
      throw new Error('clipboard fallback failed');
    }
    ElMessage.success(`${label}已复制`);
  } catch (error) {
    if (copyTextWithFallback(normalized)) {
      ElMessage.success(`${label}已复制`);
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `${label}复制失败`);
  }
}

function applyTaskHtmlPromptAssistantBootstrap(payload: TaskHtmlPromptAssistantBootstrap) {
  taskHtmlPromptAssistantBootstrap.value = payload;
  if (payload.capabilities.streaming === false && taskHtmlPromptDialogState.value.stream_enabled) {
    taskHtmlPromptDialogState.value = {
      ...taskHtmlPromptDialogState.value,
      stream_enabled: false,
    };
  }
  const providerIds = new Set(payload.providers.map((item) => item.id));
  if (taskHtmlPromptDialogState.value.provider_id !== null && !providerIds.has(taskHtmlPromptDialogState.value.provider_id)) {
    taskHtmlPromptDialogState.value = {
      ...taskHtmlPromptDialogState.value,
      provider_id: null,
    };
  }
  const availableKnowledgeBaseIds = new Set(
    payload.knowledge_bases.filter((item) => item.scopes.includes('general')).map((item) => item.id)
  );
  const currentKnowledgeBaseIds = taskHtmlPromptDialogState.value.knowledge_base_ids.filter(
    (item, index, source) => availableKnowledgeBaseIds.has(item) && source.indexOf(item) === index
  );
  taskHtmlPromptDialogState.value = {
    ...taskHtmlPromptDialogState.value,
    knowledge_base_ids: currentKnowledgeBaseIds.length
      ? currentKnowledgeBaseIds
      : payload.default_knowledge_base_ids.general.filter((item) => availableKnowledgeBaseIds.has(item)),
  };
}

async function loadTaskHtmlPromptAssistantBootstrap() {
  if (!authStore.token) {
    return;
  }

  taskHtmlPromptAssistantBootstrapLoading.value = true;
  taskHtmlPromptAssistantBootstrapError.value = '';
  try {
    const payload = await apiGet<TaskHtmlPromptAssistantBootstrap>('/assistants/companion/bootstrap', authStore.token);
    applyTaskHtmlPromptAssistantBootstrap(payload);
  } catch (error) {
    taskHtmlPromptAssistantBootstrapError.value =
      error instanceof Error ? error.message : '加载 AI 模型服务配置失败';
  } finally {
    taskHtmlPromptAssistantBootstrapLoading.value = false;
  }
}

async function ensureTaskHtmlPromptAssistantBootstrap() {
  if (taskHtmlPromptAssistantBootstrap.value || taskHtmlPromptAssistantBootstrapLoading.value) {
    return;
  }
  await loadTaskHtmlPromptAssistantBootstrap();
}

async function openTaskHtmlPromptDialog(task: PlanFormTask, slot: TaskAssetSlot) {
  void ensureTaskHtmlPromptAssistantBootstrap();
  if (task.task_type === 'data_submit') {
    await ensureTaskIdReserved(task);
    if (!task.id) {
      ElMessage.warning('接口地址生成失败，请稍后重试。');
      return;
    }
    seedTaskTypeStarterSources(task);
  }

  const templateId =
    taskHtmlPromptSelections.value[slot] ||
    taskHtmlPromptTemplateOptions.find((option) => option.slot === slot)?.id ||
    defaultTaskHtmlPromptTemplateId(slot);

  taskHtmlPromptDialogState.value = {
    task_key: task.key,
    slot,
    template_id: templateId,
    custom_prompt: taskHtmlPromptCustomizations.value[slot] || '',
    provider_id: taskHtmlPromptDialogState.value.provider_id,
    stream_enabled: taskHtmlPromptDialogState.value.stream_enabled && taskHtmlPromptStreamCapabilityEnabled.value,
    thinking_enabled: taskHtmlPromptDialogState.value.thinking_enabled,
    knowledge_base_ids: [...taskHtmlPromptDialogState.value.knowledge_base_ids],
  };
  taskHtmlPromptFollowupPrompt.value = '';
  taskHtmlPromptConversation.value = [];
  resetTaskHtmlPromptGenerationStatus();
  taskHtmlPromptDialogVisible.value = true;
}

async function copyTaskDataSubmitEndpoint(task: PlanFormTask, type: 'submit' | 'records') {
  await ensureTaskIdReserved(task);
  const value = type === 'submit' ? taskDataSubmitPromptApiPath(task) : taskDataSubmitPromptRecordsPath(task);
  await copyPlainText(value, type === 'submit' ? '提交接口地址' : '读取接口地址');
}

function getTaskAssetEntryPath(task: PlanFormTask, slot: TaskAssetSlot) {
  if (slot === 'web') {
    return task.config.entry_path.trim() || 'index.html';
  }
  if (slot === 'data_submit_form') {
    return task.config.submit_entry_path.trim() || 'index.html';
  }
  return task.config.visualization_entry_path.trim() || 'index.html';
}

function setTaskAssetEntryPath(task: PlanFormTask, slot: TaskAssetSlot, value: string) {
  if (slot === 'web') {
    task.config.entry_path = value;
    return;
  }
  if (slot === 'data_submit_form') {
    task.config.submit_entry_path = value;
    return;
  }
  task.config.visualization_entry_path = value;
}

function getTaskHtmlSource(task: PlanFormTask, slot: TaskAssetSlot) {
  if (slot === 'web') {
    return task.config.entry_html_source;
  }
  if (slot === 'data_submit_form') {
    return task.config.submit_html_source;
  }
  return task.config.visualization_html_source;
}

function getTaskSlotEditorTab(task: PlanFormTask, slot: TaskAssetSlot): TaskSlotEditorTab {
  if (slot === 'web') {
    return task.config.entry_editor_tab;
  }
  if (slot === 'data_submit_form') {
    return task.config.submit_editor_tab;
  }
  if (slot === 'data_submit_visualization') {
    return task.config.visualization_editor_tab;
  }
  return 'source';
}

function setTaskSlotEditorTab(task: PlanFormTask, slot: TaskAssetSlot, value: TaskSlotEditorTab) {
  if (slot === 'web') {
    task.config.entry_editor_tab = value;
    return;
  }
  if (slot === 'data_submit_form') {
    task.config.submit_editor_tab = value;
    return;
  }
  if (slot === 'data_submit_visualization') {
    task.config.visualization_editor_tab = value;
  }
}

function revealTaskPreview(task: PlanFormTask, slot: TaskAssetSlot) {
  setTaskSlotEditorTab(task, slot, 'preview');
}

function setTaskHtmlSource(task: PlanFormTask, slot: TaskAssetSlot, value: string) {
  if (slot === 'web') {
    task.config.entry_html_source = value;
    return;
  }
  if (slot === 'data_submit_form') {
    task.config.submit_html_source = value;
    return;
  }
  task.config.visualization_html_source = value;
}


function taskDataSubmitApiPath(task: PlanFormTask) {
  if (task.config.submit_api_path) {
    return buildAbsoluteApiUrl(task.config.submit_api_path);
  }
  if (!task.id || !task.config.endpoint_token.trim()) {
    return '';
  }
  return buildAbsoluteApiUrl(`tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}`);
}

function taskDataSubmitRecordsPath(task: PlanFormTask) {
  if (task.config.records_api_path) {
    return buildAbsoluteApiUrl(task.config.records_api_path);
  }
  if (!task.id || !task.config.endpoint_token.trim()) {
    return '';
  }
  return buildAbsoluteApiUrl(`tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}/records`);
}

function ensureDataSubmitTaskConfig(task: PlanFormTask) {
  if (task.task_type !== 'data_submit') {
    return;
  }
  if (!task.config.endpoint_token.trim()) {
    task.config.endpoint_token = generateTaskEndpointToken();
  }
  task.config.data_submit_active_tab =
    task.config.data_submit_active_tab === 'visualization' ? 'visualization' : 'submit';
  if (!task.id) {
    task.config.submit_api_path = '';
    task.config.records_api_path = '';
    return;
  }
  task.config.submit_api_path = buildAbsoluteApiUrl(
    `tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}`
  );
  task.config.records_api_path = buildAbsoluteApiUrl(
    `tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}/records`
  );
}

function mergeTaskConfigFromServer(task: PlanFormTask, serverConfig: Record<string, unknown> | null | undefined) {
  task.config = normalizeTaskConfigState(task.task_type, {
    ...task.config,
    ...(serverConfig || {}),
  });
  ensureDataSubmitTaskConfig(task);
}

function buildHtmlDraftAssistantRequestBody(
  prompt: string,
  options: Required<Pick<HtmlDraftRequestOptions, 'providerId' | 'thinkingEnabled' | 'knowledgeBaseIds'>> &
    Pick<HtmlDraftRequestOptions, 'conversation'>
) {
  return {
    scope: 'general',
    message: `${prompt}\n\n请直接返回 HTML 内容，不要附带解释、Markdown 代码块或额外说明。如需外部资源，请使用稳定 CDN。`,
    provider_id: options.providerId ?? undefined,
    thinking_enabled: options.thinkingEnabled,
    knowledge_base_ids: options.knowledgeBaseIds,
    conversation: (options.conversation || []).map((item) => ({
      role: item.role,
      content: item.content,
    })),
  };
}

async function requestHtmlDraftStream(
  prompt: string,
  options: {
    providerId: number | null;
    thinkingEnabled: boolean;
    knowledgeBaseIds: string[];
    conversation?: TaskHtmlPromptConversationMessage[];
    onToken?: (text: string) => void;
  }
) {
  if (!authStore.token) {
    throw new Error('请先登录后再使用 AI 生成功能');
  }

  let accumulatedText = '';

  const donePayload = await streamCompanionReply<AssistantHtmlDraftResponse>(
    `${apiBaseUrl}/assistants/companion/respond/stream`,
    {
      body: {
        ...buildHtmlDraftAssistantRequestBody(prompt, {
          providerId: options.providerId,
          thinkingEnabled: options.thinkingEnabled,
          knowledgeBaseIds: options.knowledgeBaseIds,
          conversation: options.conversation,
        }),
        stream: true,
      },
      token: authStore.token,
      onToken: (text) => {
        accumulatedText += text;
        options.onToken?.(accumulatedText);
      },
    }
  );

  return donePayload;
}

async function requestHtmlDraft(prompt: string, options: HtmlDraftRequestOptions = {}): Promise<string> {
  if (!authStore.token) {
    throw new Error('请先登录后再使用 AI 生成功能');
  }

  void ensureTaskHtmlPromptAssistantBootstrap();
  const remainingRetries = options.remainingRetries ?? taskHtmlDraftRetryCount;
  const attempt = options.attempt ?? 1;
  const totalAttempts = options.totalAttempts ?? remainingRetries + attempt;
  const providerId = options.providerId ?? taskHtmlPromptDialogState.value.provider_id ?? null;
  const streamEnabled =
    options.streamEnabled ?? (taskHtmlPromptDialogState.value.stream_enabled && taskHtmlPromptStreamCapabilityEnabled.value);
  const thinkingEnabled = options.thinkingEnabled ?? taskHtmlPromptDialogState.value.thinking_enabled;
  const knowledgeBaseIds = options.knowledgeBaseIds ?? [...taskHtmlPromptDialogState.value.knowledge_base_ids];
  const conversation = options.conversation || [];

  options.onStatusChange?.(
    createTaskHtmlPromptGenerationStatus({
      state: 'loading',
      provider_mode: 'pending',
      attempt,
      total_attempts: totalAttempts,
      stream_enabled: streamEnabled,
      thinking_enabled: thinkingEnabled,
      received_chars: 0,
      error_message: attempt > 1 ? '上一次返回的不是可渲染 HTML，正在自动重试。' : '',
    })
  );

  let response: AssistantHtmlDraftResponse;
  try {
    if (streamEnabled) {
      response = await requestHtmlDraftStream(prompt, {
        providerId,
        thinkingEnabled,
        knowledgeBaseIds,
        conversation,
        onToken: (text) => {
          const htmlSource = extractHtmlDraft(text) || text;
          options.onStatusChange?.(
            createTaskHtmlPromptGenerationStatus({
              ...taskHtmlPromptGenerationStatus.value,
              state: 'loading',
              provider_mode: taskHtmlPromptGenerationStatus.value.provider_mode || 'pending',
              attempt,
              total_attempts: totalAttempts,
              stream_enabled: streamEnabled,
              thinking_enabled: thinkingEnabled,
              received_chars: text.length,
              html_source: htmlSource,
            })
          );
        },
      });
    } else {
      response = await apiPost<AssistantHtmlDraftResponse>(
        '/assistants/companion/respond',
        buildHtmlDraftAssistantRequestBody(prompt, {
          providerId,
          thinkingEnabled,
          knowledgeBaseIds,
          conversation,
        }),
        authStore.token
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '请求 AI 生成失败';
    options.onStatusChange?.(
      createTaskHtmlPromptGenerationStatus({
        state: 'error',
        error_message: message,
        attempt,
        total_attempts: totalAttempts,
        stream_enabled: streamEnabled,
        thinking_enabled: thinkingEnabled,
      })
    );
    throw new Error(message);
  }

  if (taskHtmlPromptAssistantBootstrap.value) {
    taskHtmlPromptAssistantBootstrap.value.active_provider = response.active_provider || null;
    if (
      taskHtmlPromptDialogState.value.provider_id !== null &&
      response.active_provider?.id !== taskHtmlPromptDialogState.value.provider_id
    ) {
      taskHtmlPromptDialogState.value = {
        ...taskHtmlPromptDialogState.value,
        provider_id: response.active_provider?.id ?? null,
      };
    }
  }

  const providerName = resolveAssistantProviderName(response);
  const providerMode = String(response.reply?.provider_mode || '').trim();
  const warning = String(response.reply?.warning || '').trim();
  const html = extractHtmlDraft(response.reply?.content || '');
  if (isRenderableHtmlDraft(html)) {
    options.onStatusChange?.(
      createTaskHtmlPromptGenerationStatus({
        state: 'idle',
        provider_name: providerName,
        provider_mode: providerMode,
        warning,
        html_source: html,
        attempt,
        total_attempts: totalAttempts,
        stream_enabled: streamEnabled,
        thinking_enabled: thinkingEnabled,
        received_chars: html.length,
      })
    );
    return html;
  }

  if (remainingRetries > 0) {
    const retryPrompt = [
      prompt,
      '上一次返回的不是可渲染 HTML，请只输出 HTML 源码本身，不要输出解释、说明文本或额外对话。',
    ].join('\n\n');
    return requestHtmlDraft(retryPrompt, {
      remainingRetries: remainingRetries - 1,
      attempt: attempt + 1,
      totalAttempts,
      onStatusChange: options.onStatusChange,
      providerId,
      streamEnabled,
      thinkingEnabled,
      knowledgeBaseIds,
      conversation,
    });
  }

  const message = buildHtmlDraftErrorMessage(providerMode, warning);
  const failedHtmlSource = extractHtmlDraft(response.reply?.content || '') || String(response.reply?.content || '');
  options.onStatusChange?.(
    createTaskHtmlPromptGenerationStatus({
      state: 'error',
      provider_name: providerName,
      provider_mode: providerMode,
      warning,
      error_message: message,
      html_source: failedHtmlSource,
      attempt,
      total_attempts: totalAttempts,
      stream_enabled: streamEnabled,
      thinking_enabled: thinkingEnabled,
    })
  );
  throw new Error(message);
}

function buildPlanHtmlPrompt() {
  const lessonLabel = currentLessonLabel() || '未选择课次';
  const title = planForm.value.title.trim() || '未命名学案';
  return [
    `请生成一份教师学案导读 HTML，标题为：${title}。`,
    `绑定课次：${lessonLabel}。`,
    '内容用于教师后台学案导读区域，适合课堂导入、步骤说明、重点提示和资源链接。',
    '请直接返回可渲染的完整片段或 HTML 正文，不要添加代码围栏或额外解释。',
  ].join('\n');
}

function buildTaskDescriptionPrompt(task: PlanFormTask) {
  const displayTitle = task.title.trim() || `任务 ${task.key}`;
  return [
    `请为任务“${displayTitle}”生成一段简洁的 HTML 任务说明。`,
    `任务类型：${taskTypeLabel(task.task_type)}。`,
    '内容要适合直接展示给学生，包含任务目标、步骤提示和提交要求。',
    '请直接返回可渲染的 HTML 片段。',
  ].join('\n');
}

function buildTaskHtmlPrompt(task: PlanFormTask, slot: TaskAssetSlot, options?: TaskHtmlPromptBuildOptions) {
  const title = task.title.trim() || taskTypeLabel(task.task_type);
  const submitApiPath = taskDataSubmitPromptApiPath(task);
  const recordsApiPath = taskDataSubmitPromptRecordsPath(task);
  const runtimeHint =
    '生成页面时请只使用浏览器原生能力；如需请求数据，请使用原生 fetch 并处理失败情况。';
  const previewHint = '生成结果需要教师确认后写入当前任务的 HTML 源码区域，页面应能在 iframe 中独立运行。';
  const templatePrompt = options?.template_prompt?.trim();
  const customPrompt = richTextToPlainText(options?.custom_prompt).trim();

  if (slot === 'web') {
    const promptLines = [
      `请生成一个 HTML 网页，用于完成“${title}”这项网页任务。`,
      '优先使用浏览器原生能力；如需第三方资源，仅可使用稳定 CDN，并确保页面可直接运行。',
      runtimeHint,
      '请直接返回 HTML。',
    ];
    if (templatePrompt) {
      promptLines.splice(2, 0, `模板要求：${templatePrompt}`);
    }
    if (customPrompt) {
      promptLines.splice(promptLines.length - 1, 0, `补充要求：${customPrompt}`);
    }
    return promptLines.join('\n');
  }

  if (slot === 'data_submit_form') {
    const promptLines = [
      `请生成一个 HTML 提交页，用于完成“${title}”这项数据提交任务。`,
      `提交接口：${submitApiPath}` ,
      '页面需要把表单内容整理成 JSON，并通过 POST 提交到上述接口。',
      '请提供清晰的表单、提交反馈和必要说明，适合学生直接填写提交。',
      previewHint,
      '请直接返回 HTML。',
    ];
    if (templatePrompt) {
      promptLines.splice(3, 0, `模板要求：${templatePrompt}`);
    }
    if (customPrompt) {
      promptLines.splice(promptLines.length - 1, 0, `补充要求：${customPrompt}`);
    }
    return promptLines.join('\n');
  }

  const promptLines = [
    `请生成一个 HTML 可视化页，用于展示“${title}”这项数据提交任务的结果。`,
    `读取接口：${recordsApiPath}` ,
    '页面需要读取接口返回的 JSON 数据。',
    '请将结果做成清晰的统计展示，可使用表格、卡片、图表等形式，但不要依赖重量级框架。',
    '页面需要兼顾课堂投屏和教师后台预览场景。',
    previewHint,
    '请直接返回 HTML。',
  ];
  if (templatePrompt) {
    promptLines.splice(3, 0, `模板要求：${templatePrompt}`);
  }
  if (customPrompt) {
    promptLines.splice(promptLines.length - 1, 0, `补充要求：${customPrompt}`);
  }
  return promptLines.join('\n');
}

async function generatePlanHtmlDraft() {
  generatingPlanHtml.value = true;
  try {
    const html = await requestHtmlDraft(buildPlanHtmlPrompt());
    planForm.value.content = html;
    planForm.value.content_mode = 'visual';
    ElMessage.success('学案导读初稿已生成');
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成学案导读失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    generatingPlanHtml.value = false;
  }
}

async function generateTaskDescriptionDraft(task: PlanFormTask) {
  const loadingKey = taskDescriptionGenerationKey(task);
  generatingTaskHtmlKey.value = loadingKey;
  try {
    const html = await requestHtmlDraft(buildTaskDescriptionPrompt(task));
    task.description = html;
    task.description_mode = 'visual';
    ElMessage.success('任务说明初稿已生成');
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成任务说明失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    if (generatingTaskHtmlKey.value === loadingKey) {
      generatingTaskHtmlKey.value = null;
    }
  }
}


async function submitTaskHtmlPromptDialog() {
  const task = taskHtmlPromptDialogTask.value;
  const template = selectedTaskHtmlPromptTemplate.value;
  if (!task) {
    taskHtmlPromptDialogVisible.value = false;
    return;
  }
  const { slot, template_id, custom_prompt } = taskHtmlPromptDialogState.value;
  taskHtmlPromptSelections.value[slot] = template_id;
  taskHtmlPromptCustomizations.value[slot] = custom_prompt;
  taskHtmlPromptConversation.value = [];
  taskHtmlPromptFollowupPrompt.value = '';
  resetTaskHtmlPromptGenerationStatus();
  const promptText = buildTaskHtmlPrompt(task, slot, {
    template_prompt: template?.prompt,
    custom_prompt,
  });
  const loadingKey = taskAssetGenerationKey(task, slot);
  generatingTaskHtmlKey.value = loadingKey;
  try {
    const generatedHtml = await requestHtmlDraft(promptText, {
      remainingRetries: taskHtmlDraftRetryCount,
      onStatusChange: (status) => {
        taskHtmlPromptGenerationStatus.value = status;
      },
    });
    taskHtmlPromptConversation.value = [
      { role: 'user', content: promptText, created_at: new Date().toISOString() },
      { role: 'assistant', content: generatedHtml, created_at: new Date().toISOString() },
    ];
    setTaskHtmlPromptGenerationStatus({
      html_source: generatedHtml,
      received_chars: generatedHtml.length,
    });
    ElMessage.success('任务页面源码已生成，请确认后更新到下方源码编辑区');
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务网页生成失败，请稍后重试。';
    errorMessage.value = message;
    ElMessage.error(message);
    if (taskHtmlPromptGenerationStatus.value.state !== 'error') {
      setTaskHtmlPromptGenerationStatus({
        state: 'error',
        error_message: message,
      });
    }
  } finally {
    if (generatingTaskHtmlKey.value === loadingKey) {
      generatingTaskHtmlKey.value = null;
    }
  }
}

async function copyTaskHtmlPromptGeneratedSource() {
  const generatedHtml = taskHtmlPromptGenerationStatus.value.html_source.trim();
  if (!generatedHtml) {
    ElMessage.warning('请先生成 HTML 源码');
    return;
  }
  await copyPlainText(generatedHtml, '生成源码');
}

function applyTaskHtmlPromptGeneratedSource(closeAfterApply = false) {
  const task = taskHtmlPromptDialogTask.value;
  const generatedHtml = taskHtmlPromptGenerationStatus.value.html_source.trim();
  if (!task || !generatedHtml) {
    ElMessage.warning('请先生成 HTML 源码');
    return;
  }

  const slot = taskHtmlPromptDialogState.value.slot;
  const alreadyApplied = getTaskHtmlSource(task, slot).trim() === generatedHtml;
  if (!alreadyApplied) {
    setTaskHtmlSource(task, slot, generatedHtml);
    revealTaskPreview(task, slot);
    ElMessage.success('已更新到下方源码编辑区');
  }
  if (closeAfterApply) {
    taskHtmlPromptDialogVisible.value = false;
  } else if (alreadyApplied) {
    ElMessage.info('生成源码已在下方源码编辑区');
  }
}

async function continueTaskHtmlPromptDialog() {
  const task = taskHtmlPromptDialogTask.value;
  if (!task || continuingTaskHtmlPrompt.value) {
    return;
  }

  const slot = taskHtmlPromptDialogState.value.slot;
  const followupText = richTextToPlainText(taskHtmlPromptFollowupPrompt.value).trim();
  if (!followupText) {
    ElMessage.warning('请先输入修改要求');
    return;
  }

  const currentHtml = taskHtmlPromptGenerationStatus.value.html_source.trim() || getTaskHtmlSource(task, slot).trim();
  if (!currentHtml) {
    ElMessage.warning('请先生成一版 HTML 后再继续对话修改');
    return;
  }

  const loadingKey = taskAssetGenerationKey(task, slot);
  generatingTaskHtmlKey.value = loadingKey;
  continuingTaskHtmlPrompt.value = true;
  const previousConversation = [...taskHtmlPromptConversation.value];
  const followupPrompt = [
    '你正在继续修改一个已经生成的 HTML 页面。',
    '请根据新的修改要求返回完整、可直接运行的 HTML 源码。',
    '不要只返回差异说明，不要输出 Markdown 代码块。',
    `当前 HTML：\n${currentHtml}`,
    `新的修改要求：\n${followupText}`,
  ].join('\n\n');

  try {
    const html = await requestHtmlDraft(followupPrompt, {
      remainingRetries: taskHtmlDraftRetryCount,
      conversation: previousConversation,
      onStatusChange: (status) => {
        taskHtmlPromptGenerationStatus.value = status;
      },
    });
    const now = new Date().toISOString();
    taskHtmlPromptConversation.value = [
      ...previousConversation,
      { role: 'user', content: followupText, created_at: now },
      { role: 'assistant', content: html, created_at: new Date().toISOString() },
    ];
    taskHtmlPromptFollowupPrompt.value = '';
    setTaskHtmlPromptGenerationStatus({
      html_source: html,
      received_chars: html.length,
    });
    ElMessage.success('修改版 HTML 已生成，请确认后更新到下方源码编辑区');
  } catch (error) {
    const message = error instanceof Error ? error.message : '继续生成失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    continuingTaskHtmlPrompt.value = false;
    if (generatingTaskHtmlKey.value === loadingKey) {
      generatingTaskHtmlKey.value = null;
    }
  }
}


async function loadPlans() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    isLoading.value = false;
    return;
  }

  const [planPayload, curriculumPayload] = await Promise.all([
    apiGet<{ plans: PlanSummary[] }>('/lesson-plans/staff/list', authStore.token),
    apiGet<{ books: CurriculumBook[] }>('/curriculum/tree', authStore.token),
  ]);

  plans.value = planPayload.plans;
  curriculumBooks.value = curriculumPayload.books;
}

async function loadPlanDetail(planId: number | null) {
  if (!planId || !authStore.token) {
    selectedPlanDetail.value = null;
    editingPlanId.value = null;
    editorVisible.value = false;
    markEditorCommitted('');
    return;
  }

  const payload = await apiGet<{ plan: PlanDetail }>(`/lesson-plans/staff/${planId}`, authStore.token);
  selectedPlanDetail.value = payload.plan;
  activatePlanEditor(payload.plan);
}

async function loadPage() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    await Promise.all([loadPlans(), loadCustomTaskTemplates()]);
    if (isCreateRoute.value) {
      selectedPlanDetail.value = null;
      activateBlankPlanEditor();
      return;
    }
    await loadPlanDetail(selectedPlanId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载学案数据失败';
  } finally {
    isLoading.value = false;
  }
}

async function confirmRouteLeaveWithUnsavedChanges() {
  if (!hasUnsavedChanges.value) {
    return true;
  }
  persistCurrentEditorDraft();
  try {
    await ElMessageBox.confirm(
      '当前学案修改还没有保存到服务器，本地草稿已自动保留。确认现在离开吗？',
      '未保存提醒',
      {
        type: 'warning',
        confirmButtonText: '离开',
        cancelButtonText: '继续编辑',
      }
    );
    return true;
  } catch (error) {
    if (isDialogCancelled(error)) {
      return false;
    }
    throw error;
  }
}

function handleWindowBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) {
    return;
  }
  persistCurrentEditorDraft();
  event.preventDefault();
  event.returnValue = '';
}

function handleTaskHtmlPromptAssistantConfigUpdated() {
  taskHtmlPromptAssistantBootstrap.value = null;
  if (!authStore.token) {
    return;
  }
  void loadTaskHtmlPromptAssistantBootstrap();
}

async function selectPlan(planId: number | null) {
  if (!planId) {
    return;
  }
  await router.push(`/staff/lesson-plans/${planId}`);
}

function handleRowClick(row: PlanSummary) {
  void openEditDialog(row.id);
}

function openCreateDialog() {
  persistCurrentEditorDraft();
  void router.push('/staff/lesson-plans/new');
}


async function openEditDialog(planId: number) {
  try {
    await selectPlan(planId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打开编辑区失败';
  }
}

async function goToPlanList() {
  await router.push('/staff/lesson-plans');
}

function buildPayload() {
  if (!planForm.value.title.trim()) {
    throw new Error('请先填写学案标题');
  }
  if (!planForm.value.lesson_id && planForm.value.status !== 'draft') {
    throw new Error('暂未绑定课次的学案只能保存为草稿，请先绑定课次后再发布或开课。');
  }

  const tasks = planForm.value.tasks.map((task, index) => {
    if (!task.title.trim()) {
      throw new Error(`请填写任务 ${index + 1} 的标题`);
    }
    return {
      id: task.id,
      title: task.title.trim(),
      task_type: task.task_type,
      submission_scope: normalizeTaskSubmissionScope(task.task_type, task.submission_scope),
      description: normalizeHtmlValue(task.description, 'visual'),
      config: buildTaskConfigPayload(task),
      sort_order: index + 1,
      is_required: task.is_required,
    };
  });

  return {
    lesson_id: planForm.value.lesson_id ?? null,
    title: planForm.value.title.trim(),
    content: normalizeHtmlValue(planForm.value.content, 'visual'),
    assigned_date: planForm.value.assigned_date,
    status: planForm.value.status,
    tasks,
  };
}

async function savePlan() {
  if (!authStore.token) {
    return;
  }

  const draftPlanId = editingPlanId.value;
  isSavingPlan.value = true;
  errorMessage.value = '';

  try {
    await Promise.all(
      planForm.value.tasks
        .filter((task) => task.task_type === 'data_submit' && !task.id)
        .map((task) => ensureTaskIdReserved(task))
    );
    const payload = buildPayload();
    const response = editingPlanId.value
      ? await apiPut<{ plan: PlanDetail }>(
          `/lesson-plans/staff/${editingPlanId.value}`,
          payload,
          authStore.token
        )
      : await apiPost<{ plan: PlanDetail }>(
          '/lesson-plans/staff',
          payload,
          authStore.token
        );

    ElMessage.success(editingPlanId.value ? '学案已更新' : '学案已创建');
    clearLessonPlanDraft(draftPlanId);
    clearLessonPlanDraft(response.plan.id);
    markEditorCommitted(currentEditorSnapshot.value);
    await loadPlans();
    await selectPlan(response.plan.id);
    await loadPlanDetail(response.plan.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存学案失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isSavingPlan.value = false;
  }
}

async function publishPlan(planId: number) {
  if (!authStore.token) {
    return;
  }

  publishingPlanId.value = planId;
  errorMessage.value = '';

  try {
    const response = await apiPost<{ plan: PlanDetail }>(
      `/lesson-plans/staff/${planId}/publish`,
      {},
      authStore.token
    );
    ElMessage.success('学案已发布，可以去开课了');
    await loadPlans();
    await selectPlan(response.plan.id);
    await loadPlanDetail(response.plan.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发布学案失败';
  } finally {
    publishingPlanId.value = null;
  }
}

async function deletePlan(planId: number) {
  if (!authStore.token) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      '确认删除这个学案吗？删除后不可恢复，且会一并清理相关学习进度和开课记录。',
      '删除学案',
      { type: 'warning' }
    );
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : '删除学案失败';
    return;
  }

  deletingPlanId.value = planId;
  errorMessage.value = '';
  try {
    await apiDelete<{ deleted_id: number }>(`/lesson-plans/staff/${planId}`, authStore.token);
    clearLessonPlanDraft(planId);
    ElMessage.success('学案已删除');
    const deletingCurrent =
      selectedPlanDetail.value?.id === planId ||
      Number(route.params.planId) === planId;

    await loadPlans();
    if (deletingCurrent) {
      const nextPlanId = plans.value[0]?.id ?? null;
      if (nextPlanId) {
        await router.replace(`/staff/lesson-plans/${nextPlanId}`);
        await loadPlanDetail(nextPlanId);
      } else {
        selectedPlanDetail.value = null;
        editingPlanId.value = null;
        editorVisible.value = false;
        await router.replace('/staff/lesson-plans');
      }
      return;
    }
    await loadPlanDetail(selectedPlanId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除学案失败';
  } finally {
    deletingPlanId.value = null;
  }
}

onBeforeRouteUpdate((_to, _from) => {
  persistCurrentEditorDraft();
  return true;
});

onBeforeRouteLeave(async () => {
  return await confirmRouteLeaveWithUnsavedChanges();
});

watch(
  () => route.fullPath,
  async () => {
    if (isCreateRoute.value) {
      selectedPlanDetail.value = null;
      activateBlankPlanEditor();
      await nextTick();
      return;
    }
    if (!isEditorRoute.value) {
      selectedPlanDetail.value = null;
      editingPlanId.value = null;
      editorVisible.value = false;
      markEditorCommitted('');
      return;
    }
    if (selectedPlanId.value === selectedPlanDetail.value?.id) {
      return;
    }
    await loadPlanDetail(selectedPlanId.value);
  }
);

watch(
  () => planForm.value.tasks.map((task) => task.key),
  (taskKeys) => {
    if (!taskKeys.length) {
      editorActiveTab.value = 'content';
      activeTaskEditorKey.value = '';
      return;
    }
    if (taskKeys.includes(activeTaskEditorKey.value)) {
      return;
    }
    activeTaskEditorKey.value = taskKeys[0];
    if (editorActiveTab.value === 'tasks') {
      editorTaskTabKey.value = `task:${taskKeys[0]}`;
    }
  },
  { deep: false }
);

watch(
  () => planForm.value.lesson_id,
  (lessonId) => {
    if (!lessonId && planForm.value.status !== 'draft') {
      planForm.value.status = 'draft';
    }
  }
);

watch(taskHtmlPromptDialogVisible, (visible) => {
  if (visible) {
    return;
  }
  if (generatingTaskHtmlKey.value === currentTaskHtmlPromptGenerationKey.value) {
    return;
  }
  resetTaskHtmlPromptGenerationStatus();
});

watch(currentEditorSnapshot, () => {
  if (!editorVisible.value) {
    clearDraftAutoSaveTimer();
    return;
  }
  if (!hasUnsavedChanges.value) {
    clearDraftAutoSaveTimer();
    clearLessonPlanDraft(editingPlanId.value);
    return;
  }
  scheduleDraftAutoSave();
});

onMounted(() => {
  window.addEventListener('beforeunload', handleWindowBeforeUnload);
  window.addEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleTaskHtmlPromptAssistantConfigUpdated);
  window.addEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleTaskHtmlPromptAssistantConfigUpdated);
  resetPlanForm();
  markEditorCommitted();
  void loadPage();
});

onBeforeUnmount(() => {
  clearDraftAutoSaveTimer();
  window.removeEventListener('beforeunload', handleWindowBeforeUnload);
  window.removeEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleTaskHtmlPromptAssistantConfigUpdated);
  window.removeEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleTaskHtmlPromptAssistantConfigUpdated);
});
</script>

<style scoped>
.lesson-plan-page {
  width: min(1680px, 100%);
  margin: 0 auto;
}

.plan-charts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr);
  gap: var(--ls-gap-md, 12px);
}

.plan-charts :deep(.sa-panel__body) {
  display: grid;
  gap: 12px;
}

.plan-chart-head strong {
  color: var(--ls-ink);
  font-size: 15px;
}

.plan-chart-head .section-note {
  margin: 4px 0 0;
  color: var(--ls-muted);
  font-size: 13px;
}

@media (max-width: 1080px) {
  .plan-charts {
    grid-template-columns: 1fr;
  }
}

.lesson-plan-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  gap: 18px;
  align-items: stretch;
}

.lesson-plan-hero :deep(.sa-page-header__title) {
  font-size: clamp(34px, 4vw, 44px);
}

.lesson-plan-hero__actions {
  display: grid;
  gap: 14px;
  align-content: space-between;
  width: 100%;
}

.lesson-plan-hero__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}

.lesson-plan-hero__summary {
  display: grid;
  gap: 6px;
  padding: 18px 18px 16px;
  border: 1px solid var(--ls-summary-border);
  border-radius: 22px;
  background: var(--ls-summary-bg);
}

.lesson-plan-hero__summary strong {
  font-size: 18px;
  color: var(--ls-text);
}

.lesson-plan-hero__summary span {
  color: var(--ls-muted);
  line-height: 1.6;
}

.lesson-plan-hero__summary-label {
  margin: 0;
  color: var(--ls-summary-label);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.stack-list {
  display: grid;
  gap: 16px;
}

.content-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: var(--ls-panel-soft);
}

.plan-title-cell {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.plan-title-cell__thumb-wrap {
  width: 84px;
  height: 58px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(67, 109, 185, 0.16);
  background: rgba(67, 109, 185, 0.06);
}

.plan-title-cell__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.plan-title-cell__thumb--placeholder {
  display: grid;
  place-items: center;
  color: var(--ls-text);
  font-weight: 700;
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.2), rgba(111, 179, 149, 0.2)),
    rgba(67, 109, 185, 0.1);
}

.plan-title-cell__meta {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.plan-title-cell__title,
.plan-title-cell__desc {
  margin: 0;
}

.plan-title-cell__title {
  color: var(--ls-ink);
  font-weight: 700;
  line-height: 1.4;
}

.plan-title-cell__desc {
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.5;
}

.editor-tabs {
  margin-top: 8px;
}

.editor-task-toolbar {
  margin-top: 10px;
}

.content-mode-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--ls-content-panel-border);
  border-radius: 20px;
  background: var(--ls-content-panel-bg);
}

.dialog-task-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin: 8px 0 12px;
}

.dialog-task-head h3,
.section-note {
  margin: 0;
}

.section-note {
  color: var(--ls-muted);
  line-height: 1.7;
}

.plan-editor-body {
  display: grid;
  gap: 18px;
}

.plan-form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 0 16px;
  align-items: start;
}

.plan-editor-card__header {
  display: grid;
  gap: 4px;
}

.plan-editor-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.editor-save-alert {
  margin-top: 8px;
}

.full-width {
  width: 100%;
}

@media (max-width: 1024px) {
  .lesson-plan-page {
    width: 100%;
  }

  .lesson-plan-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dialog-task-head,
  .info-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .plan-form-grid {
    grid-template-columns: 1fr;
  }

  .plan-title-cell {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .plan-title-cell__thumb-wrap {
    width: 72px;
    height: 52px;
  }
}
</style>
