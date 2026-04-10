import { computed, ref, watch, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import { richTextToPlainText } from '@/utils/richText';
import type {
  CustomTaskTemplate,
  PlanFormTask,
  TaskTemplateDropdownCommand,
  TaskTemplateFormState,
  TaskTemplateGroupSection,
  TaskTemplateLibraryFilter,
  TaskTemplatePresetId,
} from '../lessonPlan.types';

type UseTaskTemplateLibraryOptions = {
  authToken: Ref<string | null | undefined>;
  errorMessage: Ref<string>;
  planForm: Ref<{
    tasks: PlanFormTask[];
  }>;
  createTaskFromTemplate: (presetId: TaskTemplatePresetId) => PlanFormTask;
  createTaskFromCustomTemplate: (
    template: CustomTaskTemplate,
    options?: {
      linkTemplate?: boolean;
    }
  ) => PlanFormTask;
  appendTaskToEditor: (task: PlanFormTask) => void;
  buildSuggestedTaskTemplateName: (task: PlanFormTask) => string;
  buildSuggestedTaskTemplateSummary: (task: PlanFormTask) => string;
  buildTaskTemplateConfigPayload: (task: PlanFormTask) => Record<string, unknown> | null;
  normalizeTaskSubmissionScope: (taskType: string, currentScope?: string) => string;
  normalizeHtmlValue: (value: string, mode: 'visual' | 'source') => string | null;
  taskTypeLabel: (taskType: string) => string;
  isDialogCancelled: (error: unknown) => boolean;
};

function normalizeTaskTemplateGroupNameValue(groupName: string | null | undefined) {
  return (groupName || '').trim();
}

function taskTemplateGroupDropKey(groupName: string | null | undefined) {
  const normalized = normalizeTaskTemplateGroupNameValue(groupName);
  return normalized || '__ungrouped__';
}

function taskTemplateSortOrderValue(sortOrder: number | null | undefined) {
  return typeof sortOrder === 'number' && Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : 1000;
}

function taskTemplateDateSortValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortCustomTaskTemplates(templates: CustomTaskTemplate[]) {
  return [...templates].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) {
      return left.is_pinned ? -1 : 1;
    }
    const sortOrderDelta = taskTemplateSortOrderValue(left.sort_order) - taskTemplateSortOrderValue(right.sort_order);
    if (sortOrderDelta !== 0) {
      return sortOrderDelta;
    }
    const lastUsedDelta = taskTemplateDateSortValue(right.last_used_at) - taskTemplateDateSortValue(left.last_used_at);
    if (lastUsedDelta !== 0) {
      return lastUsedDelta;
    }
    const groupCompare = normalizeTaskTemplateGroupNameValue(left.group_name).localeCompare(
      normalizeTaskTemplateGroupNameValue(right.group_name),
      'zh-CN'
    );
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return taskTemplateDateSortValue(right.updated_at) - taskTemplateDateSortValue(left.updated_at);
  });
}

function taskTemplateGroupLabel(groupName: string | null | undefined) {
  return normalizeTaskTemplateGroupNameValue(groupName) || '未分组';
}

function buildTaskTemplateGroupSections(templates: CustomTaskTemplate[]): TaskTemplateGroupSection[] {
  const grouped = new Map<string, CustomTaskTemplate[]>();
  for (const template of templates) {
    const key = normalizeTaskTemplateGroupNameValue(template.group_name);
    const current = grouped.get(key) || [];
    current.push(template);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => {
      if (!left && !right) {
        return 0;
      }
      if (!left) {
        return 1;
      }
      if (!right) {
        return -1;
      }
      return left.localeCompare(right, 'zh-CN');
    })
    .map(([key, items]) => ({
      key,
      label: taskTemplateGroupLabel(key),
      items,
    }));
}

