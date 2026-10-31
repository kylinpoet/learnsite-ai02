<template>
  <div class="page-stack lesson-plan-page" :class="{ 'lesson-plan-page--editor': isEditorRoute }">
    <StaffPageHead
      v-if="!isEditorRoute"
      title="学案管理"
      :sub="planListSummary"
    >
      <template #actions>
        <n-button type="primary" @click="openCreateDialog">新建学案</n-button>
        <n-button secondary @click="router.push('/staff/curriculum')">查看课程体系</n-button>
      </template>
    </StaffPageHead>

    <!-- 编辑页常驻工具条：对象身份在左，唯一主操作在右；滚动时贴着外壳页头 -->
    <header v-else class="plan-bar">
      <div class="plan-bar__id">
        <button class="plan-bar__back" type="button" @click="goToPlanList">← 学案清单</button>
        <h1 class="plan-bar__title">{{ pageTitle }}</h1>
        <p class="plan-bar__meta">
          <span :class="['sf-pill', planStatusPillClass(planForm.status)]">{{ planStatusLabel(planForm.status) }}</span>
          <span>{{ planBarLessonLabel }}</span>
          <span>{{ planForm.tasks.length }} 个活动</span>
          <span v-if="hasUnsavedChanges" class="plan-bar__dirty">有未保存的修改</span>
        </p>
      </div>
      <div class="plan-bar__actions">
        <n-button secondary @click="openStudentPreview">预览学生端</n-button>
        <n-button quaternary @click="cancelPlanEditing">
          {{ editingPlanId ? '重置修改' : '取消新建' }}
        </n-button>
        <n-button :loading="isSavingPlan" type="primary" @click="savePlan">
          {{ editingPlanId ? '保存修改' : '创建学案' }}
        </n-button>
      </div>
    </header>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <div v-if="!isLoading && !isEditorRoute" class="page-stack">
      <StaffStatStrip :items="planStatItems" />

      <section class="sf-panel">
        <div class="sf-toolbar">
          <n-input
            v-model:value="planKeyword"
            class="sf-toolbar__search"
            clearable
            placeholder="搜索学案标题 / 课次 / 单元"
          />
          <div class="sf-toolbar__right">
            <span class="sf-toolbar__count">{{ filteredPlans.length }} / {{ plans.length }} 份</span>
          </div>
        </div>

        <div class="sf-tabs list-tabs">
          <button
            v-for="tab in planFilterTabs"
            :key="tab.value"
            type="button"
            :class="['sf-tabs__item', { 'is-active': planStatusFilter === tab.value }]"
            @click="planStatusFilter = tab.value"
          >
            {{ tab.label }}
            <span class="sf-tabs__count">{{ tab.count }}</span>
          </button>
        </div>

        <p v-if="!filteredPlans.length" class="sf-empty">
          {{ plans.length ? '当前筛选条件下没有学案。' : '还没有学案。先新建一份，绑定课次后即可发布。' }}
        </p>

        <div v-else>
          <div class="sf-rows__head sf-cols-plans">
            <span>学案</span>
            <span>活动</span>
            <span>学生待完成</span>
            <span>操作</span>
          </div>
          <div class="sf-rows">
          <article
            v-for="plan in filteredPlans"
            :key="plan.id"
            class="sf-row sf-row--cols sf-cols-plans sf-row--link"
            @click="openEditDialog(plan.id)"
          >
            <div class="sf-row__main">
              <p class="sf-row__title">
                <span class="sf-row__title-text">{{ plan.title }}</span>
                <span :class="['sf-pill', planStatusPillClass(plan.status)]">{{ planStatusLabel(plan.status) }}</span>
                <span v-if="plan.is_hidden" class="sf-pill sf-pill--hidden">已下架</span>
                <span v-if="!plan.lesson" class="sf-pill">未绑定课次</span>
              </p>
              <p class="sf-row__meta">
                <span>{{ planLessonDisplayLabel(plan) }}</span>
                <span v-if="plan.lesson?.unit_title">{{ plan.lesson.unit_title }}</span>
                <span>{{ plan.assigned_date }}</span>
              </p>
            </div>

            <span class="sf-row__num" data-label="活动">{{ plan.task_count }}</span>
            <span class="sf-row__num" data-label="待完成">{{ plan.progress.pending_count }}</span>

            <div class="sf-row__action" @click.stop>
              <n-button
                v-if="plan.status === 'draft'"
                :disabled="!plan.lesson"
                :loading="publishingPlanId === plan.id"
                text
                type="primary"
                @click="publishPlan(plan.id)"
              >
                发布
              </n-button>
              <n-dropdown
                :options="planRowActions(plan)"
                placement="bottom-end"
                trigger="click"
                @select="(key: string) => handlePlanRowAction(key, plan)"
              >
                <n-button
                  :loading="visibilityLoadingPlanId === plan.id"
                  quaternary
                  circle
                  size="small"
                  aria-label="更多操作"
                >
                  ···
                </n-button>
              </n-dropdown>
            </div>
          </article>
          </div>
        </div>
      </section>
    </div>
    <!-- 两栏共用一个表单上下文，标签统一在控件上方 -->
    <n-form
      v-if="!isLoading && isEditorRoute && editorVisible"
      class="plan-editor"
      label-placement="top"
      :show-feedback="false"
    >
      <!-- 左栏：学案信息与内容目录。目录是唯一的导航，取代原来的页签 -->
      <div class="plan-rail">
        <details class="sf-panel plan-rail__panel" :open="!isNarrowViewport">
          <summary class="sf-panel__head plan-rail__summary">
            <h2 class="sf-panel__title">学案信息</h2>
            <span class="plan-rail__summary-tail">
              <span class="plan-rail__summary-hint">{{ planStatusLabel(planForm.status) }}</span>
              <span class="plan-rail__summary-caret" aria-hidden="true"></span>
            </span>
          </summary>
          <div class="sf-panel__body plan-rail__body">
            <n-form-item label="学案标题">
              <n-input
                v-model:value="planForm.title"
                maxlength="120"
                placeholder="例如：八下第一单元 第4课 智能感知体验"
              />
            </n-form-item>
            <n-form-item label="绑定课次">
              <n-select
                v-model:value="planForm.lesson_id"
                class="full-width"
                clearable
                filterable
                :options="lessonSelectOptions"
                placeholder="可暂不选择课次"
              />
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
            <p class="plan-rail__note">
              {{
                planForm.lesson_id
                  ? '已绑定课次，保存后可以发布并开课。'
                  : '不绑定课次也能存草稿；绑定后才能发布、开课。'
              }}
            </p>
          </div>
        </details>

        <section class="sf-panel">
          <header class="sf-panel__head">
            <h2 class="sf-panel__title">
              内容目录
              <span class="sf-panel__count">{{ planForm.tasks.length + 1 }} 项</span>
            </h2>
          </header>
          <div class="sf-panel__body sf-panel__body--flush plan-outline">
            <nav aria-label="学案内容">
              <button
                type="button"
                :class="['plan-outline__item', { 'is-active': editorTaskTabKey === 'content' }]"
                @click="selectEditorPane('content')"
              >
                <span class="plan-outline__badge" aria-hidden="true"></span>
                <span class="plan-outline__text">
                  <span class="plan-outline__label">学案导读</span>
                  <span class="plan-outline__meta">{{ planContentSummary }}</span>
                </span>
              </button>
              <button
                v-for="(task, index) in planForm.tasks"
                :key="task.key"
                type="button"
                :class="[
                  'plan-outline__item',
                  { 'is-active': editorTaskTabKey === `task:${task.key}`, 'is-off': !task.is_active },
                ]"
                @click="selectEditorPane(`task:${task.key}`)"
              >
                <span class="plan-outline__badge">{{ index + 1 }}</span>
                <span class="plan-outline__text">
                  <span class="plan-outline__label">{{ task.title.trim() || '未命名活动' }}</span>
                  <span class="plan-outline__meta">
                    {{ taskTypeLabel(task.task_type) }}<template v-if="!task.is_active"> · 已停用</template>
                  </span>
                </span>
              </button>
            </nav>
          </div>
          <footer class="sf-panel__foot plan-rail__add">
            <div class="plan-rail__add-row">
              <n-button block secondary size="small" @click="addTaskRow">新增活动</n-button>
              <n-button block quaternary size="small" @click="openTaskTemplateLibrary">模板库</n-button>
            </div>
            <TaskTemplatePickerDropdown
              block
              secondary
              :custom-task-templates-loading="customTaskTemplatesLoading"
              :custom-task-templates="customTaskTemplates"
              :dropdown-pinned-custom-task-templates="dropdownPinnedCustomTaskTemplates"
              :dropdown-recent-custom-task-templates="dropdownRecentCustomTaskTemplates"
              :custom-task-template-dropdown-groups="customTaskTemplateDropdownGroups"
              :task-type-label="taskTypeLabel"
              :handle-task-template-command="handleTaskTemplateCommand"
            />
          </footer>
        </section>
      </div>

      <!-- 右栏：同一时刻只呈现一个编辑对象，标题、说明、操作都在这一条里 -->
      <section ref="planCanvasRef" class="sf-panel plan-canvas">
        <header class="sf-panel__head plan-canvas__head">
          <div class="plan-canvas__id">
            <h2 class="plan-canvas__title">{{ currentEditorPane.title }}</h2>
            <p class="plan-canvas__meta">{{ currentEditorPane.meta }}</p>
          </div>
          <div class="sf-panel__actions">
            <n-dropdown
              v-if="currentEditorTask"
              :options="currentEditorTaskActions"
              placement="bottom-end"
              trigger="click"
              @select="handleCurrentEditorTaskAction"
            >
              <n-button quaternary size="small">
                活动操作
                <AppIcon class="plan-canvas__caret" :icon="ChevronDown" :size="14" />
              </n-button>
            </n-dropdown>
            <n-button
              v-else
              :loading="generatingPlanHtml"
              secondary
              size="small"
              @click="generatePlanHtmlDraft"
            >
              AI 生成导读初稿
            </n-button>
          </div>
        </header>

        <div
          v-if="visitedEditorPanes.has('content')"
          v-show="editorTaskTabKey === 'content'"
          class="sf-panel__body plan-canvas__body"
        >
          <RichTextEditor
            v-model="planForm.content"
            :min-height="380"
            placeholder="填写学案导读、课堂流程、重点提示、参考链接等。"
          />
        </div>

        <div
          v-for="(task, index) in planForm.tasks"
          :key="task.key"
          v-show="editorTaskTabKey === `task:${task.key}`"
          class="sf-panel__body plan-canvas__body"
        >
          <LessonPlanTaskEditorCard
            v-if="visitedEditorPanes.has(`task:${task.key}`)"
            :task="task"
            :index="index"
            :task-count="planForm.tasks.length"
            :show-toolbar="false"
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
        </div>
      </section>
    </n-form>

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
import type { DropdownOption } from 'naive-ui';
import { NAlert, NButton, NDatePicker, NDropdown, NForm, NFormItem, NInput, NSelect, NSkeleton, NTag } from 'naive-ui';
import { ChevronDown } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import AppIcon from '@/components/AppIcon.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
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
const visibilityLoadingPlanId = ref<number | null>(null);
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
    ElMessage.warning('已复制活动结构，但资源文件和接口地址不会自动复用，请按需重新上传或生成。');
  },
  onTaskCopied: () => {
    ElMessage.success('活动已复制');
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

/** 从当前编辑的活动标签直接跳到对应活动的学生视角 */
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
  if (isCreateRoute.value) {
    return '新建学案';
  }
  return planForm.value.title.trim() || selectedPlanDetail.value?.title || '编辑学案';
});
/** 编辑页工具条第二行：课次是学生端的入口，写全称比写「已绑定」有用 */
const planBarLessonLabel = computed(() => {
  const plan = selectedPlanDetail.value;
  if (!plan) {
    return isCreateRoute.value ? '保存后可绑定课次' : '正在加载课次…';
  }
  return plan.lesson ? planLessonDisplayLabel(plan) : '未绑定课次';
});

