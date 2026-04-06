<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button type="primary">从模板新增</el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="preset in taskTemplatePresetOptions"
          :key="preset.id"
          :command="{ kind: 'preset', id: preset.id }"
        >
          <div class="task-template-option">
            <strong>{{ preset.label }}</strong>
            <span>{{ preset.description }}</span>
          </div>
        </el-dropdown-item>
        <el-dropdown-item v-if="customTaskTemplatesLoading" divided disabled>
          <div class="task-template-option">
            <strong>自定义模板</strong>
            <span>正在加载教师自定义模板...</span>
          </div>
        </el-dropdown-item>
        <template v-else-if="customTaskTemplates.length">
          <el-dropdown-item disabled divided>
            <div class="task-template-option">
              <strong>自定义模板</strong>
              <span>保存过的任务模板会出现在这里，可直接复用。</span>
            </div>
          </el-dropdown-item>
          <template v-if="dropdownPinnedCustomTaskTemplates.length">
            <el-dropdown-item disabled>
              <div class="task-template-option task-template-option--group">
                <strong>已置顶</strong>
                <span>{{ dropdownPinnedCustomTaskTemplates.length }} 个模板</span>
              </div>
            </el-dropdown-item>
            <el-dropdown-item
              v-for="templateItem in dropdownPinnedCustomTaskTemplates"
              :key="`pinned-${templateItem.id}`"
              :command="{ kind: 'custom', id: templateItem.id }"
            >
              <div class="task-template-option">
                <strong>{{ templateItem.title }}</strong>
                <span>置顶 · {{ taskTypeLabel(templateItem.task_type) }} · {{ templateItem.task_title }}</span>
              </div>
            </el-dropdown-item>
          </template>
          <template v-if="dropdownRecentCustomTaskTemplates.length">
            <el-dropdown-item disabled>
              <div class="task-template-option task-template-option--group">
                <strong>最近使用</strong>
                <span>优先显示最近 6 个常用模板</span>
              </div>
            </el-dropdown-item>
            <el-dropdown-item
              v-for="templateItem in dropdownRecentCustomTaskTemplates"
              :key="`recent-${templateItem.id}`"
              :command="{ kind: 'custom', id: templateItem.id }"
            >
              <div class="task-template-option">
                <strong>{{ templateItem.title }}</strong>
                <span>最近使用 · {{ taskTypeLabel(templateItem.task_type) }} · {{ templateItem.task_title }}</span>
              </div>
            </el-dropdown-item>
          </template>
          <template v-for="group in customTaskTemplateDropdownGroups" :key="group.key || 'ungrouped'">
            <el-dropdown-item disabled>
              <div class="task-template-option task-template-option--group">
                <strong>{{ group.label }}</strong>
                <span>{{ group.items.length }} 个模板</span>
              </div>
            </el-dropdown-item>
            <el-dropdown-item
              v-for="templateItem in group.items"
              :key="templateItem.id"
              :command="{ kind: 'custom', id: templateItem.id }"
            >
              <div class="task-template-option">
                <strong>{{ templateItem.title }}</strong>
                <span>{{ taskTypeLabel(templateItem.task_type) }} · 预设任务名：{{ templateItem.task_title }}</span>
              </div>
            </el-dropdown-item>
          </template>
        </template>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { taskTemplatePresetOptions } from '../lessonPlan.constants';
import type {
  CustomTaskTemplate,
  TaskTemplateDropdownCommand,
  TaskTemplateGroupSection,
} from '../lessonPlan.types';

const props = defineProps<{
  customTaskTemplatesLoading: boolean;
  customTaskTemplates: CustomTaskTemplate[];
  dropdownPinnedCustomTaskTemplates: CustomTaskTemplate[];
  dropdownRecentCustomTaskTemplates: CustomTaskTemplate[];
  customTaskTemplateDropdownGroups: TaskTemplateGroupSection[];
  taskTypeLabel: (taskType: string) => string;
  handleTaskTemplateCommand: (command: TaskTemplateDropdownCommand) => void;
}>();

function handleCommand(command: unknown) {
  props.handleTaskTemplateCommand(command as TaskTemplateDropdownCommand);
}
</script>

<style scoped>
.task-template-option {
  display: grid;
  gap: 2px;
  min-width: 260px;
}

.task-template-option strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--ls-text);
}

.task-template-option span {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ls-muted);
}

.task-template-option--group {
  opacity: 0.82;
}
</style>