export function useTaskTemplateLibrary(options: UseTaskTemplateLibraryOptions) {
  const customTaskTemplates = ref<CustomTaskTemplate[]>([]);
  const customTaskTemplatesLoading = ref(false);
  const taskTemplateDialogVisible = ref(false);
  const taskTemplateLibraryVisible = ref(false);
  const savingTaskTemplate = ref(false);
  const deletingTaskTemplateId = ref<number | null>(null);
  const sortingTaskTemplates = ref(false);
  const draggingTaskTemplateId = ref<number | null>(null);
  const dragOverTaskTemplateId = ref<number | null>(null);
  const dragOverTaskTemplateGroupKey = ref('');
  const draggingTaskTemplateVisibleIds = ref<number[]>([]);
  const selectedCustomTaskTemplateIds = ref<number[]>([]);
  const taskTemplateBatchGroupName = ref('');
  const batchUpdatingTaskTemplateGroups = ref(false);
  const batchUpdatingTaskTemplatePins = ref(false);
  const taskTemplateSourceTaskKey = ref('');
  const taskTemplateLibraryFilter = ref<TaskTemplateLibraryFilter>({
    keyword: '',
    group_name: '',
  });
  const taskTemplateForm = ref<TaskTemplateFormState>({
    mode: 'create',
    templateId: null,
    group_name: '',
    title: '',
    summary: '',
    is_pinned: false,
  });

  const taskTemplateSourceTask = computed(
    () => options.planForm.value.tasks.find((task) => task.key === taskTemplateSourceTaskKey.value) || null
  );
  const taskTemplateDialogTitle = computed(() =>
    taskTemplateForm.value.mode === 'overwrite' ? '覆盖自定义模板' : '另存为自定义模板'
  );
  const taskTemplateSaveButtonLabel = computed(() =>
    taskTemplateForm.value.mode === 'overwrite' ? '覆盖保存' : '保存模板'
  );
  const taskTemplateGroupOptions = computed(() =>
    Array.from(
      new Set(
        customTaskTemplates.value
          .map((template) => normalizeTaskTemplateGroupNameValue(template.group_name))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  );
  const filteredCustomTaskTemplates = computed(() => {
    const keyword = taskTemplateLibraryFilter.value.keyword.trim().toLowerCase();
    const groupName = normalizeTaskTemplateGroupNameValue(taskTemplateLibraryFilter.value.group_name);

    return customTaskTemplates.value.filter((template) => {
      if (groupName && normalizeTaskTemplateGroupNameValue(template.group_name) !== groupName) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const fields = [
        template.title,
        template.group_name,
        template.summary || '',
        template.task_title,
        template.task_description || '',
        options.taskTypeLabel(template.task_type),
      ];
      return fields.some((field) => field.toLowerCase().includes(keyword));
    });
  });
  const filteredTaskTemplateGroupSections = computed(() =>
    buildTaskTemplateGroupSections(filteredCustomTaskTemplates.value.filter((template) => !template.is_pinned))
  );
  const selectedCustomTaskTemplateIdSet = computed(() => new Set(selectedCustomTaskTemplateIds.value));
  const selectedFilteredCustomTaskTemplateCount = computed(() =>
    filteredCustomTaskTemplates.value.filter((template) => selectedCustomTaskTemplateIdSet.value.has(template.id))
      .length
  );
  const taskTemplateBatchBusy = computed(
    () => sortingTaskTemplates.value || batchUpdatingTaskTemplateGroups.value || batchUpdatingTaskTemplatePins.value
  );
  const allFilteredCustomTaskTemplatesSelected = computed(
    () =>
      filteredCustomTaskTemplates.value.length > 0 &&
      filteredCustomTaskTemplates.value.every((template) => selectedCustomTaskTemplateIdSet.value.has(template.id))
  );
  const pinnedCustomTaskTemplates = computed(() =>
    filteredCustomTaskTemplates.value.filter((template) => template.is_pinned)
  );
  const recentCustomTaskTemplates = computed(() =>
    [...filteredCustomTaskTemplates.value]
      .filter((template) => !template.is_pinned && Boolean(template.last_used_at))
      .sort((left, right) => taskTemplateDateSortValue(right.last_used_at) - taskTemplateDateSortValue(left.last_used_at))
      .slice(0, 6)
  );
  const dropdownPinnedCustomTaskTemplates = computed(() =>
    customTaskTemplates.value.filter((template) => template.is_pinned).slice(0, 6)
  );
  const dropdownRecentCustomTaskTemplates = computed(() =>
    [...customTaskTemplates.value]
      .filter((template) => !template.is_pinned && Boolean(template.last_used_at))
      .sort((left, right) => taskTemplateDateSortValue(right.last_used_at) - taskTemplateDateSortValue(left.last_used_at))
      .slice(0, 6)
  );
  const dropdownRecentTemplateIdSet = computed(
    () => new Set(dropdownRecentCustomTaskTemplates.value.map((template) => template.id))
  );
  const customTaskTemplateDropdownGroups = computed(() =>
    buildTaskTemplateGroupSections(
      customTaskTemplates.value.filter(
        (template) => !template.is_pinned && !dropdownRecentTemplateIdSet.value.has(template.id)
      )
    )
  );

  function findCustomTaskTemplate(templateId: number) {
    return customTaskTemplates.value.find((template) => template.id === templateId) || null;
  }

  function updateCustomTaskTemplateInState(template: CustomTaskTemplate) {
    const currentIndex = customTaskTemplates.value.findIndex((item) => item.id === template.id);
    if (currentIndex < 0) {
      customTaskTemplates.value = sortCustomTaskTemplates([...customTaskTemplates.value, template]);
      return;
    }
    const nextTemplates = [...customTaskTemplates.value];
    nextTemplates.splice(currentIndex, 1, template);
    customTaskTemplates.value = sortCustomTaskTemplates(nextTemplates);
  }

  function taskTemplateIdList(templates: CustomTaskTemplate[]) {
    return templates.map((template) => template.id);
  }

  function isCustomTaskTemplateSelected(templateId: number) {
    return selectedCustomTaskTemplateIdSet.value.has(templateId);
  }

  function setCustomTaskTemplateSelected(templateId: number, selected: boolean) {
    const currentSet = new Set(selectedCustomTaskTemplateIds.value);
    if (selected) {
      currentSet.add(templateId);
    } else {
      currentSet.delete(templateId);
    }
    selectedCustomTaskTemplateIds.value = Array.from(currentSet);
  }

  function clearSelectedCustomTaskTemplates() {
    selectedCustomTaskTemplateIds.value = [];
  }

  function selectAllFilteredCustomTaskTemplates() {
    const nextSelected = new Set(selectedCustomTaskTemplateIds.value);
    for (const template of filteredCustomTaskTemplates.value) {
      nextSelected.add(template.id);
    }
    selectedCustomTaskTemplateIds.value = Array.from(nextSelected);
  }

  function areAllCustomTaskTemplatesSelected(templates: CustomTaskTemplate[]) {
    return templates.length > 0 && templates.every((template) => selectedCustomTaskTemplateIdSet.value.has(template.id));
  }

  function setCustomTaskTemplatesSelected(templateIds: number[], selected: boolean) {
    const nextSelected = new Set(selectedCustomTaskTemplateIds.value);
    for (const templateId of templateIds) {
      if (selected) {
        nextSelected.add(templateId);
      } else {
        nextSelected.delete(templateId);
      }
    }
    selectedCustomTaskTemplateIds.value = Array.from(nextSelected);
  }

  function toggleCustomTaskTemplateSelectionForList(templates: CustomTaskTemplate[]) {
    const templateIds = taskTemplateIdList(templates);
    if (!templateIds.length) {
      return;
    }
    setCustomTaskTemplatesSelected(templateIds, !areAllCustomTaskTemplatesSelected(templates));
  }

  function sameTaskTemplateIdOrder(left: number[], right: number[]) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((id, index) => id === right[index]);
  }

  function moveTaskTemplateIdBeforeTarget(visibleIds: number[], templateId: number, targetId: number) {
    if (templateId === targetId) {
      return visibleIds;
    }
    const currentIndex = visibleIds.indexOf(templateId);
    const targetIndex = visibleIds.indexOf(targetId);
    if (currentIndex < 0 || targetIndex < 0) {
      return visibleIds;
    }
    const nextVisibleIds = [...visibleIds];
    const [movedId] = nextVisibleIds.splice(currentIndex, 1);
    if (movedId === undefined) {
      return visibleIds;
    }
    const nextTargetIndex = nextVisibleIds.indexOf(targetId);
    if (nextTargetIndex < 0) {
      return visibleIds;
    }
    nextVisibleIds.splice(nextTargetIndex, 0, movedId);
    return nextVisibleIds;
  }

  function moveTaskTemplateIdByOffset(visibleIds: number[], templateId: number, direction: -1 | 1) {
    const currentIndex = visibleIds.indexOf(templateId);
    if (currentIndex < 0) {
      return visibleIds;
    }
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= visibleIds.length) {
      return visibleIds;
    }
    const nextVisibleIds = [...visibleIds];
    const [movedId] = nextVisibleIds.splice(currentIndex, 1);
    if (movedId === undefined) {
      return visibleIds;
    }
    nextVisibleIds.splice(targetIndex, 0, movedId);
    return nextVisibleIds;
  }

  function applyCustomTaskTemplateSortOrder(templates: CustomTaskTemplate[]) {
    return templates.map((template, index) => ({
      ...template,
      sort_order: index + 1,
    }));
  }

  function mergeVisibleTaskTemplateOrder(visibleIds: number[], nextVisibleIds: number[]) {
    if (!visibleIds.length) {
      return customTaskTemplates.value;
    }
    const normalizedVisibleIds = [...visibleIds].sort((left, right) => left - right);
    const normalizedNextVisibleIds = [...nextVisibleIds].sort((left, right) => left - right);
    if (!sameTaskTemplateIdOrder(normalizedVisibleIds, normalizedNextVisibleIds)) {
      return customTaskTemplates.value;
    }
    const visibleIdSet = new Set(visibleIds);
    const templateById = new Map(customTaskTemplates.value.map((template) => [template.id, template] as const));
    let visibleIndex = 0;
    return customTaskTemplates.value.map((template) => {
      if (!visibleIdSet.has(template.id)) {
        return template;
      }
      const nextTemplateId = nextVisibleIds[visibleIndex];
      visibleIndex += 1;
      return templateById.get(nextTemplateId) || template;
    });
  }

  function canMoveCustomTaskTemplate(templateId: number, visibleIds: number[], direction: -1 | 1) {
    if (sortingTaskTemplates.value) {
      return false;
    }
    const currentIndex = visibleIds.indexOf(templateId);
    if (currentIndex < 0) {
      return false;
    }
    const targetIndex = currentIndex + direction;
    return targetIndex >= 0 && targetIndex < visibleIds.length;
  }

  function buildNextCustomTaskTemplatesForGroupMove(
    templateId: number,
    targetGroupName: string | null | undefined,
    targetVisibleIds: number[],
    targetBeforeId: number | null
  ) {
    const draggedTemplate = findCustomTaskTemplate(templateId);
    if (!draggedTemplate || draggedTemplate.is_pinned) {
      return null;
    }

    const normalizedTargetGroupName = normalizeTaskTemplateGroupNameValue(targetGroupName);
    const currentTemplates = [...customTaskTemplates.value];
    const nextTemplates = currentTemplates.filter((template) => template.id !== templateId);
    const nextDraggedTemplate: CustomTaskTemplate = {
      ...draggedTemplate,
      group_name: normalizedTargetGroupName,
    };

    let insertIndex = nextTemplates.length;
    if (targetBeforeId !== null) {
      const targetIndex = nextTemplates.findIndex((template) => template.id === targetBeforeId);
      if (targetIndex >= 0) {
        insertIndex = targetIndex;
      }
    } else {
      const nextVisibleIds = targetVisibleIds.filter((id) => id !== templateId);
      let lastTargetIndex = -1;
      for (const visibleId of nextVisibleIds) {
        const targetIndex = nextTemplates.findIndex((template) => template.id === visibleId);
        if (targetIndex > lastTargetIndex) {
          lastTargetIndex = targetIndex;
        }
      }
      if (lastTargetIndex >= 0) {
        insertIndex = lastTargetIndex + 1;
      }
    }

    nextTemplates.splice(insertIndex, 0, nextDraggedTemplate);
    return {
      nextTemplates,
      normalizedTargetGroupName,
      draggedTemplate,
    };
  }

  async function persistCustomTaskTemplateOrder(
    nextTemplates: CustomTaskTemplate[],
    persistOptions?: {
      successMessage?: string;
      groupUpdates?: Array<{
        id: number;
        group_name: string | null;
      }>;
    }
  ) {
    if (!options.authToken.value) {
      return false;
    }

    const previousTemplates = customTaskTemplates.value;
    const optimisticTemplates = sortCustomTaskTemplates(applyCustomTaskTemplateSortOrder(nextTemplates));
    customTaskTemplates.value = optimisticTemplates;
    sortingTaskTemplates.value = true;

    try {
      const response = await apiPost<{ templates: CustomTaskTemplate[] }>(
        '/lesson-plans/staff/task-templates/reorder',
        {
          ordered_ids: optimisticTemplates.map((template) => template.id),
          group_updates: persistOptions?.groupUpdates || [],
        },
        options.authToken.value
      );
      customTaskTemplates.value = sortCustomTaskTemplates(response.templates);
      if (persistOptions?.successMessage) {
        ElMessage.success(persistOptions.successMessage);
      }
      return true;
    } catch (error) {
      customTaskTemplates.value = previousTemplates;
      const message = error instanceof Error ? error.message : '更新模板排序失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
      return false;
    } finally {
      sortingTaskTemplates.value = false;
    }
  }

  async function updateSelectedTaskTemplateGroups(targetGroupName: string | null) {
    if (taskTemplateBatchBusy.value) {
      return;
    }
    if (!selectedCustomTaskTemplateIds.value.length) {
      ElMessage.warning('请先选择要整理的模板');
      return;
    }

    const selectedIdSet = new Set(selectedCustomTaskTemplateIds.value);
    const normalizedTargetGroupName = normalizeTaskTemplateGroupNameValue(targetGroupName);
    const groupUpdates = customTaskTemplates.value
      .filter(
        (template) =>
          selectedIdSet.has(template.id) &&
          normalizeTaskTemplateGroupNameValue(template.group_name) !== normalizedTargetGroupName
      )
      .map((template) => ({
        id: template.id,
        group_name: normalizedTargetGroupName || null,
      }));

    if (!groupUpdates.length) {
      ElMessage.info(
        normalizedTargetGroupName
          ? `所选模板已经都在“${normalizedTargetGroupName}”分组中`
          : '所选模板已经是未分组状态'
      );
      return;
    }

    const nextTemplates = customTaskTemplates.value.map((template) =>
      selectedIdSet.has(template.id)
        ? {
            ...template,
            group_name: normalizedTargetGroupName,
          }
        : template
    );

    batchUpdatingTaskTemplateGroups.value = true;
    try {
      const success = await persistCustomTaskTemplateOrder(nextTemplates, {
        successMessage: normalizedTargetGroupName
          ? `已将 ${groupUpdates.length} 个模板移到“${normalizedTargetGroupName}”`
          : `已将 ${groupUpdates.length} 个模板移出分组`,
        groupUpdates,
      });
      if (success) {
        clearSelectedCustomTaskTemplates();
        taskTemplateBatchGroupName.value = '';
      }
    } finally {
      batchUpdatingTaskTemplateGroups.value = false;
    }
  }

  async function updateSelectedTaskTemplatePinned(isPinned: boolean) {
    if (taskTemplateBatchBusy.value) {
      return;
    }
    if (!options.authToken.value) {
      return;
    }
    if (!selectedCustomTaskTemplateIds.value.length) {
      ElMessage.warning('请先选择要整理的模板');
      return;
    }

    const selectedIdSet = new Set(selectedCustomTaskTemplateIds.value);
    const targetTemplates = customTaskTemplates.value.filter(
      (template) => selectedIdSet.has(template.id) && template.is_pinned !== isPinned
    );

    if (!targetTemplates.length) {
      ElMessage.info(isPinned ? '所选模板已经全部置顶' : '所选模板已经全部取消置顶');
      return;
    }

    batchUpdatingTaskTemplatePins.value = true;
    options.errorMessage.value = '';

    try {
      const updatedTemplates = new Map<number, CustomTaskTemplate>();
      for (const template of targetTemplates) {
        const response = await apiPost<{ template: CustomTaskTemplate }>(
          `/lesson-plans/staff/task-templates/${template.id}/pin`,
          { is_pinned: isPinned },
          options.authToken.value
        );
        updatedTemplates.set(template.id, response.template);
      }

      customTaskTemplates.value = sortCustomTaskTemplates(
        customTaskTemplates.value.map((template) => updatedTemplates.get(template.id) || template)
      );
      clearSelectedCustomTaskTemplates();
      ElMessage.success(
        isPinned
          ? `已将 ${updatedTemplates.size} 个模板批量置顶`
          : `已将 ${updatedTemplates.size} 个模板批量取消置顶`
      );
    } catch (error) {
      try {
        await loadCustomTaskTemplates();
      } catch {
        // Keep the previous visible state if reload also fails.
      }
      const message = error instanceof Error ? error.message : '批量更新模板置顶状态失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    } finally {
      batchUpdatingTaskTemplatePins.value = false;
    }
  }

  function moveCustomTaskTemplateToGroup(
    templateId: number,
    targetGroupName: string | null | undefined,
    targetVisibleIds: number[],
    targetBeforeId: number | null
  ) {
    const result = buildNextCustomTaskTemplatesForGroupMove(
      templateId,
      targetGroupName,
      targetVisibleIds,
      targetBeforeId
    );
    if (!result) {
      return;
    }

    const currentGroupName = normalizeTaskTemplateGroupNameValue(result.draggedTemplate.group_name);
    const nextTemplateIds = taskTemplateIdList(result.nextTemplates);
    const currentTemplateIds = taskTemplateIdList(customTaskTemplates.value);
    const onlyGroupChanged = sameTaskTemplateIdOrder(nextTemplateIds, currentTemplateIds);

    if (onlyGroupChanged && currentGroupName === result.normalizedTargetGroupName) {
      return;
    }

    const targetGroupLabel = result.normalizedTargetGroupName || '未分组';
    void persistCustomTaskTemplateOrder(result.nextTemplates, {
      successMessage: `模板已移动到“${targetGroupLabel}”`,
      groupUpdates: [
        {
          id: templateId,
          group_name: result.normalizedTargetGroupName || null,
        },
      ],
    });
  }

  function reorderCustomTaskTemplatesInLibrary(visibleIds: number[], templateId: number, targetId: number) {
    const nextVisibleIds = moveTaskTemplateIdBeforeTarget(visibleIds, templateId, targetId);
    if (sameTaskTemplateIdOrder(nextVisibleIds, visibleIds)) {
      return;
    }
    const nextTemplates = mergeVisibleTaskTemplateOrder(visibleIds, nextVisibleIds);
    void persistCustomTaskTemplateOrder(nextTemplates);
  }

  function moveCustomTaskTemplate(templateId: number, visibleIds: number[], direction: -1 | 1) {
    const nextVisibleIds = moveTaskTemplateIdByOffset(visibleIds, templateId, direction);
    if (sameTaskTemplateIdOrder(nextVisibleIds, visibleIds)) {
      return;
    }
    const nextTemplates = mergeVisibleTaskTemplateOrder(visibleIds, nextVisibleIds);
    void persistCustomTaskTemplateOrder(nextTemplates, { successMessage: '模板顺序已调整' });
  }

  function handleTaskTemplateDragStart(templateId: number, visibleIds: number[], event: DragEvent) {
    draggingTaskTemplateId.value = templateId;
    dragOverTaskTemplateId.value = templateId;
    dragOverTaskTemplateGroupKey.value = '';
    draggingTaskTemplateVisibleIds.value = [...visibleIds];
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(templateId));
    }
  }

  function handleTaskTemplateDragOver(templateId: number, visibleIds: number[], event: DragEvent) {
    if (sortingTaskTemplates.value || !draggingTaskTemplateId.value || draggingTaskTemplateId.value === templateId) {
      return;
    }
    const draggedTemplate = findCustomTaskTemplate(draggingTaskTemplateId.value);
    const targetTemplate = findCustomTaskTemplate(templateId);
    if (!draggedTemplate || !targetTemplate) {
      return;
    }
    event.preventDefault();
    const sameList = sameTaskTemplateIdOrder(visibleIds, draggingTaskTemplateVisibleIds.value);
    const canCrossGroupMove =
      !draggedTemplate.is_pinned &&
      !targetTemplate.is_pinned &&
      normalizeTaskTemplateGroupNameValue(draggedTemplate.group_name) !==
        normalizeTaskTemplateGroupNameValue(targetTemplate.group_name) &&
      !sameList;
    dragOverTaskTemplateId.value = templateId;
    dragOverTaskTemplateGroupKey.value = canCrossGroupMove ? taskTemplateGroupDropKey(targetTemplate.group_name) : '';
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleTaskTemplateDrop(templateId: number, visibleIds: number[], event: DragEvent) {
    event.preventDefault();
    const draggedId = Number(event.dataTransfer?.getData('text/plain') || draggingTaskTemplateId.value || 0);
    handleTaskTemplateDragEnd();
    if (!draggedId || draggedId === templateId) {
      return;
    }

    const targetTemplate = findCustomTaskTemplate(templateId);
    if (!targetTemplate) {
      return;
    }

    if (sameTaskTemplateIdOrder(visibleIds, draggingTaskTemplateVisibleIds.value)) {
      reorderCustomTaskTemplatesInLibrary(visibleIds, draggedId, templateId);
      return;
    }

    moveCustomTaskTemplateToGroup(draggedId, targetTemplate.group_name, visibleIds, templateId);
  }

  function handleTaskTemplateGroupDragOver(
    groupName: string | null | undefined,
    visibleIds: number[],
    event: DragEvent
  ) {
    if (sortingTaskTemplates.value || !draggingTaskTemplateId.value) {
      return;
    }
    const draggedTemplate = findCustomTaskTemplate(draggingTaskTemplateId.value);
    if (!draggedTemplate || draggedTemplate.is_pinned) {
      return;
    }
    event.preventDefault();
    dragOverTaskTemplateId.value = null;
    dragOverTaskTemplateGroupKey.value = taskTemplateGroupDropKey(groupName);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    void visibleIds;
  }

  function handleTaskTemplateGroupDrop(groupName: string | null | undefined, visibleIds: number[], event: DragEvent) {
    event.preventDefault();
    const draggedId = Number(event.dataTransfer?.getData('text/plain') || draggingTaskTemplateId.value || 0);
    handleTaskTemplateDragEnd();
    if (!draggedId) {
      return;
    }
    moveCustomTaskTemplateToGroup(draggedId, groupName, visibleIds, null);
  }

  function handleTaskTemplateDragEnd() {
    draggingTaskTemplateId.value = null;
    dragOverTaskTemplateId.value = null;
    dragOverTaskTemplateGroupKey.value = '';
    draggingTaskTemplateVisibleIds.value = [];
  }

  function applyBatchTaskTemplateGroup() {
    void updateSelectedTaskTemplateGroups(taskTemplateBatchGroupName.value || null);
  }

  function clearBatchTaskTemplateGroup() {
    void updateSelectedTaskTemplateGroups(null);
  }

  function applyBatchTaskTemplatePinned(isPinned: boolean) {
    void updateSelectedTaskTemplatePinned(isPinned);
  }

  function taskTemplateButtonLabel(task: PlanFormTask) {
    return task.linked_template_id ? '覆盖模板' : '另存为模板';
  }

  function applyTaskTemplateFormFromTemplate(template: CustomTaskTemplate | null) {
    if (!template) {
      return;
    }
    taskTemplateForm.value.group_name = template.group_name || '';
    taskTemplateForm.value.title = template.title;
    taskTemplateForm.value.summary = template.summary || '';
    taskTemplateForm.value.is_pinned = template.is_pinned;
  }

  function prepareTaskTemplateForm(task: PlanFormTask) {
    const linkedTemplate = task.linked_template_id ? findCustomTaskTemplate(task.linked_template_id) : null;
    taskTemplateForm.value = {
      mode: linkedTemplate ? 'overwrite' : 'create',
      templateId: linkedTemplate?.id ?? null,
      group_name: linkedTemplate?.group_name || '',
      title: linkedTemplate?.title || options.buildSuggestedTaskTemplateName(task),
      summary: linkedTemplate?.summary || options.buildSuggestedTaskTemplateSummary(task),
      is_pinned: linkedTemplate?.is_pinned ?? false,
    };
  }

  function formatTaskTemplateUpdatedAt(value: string | null) {
    if (!value) {
      return '未记录';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function loadCustomTaskTemplates() {
    if (!options.authToken.value) {
      customTaskTemplates.value = [];
      return;
    }

    customTaskTemplatesLoading.value = true;
    try {
      const payload = await apiGet<{ templates: CustomTaskTemplate[] }>(
        '/lesson-plans/staff/task-templates',
        options.authToken.value
      );
      customTaskTemplates.value = sortCustomTaskTemplates(payload.templates);
    } finally {
      customTaskTemplatesLoading.value = false;
    }
  }

  function openTaskTemplateLibrary() {
    taskTemplateLibraryFilter.value = {
      keyword: '',
      group_name: '',
    };
    clearSelectedCustomTaskTemplates();
    taskTemplateBatchGroupName.value = '';
    handleTaskTemplateDragEnd();
    taskTemplateLibraryVisible.value = true;
    void loadCustomTaskTemplates().catch((error) => {
      const message = error instanceof Error ? error.message : '加载任务模板失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    });
  }

  function openSaveTaskTemplateDialog(task: PlanFormTask) {
    taskTemplateSourceTaskKey.value = task.key;
    prepareTaskTemplateForm(task);
    taskTemplateDialogVisible.value = true;
  }

  function handleTaskTemplateModeChange(nextMode?: TaskTemplateFormState['mode']) {
    if (nextMode) {
      taskTemplateForm.value.mode = nextMode;
    }
    const sourceTask = taskTemplateSourceTask.value;
    if (!sourceTask) {
      return;
    }
    const linkedTemplate = sourceTask.linked_template_id ? findCustomTaskTemplate(sourceTask.linked_template_id) : null;

    if (taskTemplateForm.value.mode === 'overwrite') {
      if (!customTaskTemplates.value.length) {
        taskTemplateForm.value.mode = 'create';
        ElMessage.warning('当前还没有可覆盖的自定义模板');
        return;
      }
      const fallbackTemplate =
        linkedTemplate || findCustomTaskTemplate(taskTemplateForm.value.templateId || 0) || customTaskTemplates.value[0];
      taskTemplateForm.value.templateId = fallbackTemplate?.id ?? null;
      applyTaskTemplateFormFromTemplate(fallbackTemplate || null);
      return;
    }

    taskTemplateForm.value.templateId = null;
    taskTemplateForm.value.group_name = linkedTemplate?.group_name || '';
    taskTemplateForm.value.title = options.buildSuggestedTaskTemplateName(sourceTask);
    taskTemplateForm.value.summary = options.buildSuggestedTaskTemplateSummary(sourceTask);
    taskTemplateForm.value.is_pinned = false;
  }

  function handleTaskTemplateTargetChange(templateId: number | null) {
    taskTemplateForm.value.templateId = templateId;
    if (!templateId) {
      return;
    }
    applyTaskTemplateFormFromTemplate(findCustomTaskTemplate(templateId));
  }

  async function saveCurrentTaskAsTemplate() {
    if (!options.authToken.value) {
      return;
    }

    const sourceTask = taskTemplateSourceTask.value;
    if (!sourceTask) {
      ElMessage.error('未找到要保存的任务');
      return;
    }
    if (!taskTemplateForm.value.title.trim()) {
      ElMessage.error('请先填写模板名称');
      return;
    }

    savingTaskTemplate.value = true;
    options.errorMessage.value = '';
    try {
      const payload = {
        title: taskTemplateForm.value.title.trim(),
        group_name: normalizeTaskTemplateGroupNameValue(taskTemplateForm.value.group_name) || null,
        summary: richTextToPlainText(taskTemplateForm.value.summary).trim() || null,
        task_title: sourceTask.title.trim() || options.taskTypeLabel(sourceTask.task_type) || '未命名任务',
        task_type: sourceTask.task_type,
        submission_scope: options.normalizeTaskSubmissionScope(sourceTask.task_type, sourceTask.submission_scope),
        task_description: options.normalizeHtmlValue(sourceTask.description, 'visual'),
        config: options.buildTaskTemplateConfigPayload(sourceTask),
        is_required: sourceTask.is_required,
        is_pinned: taskTemplateForm.value.is_pinned,
      };
      const overwriteTargetId =
        taskTemplateForm.value.mode === 'overwrite' ? taskTemplateForm.value.templateId : null;
      if (taskTemplateForm.value.mode === 'overwrite' && !overwriteTargetId) {
        throw new Error('请选择要覆盖的模板');
      }

      const response =
        overwriteTargetId !== null
          ? await apiPut<{ template: CustomTaskTemplate }>(
              `/lesson-plans/staff/task-templates/${overwriteTargetId}`,
              payload,
              options.authToken.value
            )
          : await apiPost<{ template: CustomTaskTemplate }>(
              '/lesson-plans/staff/task-templates',
              payload,
              options.authToken.value
            );
      updateCustomTaskTemplateInState(response.template);
      sourceTask.linked_template_id = response.template.id;
      taskTemplateDialogVisible.value = false;
      ElMessage.success(overwriteTargetId !== null ? '模板已覆盖保存' : '任务已保存为自定义模板');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存任务模板失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    } finally {
      savingTaskTemplate.value = false;
    }
  }

  async function markCustomTaskTemplateUsed(templateId: number) {
    if (!options.authToken.value) {
      return;
    }
    const response = await apiPost<{ template: CustomTaskTemplate }>(
      `/lesson-plans/staff/task-templates/${templateId}/mark-used`,
      {},
      options.authToken.value
    );
    updateCustomTaskTemplateInState(response.template);
  }

  async function setCustomTaskTemplatePinned(template: CustomTaskTemplate, isPinned: boolean) {
    if (!options.authToken.value) {
      return;
    }
    const response = await apiPost<{ template: CustomTaskTemplate }>(
      `/lesson-plans/staff/task-templates/${template.id}/pin`,
      { is_pinned: isPinned },
      options.authToken.value
    );
    updateCustomTaskTemplateInState(response.template);
    ElMessage.success(isPinned ? `模板“${template.title}”已置顶` : `模板“${template.title}”已取消置顶`);
  }

  function toggleCustomTaskTemplatePinned(template: CustomTaskTemplate) {
    void setCustomTaskTemplatePinned(template, !template.is_pinned).catch((error) => {
      const message = error instanceof Error ? error.message : '更新模板置顶状态失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    });
  }

  function recordTaskTemplateUsed(templateId: number) {
    void markCustomTaskTemplateUsed(templateId).catch(() => {
      // Non-blocking: template usage should continue even if recent-use sync fails.
    });
  }

  function applyCustomTaskTemplate(template: CustomTaskTemplate) {
    options.appendTaskToEditor(options.createTaskFromCustomTemplate(template));
    taskTemplateLibraryVisible.value = false;
    recordTaskTemplateUsed(template.id);
    ElMessage.success(`已添加模板“${template.title}”`);
  }

  function editCustomTaskTemplate(template: CustomTaskTemplate) {
    options.appendTaskToEditor(options.createTaskFromCustomTemplate(template, { linkTemplate: true }));
    taskTemplateLibraryVisible.value = false;
    recordTaskTemplateUsed(template.id);
    ElMessage.success(`模板“${template.title}”已载入，修改后可点击“覆盖模板”保存回原模板`);
  }

  async function deleteCustomTaskTemplate(template: CustomTaskTemplate) {
    if (!options.authToken.value) {
      return;
    }

    try {
      await ElMessageBox.confirm(
        `确认删除模板“${template.title}”吗？删除后不会影响已经创建的学案任务。`,
        '删除任务模板',
        { type: 'warning' }
      );
    } catch (error) {
      if (options.isDialogCancelled(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : '删除任务模板失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
      return;
    }

    deletingTaskTemplateId.value = template.id;
    options.errorMessage.value = '';
    try {
      await apiDelete<{ deleted_id: number }>(
        `/lesson-plans/staff/task-templates/${template.id}`,
        options.authToken.value
      );
      await loadCustomTaskTemplates();
      ElMessage.success('任务模板已删除');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除任务模板失败';
      options.errorMessage.value = message;
      ElMessage.error(message);
    } finally {
      deletingTaskTemplateId.value = null;
    }
  }

  function handleTaskTemplateCommand(command: string | number | object) {
    if (!command || typeof command !== 'object' || !('kind' in command)) {
      return;
    }
    const taskTemplateCommand = command as TaskTemplateDropdownCommand;
    if (taskTemplateCommand.kind === 'preset') {
      const nextTask = options.createTaskFromTemplate(taskTemplateCommand.id);
      options.appendTaskToEditor(nextTask);
      ElMessage.success(`${options.taskTypeLabel(nextTask.task_type)}已添加`);
      return;
    }
    const template = findCustomTaskTemplate(taskTemplateCommand.id);
    if (!template) {
      ElMessage.error('没有找到对应的自定义模板，请刷新后重试');
      return;
    }
    options.appendTaskToEditor(options.createTaskFromCustomTemplate(template));
    recordTaskTemplateUsed(template.id);
    ElMessage.success(`已添加模板“${template.title}”`);
  }

  watch(customTaskTemplates, (templates) => {
    const currentTemplateIds = new Set(templates.map((template) => template.id));
    selectedCustomTaskTemplateIds.value = selectedCustomTaskTemplateIds.value.filter((id) =>
      currentTemplateIds.has(id)
    );
  });

  return {
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
  };
}