/** 目录里的导读占位说明：只回答「填了没有」，不重复编辑器里的内容 */
const planContentSummary = computed(() => {
  const text = planForm.value.content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? `已填写 ${text.length} 字` : '还没填写';
});

/** 当前画布里正在编辑的活动；导读页签下为 null */
const currentEditorTask = computed<PlanFormTask | null>(() => {
  const key = activeTaskEditorKey.value;
  if (editorActiveTab.value !== 'tasks' || !key) {
    return null;
  }
  return planForm.value.tasks.find((task) => task.key === key) || null;
});

/** 画布头部：标题与一行事实，说明这是哪个对象、它现在是什么状态 */
const currentEditorPane = computed(() => {
  const task = currentEditorTask.value;
  if (!task) {
    return {
      title: '学案导读',
      meta: '学生进入学案后先看到这一段，保存后随学案一起下发。',
    };
  }
  const index = planForm.value.tasks.findIndex((item) => item.key === task.key);
  const facts = [taskTypeLabel(task.task_type), task.is_required ? '必做' : '选做', task.is_active ? '已启用' : '已停用'];
  return {
    title: `活动 ${index + 1} · ${task.title.trim() || '未命名活动'}`,
    meta: facts.join(' · '),
  };
});

/** 活动操作收进一个下拉，画布头部只留唯一主操作的位置 */
const currentEditorTaskActions = computed<DropdownOption[]>(() => {
  const task = currentEditorTask.value;
  if (!task) {
    return [];
  }
  const index = planForm.value.tasks.findIndex((item) => item.key === task.key);
  return [
    { label: '前移一位', key: 'move-up', disabled: index <= 0 },
    { label: '后移一位', key: 'move-down', disabled: index >= planForm.value.tasks.length - 1 },
    { label: '复制活动', key: 'copy' },
    { label: taskTemplateButtonLabel(task), key: 'save-template' },
    { key: 'divider', type: 'divider' },
    { label: '删除活动', key: 'delete', disabled: planForm.value.tasks.length <= 1 },
  ];
});

