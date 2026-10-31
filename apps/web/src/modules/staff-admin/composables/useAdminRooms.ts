import { computed, ref } from 'vue';

import { apiDelete, apiPost, apiPut, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import type { BootstrapPayload, RoomSeat, RoomSeatDraftPayload } from '../adminTypes';

export const ROOM_GRID_MAX = 50;
export const seatImportAccept = '.csv,.txt,.tsv,.xlsx';

export type RoomDialogForm = {
  name: string;
  row_count: number;
  col_count: number;
  description: string;
  ip_prefix: string;
  ip_start: number;
};

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

// 模块级单例：外壳（nav/路由恢复）与 RoomsPane 共享当前机房选择。
const selectedRoomId = ref<number | null>(null);

export function useAdminRooms(
  bootstrap: { value: BootstrapPayload | null },
) {
  const authStore = useAuthStore();

  const roomSeatDraft = ref<RoomSeat[]>([]);
  const roomGridRows = ref(1);
  const roomGridCols = ref(1);
  const draggingSeat = ref<RoomSeat | null>(null);
  const dragOverCellKey = ref('');
  const isImportingSeats = ref(false);
  const showSeatTable = ref(false);

  const maxSeatRow = computed(() => roomSeatDraft.value.reduce((max, seat) => Math.max(max, seat.row_no), 1));
  const maxSeatCol = computed(() => roomSeatDraft.value.reduce((max, seat) => Math.max(max, seat.col_no), 1));
  const roomLayoutStyle = computed(() => ({
    gridTemplateColumns: `repeat(${Math.max(roomGridCols.value, 1)}, minmax(0, 1fr))`,
  }));
  const roomLayoutCells = computed(() => {
    const cells: Array<{ row: number; col: number; seat: RoomSeat | null; seatIndex: number | null }> = [];
    for (let row = 1; row <= roomGridRows.value; row += 1) {
      for (let col = 1; col <= roomGridCols.value; col += 1) {
        const seatIndex = roomSeatDraft.value.findIndex((item) => item.row_no === row && item.col_no === col);
        cells.push({
          row,
          col,
          seat: seatIndex >= 0 ? roomSeatDraft.value[seatIndex] : null,
          seatIndex: seatIndex >= 0 ? seatIndex : null,
        });
      }
    }
    return cells;
  });

  function cloneSeats(seats: RoomSeat[]) {
    return JSON.parse(JSON.stringify(seats)) as RoomSeat[];
  }

  function sortRoomSeatDraft() {
    roomSeatDraft.value.sort((left, right) => (
      left.row_no - right.row_no
      || left.col_no - right.col_no
      || (left.id ?? 0) - (right.id ?? 0)
    ));
  }

  function setRoomDraft(payload: RoomSeatDraftPayload) {
    roomSeatDraft.value = cloneSeats(payload.seats);
    sortRoomSeatDraft();
    roomGridRows.value = Math.max(1, Math.min(ROOM_GRID_MAX, payload.row_count));
    roomGridCols.value = Math.max(1, Math.min(ROOM_GRID_MAX, payload.col_count));
    draggingSeat.value = null;
    dragOverCellKey.value = '';
  }

  function findFirstEmptyCell() {
    for (let row = 1; row <= roomGridRows.value; row += 1) {
      for (let col = 1; col <= roomGridCols.value; col += 1) {
        const occupied = roomSeatDraft.value.some((seat) => seat.row_no === row && seat.col_no === col);
        if (!occupied) {
          return { row, col };
        }
      }
    }
    return null;
  }

  function buildCellKey(row: number, col: number) {
    return `${row}-${col}`;
  }

  function handleSeatDragStart(event: DragEvent, seat: RoomSeat | null) {
    if (!seat) {
      return;
    }
    draggingSeat.value = seat;
    dragOverCellKey.value = buildCellKey(seat.row_no, seat.col_no);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.dropEffect = 'move';
      event.dataTransfer.setData('text/plain', seat.id ? String(seat.id) : buildCellKey(seat.row_no, seat.col_no));
    }
  }

  function handleSeatDragOver(event: DragEvent, row: number, col: number) {
    if (!draggingSeat.value) {
      return;
    }
    dragOverCellKey.value = buildCellKey(row, col);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleSeatDragEnd() {
    draggingSeat.value = null;
    dragOverCellKey.value = '';
  }

  function handleSeatDrop(event: DragEvent, row: number, col: number) {
    event.preventDefault();

    const sourceSeat = draggingSeat.value;
    if (!sourceSeat) {
      return;
    }

    const targetSeat = roomSeatDraft.value.find(
      (seat) => seat !== sourceSeat && seat.row_no === row && seat.col_no === col
    );

    const originalRow = sourceSeat.row_no;
    const originalCol = sourceSeat.col_no;
    sourceSeat.row_no = row;
    sourceSeat.col_no = col;

    if (targetSeat) {
      targetSeat.row_no = originalRow;
      targetSeat.col_no = originalCol;
    }

    sortRoomSeatDraft();
    draggingSeat.value = null;
    dragOverCellKey.value = '';
  }

  function normalizeGridValue(value: number | undefined, fallback: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback;
    }
    return Math.max(1, Math.min(ROOM_GRID_MAX, Math.trunc(value)));
  }

  function handleRoomGridRowsChange() {
    const nextValue = normalizeGridValue(roomGridRows.value, maxSeatRow.value);
    if (nextValue < maxSeatRow.value) {
      roomGridRows.value = maxSeatRow.value;
      ElMessage.warning(`当前第 ${maxSeatRow.value} 行仍有座位，请先移动或删除这些座位后再缩小行数`);
      return;
    }
    roomGridRows.value = nextValue;
  }

  function handleRoomGridColsChange() {
    const nextValue = normalizeGridValue(roomGridCols.value, maxSeatCol.value);
    if (nextValue < maxSeatCol.value) {
      roomGridCols.value = maxSeatCol.value;
      ElMessage.warning(`当前第 ${maxSeatCol.value} 列仍有座位，请先移动或删除这些座位后再缩小列数`);
      return;
    }
    roomGridCols.value = nextValue;
  }

  function csvEscapeCell(value: string | number | boolean | null | undefined) {
    const text = `${value ?? ''}`;
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function buildTemplateSeats() {
    if (roomSeatDraft.value.length) {
      return [...roomSeatDraft.value].sort((left, right) => (
        left.row_no - right.row_no
        || left.col_no - right.col_no
        || (left.id ?? 0) - (right.id ?? 0)
      ));
    }

    const generatedSeats: RoomSeat[] = [];
    for (let row = 1; row <= roomGridRows.value; row += 1) {
      for (let col = 1; col <= roomGridCols.value; col += 1) {
        generatedSeats.push({
          row_no: row,
          col_no: col,
          seat_label: `${row}-${col}`,
          ip_address: '',
          hostname: null,
          is_enabled: true,
        });
      }
    }
    return generatedSeats;
  }

  function downloadSeatTemplate(selectedRoom: BootstrapPayload['rooms'][number] | null) {
    if (!selectedRoom) {
      ElMessage.warning('请先选择机房，再下载座位导入模板');
      return;
    }

    try {
      const csvRows = [
        ['行号', '列号', '座位号', 'IP地址', '主机名', '是否启用'],
        ...buildTemplateSeats().map((seat) => [
          seat.row_no,
          seat.col_no,
          seat.seat_label,
          seat.ip_address,
          seat.hostname ?? '',
          seat.is_enabled ? '是' : '否',
        ]),
      ];
      const csvContent = `\uFEFF${csvRows.map((row) => row.map((cell) => csvEscapeCell(cell)).join(',')).join('\r\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${selectedRoom.name}-座位导入模板.csv`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '下载座位导入模板失败');
    }
  }

  async function importSeatFile(file: File, escapeHtml: (value: string) => string) {
    if (!authStore.token) {
      ElMessage.warning('登录状态已失效，请重新登录后再导入座位表');
      return;
    }
    if (!selectedRoomId.value) {
      ElMessage.warning('请先选择机房后再导入座位表');
      return;
    }

    isImportingSeats.value = true;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const payload = await apiUpload<RoomSeatDraftPayload>(
        `/settings/admin/rooms/${selectedRoomId.value}/seats/import`,
        formData,
        authStore.token
      );
      setRoomDraft(payload);
      ElMessage.success(`已导入 ${payload.seats.length} 个座位，请检查后再保存`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入座位表失败';
      const helpTips = [
        '请确认文件格式为 .csv / .txt / .tsv / .xlsx',
        '请保留表头：行号、列号、座位号、IP地址（主机名、是否启用可选）',
        '请检查是否存在重复座标、重复 IP 或超出机房网格范围',
      ];
      await ElMessageBox.alert(
        `${escapeHtml(message).replace(/\n/g, '<br/>')}<br/><br/>${helpTips.map((item, index) => `${index + 1}. ${escapeHtml(item)}`).join('<br/>')}`,
        '座位表导入失败',
        {
          confirmButtonText: '知道了',
          dangerouslyUseHTMLString: true,
          customClass: 'admin-batch-skip-dialog',
        }
      );
    } finally {
      isImportingSeats.value = false;
    }
  }

  async function saveRoom(editingRoomId: number | null, form: RoomDialogForm): Promise<number | null> {
    if (!authStore.token) return null;
    const path = editingRoomId ? `/settings/admin/rooms/${editingRoomId}` : '/settings/admin/rooms';
    const method = editingRoomId ? apiPut : apiPost;
    bootstrap.value = await method<BootstrapPayload>(path, form, authStore.token);
    selectedRoomId.value = editingRoomId ?? bootstrap.value.rooms[bootstrap.value.rooms.length - 1]?.id ?? null;
    ElMessage.success(editingRoomId ? '机房已更新' : '机房已创建');
    return selectedRoomId.value;
  }

  async function deleteRoom(roomId: number) {
    if (!authStore.token) return;
    await ElMessageBox.confirm('确认删除这个机房吗？');
    bootstrap.value = await apiDelete<BootstrapPayload>(`/settings/admin/rooms/${roomId}`, authStore.token);
    selectedRoomId.value = bootstrap.value.rooms[0]?.id ?? null;
    ElMessage.success('机房已删除');
  }

  function addSeatDraft() {
    let target = findFirstEmptyCell();
    if (!target) {
      if (roomGridRows.value >= ROOM_GRID_MAX) {
        ElMessage.warning(`机房行数最多支持 ${ROOM_GRID_MAX} 行，请先调整布局或删除空座位`);
        return;
      }
      roomGridRows.value += 1;
      target = { row: roomGridRows.value, col: 1 };
    }
    roomSeatDraft.value.push({
      row_no: target.row,
      col_no: target.col,
      seat_label: `新座位${roomSeatDraft.value.length + 1}`,
      ip_address: '',
      hostname: '',
      is_enabled: true,
    });
    sortRoomSeatDraft();
  }

  function removeSeatDraft(index: number) {
    roomSeatDraft.value.splice(index, 1);
    sortRoomSeatDraft();
  }

  async function clearSeatDraft() {
    if (!authStore.token || !selectedRoomId.value) {
      return;
    }
    if (!roomSeatDraft.value.length) {
      ElMessage.info('当前座位表已经是空的');
      return;
    }

    try {
      await ElMessageBox.confirm('确认一键清空当前机房的全部座位吗？该操作会立即保存且不可撤销。', '清空座位表', {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      });

      bootstrap.value = await apiPut<BootstrapPayload>(
        `/settings/admin/rooms/${selectedRoomId.value}/seats`,
        {
          row_count: roomGridRows.value,
          col_count: roomGridCols.value,
          seats: [],
        },
        authStore.token
      );
      ElMessage.success('座位表已一键清空');
    } catch (error) {
      if (isDialogCancelled(error)) {
        return;
      }
      ElMessage.error(error instanceof Error ? error.message : '清空座位表失败');
    }
  }

  async function saveSeatDraft() {
    if (!authStore.token || !selectedRoomId.value) return;
    if (roomGridRows.value < maxSeatRow.value) {
      ElMessage.warning(`当前第 ${maxSeatRow.value} 行仍有座位，请先调整后再保存`);
      roomGridRows.value = maxSeatRow.value;
      return;
    }
    if (roomGridCols.value < maxSeatCol.value) {
      ElMessage.warning(`当前第 ${maxSeatCol.value} 列仍有座位，请先调整后再保存`);
      roomGridCols.value = maxSeatCol.value;
      return;
    }
    try {
      bootstrap.value = await apiPut<BootstrapPayload>(
        `/settings/admin/rooms/${selectedRoomId.value}/seats`,
        {
          row_count: roomGridRows.value,
          col_count: roomGridCols.value,
          seats: roomSeatDraft.value.map((seat) => ({
            id: seat.id,
            row_no: seat.row_no,
            col_no: seat.col_no,
            seat_label: seat.seat_label,
            ip_address: seat.ip_address,
            hostname: seat.hostname,
            is_enabled: seat.is_enabled,
          })),
        },
        authStore.token
      );
      ElMessage.success('机房座位已更新');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '保存座位表失败');
    }
  }

  return {
    selectedRoomId,
    roomSeatDraft,
    roomGridRows,
    roomGridCols,
    draggingSeat,
    dragOverCellKey,
    isImportingSeats,
    showSeatTable,
    maxSeatRow,
    maxSeatCol,
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
  };
}
