<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>机房与座位</h2>
        <p class="st-head__sub">先定行数与列数，再把座位块拖到对应位置；学生登录后按 IP 自动定位座位号。</p>
      </div>
      <div class="st-head__actions">
        <n-button secondary :disabled="!selectedRoom" @click="selectedRoom && openRoomDialog(selectedRoom)">编辑机房</n-button>
        <n-button type="primary" @click="openRoomDialog()">新增机房</n-button>
      </div>
    </header>

    <section class="sf-panel">
      <div class="sf-tabs">
        <button
          v-for="room in rooms"
          :key="room.id"
          :class="['sf-tabs__item', { 'is-active': selectedRoomId === room.id }]"
          type="button"
          @click="selectedRoomId = room.id"
        >
          {{ room.name }}
          <span class="sf-tabs__count">{{ room.seats.length }}</span>
        </button>
      </div>

      <p v-if="!rooms.length" class="sf-empty">还没有机房，先新增一间。</p>
      <template v-else-if="selectedRoom">
        <header class="sf-panel__head">
          <h3 class="sf-panel__title">
            座位布局
            <span class="sf-panel__count">
              {{ roomGridRows }} 行 × {{ roomGridCols }} 列 · {{ roomSeatDraft.length }} 个座位
            </span>
          </h3>
          <div class="sf-panel__actions">
            <input ref="seatImportInputRef" class="file-input" :accept="seatImportAccept" type="file" @change="handleSeatImportChange" />
            <n-button secondary @click="downloadSeatTemplate(selectedRoom)">下载模板</n-button>
            <n-button :loading="isImportingSeats" secondary @click="openSeatImportPicker">导入表格</n-button>
            <n-button secondary @click="addSeatDraft">新增座位</n-button>
            <n-button secondary type="error" @click="deleteRoom(selectedRoom!.id)">删除机房</n-button>
            <n-button type="primary" :disabled="!roomSeatDraft.length" @click="saveSeatDraft">保存座位表</n-button>
          </div>
        </header>

        <div class="st-boardbar">
          <label class="st-boardbar__field">
            <span>行数</span>
            <input v-model.number="roomGridRows" class="grid-number-input" type="number" min="1" :max="roomGridMax" @change="handleRoomGridRowsChange" />
          </label>
          <label class="st-boardbar__field">
            <span>列数</span>
            <input v-model.number="roomGridCols" class="grid-number-input" type="number" min="1" :max="roomGridMax" @change="handleRoomGridColsChange" />
          </label>
          <span class="st-boardbar__note">
            {{ selectedRoom.description || '未填写机房说明' }} · 拖动座位块可调整位置
          </span>
          <div class="st-boardbar__actions">
            <n-button text @click="clearSeatDraft">清空当前布局</n-button>
            <n-button text @click="showSeatTable = !showSeatTable">
              {{ showSeatTable ? '收起座位明细' : `座位明细（${roomSeatDraft.length}）` }}
            </n-button>
          </div>
        </div>

        <div class="st-board">
          <div class="room-layout-board" :style="roomLayoutStyle">
            <div
              v-for="cell in roomLayoutCells"
              :key="`${cell.row}-${cell.col}`"
              :class="['room-layout-cell', { 'is-drop-target': dragOverCellKey === `${cell.row}-${cell.col}` }]"
              @dragover.prevent="handleSeatDragOver($event, cell.row, cell.col)"
              @drop.prevent="handleSeatDrop($event, cell.row, cell.col)"
            >
              <span class="room-layout-axis">{{ cell.row }}-{{ cell.col }}</span>
              <div
                v-if="cell.seat && cell.seatIndex !== null"
                :class="['drag-seat-card', { 'is-dragging': draggingSeat === cell.seat }]"
                draggable="true"
                @dragstart="handleSeatDragStart($event, cell.seat)"
                @dragend="handleSeatDragEnd"
              >
                <strong>{{ cell.seat.seat_label }}</strong>
                <span>{{ cell.seat.ip_address || '待填 IP' }}</span>
              </div>
              <div v-else class="drag-seat-empty">空位</div>
            </div>
          </div>
        </div>

        <div v-if="showSeatTable" class="sf-panel__body sf-panel__body--flush">
          <SaDataTable :data="roomSeatDraft" :row-key="(row) => `${row.row_no}-${row.col_no}`" :scroll-x="680">
            <SaTableColumn label="位置" min-width="96">
              <template #default="{ row }">{{ row.row_no }} - {{ row.col_no }}</template>
            </SaTableColumn>
            <SaTableColumn label="座位名" min-width="120">
              <template #default="{ row }"><n-input v-model:value="row.seat_label" /></template>
            </SaTableColumn>
            <SaTableColumn label="IP" min-width="150">
              <template #default="{ row }"><n-input v-model:value="row.ip_address" /></template>
            </SaTableColumn>
            <SaTableColumn label="主机名" min-width="150">
              <template #default="{ row }"><n-input v-model:value="row.hostname" /></template>
            </SaTableColumn>
            <SaTableColumn label="启用" min-width="80">
              <template #default="{ row }"><n-switch v-model:value="row.is_enabled" /></template>
            </SaTableColumn>
            <SaTableColumn label="操作" min-width="80">
              <template #default="{ $index }">
                <n-button text type="error" @click="removeSeatDraft($index)">删除</n-button>
              </template>
            </SaTableColumn>
          </SaDataTable>
        </div>

        <footer class="sf-panel__foot st-panel-note">
          导入支持 .csv / .txt / .tsv / .xlsx，表头可用：行号、列号、座位号、IP 地址、主机名、是否启用。
        </footer>
      </template>
      <n-empty v-else description="请先选择机房" />
    </section>

    <n-modal v-model:show="roomDialogVisible" :title="editingRoomId ? '编辑机房' : '新增机房'" preset="card" style="width: 560px">
      <n-form label-placement="top">
        <n-form-item label="机房名称"><n-input v-model:value="roomForm.name" /></n-form-item>
        <div class="admin-grid two-col">
          <n-form-item label="行数"><n-input-number v-model:value="roomForm.row_count" :max="roomGridMax" :min="1" /></n-form-item>
          <n-form-item label="列数"><n-input-number v-model:value="roomForm.col_count" :max="roomGridMax" :min="1" /></n-form-item>
        </div>
        <n-form-item label="IP 前缀"><n-input v-model:value="roomForm.ip_prefix" placeholder="例如 10.7.1." /></n-form-item>
        <n-form-item label="IP 起始序号"><n-input-number v-model:value="roomForm.ip_start" :max="250" :min="1" /></n-form-item>
        <n-form-item label="机房说明"><n-input v-model:value="roomForm.description" type="textarea" /></n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="roomDialogVisible = false">取消</n-button>
          <n-button type="primary" @click="saveRoomForm">保存</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { NButton, NEmpty, NForm, NFormItem, NInput, NInputNumber, NModal, NSwitch } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { ElMessage } from '@/ui/feedback';

