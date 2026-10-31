<template>
  <n-dropdown
    placement="bottom-start"
    trigger="click"
    :options="options"
    :render-option="renderDropdownOption"
    @select="handleSelect"
  >
    <n-button :block="props.block" :secondary="props.secondary" :type="props.secondary ? 'default' : 'primary'">
      从模板新增
    </n-button>
  </n-dropdown>
</template>

<script setup lang="ts">
import type { DropdownOption } from 'naive-ui';
import { NButton, NDropdown } from 'naive-ui';
import { computed, h } from 'vue';
import type { VNode } from 'vue';

import { taskTemplatePresetOptions } from '../lessonPlan.constants';
import type {
  CustomTaskTemplate,
  TaskTemplateDropdownCommand,
  TaskTemplateGroupSection,
  TaskTemplatePresetId,
} from '../lessonPlan.types';

const props = withDefaults(
  defineProps<{
    customTaskTemplatesLoading: boolean;
    customTaskTemplates: CustomTaskTemplate[];
    dropdownPinnedCustomTaskTemplates: CustomTaskTemplate[];
    dropdownRecentCustomTaskTemplates: CustomTaskTemplate[];
    customTaskTemplateDropdownGroups: TaskTemplateGroupSection[];
    taskTypeLabel: (taskType: string) => string;
    handleTaskTemplateCommand: (command: TaskTemplateDropdownCommand) => void;
    /** 放进侧栏时用次要按钮与整宽，避免和页面唯一的主操作抢注意力 */
    secondary?: boolean;
    block?: boolean;
  }>(),
  { secondary: false, block: false }
);

const optionItemStyle =
  'display: grid; gap: 2px; min-width: 260px; white-space: normal; line-height: 1.4;';

/**
 * n-dropdown 的选项高度被固定为单行（height: var(--n-option-height)），
 * 标题 + 说明的两行文案会溢出压到下一项，这里套一层容器由全局样式放开高度。
 */
function renderDropdownOption({ node }: { node: VNode }) {
  return h('div', { class: 'ls-task-template-option' }, [node]);
}

/**
 * n-dropdown 的选项内容由下拉层渲染，scoped 样式不会命中，
 * 因此标题/说明的排版以行内样式给出，保持原来两行结构。
 */
function renderOptionContent(title: string, description: string, muted = false) {
  return () =>
    h(
      'div',
      {
        style: muted ? `${optionItemStyle} opacity: 0.82;` : optionItemStyle,
      },
      [
        h('strong', { style: 'display: block; font-size: 13px; font-weight: 700; color: var(--ls-text);' }, title),
        h('span', { style: 'display: block; font-size: 12px; line-height: 1.45; color: var(--ls-muted);' }, description),
      ]
    );
}

function templateOption(templateItem: CustomTaskTemplate, description: string): DropdownOption {
  return {
    key: `custom:${templateItem.id}`,
    label: renderOptionContent(templateItem.title, description),
  };
}

const options = computed<DropdownOption[]>(() => {
  const items: DropdownOption[] = taskTemplatePresetOptions.map((preset) => ({
    key: `preset:${preset.id}`,
    label: renderOptionContent(preset.label, preset.description),
  }));

  if (props.customTaskTemplatesLoading) {
    items.push({ type: 'divider', key: 'custom-divider' });
    items.push({
      key: 'custom-loading',
      disabled: true,
      label: renderOptionContent('自定义模板', '正在加载教师自定义模板...'),
    });
    return items;
  }

  if (!props.customTaskTemplates.length) {
    return items;
  }

  items.push({ type: 'divider', key: 'custom-divider' });
  items.push({
    key: 'custom-header',
    disabled: true,
    label: renderOptionContent('自定义模板', '保存过的活动模板会出现在这里，可直接复用。'),
  });

  if (props.dropdownPinnedCustomTaskTemplates.length) {
    items.push({
      key: 'custom-pinned-header',
      disabled: true,
      label: renderOptionContent(
        '已置顶',
        `${props.dropdownPinnedCustomTaskTemplates.length} 个模板`,
        true
      ),
    });
    for (const templateItem of props.dropdownPinnedCustomTaskTemplates) {
      items.push(
        templateOption(
          templateItem,
          `置顶 · ${props.taskTypeLabel(templateItem.task_type)} · ${templateItem.task_title}`
        )
      );
    }
  }

  if (props.dropdownRecentCustomTaskTemplates.length) {
    items.push({
      key: 'custom-recent-header',
      disabled: true,
      label: renderOptionContent('最近使用', '优先显示最近 6 个常用模板', true),
    });
    for (const templateItem of props.dropdownRecentCustomTaskTemplates) {
      items.push(
        templateOption(
          templateItem,
          `最近使用 · ${props.taskTypeLabel(templateItem.task_type)} · ${templateItem.task_title}`
        )
      );
    }
  }

  for (const group of props.customTaskTemplateDropdownGroups) {
    items.push({
      key: `custom-group-header:${group.key || 'ungrouped'}`,
      disabled: true,
      label: renderOptionContent(group.label, `${group.items.length} 个模板`, true),
    });
    for (const templateItem of group.items) {
      items.push(
        templateOption(
          templateItem,
          `${props.taskTypeLabel(templateItem.task_type)} · 预设活动名：${templateItem.task_title}`
        )
      );
    }
  }

  return items;
});

function handleSelect(key: string | number) {
  const raw = String(key);
  const separator = raw.indexOf(':');
  if (separator < 0) {
    return;
  }
  const kind = raw.slice(0, separator);
  const rawId = raw.slice(separator + 1);
  if (!rawId) {
    return;
  }

  if (kind === 'preset') {
    props.handleTaskTemplateCommand({ kind: 'preset', id: rawId as TaskTemplatePresetId });
    return;
  }

  if (kind === 'custom') {
    const id = Number(rawId);
    if (!Number.isNaN(id)) {
      props.handleTaskTemplateCommand({ kind: 'custom', id });
    }
  }
}
</script>

<style>
/* 下拉层被 teleport 到 body，scoped 样式无法命中，这里用前缀类限定作用范围。
   选择器层数需覆盖 naive-ui 自身的 .n-dropdown-menu .n-dropdown-option .n-dropdown-option-body。 */
.n-dropdown-menu .ls-task-template-option .n-dropdown-option .n-dropdown-option-body {
  height: auto;
  min-height: var(--n-option-height);
  line-height: 1.4;
  padding: 6px 0;
}

.n-dropdown-menu .ls-task-template-option .n-dropdown-option .n-dropdown-option-body .n-dropdown-option-body__label {
  padding-right: 14px;
  white-space: normal;
}
</style>