function handleCurrentEditorTaskAction(key: string) {
  const task = currentEditorTask.value;
  if (!task) {
    return;
  }
  if (key === 'move-up') {
    moveTaskRow(task.key, -1);
    return;
  }
  if (key === 'move-down') {
    moveTaskRow(task.key, 1);
    return;
  }
  if (key === 'copy') {
    copyTaskRow(task.key);
    return;
  }
  if (key === 'save-template') {
    openSaveTaskTemplateDialog(task);
    return;
  }
  if (key === 'delete') {
    removeTaskRow(task.key);
  }
}

/** 画布只挂载看过的对象：CKEditor 实例较重，不随活动数量线性增长 */
const visitedEditorPanes = ref<Set<string>>(new Set(['content']));
const planCanvasRef = ref<HTMLElement | null>(null);

/** 手机上「学案信息」默认收起，让目录和画布先出现在首屏；桌面上始终展开 */
const NARROW_VIEWPORT_QUERY = '(max-width: 900px)';
const isNarrowViewport = ref(false);
let narrowViewportList: MediaQueryList | null = null;

function syncNarrowViewport() {
  if (narrowViewportList) {
    isNarrowViewport.value = narrowViewportList.matches;
  }
}

function selectEditorPane(key: string) {
  editorTaskTabKey.value = key;
  visitedEditorPanes.value.add(key);
  if (typeof window !== 'undefined' && window.innerWidth < 1080) {
    nextTick(() => planCanvasRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

function planLessonDisplayLabel(plan: Pick<PlanSummary, 'lesson'>) {
  return plan.lesson?.title || '暂未绑定课次';
}

/** 状态药丸：草稿中性、已发布/上课中为正、已完成中性 */
function planStatusPillClass(status: string) {
  if (status === 'published' || status === 'active') {
    return 'sf-pill--pos';
  }
  return '';
}

const totalTaskCount = computed(() => plans.value.reduce((sum, item) => sum + item.task_count, 0));
const publishedPlanCount = computed(
  () => plans.value.filter((plan) => plan.status === 'published' || plan.status === 'active').length
);
const unboundPlanCount = computed(() => plans.value.filter((plan) => !plan.lesson).length);

/** 标题下一行只写结论：数字在下面的统计带里，这里不重复 */
const pendingTaskTotal = computed(() =>
  plans.value.reduce((sum, plan) => sum + plan.progress.pending_count, 0)
);

const planListSummary = computed(() => {
  if (!plans.value.length) {
    return '还没有学案。新建一份、绑定课次后即可发布开课。';
  }
  if (unboundPlanCount.value > 0) {
    return `${unboundPlanCount.value} 份学案还没绑定课次，绑定后才能发布。`;
  }
  const draft = plans.value.filter((plan) => plan.status === 'draft').length;
  if (draft > 0) {
    return `${draft} 份草稿还没发布。`;
  }
  if (pendingTaskTotal.value > 0) {
    return `学生还有 ${pendingTaskTotal.value} 个活动待完成。`;
  }
  return '全部学案都已发布。';
});

const planStatItems = computed<StaffStatItem[]>(() => [  { label: '学案', value: plans.value.length, unit: '份' },
  { label: '已发布', value: publishedPlanCount.value, unit: '份', note: '可以直接开课' },
  { label: '活动', value: totalTaskCount.value, unit: '个' },
  {
    label: '未绑定课次',
    value: unboundPlanCount.value,
    unit: '份',
    note: unboundPlanCount.value ? '绑定课次后才能发布' : '全部学案都已绑定',
  },
]);

const planKeyword = ref('');
const planStatusFilter = ref<'all' | 'draft' | 'published' | 'unbound'>('all');

const filteredPlans = computed(() => {
  const keyword = planKeyword.value.trim().toLowerCase();
  return plans.value.filter((plan) => {
    if (planStatusFilter.value === 'draft' && plan.status !== 'draft') {
      return false;
    }
    if (planStatusFilter.value === 'published' && plan.status !== 'published' && plan.status !== 'active') {
      return false;
    }
    if (planStatusFilter.value === 'unbound' && plan.lesson) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return [plan.title, plan.lesson?.title || '', plan.lesson?.unit_title || '']
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
});

const planFilterTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: plans.value.length },
  { value: 'draft' as const, label: '草稿', count: plans.value.filter((plan) => plan.status === 'draft').length },
  {
    value: 'published' as const,
    label: '已发布',
    count: plans.value.filter((plan) => plan.status === 'published' || plan.status === 'active').length,
  },
  { value: 'unbound' as const, label: '未绑定课次', count: unboundPlanCount.value },
]);

function planRowActions(plan: PlanSummary) {
  return [
    { label: '进入编辑', key: 'edit' },
    ...(plan.status === 'draft' ? [{ label: '发布', key: 'publish', disabled: !plan.lesson }] : []),
    plan.is_hidden
      ? { label: '恢复显示', key: 'show' }
      : { label: '隐藏（下架）', key: 'hide', disabled: plan.status === 'active' },
    { label: '删除', key: 'delete' },
  ];
}

function handlePlanRowAction(key: string, plan: PlanSummary) {
  if (key === 'edit') {
    void openEditDialog(plan.id);
    return;
  }
  if (key === 'publish') {
    void publishPlan(plan.id);
    return;
  }
  if (key === 'hide') {
    void togglePlanVisibility(plan, true);
    return;
  }
  if (key === 'show') {
    void togglePlanVisibility(plan, false);
    return;
  }
  if (key === 'delete') {
    void deletePlan(plan.id);
  }
}
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

/** 切到新的活动时把它的编辑区挂载出来；已挂载的保持原状，避免 CKEditor 反复重建 */
watch(
  editorTaskTabKey,
  (key) => {
    visitedEditorPanes.value.add(key);
  },
  { immediate: true }
);
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

async function cancelPlanEditing() {
  cancelPlanEditingState(selectedPlanDetail.value);
  // 数据提交活动的接口地址在重置后才补齐，基线要等这一步之后再对齐，
  // 否则刚重置完仍然显示「有未保存的修改」。
  normalizeEditorDataSubmitTaskSources();
  handleTaskTabDragEnd();
  await nextTick();
  markEditorCommitted();
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
      const message = error instanceof Error ? error.message : '生成活动接口失败';
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
  return '切换为数据提交活动后会自动生成正式接口地址';
}

function taskDataSubmitAlertDescription(task: PlanFormTask) {
  if (task.id && !isTaskPersisted(task)) {
    return '当前接口 ID 已预生成，可以先复制给 AI 生成学生提交页和可视化页；保存学案后学生即可正式访问。';
  }
  if (task.id) {
    return '接口已经可用，可直接复制给 AI 生成网页，或继续手动调整提交页与可视化页。';
  }
  return '切换到数据提交活动后，系统会自动生成提交接口与读取接口。';
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

  const title = task.title.trim() || taskTypeLabel(task.task_type) || '活动';
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
  const title = task.title.trim() || taskTypeLabel(task.task_type) || '活动';
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
  const displayTitle = task.title.trim() || `活动 ${task.key}`;
  return [
    `请为活动“${displayTitle}”生成一段简洁的 HTML 活动说明。`,
    `活动类型：${taskTypeLabel(task.task_type)}。`,
    '内容要适合直接展示给学生，包含活动目标、步骤提示和提交要求。',
    '请直接返回可渲染的 HTML 片段。',
  ].join('\n');
}

function buildTaskHtmlPrompt(task: PlanFormTask, slot: TaskAssetSlot, options?: TaskHtmlPromptBuildOptions) {
  const title = task.title.trim() || taskTypeLabel(task.task_type);
  const submitApiPath = taskDataSubmitPromptApiPath(task);
  const recordsApiPath = taskDataSubmitPromptRecordsPath(task);
  const runtimeHint =
    '生成页面时请只使用浏览器原生能力；如需请求数据，请使用原生 fetch 并处理失败情况。';
  const previewHint = '生成结果需要教师确认后写入当前活动的 HTML 源码区域，页面应能在 iframe 中独立运行。';
  const templatePrompt = options?.template_prompt?.trim();
  const customPrompt = richTextToPlainText(options?.custom_prompt).trim();

  if (slot === 'web') {
    const promptLines = [
      `请生成一个 HTML 网页，用于完成“${title}”这项网页活动。`,
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
      `请生成一个 HTML 提交页，用于完成“${title}”这项数据提交活动。`,
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
    `请生成一个 HTML 可视化页，用于展示“${title}”这项数据提交活动的结果。`,
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
    ElMessage.success('活动说明初稿已生成');
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成活动说明失败';
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
    ElMessage.success('活动页面源码已生成，请确认后更新到下方源码编辑区');
  } catch (error) {
    const message = error instanceof Error ? error.message : '活动网页生成失败，请稍后重试。';
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
  // 表单落地后还有一轮 watcher 补全（源码模式、接口地址等），等 DOM 更新完再把基线对齐，
  // 否则刚打开学案就显示「有未保存的修改」。
  await nextTick();
  markEditorCommitted();
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
      throw new Error(`请填写活动 ${index + 1} 的标题`);
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
      is_active: task.is_active,
    };
  });

  return {
    lesson_id: planForm.value.lesson_id ?? null,
    title: planForm.value.title.trim(),
    content: normalizeHtmlValue(planForm.value.content, 'visual'),
    assigned_date: planForm.value.assigned_date,
    status: planForm.value.status,
    is_hidden: planForm.value.is_hidden,
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

async function togglePlanVisibility(plan: PlanSummary, hidden: boolean) {
  if (!authStore.token) {
    return;
  }
  if (hidden) {
    try {
      await ElMessageBox.confirm(
        '下架后学生在学习首页和课程页都看不到这份学案，教师端仍可恢复。确认下架吗？',
        '隐藏学案',
        { type: 'warning' }
      );
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      return;
    }
  }

  visibilityLoadingPlanId.value = plan.id;
  errorMessage.value = '';
  try {
    const response = await apiPost<{ plan: PlanDetail }>(
      `/lesson-plans/staff/${plan.id}/visibility`,
      { hidden },
      authStore.token
    );
    ElMessage.success(hidden ? '学案已隐藏' : '学案已恢复显示');
    await loadPlans();
    if (selectedPlanId.value === plan.id) {
      await loadPlanDetail(plan.id);
    }
    return response.plan;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新学案显示状态失败';
  } finally {
    visibilityLoadingPlanId.value = null;
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
  narrowViewportList = window.matchMedia(NARROW_VIEWPORT_QUERY);
  syncNarrowViewport();
  narrowViewportList.addEventListener('change', syncNarrowViewport);
  window.addEventListener('beforeunload', handleWindowBeforeUnload);
  window.addEventListener(AI_PROVIDER_CONFIG_UPDATED_EVENT, handleTaskHtmlPromptAssistantConfigUpdated);
  window.addEventListener(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT, handleTaskHtmlPromptAssistantConfigUpdated);
  resetPlanForm();
  markEditorCommitted();
  void loadPage();
});

onBeforeUnmount(() => {
  clearDraftAutoSaveTimer();
  narrowViewportList?.removeEventListener('change', syncNarrowViewport);
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

/* 状态页签与工具栏同宽，下划线贴着行分隔线 */
.list-tabs {
  padding: 0 16px;
}

.full-width {
  width: 100%;
}

/* ================= 编辑页 =================
   一屏只服务一件事：目录在左，正在编辑的那一项占满右栏，保存常驻在顶部工具条里。 */

.lesson-plan-page--editor {
  width: min(1240px, 100%);
}

/* ---------- 常驻工具条：身份在左，唯一主操作在右 ---------- */

.plan-bar {
  position: sticky;
  top: 52px;
  z-index: 10;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px 12px;
  border: 1px solid var(--sf-line);
  border-radius: var(--sf-r-card);
  background: var(--sf-surface);
}

.plan-bar__id {
  display: grid;
  gap: 0;
  min-width: 0;
}

.plan-bar__back {
  justify-self: start;
  margin: 0 0 2px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--sf-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.plan-bar__back:hover {
  color: var(--sf-ink);
}

.plan-bar__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--sf-ink);
  font-family: var(--ls-font);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-bar__meta {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px 10px;
  overflow: hidden;
  margin: 3px 0 0;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.5;
}

.plan-bar__meta > span {
  white-space: nowrap;
}

.plan-bar__dirty {
  color: var(--sf-warn);
}

.plan-bar__dirty::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 999px;
  background: currentColor;
  vertical-align: 1px;
}

.plan-bar__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

/* ---------- 两栏工作区 ---------- */

.plan-editor {
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.plan-rail {
  position: sticky;
  top: 160px;
  display: grid;
  gap: 12px;
  max-height: calc(100vh - 166px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.plan-rail__body {
  display: grid;
  gap: 12px;
  padding: 12px 14px 14px;
}

.plan-rail__body :deep(.n-form-item) {
  margin-bottom: 0;
}

.plan-rail__body :deep(.n-form-item-label) {
  padding-bottom: 4px;
  font-size: 12px;
  color: var(--sf-muted);
}

.plan-rail__body :deep(.n-form-item-blank) {
  min-height: 0;
}

.plan-rail__note {
  margin: 0;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.6;
}

/* 手机上「学案信息」可折叠：先看到目录与画布，需要改绑定关系时再展开 */
.plan-rail__summary {
  cursor: default;
  list-style: none;
}

.plan-rail__summary::-webkit-details-marker {
  display: none;
}

/* 桌面上「学案信息」始终展开，标题行不做折叠开关 */
@media (min-width: 901px) {
  .plan-rail__summary {
    pointer-events: none;
  }
}

.plan-rail__summary-tail {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.plan-rail__summary-hint,
.plan-rail__summary-caret {
  display: none;
  color: var(--sf-muted);
  font-size: 12px;
}

/* ---------- 内容目录：唯一的导航，取代页签 ---------- */

.plan-outline {
  padding: 6px;
}

.plan-outline nav {
  display: grid;
  gap: 2px;
}

.plan-outline__item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--sf-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.plan-outline__item:hover {
  background: var(--sf-surface-2);
}

.plan-outline__item:focus-visible {
  outline: 2px solid var(--sf-accent);
  outline-offset: -2px;
}

.plan-outline__item.is-active {
  background: var(--sf-accent-soft);
}

.plan-outline__badge {
  flex: none;
  width: 15px;
  padding-top: 1px;
  color: var(--sf-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.plan-outline__text {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.plan-outline__label {
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-outline__meta {
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.4;
}

.plan-outline__item.is-active .plan-outline__label {
  color: var(--sf-ink);
  font-weight: 600;
}

.plan-outline__item.is-off .plan-outline__label {
  color: var(--sf-muted);
}

.plan-rail__add {
  display: grid;
  gap: 8px;
  padding: 10px 12px 12px;
}

.plan-rail__add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

/* ---------- 画布：同一时刻只有一个编辑对象 ---------- */

.plan-canvas {
  min-width: 0;
}

.plan-canvas__head {
  align-items: flex-start;
  padding: 12px 16px;
}

.plan-canvas__id {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.plan-canvas__title {
  margin: 0;
  overflow: hidden;
  color: var(--sf-ink);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-canvas__meta {
  margin: 0;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.5;
}

.plan-canvas__body {
  padding: 16px;
}

.plan-canvas__caret {
  margin-left: 4px;
  opacity: 0.7;
}

/* 画布里的字段之间留一口气：表单项默认紧贴，长表单会糊成一片 */
.plan-canvas__body :deep(.n-form-item) {
  margin-bottom: 12px;
}

/* ---------- 窄屏 ---------- */

/* 平板横屏到小桌面：两栏都留着，侧栏收一档，编辑区仍然是主角 */
@media (max-width: 1200px) and (min-width: 901px) {
  .plan-editor {
    grid-template-columns: 240px minmax(0, 1fr);
  }
}

/* 平板竖屏以下：目录落到画布上方，目录项横向滚动，画布仍在首屏可及的位置 */
@media (max-width: 900px) {
  .plan-editor {
    grid-template-columns: minmax(0, 1fr);
  }

  .plan-rail {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .plan-rail__body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
  }

  .plan-rail__note {
    grid-column: 1 / -1;
  }

  .plan-outline nav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .plan-outline nav::-webkit-scrollbar {
    display: none;
  }

  .plan-outline__item {
    flex: none;
    width: auto;
    max-width: 220px;
    background: var(--sf-surface-2);
  }

  .plan-outline__item.is-active {
    background: var(--sf-accent-soft);
  }
}

@media (max-width: 900px) {
  .plan-rail__summary {
    cursor: pointer;
  }

  .plan-rail__summary-hint {
    display: inline;
  }

  .plan-rail__summary-caret {
    display: block;
    width: 7px;
    height: 7px;
    margin-top: -3px;
    border-right: 1.5px solid var(--sf-muted);
    border-bottom: 1.5px solid var(--sf-muted);
    transform: rotate(45deg);
    transition: transform 0.15s ease;
  }

  .plan-rail__panel:not([open]) .plan-rail__summary-caret {
    margin-top: 2px;
    transform: rotate(-45deg);
  }
}

@media (max-width: 768px) {
  .plan-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px 12px 12px;
  }

  .plan-bar__title {
    font-size: 18px;
    white-space: normal;
  }

  .plan-bar__meta {
    flex-wrap: wrap;
    overflow: visible;
  }

  .plan-bar__actions {
    justify-content: flex-end;
  }

  .plan-canvas__head {
    flex-wrap: wrap;
    gap: 8px;
  }
}

@media (max-width: 640px) {
  .plan-rail__body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