import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import type { BootstrapPayload } from '../adminTypes';
import { ROOM_GRID_MAX as roomGridMax, seatImportAccept as importAccept, useAdminRooms, type RoomDialogForm } from '../composables/useAdminRooms';
import { useAdminBootstrap } from '../composables/useAdminBootstrap';

const { bootstrap } = useAdminBootstrap();

const {
  selectedRoomId,
  roomSeatDraft,
  roomGridRows,
  roomGridCols,
  draggingSeat,
  dragOverCellKey,
  isImportingSeats,
  showSeatTable,
  roomLayoutStyle,
  roomLayoutCells,
  setRoomDraft,
  handleSeatDragStart,
  handleSeatDragOver,
  handleSeatDragEnd,
  handleSeatDrop,
  handleRoomGridRowsChange,
  handleRoomGridColsChange,
  downloadSeatTemplate,
  importSeatFile,
  saveRoom,
  deleteRoom,
  addSeatDraft,
  removeSeatDraft,
  clearSeatDraft,
  saveSeatDraft,
} = useAdminRooms(bootstrap);

const seatImportAccept = importAccept;
const rooms = computed<BootstrapPayload['rooms']>(() => bootstrap.value?.rooms ?? []);
const selectedRoom = computed<BootstrapPayload['rooms'][number] | null>(
  () => rooms.value.find((item) => item.id === selectedRoomId.value) ?? null
);

const roomDialogVisible = ref(false);
const editingRoomId = ref<number | null>(null);
const roomForm = ref<RoomDialogForm>({ name: '', row_count: 2, col_count: 6, description: '', ip_prefix: '', ip_start: 11 });
const seatImportInputRef = ref<HTMLInputElement | null>(null);

watch(selectedRoom, (room) => {
  if (room) {
    setRoomDraft({ row_count: room.row_count, col_count: room.col_count, seats: room.seats });
    return;
  }
  setRoomDraft({ row_count: 1, col_count: 1, seats: [] });
}, { immediate: true });

function openRoomDialog(item?: BootstrapPayload['rooms'][number]) {
  editingRoomId.value = item?.id ?? null;
  roomForm.value = item
    ? { name: item.name, row_count: item.row_count, col_count: item.col_count, description: item.description || '', ip_prefix: '', ip_start: 11 }
    : { name: '', row_count: 2, col_count: 6, description: '', ip_prefix: '', ip_start: 11 };
  roomDialogVisible.value = true;
}

async function saveRoomForm() {
  await saveRoom(editingRoomId.value, roomForm.value);
  roomDialogVisible.value = false;
}

function openSeatImportPicker() {
  if (!selectedRoom.value) {
    ElMessage.warning('请先选择机房，再导入座位表');
    return;
  }
  seatImportInputRef.value?.click();
}

async function handleSeatImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!input) {
    return;
  }
  if (!file) {
    input.value = '';
    return;
  }
  try {
    await importSeatFile(file, escapeHtml);
  } finally {
    input.value = '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
</script>
