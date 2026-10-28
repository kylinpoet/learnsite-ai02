<template>
  <div class="sa-table">
    <n-spin :show="loading">
      <n-data-table
        v-bind="$attrs"
        :bordered="bordered"
        :checked-row-keys="checkedRowKeys"
        :columns="builtColumns"
        :data="data"
        :max-height="maxHeight"
        :row-key="rowKeyGetter"
        :row-props="rowProps"
        :scroll-x="scrollX"
        :single-line="false"
        :size="naiveSize"
        :striped="stripe"
        @update:checked-row-keys="handleCheckedChange"
      >
        <template #empty>
          <slot name="empty">
            <n-empty :description="emptyText" size="small" style="padding: 24px 0" />
          </slot>
        </template>
      </n-data-table>
    </n-spin>

    <div v-if="pagination" class="sa-table__pager">
      <n-pagination
        :item-count="pagination.itemCount"
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :page-sizes="pagination.pageSizes ?? [10, 20, 50, 100]"
        :page-slot="7"
        show-quick-jumper
        show-size-picker
        @update:page="(page: number) => emit('update:page', page)"
        @update:page-size="(size: number) => emit('update:pageSize', size)"
      >
        <template #prefix="{ itemCount }">共 {{ itemCount }} 条</template>
      </n-pagination>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SaDataTable —— el-table + el-table-column + el-pagination 的统一替代。
 *
 * 用法与 Element 保持一致的声明式写法：
 *   <SaDataTable :data="rows" row-key="id" :pagination="..." @update:page="...">
 *     <SaTableColumn type="selection" width="48" />
 *     <SaTableColumn prop="name" label="姓名" min-width="120" />
 *     <SaTableColumn label="状态" min-width="100">
 *       <template #default="{ row }"><n-tag>{{ row.status }}</n-tag></template>
 *     </SaTableColumn>
 *   </SaDataTable>
 *
 * 列属性兼容：prop / label / width / min-width / fixed / align / header-align /
 * sortable / resizable / show-overflow-tooltip / formatter / className。
 * 复杂列（分组表头、自定义筛选）可直接传 :columns-config（naive 原生列数组）。
 */
import type { DataTableColumns, DataTableRowKey } from 'naive-ui';
import { NDataTable, NEmpty, NPagination, NSpin } from 'naive-ui';
import { Fragment, computed, getCurrentInstance, useSlots, type VNode } from 'vue';

import SaTableColumn from './SaTableColumn.vue';

defineOptions({ name: 'SaDataTable', inheritAttrs: false });

type Row = Record<string, any>;

const props = withDefaults(
  defineProps<{
    data?: Row[];
    rowKey?: string | ((row: Row) => string | number);
    loading?: boolean;
    stripe?: boolean;
    bordered?: boolean;
    size?: 'default' | 'small' | 'medium' | 'large';
    emptyText?: string;
    scrollX?: number;
    maxHeight?: number | string;
    checkedRowKeys?: Array<string | number>;
    pagination?: { page: number; pageSize: number; itemCount: number; pageSizes?: number[] } | null;
    columnsConfig?: any[];
  }>(),
  {
    data: () => [],
    rowKey: 'id',
    loading: false,
    stripe: false,
    bordered: false,
    size: 'default',
    emptyText: '暂无数据',
    pagination: null,
    checkedRowKeys: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:checkedRowKeys', keys: Array<string | number>): void;
  (e: 'selection-change', rows: any[]): void;
  (e: 'update:page', page: number): void;
  (e: 'update:pageSize', size: number): void;
  (e: 'row-click', row: any): void;
}>();

const slots = useSlots();
const instance = getCurrentInstance();

const naiveSize = computed(() => (props.size === 'default' ? 'medium' : props.size));

function toWidth(value: unknown): string | number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  const numeric = Number(String(value).replace('px', ''));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeFixed(value: unknown) {
  if (value === true) {
    return 'left';
  }
  if (value === 'left' || value === 'right') {
    return value;
  }
  return undefined;
}

function getValue(row: Row, path?: string) {
  if (!path) {
    return undefined;
  }
  if (!path.includes('.')) {
    return row?.[path];
  }
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), row);
}

