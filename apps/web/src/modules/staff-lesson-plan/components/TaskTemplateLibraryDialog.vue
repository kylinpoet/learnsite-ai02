<template>
  <n-modal
    v-model:show="dialogVisible"
    preset="card"
    title="自定义活动模板库"
    style="width: min(760px, 96vw)"
  >
    <div v-if="loading" class="task-template-library task-template-library--loading">
      正在加载自定义模板...
    </div>
    <n-empty v-else-if="!templates.length" description="还没有保存过自定义活动模板" />
    <template v-else>
      <div class="task-template-library-toolbar">
        <n-input
          v-model:value="keywordValue"
          clearable
          class="task-template-library-toolbar__search"
          placeholder="搜索模板名称、分组、预设活动名或说明"
        />
        <n-select
          v-model:value="groupNameValue"
          clearable
          filterable
          class="task-template-library-toolbar__group"
          :options="groupNameOptions"
          placeholder="按分组筛选"
        />
        <n-tag round type="info">结果 {{ filteredTemplates.length }}</n-tag>
        <n-tag round type="warning">置顶 {{ pinnedTemplates.length }}</n-tag>
        <n-tag round>最近使用 {{ recentTemplates.length }}</n-tag>
        <n-tag v-if="selectedIds.length" round type="success">已选 {{ selectedIds.length }}</n-tag>
        <n-tag
          v-if="selectedIds.length && selectedFilteredCount !== selectedIds.length"
          round
          type="info"
        >
          当前结果命中 {{ selectedFilteredCount }}
        </n-tag>
      </div>

      <n-empty v-if="!filteredTemplates.length" description="当前筛选条件下暂无模板" />
      <div v-else class="task-template-library">
        <div class="task-template-library-batch">
          <div class="task-template-library-batch__summary">
            <strong>批量整理</strong>
            <span>多选模板后可统一改分组、批量置顶，或直接批量移出分组。</span>
          </div>
          <div class="chip-row">
            <n-button
              secondary
              size="small"
              :disabled="batchBusy || !filteredTemplates.length || allFilteredSelected"
              @click="selectAllFiltered"
            >
              全选当前结果
            </n-button>
            <n-button secondary size="small" :disabled="batchBusy || !selectedIds.length" @click="clearSelected">
              清空选择
            </n-button>
            <n-select
              v-model:value="batchGroupNameValue"
              clearable
              filterable
              tag
              class="task-template-library-batch__group"
              :options="groupNameOptions"
              placeholder="选择或输入目标分组"
            />
            <n-button
              :disabled="batchBusy || !selectedIds.length || !normalizedBatchGroupName"
              :loading="batchUpdatingGroups"
              size="small"
              type="primary"
              @click="applyBatchGroup"
            >
              批量改分组
            </n-button>
            <n-button
              secondary
              size="small"
              :disabled="batchBusy || !selectedIds.length"
              :loading="batchUpdatingGroups"
              @click="clearBatchGroup"
            >
              批量移出分组
            </n-button>
            <n-button
              secondary
              size="small"
              type="warning"
              :disabled="batchBusy || !selectedIds.length"
              :loading="batchUpdatingPins"
              @click="applyBatchPinned(true)"
            >
              批量置顶
            </n-button>
            <n-button
              secondary
              size="small"
              :disabled="batchBusy || !selectedIds.length"
              :loading="batchUpdatingPins"
              @click="applyBatchPinned(false)"
            >
              批量取消置顶
            </n-button>
          </div>
        </div>

        <div
          class="task-template-library__drop-zone"
          :class="{
            'task-template-library__drop-zone-target':
              dragOverTaskTemplateGroupKey === taskTemplateGroupDropKey(''),
          }"
          @dragover="handleGroupDragOver('', [], $event)"
          @drop="handleGroupDrop('', [], $event)"
        >
          <strong>拖到这里移出分组</strong>
          <span>模板会保留当前内容与排序权重，只把分组改成“未分组”。</span>
        </div>

        <section v-if="pinnedTemplates.length" class="task-template-library__group">
          <div class="task-template-library__group-header">
            <div class="task-template-library__group-header-main">
              <strong>已置顶</strong>
              <span>{{ pinnedTemplates.length }} 个模板</span>
            </div>
            <div class="chip-row task-template-library__group-header-actions">
              <n-button secondary size="small" :disabled="batchBusy" @click.stop="toggleSelectionForList(pinnedTemplates)">
                {{ areAllSelected(pinnedTemplates) ? '取消本区' : '选择本区' }}
              </n-button>
            </div>
          </div>
          <article
            v-for="templateItem in pinnedTemplates"
            :key="`pin-${templateItem.id}`"
            class="task-template-library__card"
            :class="{
              'task-template-library__card-selected': isTemplateSelected(templateItem.id),
              'task-template-library__card-dragging': draggingTaskTemplateId === templateItem.id,
              'task-template-library__card-target':
                dragOverTaskTemplateId === templateItem.id && draggingTaskTemplateId !== templateItem.id,
            }"
            @dragover="handleDragOver(templateItem.id, taskTemplateIdList(pinnedTemplates), $event)"
            @drop="handleDrop(templateItem.id, taskTemplateIdList(pinnedTemplates), $event)"
          >
            <div class="task-template-library__sort-toolbar">
              <div class="task-template-library__sort-meta">
                <n-checkbox
                  :checked="isTemplateSelected(templateItem.id)"
                  @update:checked="setTemplateSelected(templateItem.id, $event)"
                >
                  选择
                </n-checkbox>
                <button
                  class="task-template-library__drag-handle"
                  :disabled="sortingTaskTemplates || pinnedTemplates.length < 2"
                  draggable="true"
                  type="button"
                  @dragstart="handleDragStart(templateItem.id, taskTemplateIdList(pinnedTemplates), $event)"
                  @dragend="handleDragEnd"
                >
                  拖拽排序
                </button>
              </div>
              <div class="chip-row">
                <n-button
                  secondary
                  size="small"
                  :disabled="!canMove(templateItem.id, taskTemplateIdList(pinnedTemplates), -1)"
                  @click="moveTemplate(templateItem.id, taskTemplateIdList(pinnedTemplates), -1)"
                >
                  上移
                </n-button>
                <n-button
                  secondary
                  size="small"
                  :disabled="!canMove(templateItem.id, taskTemplateIdList(pinnedTemplates), 1)"
                  @click="moveTemplate(templateItem.id, taskTemplateIdList(pinnedTemplates), 1)"
                >
                  下移
                </n-button>
              </div>
            </div>
            <div class="info-row">
              <div class="task-template-library__head">
                <strong>{{ templateItem.title }}</strong>
                <span>预设活动名：{{ templateItem.task_title }}</span>
              </div>
              <div class="chip-row">
                <n-tag round type="error">置顶</n-tag>
                <n-tag v-if="templateItem.group_name" round type="warning">{{ templateItem.group_name }}</n-tag>
                <n-tag round type="info">{{ taskTypeLabel(templateItem.task_type) }}</n-tag>
                <n-tag round :type="templateItem.submission_scope === 'group' ? 'warning' : 'success'">
                  {{ templateItem.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
                </n-tag>
              </div>
            </div>
            <p class="section-note">
              {{ templateItem.summary || richTextToExcerpt(templateItem.task_description, 120) || '当前模板没有补充说明。' }}
            </p>
            <div class="task-template-library__footer">
              <span class="section-note">
                最近使用：{{ formatTaskTemplateUpdatedAt(templateItem.last_used_at) }} · 使用 {{ templateItem.use_count }} 次
              </span>
              <div class="chip-row">
                <n-button secondary size="small" @click="applyTemplate(templateItem)">使用模板</n-button>
                <n-button secondary size="small" type="warning" @click="editTemplate(templateItem)">编辑后覆盖</n-button>
                <n-button secondary size="small" @click="togglePinned(templateItem)">取消置顶</n-button>
                <n-button
                  :loading="deletingTaskTemplateId === templateItem.id"
                  size="small"
                  text
                  type="error"
                  @click="deleteTemplate(templateItem)"
                >
                  删除
                </n-button>
              </div>
            </div>
          </article>
        </section>

        <section v-if="recentTemplates.length" class="task-template-library__group">
          <div class="task-template-library__group-header">
            <div class="task-template-library__group-header-main">
              <strong>最近使用</strong>
              <span>最近 6 个模板</span>
            </div>
          </div>
          <article
            v-for="templateItem in recentTemplates"
            :key="`recent-${templateItem.id}`"
            class="task-template-library__card"
            :class="{
              'task-template-library__card-selected': isTemplateSelected(templateItem.id),
            }"
          >
            <div class="task-template-library__select-row">
              <n-checkbox
                :checked="isTemplateSelected(templateItem.id)"
                @update:checked="setTemplateSelected(templateItem.id, $event)"
              >
                选择
              </n-checkbox>
            </div>
            <div class="info-row">
              <div class="task-template-library__head">
                <strong>{{ templateItem.title }}</strong>
                <span>预设活动名：{{ templateItem.task_title }}</span>
              </div>
              <div class="chip-row">
                <n-tag round>最近使用</n-tag>
                <n-tag v-if="templateItem.group_name" round type="warning">{{ templateItem.group_name }}</n-tag>
                <n-tag round type="info">{{ taskTypeLabel(templateItem.task_type) }}</n-tag>
                <n-tag round :type="templateItem.submission_scope === 'group' ? 'warning' : 'success'">
                  {{ templateItem.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
                </n-tag>
              </div>
            </div>
            <p class="section-note">
              {{ templateItem.summary || richTextToExcerpt(templateItem.task_description, 120) || '当前模板没有补充说明。' }}
            </p>
            <div class="task-template-library__footer">
              <span class="section-note">
                最近使用：{{ formatTaskTemplateUpdatedAt(templateItem.last_used_at) }} · 使用 {{ templateItem.use_count }} 次
              </span>
              <div class="chip-row">
                <n-button secondary size="small" @click="applyTemplate(templateItem)">使用模板</n-button>
                <n-button secondary size="small" type="warning" @click="editTemplate(templateItem)">编辑后覆盖</n-button>
                <n-button secondary size="small" @click="togglePinned(templateItem)">置顶</n-button>
                <n-button
                  :loading="deletingTaskTemplateId === templateItem.id"
                  size="small"
                  text
                  type="error"
                  @click="deleteTemplate(templateItem)"
                >
                  删除
                </n-button>
              </div>
            </div>
          </article>
        </section>

        <section v-for="group in groupSections" :key="group.key || 'ungrouped'" class="task-template-library__group">
          <div
            class="task-template-library__group-header"
            :class="{
              'task-template-library__group-header-target':
                dragOverTaskTemplateGroupKey === taskTemplateGroupDropKey(group.key),
            }"
            @dragover="handleGroupDragOver(group.key, taskTemplateIdList(group.items), $event)"
            @drop="handleGroupDrop(group.key, taskTemplateIdList(group.items), $event)"
          >
            <div class="task-template-library__group-header-main">
              <strong>{{ group.label }}</strong>
              <span>{{ group.items.length }} 个模板</span>
            </div>
            <div class="chip-row task-template-library__group-header-actions">
              <n-button secondary size="small" :disabled="batchBusy" @click.stop="toggleSelectionForList(group.items)">
                {{ areAllSelected(group.items) ? '取消本组' : '选择本组' }}
              </n-button>
            </div>
          </div>
          <article
            v-for="templateItem in group.items"
            :key="templateItem.id"
            class="task-template-library__card"
            :class="{
              'task-template-library__card-selected': isTemplateSelected(templateItem.id),
              'task-template-library__card-dragging': draggingTaskTemplateId === templateItem.id,
              'task-template-library__card-target':
                dragOverTaskTemplateId === templateItem.id && draggingTaskTemplateId !== templateItem.id,
            }"
            @dragover="handleDragOver(templateItem.id, taskTemplateIdList(group.items), $event)"
            @drop="handleDrop(templateItem.id, taskTemplateIdList(group.items), $event)"
          >
            <div class="task-template-library__sort-toolbar">
              <div class="task-template-library__sort-meta">
                <n-checkbox
                  :checked="isTemplateSelected(templateItem.id)"
                  @update:checked="setTemplateSelected(templateItem.id, $event)"
                >
                  选择
                </n-checkbox>
                <button
                  class="task-template-library__drag-handle"
                  :disabled="sortingTaskTemplates"
                  draggable="true"
                  type="button"
                  @dragstart="handleDragStart(templateItem.id, taskTemplateIdList(group.items), $event)"
                  @dragend="handleDragEnd"
                >
                  拖拽排序
                </button>
              </div>
              <div class="chip-row">
                <n-button
                  secondary
                  size="small"
                  :disabled="!canMove(templateItem.id, taskTemplateIdList(group.items), -1)"
                  @click="moveTemplate(templateItem.id, taskTemplateIdList(group.items), -1)"
                >
                  上移
                </n-button>
                <n-button
                  secondary
                  size="small"
                  :disabled="!canMove(templateItem.id, taskTemplateIdList(group.items), 1)"
                  @click="moveTemplate(templateItem.id, taskTemplateIdList(group.items), 1)"
                >
                  下移
                </n-button>
              </div>
            </div>
            <div class="info-row">
              <div class="task-template-library__head">
                <strong>{{ templateItem.title }}</strong>
                <span>预设活动名：{{ templateItem.task_title }}</span>
              </div>
              <div class="chip-row">
                <n-tag v-if="templateItem.is_pinned" round type="error">置顶</n-tag>
                <n-tag v-if="templateItem.group_name" round type="warning">{{ templateItem.group_name }}</n-tag>
                <n-tag round type="info">{{ taskTypeLabel(templateItem.task_type) }}</n-tag>
                <n-tag round :type="templateItem.submission_scope === 'group' ? 'warning' : 'success'">
                  {{ templateItem.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
                </n-tag>
                <n-tag round :type="templateItem.is_required ? 'success' : 'warning'">
                  {{ templateItem.is_required ? '必做' : '选做' }}
                </n-tag>
              </div>
            </div>
            <p class="section-note">
              {{ templateItem.summary || richTextToExcerpt(templateItem.task_description, 120) || '当前模板没有补充说明。' }}
            </p>
            <div class="task-template-library__footer">
              <span class="section-note">
                最近使用：{{ formatTaskTemplateUpdatedAt(templateItem.last_used_at) }} · 使用 {{ templateItem.use_count }} 次
              </span>
              <div class="chip-row">
                <n-button secondary size="small" @click="applyTemplate(templateItem)">使用模板</n-button>
                <n-button secondary size="small" type="warning" @click="editTemplate(templateItem)">编辑后覆盖</n-button>
                <n-button secondary size="small" @click="togglePinned(templateItem)">
                  {{ templateItem.is_pinned ? '取消置顶' : '置顶' }}
                </n-button>
                <n-button
                  :loading="deletingTaskTemplateId === templateItem.id"
                  size="small"
                  text
                  type="error"
                  @click="deleteTemplate(templateItem)"
                >
                  删除
                </n-button>
              </div>
            </div>
          </article>
        </section>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <n-button @click="dialogVisible = false">关闭</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { NButton, NCheckbox, NEmpty, NInput, NModal, NSelect, NTag } from 'naive-ui';
import { computed } from 'vue';

import type {
  CustomTaskTemplate,
  TaskTemplateGroupSection,
  TaskTemplateLibraryFilter,
} from '../lessonPlan.types';

const props = defineProps<{
  modelValue: boolean;
  loading: boolean;
  templates: CustomTaskTemplate[];
  filteredTemplates: CustomTaskTemplate[];
  pinnedTemplates: CustomTaskTemplate[];
  recentTemplates: CustomTaskTemplate[];
  groupSections: TaskTemplateGroupSection[];
  groupOptions: string[];
  filter: TaskTemplateLibraryFilter;
  selectedIds: number[];
  selectedFilteredCount: number;
  allFilteredSelected: boolean;
  batchGroupName: string;
  batchBusy: boolean;
  batchUpdatingGroups: boolean;
  batchUpdatingPins: boolean;
  sortingTaskTemplates: boolean;
  deletingTaskTemplateId: number | null;
  draggingTaskTemplateId: number | null;
  dragOverTaskTemplateId: number | null;
  dragOverTaskTemplateGroupKey: string;
  taskTemplateGroupDropKey: (groupName: string | null | undefined) => string;
  taskTemplateIdList: (templates: CustomTaskTemplate[]) => number[];
  taskTypeLabel: (taskType: string) => string;
  formatTaskTemplateUpdatedAt: (value: string | null) => string;
  richTextToExcerpt: (value: string | null | undefined, maxLength: number) => string;
  isTemplateSelected: (templateId: number) => boolean;
  setTemplateSelected: (templateId: number, selected: boolean) => void;
  toggleSelectionForList: (templates: CustomTaskTemplate[]) => void;
  areAllSelected: (templates: CustomTaskTemplate[]) => boolean;
  selectAllFiltered: () => void;
  clearSelected: () => void;
  applyBatchGroup: () => void;
  clearBatchGroup: () => void;
  applyBatchPinned: (isPinned: boolean) => void;
  handleGroupDragOver: (groupName: string | null | undefined, visibleIds: number[], event: DragEvent) => void;
  handleGroupDrop: (groupName: string | null | undefined, visibleIds: number[], event: DragEvent) => void;
  handleDragOver: (templateId: number, visibleIds: number[], event: DragEvent) => void;
  handleDrop: (templateId: number, visibleIds: number[], event: DragEvent) => void;
  handleDragStart: (templateId: number, visibleIds: number[], event: DragEvent) => void;
  handleDragEnd: () => void;
  canMove: (templateId: number, visibleIds: number[], direction: -1 | 1) => boolean;
  moveTemplate: (templateId: number, visibleIds: number[], direction: -1 | 1) => void;
  applyTemplate: (template: CustomTaskTemplate) => void;
  editTemplate: (template: CustomTaskTemplate) => void;
  togglePinned: (template: CustomTaskTemplate) => void;
  deleteTemplate: (template: CustomTaskTemplate) => void;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:filter', value: TaskTemplateLibraryFilter): void;
  (e: 'update:batchGroupName', value: string): void;
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const keywordValue = computed({
  get: () => props.filter.keyword,
  set: (value: string) =>
    emit('update:filter', {
      ...props.filter,
      keyword: value,
    }),
});

const groupNameValue = computed({
  get: () => props.filter.group_name,
  set: (value: string) =>
    emit('update:filter', {
      ...props.filter,
      group_name: value ?? '',
    }),
});

const batchGroupNameValue = computed({
  get: () => props.batchGroupName,
  set: (value: string) => emit('update:batchGroupName', value ?? ''),
});

const normalizedBatchGroupName = computed(() => props.batchGroupName.trim());

const groupNameOptions = computed(() =>
  props.groupOptions.map((groupName) => ({
    label: groupName,
    value: groupName,
  }))
);
</script>

<style scoped>
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.section-note {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.task-template-library {
  display: grid;
  gap: 14px;
}

.task-template-library-batch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 18px;
  background: var(--ls-panel-soft);
}

.task-template-library-batch__summary {
  display: grid;
  gap: 4px;
}

.task-template-library-batch__summary strong {
  font-size: 14px;
  color: var(--ls-text);
}

.task-template-library-batch__summary span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-template-library-batch__group {
  width: min(240px, 100%);
}

.task-template-library-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.task-template-library-toolbar__search {
  flex: 1 1 260px;
}

.task-template-library-toolbar__group {
  width: min(220px, 100%);
}

.task-template-library--loading {
  min-height: 160px;
  place-items: center;
  display: grid;
  color: var(--ls-muted);
}

.task-template-library__group {
  display: grid;
  gap: 12px;
}

.task-template-library__drop-zone {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border: 1px dashed rgba(66, 97, 162, 0.24);
  border-radius: 18px;
  background: var(--ls-panel-soft);
  color: var(--ls-muted);
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.task-template-library__drop-zone strong {
  color: var(--ls-text);
  font-size: 13px;
}

.task-template-library__drop-zone span {
  font-size: 12px;
  line-height: 1.5;
}

.task-template-library__drop-zone-target,
.task-template-library__group-header-target {
  border-color: rgba(66, 97, 162, 0.4);
  background: var(--ls-primary-soft);
  box-shadow: 0 12px 26px rgba(66, 97, 162, 0.1);
}

.task-template-library__group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
  color: var(--ls-muted);
  border: 1px dashed transparent;
  border-radius: 14px;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.task-template-library__group-header-main {
  display: grid;
  gap: 2px;
}

.task-template-library__group-header-actions {
  flex: 0 0 auto;
}

.task-template-library__group-header strong {
  color: var(--ls-text);
  font-size: 14px;
}

.task-template-library__group-header span {
  font-size: 12px;
}

.task-template-library__card {
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 20px;
  background: var(--ls-card);
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.task-template-library__card-selected {
  border-color: rgba(66, 97, 162, 0.3);
  background: var(--ls-primary-soft);
  box-shadow: 0 12px 26px rgba(66, 97, 162, 0.08);
}

.task-template-library__card-dragging {
  opacity: 0.56;
}

.task-template-library__card-target {
  border-color: rgba(66, 97, 162, 0.35);
  box-shadow: 0 14px 28px rgba(66, 97, 162, 0.12);
  transform: translateY(-2px);
}

.task-template-library__sort-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.task-template-library__sort-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.task-template-library__select-row {
  display: flex;
  justify-content: flex-start;
}

.task-template-library__drag-handle {
  border: 1px dashed rgba(66, 97, 162, 0.3);
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--ls-chip-bg);
  color: var(--ls-text);
  font: inherit;
  cursor: grab;
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;
}

.task-template-library__drag-handle:hover,
.task-template-library__drag-handle:focus-visible {
  border-color: rgba(66, 97, 162, 0.56);
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
  outline: none;
}

.task-template-library__drag-handle:active {
  cursor: grabbing;
}

.task-template-library__drag-handle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.task-template-library__head {
  display: grid;
  gap: 4px;
}

.task-template-library__head span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-template-library__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .info-row,
  .task-template-library__sort-toolbar,
  .task-template-library-batch {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
