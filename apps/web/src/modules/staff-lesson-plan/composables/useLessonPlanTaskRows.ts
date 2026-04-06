import { ref, type Ref } from 'vue';

import type { PlanEditorTab, PlanFormTask } from '../lessonPlan.types';

type PlanFormState = {
  tasks: PlanFormTask[];
};

type UseLessonPlanTaskRowsOptions = {
  planForm: Ref<PlanFormState>;
  editorActiveTab: Ref<PlanEditorTab>;
  activeTaskEditorKey: Ref<string>;
  createEmptyTask: () => PlanFormTask;
  cloneTaskConfigState: (config: PlanFormTask['config']) => PlanFormTask['config'];
  duplicateTaskTitle: (title: string) => string;
  ensureDataSubmitTaskConfig: (task: PlanFormTask) => void;
  ensureTaskIdReserved: (task: PlanFormTask) => Promise<number | null>;
  seedTaskTypeStarterSources: (task: PlanFormTask) => void;
  onTaskCopyWithReset: () => void;
  onTaskCopied: () => void;
};

export function useLessonPlanTaskRows(options: UseLessonPlanTaskRowsOptions) {
  const draggingTaskKey = ref('');
  const dragOverTaskKey = ref('');

  function handleTaskTabDragEnd() {
    draggingTaskKey.value = '';
    dragOverTaskKey.value = '';
  }

  function appendTaskToEditor(task: PlanFormTask) {
    options.planForm.value.tasks.push(task);
    options.editorActiveTab.value = 'tasks';
    options.activeTaskEditorKey.value = task.key;
    handleTaskTabDragEnd();
    if (task.task_type === 'data_submit') {
      void options.ensureTaskIdReserved(task).then(() => {
        options.seedTaskTypeStarterSources(task);
      });
    }
  }

  function addTaskRow() {
    appendTaskToEditor(options.createEmptyTask());
  }

  function reorderTaskRows(draggedTaskKey: string, targetTaskKey: string) {
    if (draggedTaskKey === targetTaskKey) {
      return;
    }

    const currentIndex = options.planForm.value.tasks.findIndex((task) => task.key === draggedTaskKey);
    const targetIndex = options.planForm.value.tasks.findIndex((task) => task.key === targetTaskKey);
    if (currentIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextTasks = [...options.planForm.value.tasks];
    const [draggedTask] = nextTasks.splice(currentIndex, 1);
    if (!draggedTask) {
      return;
    }
    nextTasks.splice(targetIndex, 0, draggedTask);
    options.planForm.value.tasks = nextTasks;
    options.editorActiveTab.value = 'tasks';
    options.activeTaskEditorKey.value = draggedTaskKey;
  }

  function handleTaskTabDragStart(taskKey: string, event: DragEvent) {
    draggingTaskKey.value = taskKey;
    dragOverTaskKey.value = taskKey;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', taskKey);
    }
  }

  function handleTaskTabDragOver(taskKey: string, event: DragEvent) {
    if (!draggingTaskKey.value || draggingTaskKey.value === taskKey) {
      return;
    }
    event.preventDefault();
    dragOverTaskKey.value = taskKey;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleTaskTabDrop(taskKey: string, event: DragEvent) {
    event.preventDefault();
    const draggedTaskKey = event.dataTransfer?.getData('text/plain') || draggingTaskKey.value;
    if (!draggedTaskKey) {
      handleTaskTabDragEnd();
      return;
    }
    reorderTaskRows(draggedTaskKey, taskKey);
    handleTaskTabDragEnd();
  }

  function moveTaskRow(taskKey: string, direction: -1 | 1) {
    const currentIndex = options.planForm.value.tasks.findIndex((task) => task.key === taskKey);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= options.planForm.value.tasks.length) {
      return;
    }

    const nextTasks = [...options.planForm.value.tasks];
    const [task] = nextTasks.splice(currentIndex, 1);
    if (!task) {
      return;
    }
    nextTasks.splice(targetIndex, 0, task);
    options.planForm.value.tasks = nextTasks;
    options.editorActiveTab.value = 'tasks';
    options.activeTaskEditorKey.value = taskKey;
  }

  function copyTaskRow(taskKey: string) {
    const currentIndex = options.planForm.value.tasks.findIndex((task) => task.key === taskKey);
    if (currentIndex < 0) {
      return;
    }

    const sourceTask = options.planForm.value.tasks[currentIndex];
    const nextTask = options.createEmptyTask();
    const nextConfig = options.cloneTaskConfigState(sourceTask.config);
    let assetResetRequired = false;

    if (nextConfig.assets.length > 0) {
      nextConfig.assets = [];
      assetResetRequired = true;
    }
    if (nextConfig.submit_assets.length > 0) {
      nextConfig.submit_assets = [];
      assetResetRequired = true;
    }
    if (nextConfig.visualization_assets.length > 0) {
      nextConfig.visualization_assets = [];
      assetResetRequired = true;
    }
    if (nextConfig.endpoint_token || nextConfig.submit_api_path || nextConfig.records_api_path) {
      nextConfig.endpoint_token = '';
      nextConfig.submit_api_path = '';
      nextConfig.records_api_path = '';
    }

    const duplicatedTask: PlanFormTask = {
      ...nextTask,
      title: options.duplicateTaskTitle(sourceTask.title),
      task_type: sourceTask.task_type,
      submission_scope: sourceTask.submission_scope,
      description: sourceTask.description,
      description_mode: sourceTask.description_mode,
      config: nextConfig,
      is_required: sourceTask.is_required,
      linked_template_id: null,
    };
    options.ensureDataSubmitTaskConfig(duplicatedTask);

    const nextTasks = [...options.planForm.value.tasks];
    nextTasks.splice(currentIndex + 1, 0, duplicatedTask);
    options.planForm.value.tasks = nextTasks;
    options.editorActiveTab.value = 'tasks';
    options.activeTaskEditorKey.value = duplicatedTask.key;
    if (duplicatedTask.task_type === 'data_submit') {
      void options.ensureTaskIdReserved(duplicatedTask).then(() => {
        options.seedTaskTypeStarterSources(duplicatedTask);
      });
    }

    if (assetResetRequired) {
      options.onTaskCopyWithReset();
      return;
    }
    options.onTaskCopied();
  }

  function removeTaskRow(taskKey: string) {
    if (options.planForm.value.tasks.length <= 1) {
      return;
    }

    const currentIndex = options.planForm.value.tasks.findIndex((task) => task.key === taskKey);
    if (currentIndex < 0) {
      return;
    }

    const fallbackTask =
      options.planForm.value.tasks[currentIndex + 1] ||
      options.planForm.value.tasks[currentIndex - 1] ||
      null;

    options.planForm.value.tasks = options.planForm.value.tasks.filter((task) => task.key !== taskKey);

    if (options.activeTaskEditorKey.value === taskKey) {
      options.activeTaskEditorKey.value = fallbackTask?.key || options.planForm.value.tasks[0]?.key || '';
    }
    if (draggingTaskKey.value === taskKey || dragOverTaskKey.value === taskKey) {
      handleTaskTabDragEnd();
    }
  }

  return {
    draggingTaskKey,
    dragOverTaskKey,
    appendTaskToEditor,
    addTaskRow,
    reorderTaskRows,
    handleTaskTabDragStart,
    handleTaskTabDragOver,
    handleTaskTabDrop,
    handleTaskTabDragEnd,
    moveTaskRow,
    copyTaskRow,
    removeTaskRow,
  };
}