function toCellContent(value: unknown) {
  if (value == null || value === '') {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  return value as any;
}

function collectColumnNodes(nodes: VNode[], out: VNode[]) {
  for (const node of nodes) {
    if (!node) {
      continue;
    }
    if (node.type === SaTableColumn) {
      out.push(node);
      continue;
    }
    if (node.type === Fragment && Array.isArray(node.children)) {
      collectColumnNodes(node.children as VNode[], out);
    }
  }
}

function getSlotFns(node: VNode) {
  const children = node.children;
  if (children && !Array.isArray(children) && typeof children === 'object') {
    return children as Record<string, (args?: any) => any>;
  }
  return null;
}

function toColumn(node: VNode, index: number): Record<string, any> | null {
  const propsOfNode = (node.props || {}) as Record<string, any>;
  const slotFns = getSlotFns(node);
  const cellSlot = slotFns?.default;
  const headerSlot = slotFns?.header;
  const type = propsOfNode.type;

  if (type === 'selection') {
    const selection: Record<string, any> = { type: 'selection', key: `__selection-${index}` };
    const width = toWidth(propsOfNode.width);
    if (width) {
      selection.width = width;
    }
    const fixed = normalizeFixed(propsOfNode.fixed);
    if (fixed) {
      selection.fixed = fixed;
    }
    selection.disabled = (row: Row) => (propsOfNode['selectable'] ? !propsOfNode.selectable(row, index) : false);
    return selection;
  }

  if (type === 'index') {
    return {
      key: `__index-${index}`,
      title: propsOfNode.label ?? '#',
      width: toWidth(propsOfNode.width) ?? 64,
      align: propsOfNode.align ?? 'center',
      render: (_row: Row, rowIndex: number) => rowIndex + 1,
    };
  }

  const prop = propsOfNode.prop as string | undefined;
  const column: Record<string, any> = {
    key: propsOfNode.key ?? prop ?? `__col-${index}`,
    title: propsOfNode.label ?? '',
  };

  const width = toWidth(propsOfNode.width);
  if (width != null) {
    column.width = width;
  }
  const minWidth = toWidth(propsOfNode['min-width']);
  if (minWidth != null) {
    column.minWidth = minWidth;
  }
  const fixed = normalizeFixed(propsOfNode.fixed);
  if (fixed) {
    column.fixed = fixed;
  }
  if (propsOfNode.align) {
    column.align = propsOfNode.align;
  }
  if (propsOfNode['header-align']) {
    column.titleAlign = propsOfNode['header-align'];
  }
  if (propsOfNode.sortable) {
    column.sorter = propsOfNode.sortable === 'custom' ? false : true;
  }
  if (propsOfNode.resizable) {
    column.resizable = true;
  }
  if (propsOfNode['show-overflow-tooltip'] || propsOfNode.ellipsis) {
    column.ellipsis = { tooltip: true };
  }
  if (propsOfNode.className) {
    column.className = propsOfNode.className;
  }
  if (headerSlot) {
    column.title = () => headerSlot({});
  }

  const formatter = propsOfNode.formatter as
    | ((row: Row, column: any, value: any, index: number) => any)
    | undefined;

  if (formatter) {
    column.render = (row: Row, rowIndex: number) =>
      toCellContent(formatter(row, { property: prop }, getValue(row, prop), rowIndex));
  } else if (cellSlot) {
    column.render = (row: Row, rowIndex: number) =>
      cellSlot({ row, column: {}, $index: rowIndex, index: rowIndex });
  } else if (prop) {
    column.render = (row: Row) => toCellContent(getValue(row, prop));
  }

  return column;
}

const builtColumns = computed<DataTableColumns>(() => {
  if (props.columnsConfig?.length) {
    return props.columnsConfig as DataTableColumns;
  }
  const nodes: VNode[] = [];
  collectColumnNodes((slots.default?.() ?? []) as VNode[], nodes);
  return nodes
    .map((node, index) => toColumn(node, index))
    .filter((column): column is Record<string, any> => Boolean(column)) as DataTableColumns;
});

function resolveRowKey(row: Row): string | number {
  if (typeof props.rowKey === 'function') {
    return props.rowKey(row);
  }
  return row?.[props.rowKey];
}

const rowKeyGetter = (row: Row) => resolveRowKey(row);

function handleCheckedChange(keys: DataTableRowKey[]) {
  const normalized = keys as Array<string | number>;
  emit('update:checkedRowKeys', normalized);
  const rows = (props.data || []).filter((row) => normalized.includes(resolveRowKey(row)));
  emit('selection-change', rows);
}

const rowProps = computed(() => {
  const hasRowClick = Boolean(instance?.vnode.props?.onRowClick);
  if (!hasRowClick) {
    return undefined;
  }
  return (row: Row) => ({
    style: 'cursor: pointer;',
    onClick: () => emit('row-click', row),
  });
});
</script>

<style scoped>
.sa-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.sa-table__pager {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .sa-table__pager {
    justify-content: center;
  }
}
</style>
