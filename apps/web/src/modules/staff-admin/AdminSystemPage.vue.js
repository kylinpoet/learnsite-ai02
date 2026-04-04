/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
const ROOM_GRID_MAX = 50;
const seatImportAccept = '.csv,.txt,.tsv,.xlsx';
const providerTypeOptions = [
    { label: 'OpenAI Compatible', value: 'openai-compatible' },
];
const adminQueryTabs = ['system', 'accounts', 'rooms', 'curriculum'];
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref('system');
const bootstrap = ref(null);
const curriculumBooks = ref([]);
const aiProviders = ref([]);
const selectedRoomId = ref(null);
const roomSeatDraft = ref([]);
const roomGridRows = ref(1);
const roomGridCols = ref(1);
const draggingSeat = ref(null);
const dragOverCellKey = ref('');
const seatImportInputRef = ref(null);
const isLoading = ref(true);
const isSavingSystem = ref(false);
const isImportingSeats = ref(false);
const errorMessage = ref('');
const systemForm = ref({ school_name: '', active_grade_nos: [], student_register_enabled: false, assistant_enabled: false, auto_attendance_on_login: true });
const assistantPromptForm = ref({ general_prompt: '', lesson_prompt: '' });
const classDialogVisible = ref(false);
const teacherDialogVisible = ref(false);
const roomDialogVisible = ref(false);
const bookDialogVisible = ref(false);
const unitDialogVisible = ref(false);
const lessonDialogVisible = ref(false);
const providerDialogVisible = ref(false);
const isSavingProvider = ref(false);
const isSavingAssistantPrompts = ref(false);
const editingClassId = ref(null);
const editingTeacherId = ref(null);
const editingRoomId = ref(null);
const editingBookId = ref(null);
const editingUnitId = ref(null);
const editingLessonId = ref(null);
const editingProviderId = ref(null);
const editingBookParentId = ref(null);
const editingUnitParentId = ref(null);
const classForm = ref({ grade_no: 7, class_no: 1, head_teacher_name: '', default_room_id: null });
const teacherForm = ref({ username: '', display_name: '', title: '', password: '', is_admin: false, class_ids: [] });
const roomForm = ref({ name: '', row_count: 2, col_count: 6, description: '', ip_prefix: '', ip_start: 11 });
const bookForm = ref({ name: '', subject: '信息科技', edition: '浙教版', grade_scope: '' });
const unitForm = ref({ book_id: 0, term_no: 1, unit_no: 1, title: '' });
const lessonForm = ref({ unit_id: 0, lesson_no: 1, title: '', summary: '' });
const providerForm = ref({ name: '', provider_type: 'openai-compatible', base_url: '', api_key: '', model_name: '', is_default: false, is_enabled: true });
const selectedRoom = computed(() => bootstrap.value?.rooms.find((item) => item.id === selectedRoomId.value) ?? null);
const maxSeatRow = computed(() => roomSeatDraft.value.reduce((max, seat) => Math.max(max, seat.row_no), 1));
const maxSeatCol = computed(() => roomSeatDraft.value.reduce((max, seat) => Math.max(max, seat.col_no), 1));
const roomLayoutStyle = computed(() => ({ gridTemplateColumns: `repeat(${Math.max(roomGridCols.value, 1)}, minmax(0, 1fr))` }));
const roomLayoutCells = computed(() => {
    const cells = [];
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
function cloneSeats(seats) {
    return JSON.parse(JSON.stringify(seats));
}
function sortRoomSeatDraft() {
    roomSeatDraft.value.sort((left, right) => (left.row_no - right.row_no
        || left.col_no - right.col_no
        || (left.id ?? 0) - (right.id ?? 0)));
}
function setRoomDraft(payload) {
    roomSeatDraft.value = cloneSeats(payload.seats);
    sortRoomSeatDraft();
    roomGridRows.value = Math.max(1, Math.min(ROOM_GRID_MAX, payload.row_count));
    roomGridCols.value = Math.max(1, Math.min(ROOM_GRID_MAX, payload.col_count));
    draggingSeat.value = null;
    dragOverCellKey.value = '';
}
function resetProviderForm() {
    providerForm.value = {
        name: '',
        provider_type: 'openai-compatible',
        base_url: '',
        api_key: '',
        model_name: '',
        is_default: false,
        is_enabled: true,
    };
}
function roomName(roomId) {
    return bootstrap.value?.rooms.find((item) => item.id === roomId)?.name || '未绑定';
}
function teacherClassNames(classIds) {
    return classIds.map((id) => bootstrap.value?.classes.find((item) => item.id === id)?.class_name || '').filter(Boolean);
}
function resolveTabFromRoute() {
    if (route.path.endsWith('/admin/ai-providers')) {
        return 'ai-providers';
    }
    const tab = route.query.tab;
    if (typeof tab === 'string' && adminQueryTabs.includes(tab)) {
        return tab;
    }
    return 'system';
}
async function loadBootstrap() {
    bootstrap.value = await apiGet('/settings/admin/bootstrap', authStore.token);
    systemForm.value = { ...bootstrap.value.system, active_grade_nos: [...bootstrap.value.system.active_grade_nos] };
    assistantPromptForm.value = { ...bootstrap.value.assistant_prompts };
    selectedRoomId.value = selectedRoomId.value && bootstrap.value.rooms.some((room) => room.id === selectedRoomId.value) ? selectedRoomId.value : bootstrap.value.rooms[0]?.id ?? null;
}
async function loadCurriculum() {
    const payload = await apiGet('/curriculum/tree', authStore.token);
    curriculumBooks.value = payload.books;
}
async function loadAIProviders() {
    const payload = await apiGet('/settings/ai-providers', authStore.token);
    aiProviders.value = payload.items;
}
async function loadPage() {
    if (!authStore.token) {
        errorMessage.value = '请先使用管理员账号登录';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        await Promise.all([loadBootstrap(), loadCurriculum(), loadAIProviders()]);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载管理员后台失败';
    }
    finally {
        isLoading.value = false;
    }
}
watch(selectedRoom, (room) => {
    if (room) {
        setRoomDraft({ row_count: room.row_count, col_count: room.col_count, seats: room.seats });
        return;
    }
    roomSeatDraft.value = [];
    roomGridRows.value = 1;
    roomGridCols.value = 1;
    draggingSeat.value = null;
    dragOverCellKey.value = '';
}, { immediate: true });
watch(() => [route.path, route.query.tab], () => {
    const nextTab = resolveTabFromRoute();
    if (activeTab.value !== nextTab) {
        activeTab.value = nextTab;
    }
}, { immediate: true });
watch(activeTab, (tab) => {
    if (tab === resolveTabFromRoute()) {
        return;
    }
    if (tab === 'ai-providers') {
        void router.replace({ path: '/staff/admin/ai-providers' });
        return;
    }
    if (tab === 'system') {
        void router.replace({ path: '/staff/admin/system' });
        return;
    }
    void router.replace({
        path: '/staff/admin/system',
        query: { tab },
    });
});
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
function buildCellKey(row, col) {
    return `${row}-${col}`;
}
function handleSeatDragStart(event, seat) {
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
function handleSeatDragOver(event, row, col) {
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
function handleSeatDrop(event, row, col) {
    event.preventDefault();
    const sourceSeat = draggingSeat.value;
    if (!sourceSeat) {
        return;
    }
    const targetSeat = roomSeatDraft.value.find((seat) => seat !== sourceSeat && seat.row_no === row && seat.col_no === col);
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
function normalizeGridValue(value, fallback) {
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
function csvEscapeCell(value) {
    const text = `${value ?? ''}`;
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}
function buildTemplateSeats() {
    if (roomSeatDraft.value.length) {
        return [...roomSeatDraft.value].sort((left, right) => (left.row_no - right.row_no
            || left.col_no - right.col_no
            || (left.id ?? 0) - (right.id ?? 0)));
    }
    const generatedSeats = [];
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
function downloadSeatTemplate() {
    if (!selectedRoom.value) {
        return;
    }
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
    anchor.download = `${selectedRoom.value.name}-座位导入模板.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
}
function openSeatImportPicker() {
    seatImportInputRef.value?.click();
}
async function handleSeatImportChange(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!input) {
        return;
    }
    if (!file || !authStore.token || !selectedRoomId.value) {
        input.value = '';
        return;
    }
    isImportingSeats.value = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const payload = await apiUpload(`/settings/admin/rooms/${selectedRoomId.value}/seats/import`, formData, authStore.token);
        setRoomDraft(payload);
        ElMessage.success(`已导入 ${payload.seats.length} 个座位，请检查后再保存`);
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '导入座位表失败');
    }
    finally {
        isImportingSeats.value = false;
        input.value = '';
    }
}
async function saveSystemSettings() {
    if (!authStore.token)
        return;
    isSavingSystem.value = true;
    try {
        const payload = await apiPut('/settings/system', systemForm.value, authStore.token);
        systemForm.value = { ...payload, active_grade_nos: [...payload.active_grade_nos] };
        ElMessage.success('系统参数已更新');
        await loadBootstrap();
    }
    finally {
        isSavingSystem.value = false;
    }
}
async function saveAssistantPrompts() {
    if (!authStore.token)
        return;
    isSavingAssistantPrompts.value = true;
    try {
        const payload = await apiPut('/settings/assistant-prompts', assistantPromptForm.value, authStore.token);
        assistantPromptForm.value = { ...payload };
        if (bootstrap.value) {
            bootstrap.value.assistant_prompts = { ...payload };
        }
        ElMessage.success('AI 学伴提示词已更新');
    }
    finally {
        isSavingAssistantPrompts.value = false;
    }
}
function openClassDialog(item) {
    editingClassId.value = item?.id ?? null;
    classForm.value = item ? { grade_no: item.grade_no, class_no: item.class_no, head_teacher_name: item.head_teacher_name || '', default_room_id: item.default_room_id } : { grade_no: 7, class_no: 1, head_teacher_name: '', default_room_id: null };
    classDialogVisible.value = true;
}
async function saveClass() {
    if (!authStore.token)
        return;
    const path = editingClassId.value ? `/settings/admin/classes/${editingClassId.value}` : '/settings/admin/classes';
    const method = editingClassId.value ? apiPut : apiPost;
    const payload = await method(path, classForm.value, authStore.token);
    bootstrap.value = payload;
    classDialogVisible.value = false;
    ElMessage.success(editingClassId.value ? '班级已更新' : '班级已创建');
}
async function deleteClass(classId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这个班级吗？');
    bootstrap.value = await apiDelete(`/settings/admin/classes/${classId}`, authStore.token);
    ElMessage.success('班级已删除');
}
function openTeacherDialog(item) {
    editingTeacherId.value = item?.id ?? null;
    teacherForm.value = item ? { username: item.username, display_name: item.display_name, title: item.title || '', password: '', is_admin: item.is_admin, class_ids: [...item.class_ids] } : { username: '', display_name: '', title: '', password: '', is_admin: false, class_ids: [] };
    teacherDialogVisible.value = true;
}
async function saveTeacher() {
    if (!authStore.token)
        return;
    const path = editingTeacherId.value ? `/settings/admin/teachers/${editingTeacherId.value}` : '/settings/admin/teachers';
    const method = editingTeacherId.value ? apiPut : apiPost;
    const payload = {
        username: teacherForm.value.username.trim(),
        display_name: teacherForm.value.display_name.trim(),
        title: teacherForm.value.title.trim() || null,
        password: teacherForm.value.password.trim() || null,
        is_admin: teacherForm.value.is_admin,
        class_ids: [...teacherForm.value.class_ids],
    };
    try {
        bootstrap.value = await method(path, payload, authStore.token);
        teacherDialogVisible.value = false;
        if (editingTeacherId.value && Number(authStore.user?.id) === editingTeacherId.value) {
            await authStore.syncSessionUser(true);
            if (!authStore.isAdmin) {
                await router.replace('/staff/dashboard');
            }
        }
        ElMessage.success(editingTeacherId.value ? '教师已更新' : '教师已创建');
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '保存教师失败');
    }
}
async function deleteTeacher(teacherId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这个教师账号吗？');
    bootstrap.value = await apiDelete(`/settings/admin/teachers/${teacherId}`, authStore.token);
    ElMessage.success('教师已删除');
}
function openRoomDialog(item) {
    editingRoomId.value = item?.id ?? null;
    roomForm.value = item ? { name: item.name, row_count: item.row_count, col_count: item.col_count, description: item.description || '', ip_prefix: '', ip_start: 11 } : { name: '', row_count: 2, col_count: 6, description: '', ip_prefix: '', ip_start: 11 };
    roomDialogVisible.value = true;
}
async function saveRoom() {
    if (!authStore.token)
        return;
    const path = editingRoomId.value ? `/settings/admin/rooms/${editingRoomId.value}` : '/settings/admin/rooms';
    const method = editingRoomId.value ? apiPut : apiPost;
    bootstrap.value = await method(path, roomForm.value, authStore.token);
    roomDialogVisible.value = false;
    selectedRoomId.value = editingRoomId.value ?? bootstrap.value.rooms[bootstrap.value.rooms.length - 1]?.id ?? null;
    ElMessage.success(editingRoomId.value ? '机房已更新' : '机房已创建');
}
async function deleteRoom(roomId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这个机房吗？');
    bootstrap.value = await apiDelete(`/settings/admin/rooms/${roomId}`, authStore.token);
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
function removeSeatDraft(index) {
    roomSeatDraft.value.splice(index, 1);
    sortRoomSeatDraft();
}
async function saveSeatDraft() {
    if (!authStore.token || !selectedRoomId.value)
        return;
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
    bootstrap.value = await apiPut(`/settings/admin/rooms/${selectedRoomId.value}/seats`, {
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
    }, authStore.token);
    ElMessage.success('机房座位已更新');
}
function openBookDialog(book) {
    editingBookId.value = book?.id ?? null;
    bookForm.value = book ? { name: book.name, subject: book.subject, edition: book.edition, grade_scope: book.grade_scope } : { name: '', subject: '信息科技', edition: '浙教版', grade_scope: '' };
    bookDialogVisible.value = true;
}
async function saveBook() {
    if (!authStore.token)
        return;
    const path = editingBookId.value ? `/curriculum/books/${editingBookId.value}` : '/curriculum/books';
    const method = editingBookId.value ? apiPut : apiPost;
    await method(path, bookForm.value, authStore.token);
    bookDialogVisible.value = false;
    await loadCurriculum();
    ElMessage.success(editingBookId.value ? '教材已更新' : '教材已创建');
}
async function deleteBook(bookId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这本教材吗？');
    await apiDelete(`/curriculum/books/${bookId}`, authStore.token);
    await loadCurriculum();
    ElMessage.success('教材已删除');
}
function openUnitDialog(bookId, unit) {
    editingUnitId.value = unit?.id ?? null;
    editingBookParentId.value = bookId;
    unitForm.value = unit ? { book_id: bookId, term_no: unit.term_no, unit_no: unit.unit_no, title: unit.title } : { book_id: bookId, term_no: 1, unit_no: 1, title: '' };
    unitDialogVisible.value = true;
}
async function saveUnit() {
    if (!authStore.token)
        return;
    const path = editingUnitId.value ? `/curriculum/units/${editingUnitId.value}` : '/curriculum/units';
    const method = editingUnitId.value ? apiPut : apiPost;
    await method(path, unitForm.value, authStore.token);
    unitDialogVisible.value = false;
    await loadCurriculum();
    ElMessage.success(editingUnitId.value ? '单元已更新' : '单元已创建');
}
async function deleteUnit(unitId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这个单元吗？');
    await apiDelete(`/curriculum/units/${unitId}`, authStore.token);
    await loadCurriculum();
    ElMessage.success('单元已删除');
}
function openLessonDialog(unitId, lesson) {
    editingLessonId.value = lesson?.id ?? null;
    editingUnitParentId.value = unitId;
    lessonForm.value = lesson ? { unit_id: unitId, lesson_no: lesson.lesson_no, title: lesson.title, summary: lesson.summary || '' } : { unit_id: unitId, lesson_no: 1, title: '', summary: '' };
    lessonDialogVisible.value = true;
}
async function saveLesson() {
    if (!authStore.token)
        return;
    const path = editingLessonId.value ? `/curriculum/lessons/${editingLessonId.value}` : '/curriculum/lessons';
    const method = editingLessonId.value ? apiPut : apiPost;
    await method(path, lessonForm.value, authStore.token);
    lessonDialogVisible.value = false;
    await loadCurriculum();
    ElMessage.success(editingLessonId.value ? '课次已更新' : '课次已创建');
}
async function deleteLesson(lessonId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这个课次吗？');
    await apiDelete(`/curriculum/lessons/${lessonId}`, authStore.token);
    await loadCurriculum();
    ElMessage.success('课次已删除');
}
function openProviderDialog(provider) {
    editingProviderId.value = provider?.id ?? null;
    if (provider) {
        providerForm.value = {
            name: provider.name,
            provider_type: provider.provider_type,
            base_url: provider.base_url,
            api_key: '',
            model_name: provider.model_name,
            is_default: provider.is_default,
            is_enabled: provider.is_enabled,
        };
    }
    else {
        resetProviderForm();
    }
    providerDialogVisible.value = true;
}
async function saveProvider() {
    if (!authStore.token)
        return;
    const payload = {
        ...providerForm.value,
        name: providerForm.value.name.trim(),
        provider_type: providerForm.value.provider_type.trim(),
        base_url: providerForm.value.base_url.trim(),
        api_key: providerForm.value.api_key.trim(),
        model_name: providerForm.value.model_name.trim(),
    };
    if (!payload.name || !payload.base_url || !payload.model_name) {
        ElMessage.warning('请填写完整的 Provider 名称、Base URL 和模型名称');
        return;
    }
    if (!editingProviderId.value && !payload.api_key) {
        ElMessage.warning('新建 Provider 时必须提供 API Key');
        return;
    }
    isSavingProvider.value = true;
    try {
        const path = editingProviderId.value ? `/settings/ai-providers/${editingProviderId.value}` : '/settings/ai-providers';
        const method = editingProviderId.value ? apiPut : apiPost;
        const response = await method(path, payload, authStore.token);
        aiProviders.value = response.items;
        providerDialogVisible.value = false;
        ElMessage.success(editingProviderId.value ? 'AI Provider 已更新' : 'AI Provider 已创建');
    }
    finally {
        isSavingProvider.value = false;
    }
}
async function deleteProvider(providerId) {
    if (!authStore.token)
        return;
    await ElMessageBox.confirm('确认删除这个 AI Provider 吗？');
    const response = await apiDelete(`/settings/ai-providers/${providerId}`, authStore.token);
    aiProviders.value = response.items;
    ElMessage.success('AI Provider 已删除');
}
onMounted(() => {
    void loadPage();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['room-grid-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['room-layout-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-stack" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "hero-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isLoading),
    type: "primary",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isLoading),
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.loadPage)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.errorMessage) {
    const __VLS_8 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_10 = __VLS_9({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
const __VLS_12 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_14 = __VLS_13({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_15.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "soft-card" },
    });
    const __VLS_16 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        rows: (12),
    }));
    const __VLS_18 = __VLS_17({
        rows: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
{
    const { default: __VLS_thisSlot } = __VLS_15.slots;
    if (__VLS_ctx.bootstrap) {
        const __VLS_20 = {}.ElTabs;
        /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            modelValue: (__VLS_ctx.activeTab),
        }));
        const __VLS_22 = __VLS_21({
            modelValue: (__VLS_ctx.activeTab),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        const __VLS_24 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            label: "基础参数",
            name: "system",
        }));
        const __VLS_26 = __VLS_25({
            label: "基础参数",
            name: "system",
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_28 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            labelPosition: "top",
        }));
        const __VLS_30 = __VLS_29({
            labelPosition: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        const __VLS_32 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            label: "学校名称",
        }));
        const __VLS_34 = __VLS_33({
            label: "学校名称",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        const __VLS_36 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            modelValue: (__VLS_ctx.systemForm.school_name),
        }));
        const __VLS_38 = __VLS_37({
            modelValue: (__VLS_ctx.systemForm.school_name),
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        var __VLS_35;
        const __VLS_40 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            label: "开放年级",
        }));
        const __VLS_42 = __VLS_41({
            label: "开放年级",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        const __VLS_44 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            modelValue: (__VLS_ctx.systemForm.active_grade_nos),
            ...{ class: "full-width" },
            multiple: true,
        }));
        const __VLS_46 = __VLS_45({
            modelValue: (__VLS_ctx.systemForm.active_grade_nos),
            ...{ class: "full-width" },
            multiple: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        for (const [grade] of __VLS_getVForSourceType(([7, 8, 9]))) {
            const __VLS_48 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                key: (grade),
                label: (`${grade} 年级`),
                value: (grade),
            }));
            const __VLS_50 = __VLS_49({
                key: (grade),
                label: (`${grade} 年级`),
                value: (grade),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        }
        var __VLS_47;
        var __VLS_43;
        const __VLS_52 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            label: "功能开关",
        }));
        const __VLS_54 = __VLS_53({
            label: "功能开关",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "switch-stack" },
        });
        const __VLS_56 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            modelValue: (__VLS_ctx.systemForm.student_register_enabled),
            activeText: "允许学生注册",
        }));
        const __VLS_58 = __VLS_57({
            modelValue: (__VLS_ctx.systemForm.student_register_enabled),
            activeText: "允许学生注册",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        const __VLS_60 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            modelValue: (__VLS_ctx.systemForm.assistant_enabled),
            activeText: "启用智能体助手",
        }));
        const __VLS_62 = __VLS_61({
            modelValue: (__VLS_ctx.systemForm.assistant_enabled),
            activeText: "启用智能体助手",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        const __VLS_64 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            modelValue: (__VLS_ctx.systemForm.auto_attendance_on_login),
            activeText: "登录自动签到",
        }));
        const __VLS_66 = __VLS_65({
            modelValue: (__VLS_ctx.systemForm.auto_attendance_on_login),
            activeText: "登录自动签到",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        var __VLS_55;
        const __VLS_68 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.isSavingSystem),
            type: "primary",
        }));
        const __VLS_70 = __VLS_69({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.isSavingSystem),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        let __VLS_72;
        let __VLS_73;
        let __VLS_74;
        const __VLS_75 = {
            onClick: (__VLS_ctx.saveSystemSettings)
        };
        __VLS_71.slots.default;
        var __VLS_71;
        var __VLS_31;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "metric-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric-tile" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.bootstrap.stats.class_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric-tile" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.bootstrap.stats.teacher_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric-tile" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.bootstrap.stats.student_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric-tile" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.bootstrap.stats.room_count);
        var __VLS_27;
        const __VLS_76 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            label: "班级与教师",
            name: "accounts",
        }));
        const __VLS_78 = __VLS_77({
            label: "班级与教师",
            name: "accounts",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_80 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_82 = __VLS_81({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        let __VLS_84;
        let __VLS_85;
        let __VLS_86;
        const __VLS_87 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.openClassDialog();
            }
        };
        __VLS_83.slots.default;
        var __VLS_83;
        const __VLS_88 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            data: (__VLS_ctx.bootstrap.classes),
            stripe: true,
        }));
        const __VLS_90 = __VLS_89({
            data: (__VLS_ctx.bootstrap.classes),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        const __VLS_92 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            label: "班级",
            minWidth: "120",
            prop: "class_name",
        }));
        const __VLS_94 = __VLS_93({
            label: "班级",
            minWidth: "120",
            prop: "class_name",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        const __VLS_96 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            label: "年级",
            minWidth: "90",
            prop: "grade_no",
        }));
        const __VLS_98 = __VLS_97({
            label: "年级",
            minWidth: "90",
            prop: "grade_no",
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        const __VLS_100 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            label: "班主任",
            minWidth: "120",
            prop: "head_teacher_name",
        }));
        const __VLS_102 = __VLS_101({
            label: "班主任",
            minWidth: "120",
            prop: "head_teacher_name",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        const __VLS_104 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            label: "机房",
            minWidth: "140",
        }));
        const __VLS_106 = __VLS_105({
            label: "机房",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        __VLS_107.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_107.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.roomName(row.default_room_id));
        }
        var __VLS_107;
        const __VLS_108 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            label: "学生数",
            minWidth: "90",
            prop: "student_count",
        }));
        const __VLS_110 = __VLS_109({
            label: "学生数",
            minWidth: "90",
            prop: "student_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        const __VLS_112 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            label: "操作",
            minWidth: "160",
        }));
        const __VLS_114 = __VLS_113({
            label: "操作",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        __VLS_115.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_115.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_116 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_118 = __VLS_117({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_117));
            let __VLS_120;
            let __VLS_121;
            let __VLS_122;
            const __VLS_123 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.bootstrap))
                        return;
                    __VLS_ctx.openClassDialog(row);
                }
            };
            __VLS_119.slots.default;
            var __VLS_119;
            const __VLS_124 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_126 = __VLS_125({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
            let __VLS_128;
            let __VLS_129;
            let __VLS_130;
            const __VLS_131 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.bootstrap))
                        return;
                    __VLS_ctx.deleteClass(row.id);
                }
            };
            __VLS_127.slots.default;
            var __VLS_127;
        }
        var __VLS_115;
        var __VLS_91;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_132 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_134 = __VLS_133({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        let __VLS_136;
        let __VLS_137;
        let __VLS_138;
        const __VLS_139 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.openTeacherDialog();
            }
        };
        __VLS_135.slots.default;
        var __VLS_135;
        const __VLS_140 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            data: (__VLS_ctx.bootstrap.teachers),
            stripe: true,
        }));
        const __VLS_142 = __VLS_141({
            data: (__VLS_ctx.bootstrap.teachers),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        const __VLS_144 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            label: "账号",
            minWidth: "110",
            prop: "username",
        }));
        const __VLS_146 = __VLS_145({
            label: "账号",
            minWidth: "110",
            prop: "username",
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        const __VLS_148 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            label: "姓名",
            minWidth: "120",
            prop: "display_name",
        }));
        const __VLS_150 = __VLS_149({
            label: "姓名",
            minWidth: "120",
            prop: "display_name",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        const __VLS_152 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            label: "职务",
            minWidth: "130",
            prop: "title",
        }));
        const __VLS_154 = __VLS_153({
            label: "职务",
            minWidth: "130",
            prop: "title",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        const __VLS_156 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            label: "管理员",
            minWidth: "90",
        }));
        const __VLS_158 = __VLS_157({
            label: "管理员",
            minWidth: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        __VLS_159.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_159.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_160 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                type: (row.is_admin ? 'warning' : 'info'),
                round: true,
            }));
            const __VLS_162 = __VLS_161({
                type: (row.is_admin ? 'warning' : 'info'),
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_161));
            __VLS_163.slots.default;
            (row.is_admin ? '是' : '否');
            var __VLS_163;
        }
        var __VLS_159;
        const __VLS_164 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
            label: "关联班级",
            minWidth: "220",
        }));
        const __VLS_166 = __VLS_165({
            label: "关联班级",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        __VLS_167.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_167.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.teacherClassNames(row.class_ids).join('、') || '未关联');
        }
        var __VLS_167;
        const __VLS_168 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            label: "操作",
            minWidth: "160",
        }));
        const __VLS_170 = __VLS_169({
            label: "操作",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        __VLS_171.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_171.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_172 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_174 = __VLS_173({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            let __VLS_176;
            let __VLS_177;
            let __VLS_178;
            const __VLS_179 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.bootstrap))
                        return;
                    __VLS_ctx.openTeacherDialog(row);
                }
            };
            __VLS_175.slots.default;
            var __VLS_175;
            const __VLS_180 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_182 = __VLS_181({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
            let __VLS_184;
            let __VLS_185;
            let __VLS_186;
            const __VLS_187 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.bootstrap))
                        return;
                    __VLS_ctx.deleteTeacher(row.id);
                }
            };
            __VLS_183.slots.default;
            var __VLS_183;
        }
        var __VLS_171;
        var __VLS_143;
        var __VLS_79;
        const __VLS_188 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
            label: "机房与座位",
            name: "rooms",
        }));
        const __VLS_190 = __VLS_189({
            label: "机房与座位",
            name: "rooms",
        }, ...__VLS_functionalComponentArgsRest(__VLS_189));
        __VLS_191.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_192 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_194 = __VLS_193({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        let __VLS_196;
        let __VLS_197;
        let __VLS_198;
        const __VLS_199 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.openRoomDialog();
            }
        };
        __VLS_195.slots.default;
        var __VLS_195;
        const __VLS_200 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
        }));
        const __VLS_202 = __VLS_201({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        let __VLS_204;
        let __VLS_205;
        let __VLS_206;
        const __VLS_207 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.selectedRoom && __VLS_ctx.openRoomDialog(__VLS_ctx.selectedRoom);
            }
        };
        __VLS_203.slots.default;
        var __VLS_203;
        const __VLS_208 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
            type: "danger",
        }));
        const __VLS_210 = __VLS_209({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        let __VLS_212;
        let __VLS_213;
        let __VLS_214;
        const __VLS_215 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.deleteRoom(__VLS_ctx.selectedRoom.id);
            }
        };
        __VLS_211.slots.default;
        var __VLS_211;
        const __VLS_216 = {}.ElRadioGroup;
        /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            modelValue: (__VLS_ctx.selectedRoomId),
            ...{ class: "room-radio-group" },
        }));
        const __VLS_218 = __VLS_217({
            modelValue: (__VLS_ctx.selectedRoomId),
            ...{ class: "room-radio-group" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        for (const [room] of __VLS_getVForSourceType((__VLS_ctx.bootstrap.rooms))) {
            const __VLS_220 = {}.ElRadioButton;
            /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
            // @ts-ignore
            const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
                key: (room.id),
                label: (room.id),
            }));
            const __VLS_222 = __VLS_221({
                key: (room.id),
                label: (room.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_221));
            __VLS_223.slots.default;
            (room.name);
            var __VLS_223;
        }
        var __VLS_219;
        if (__VLS_ctx.selectedRoom) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.selectedRoom.description || '未填写机房说明');
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_224 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
        }));
        const __VLS_226 = __VLS_225({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        let __VLS_228;
        let __VLS_229;
        let __VLS_230;
        const __VLS_231 = {
            onClick: (__VLS_ctx.downloadSeatTemplate)
        };
        __VLS_227.slots.default;
        var __VLS_227;
        const __VLS_232 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            loading: (__VLS_ctx.isImportingSeats),
            plain: true,
        }));
        const __VLS_234 = __VLS_233({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            loading: (__VLS_ctx.isImportingSeats),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
        let __VLS_236;
        let __VLS_237;
        let __VLS_238;
        const __VLS_239 = {
            onClick: (__VLS_ctx.openSeatImportPicker)
        };
        __VLS_235.slots.default;
        var __VLS_235;
        const __VLS_240 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
        }));
        const __VLS_242 = __VLS_241({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
        let __VLS_244;
        let __VLS_245;
        let __VLS_246;
        const __VLS_247 = {
            onClick: (__VLS_ctx.addSeatDraft)
        };
        __VLS_243.slots.default;
        var __VLS_243;
        const __VLS_248 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            type: "primary",
        }));
        const __VLS_250 = __VLS_249({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.selectedRoom),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_249));
        let __VLS_252;
        let __VLS_253;
        let __VLS_254;
        const __VLS_255 = {
            onClick: (__VLS_ctx.saveSeatDraft)
        };
        __VLS_251.slots.default;
        var __VLS_251;
        if (__VLS_ctx.selectedRoom) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (__VLS_ctx.handleSeatImportChange) },
                ref: "seatImportInputRef",
                ...{ class: "file-input" },
                accept: (__VLS_ctx.seatImportAccept),
                type: "file",
            });
            /** @type {typeof __VLS_ctx.seatImportInputRef} */ ;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "room-grid-toolbar" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chip-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (__VLS_ctx.handleRoomGridRowsChange) },
                ...{ class: "grid-number-input" },
                type: "number",
                min: "1",
                max: (__VLS_ctx.ROOM_GRID_MAX),
            });
            (__VLS_ctx.roomGridRows);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chip-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (__VLS_ctx.handleRoomGridColsChange) },
                ...{ class: "grid-number-input" },
                type: "number",
                min: "1",
                max: (__VLS_ctx.ROOM_GRID_MAX),
            });
            (__VLS_ctx.roomGridCols);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "room-layout-board" },
                ...{ style: (__VLS_ctx.roomLayoutStyle) },
            });
            for (const [cell] of __VLS_getVForSourceType((__VLS_ctx.roomLayoutCells))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onDragover: (...[$event]) => {
                            if (!(__VLS_ctx.bootstrap))
                                return;
                            if (!(__VLS_ctx.selectedRoom))
                                return;
                            __VLS_ctx.handleSeatDragOver($event, cell.row, cell.col);
                        } },
                    ...{ onDrop: (...[$event]) => {
                            if (!(__VLS_ctx.bootstrap))
                                return;
                            if (!(__VLS_ctx.selectedRoom))
                                return;
                            __VLS_ctx.handleSeatDrop($event, cell.row, cell.col);
                        } },
                    key: (`${cell.row}-${cell.col}`),
                    ...{ class: "room-layout-cell" },
                    ...{ class: ({ 'is-drop-target': __VLS_ctx.dragOverCellKey === `${cell.row}-${cell.col}` }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "room-layout-axis" },
                });
                (cell.row);
                (cell.col);
                if (cell.seat && cell.seatIndex !== null) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ onDragstart: (...[$event]) => {
                                if (!(__VLS_ctx.bootstrap))
                                    return;
                                if (!(__VLS_ctx.selectedRoom))
                                    return;
                                if (!(cell.seat && cell.seatIndex !== null))
                                    return;
                                __VLS_ctx.handleSeatDragStart($event, cell.seat);
                            } },
                        ...{ onDragend: (__VLS_ctx.handleSeatDragEnd) },
                        ...{ class: "drag-seat-card" },
                        ...{ class: ({ 'is-dragging': __VLS_ctx.draggingSeat === cell.seat }) },
                        draggable: "true",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (cell.seat.seat_label);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (cell.seat.ip_address || '待填 IP');
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "drag-seat-empty" },
                    });
                }
            }
            const __VLS_256 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
                data: (__VLS_ctx.roomSeatDraft),
                stripe: true,
            }));
            const __VLS_258 = __VLS_257({
                data: (__VLS_ctx.roomSeatDraft),
                stripe: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_257));
            __VLS_259.slots.default;
            const __VLS_260 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
                label: "位置",
                minWidth: "100",
            }));
            const __VLS_262 = __VLS_261({
                label: "位置",
                minWidth: "100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_261));
            __VLS_263.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_263.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.row_no);
                (row.col_no);
            }
            var __VLS_263;
            const __VLS_264 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
                label: "座位名",
                minWidth: "120",
            }));
            const __VLS_266 = __VLS_265({
                label: "座位名",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_265));
            __VLS_267.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_267.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_268 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                    modelValue: (row.seat_label),
                }));
                const __VLS_270 = __VLS_269({
                    modelValue: (row.seat_label),
                }, ...__VLS_functionalComponentArgsRest(__VLS_269));
            }
            var __VLS_267;
            const __VLS_272 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
                label: "IP",
                minWidth: "150",
            }));
            const __VLS_274 = __VLS_273({
                label: "IP",
                minWidth: "150",
            }, ...__VLS_functionalComponentArgsRest(__VLS_273));
            __VLS_275.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_275.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_276 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
                    modelValue: (row.ip_address),
                }));
                const __VLS_278 = __VLS_277({
                    modelValue: (row.ip_address),
                }, ...__VLS_functionalComponentArgsRest(__VLS_277));
            }
            var __VLS_275;
            const __VLS_280 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                label: "主机名",
                minWidth: "150",
            }));
            const __VLS_282 = __VLS_281({
                label: "主机名",
                minWidth: "150",
            }, ...__VLS_functionalComponentArgsRest(__VLS_281));
            __VLS_283.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_283.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_284 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                    modelValue: (row.hostname),
                }));
                const __VLS_286 = __VLS_285({
                    modelValue: (row.hostname),
                }, ...__VLS_functionalComponentArgsRest(__VLS_285));
            }
            var __VLS_283;
            const __VLS_288 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
                label: "启用",
                minWidth: "90",
            }));
            const __VLS_290 = __VLS_289({
                label: "启用",
                minWidth: "90",
            }, ...__VLS_functionalComponentArgsRest(__VLS_289));
            __VLS_291.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_291.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_292 = {}.ElSwitch;
                /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
                // @ts-ignore
                const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
                    modelValue: (row.is_enabled),
                }));
                const __VLS_294 = __VLS_293({
                    modelValue: (row.is_enabled),
                }, ...__VLS_functionalComponentArgsRest(__VLS_293));
            }
            var __VLS_291;
            const __VLS_296 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
                label: "操作",
                minWidth: "90",
            }));
            const __VLS_298 = __VLS_297({
                label: "操作",
                minWidth: "90",
            }, ...__VLS_functionalComponentArgsRest(__VLS_297));
            __VLS_299.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_299.slots;
                const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_300 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }));
                const __VLS_302 = __VLS_301({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_301));
                let __VLS_304;
                let __VLS_305;
                let __VLS_306;
                const __VLS_307 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!(__VLS_ctx.selectedRoom))
                            return;
                        __VLS_ctx.removeSeatDraft($index);
                    }
                };
                __VLS_303.slots.default;
                var __VLS_303;
            }
            var __VLS_299;
            var __VLS_259;
        }
        else {
            const __VLS_308 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
                description: "请先选择机房",
            }));
            const __VLS_310 = __VLS_309({
                description: "请先选择机房",
            }, ...__VLS_functionalComponentArgsRest(__VLS_309));
        }
        var __VLS_191;
        const __VLS_312 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            label: "教材目录",
            name: "curriculum",
        }));
        const __VLS_314 = __VLS_313({
            label: "教材目录",
            name: "curriculum",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
        __VLS_315.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel panel-stack-gap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_316 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_318 = __VLS_317({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
        let __VLS_320;
        let __VLS_321;
        let __VLS_322;
        const __VLS_323 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.openBookDialog();
            }
        };
        __VLS_319.slots.default;
        var __VLS_319;
        const __VLS_324 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            ...{ 'onClick': {} },
            plain: true,
        }));
        const __VLS_326 = __VLS_325({
            ...{ 'onClick': {} },
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        let __VLS_328;
        let __VLS_329;
        let __VLS_330;
        const __VLS_331 = {
            onClick: (__VLS_ctx.loadCurriculum)
        };
        __VLS_327.slots.default;
        var __VLS_327;
        if (!__VLS_ctx.curriculumBooks.length) {
            const __VLS_332 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
                description: "暂无教材数据",
            }));
            const __VLS_334 = __VLS_333({
                description: "暂无教材数据",
            }, ...__VLS_functionalComponentArgsRest(__VLS_333));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "list-stack" },
            });
            for (const [book] of __VLS_getVForSourceType((__VLS_ctx.curriculumBooks))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (book.id),
                    ...{ class: "list-card" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "panel-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                (book.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                (book.subject);
                (book.edition);
                (book.grade_scope);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row" },
                });
                const __VLS_336 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }));
                const __VLS_338 = __VLS_337({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_337));
                let __VLS_340;
                let __VLS_341;
                let __VLS_342;
                const __VLS_343 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!!(!__VLS_ctx.curriculumBooks.length))
                            return;
                        __VLS_ctx.openUnitDialog(book.id);
                    }
                };
                __VLS_339.slots.default;
                var __VLS_339;
                const __VLS_344 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }));
                const __VLS_346 = __VLS_345({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_345));
                let __VLS_348;
                let __VLS_349;
                let __VLS_350;
                const __VLS_351 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!!(!__VLS_ctx.curriculumBooks.length))
                            return;
                        __VLS_ctx.openBookDialog(book);
                    }
                };
                __VLS_347.slots.default;
                var __VLS_347;
                const __VLS_352 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }));
                const __VLS_354 = __VLS_353({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_353));
                let __VLS_356;
                let __VLS_357;
                let __VLS_358;
                const __VLS_359 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!!(!__VLS_ctx.curriculumBooks.length))
                            return;
                        __VLS_ctx.deleteBook(book.id);
                    }
                };
                __VLS_355.slots.default;
                var __VLS_355;
                for (const [unit] of __VLS_getVForSourceType((book.units))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (unit.id),
                        ...{ class: "curriculum-block" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "panel-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (unit.title);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "chip-row" },
                    });
                    const __VLS_360 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }));
                    const __VLS_362 = __VLS_361({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
                    let __VLS_364;
                    let __VLS_365;
                    let __VLS_366;
                    const __VLS_367 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.bootstrap))
                                return;
                            if (!!(!__VLS_ctx.curriculumBooks.length))
                                return;
                            __VLS_ctx.openLessonDialog(unit.id);
                        }
                    };
                    __VLS_363.slots.default;
                    var __VLS_363;
                    const __VLS_368 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }));
                    const __VLS_370 = __VLS_369({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
                    let __VLS_372;
                    let __VLS_373;
                    let __VLS_374;
                    const __VLS_375 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.bootstrap))
                                return;
                            if (!!(!__VLS_ctx.curriculumBooks.length))
                                return;
                            __VLS_ctx.openUnitDialog(book.id, unit);
                        }
                    };
                    __VLS_371.slots.default;
                    var __VLS_371;
                    const __VLS_376 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "danger",
                    }));
                    const __VLS_378 = __VLS_377({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "danger",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_377));
                    let __VLS_380;
                    let __VLS_381;
                    let __VLS_382;
                    const __VLS_383 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.bootstrap))
                                return;
                            if (!!(!__VLS_ctx.curriculumBooks.length))
                                return;
                            __VLS_ctx.deleteUnit(unit.id);
                        }
                    };
                    __VLS_379.slots.default;
                    var __VLS_379;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "chip-row" },
                    });
                    for (const [lesson] of __VLS_getVForSourceType((unit.lessons))) {
                        const __VLS_384 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
                            key: (lesson.id),
                            round: true,
                        }));
                        const __VLS_386 = __VLS_385({
                            key: (lesson.id),
                            round: true,
                        }, ...__VLS_functionalComponentArgsRest(__VLS_385));
                        __VLS_387.slots.default;
                        (lesson.title);
                        const __VLS_388 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
                            ...{ 'onClick': {} },
                            link: true,
                            type: "primary",
                        }));
                        const __VLS_390 = __VLS_389({
                            ...{ 'onClick': {} },
                            link: true,
                            type: "primary",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_389));
                        let __VLS_392;
                        let __VLS_393;
                        let __VLS_394;
                        const __VLS_395 = {
                            onClick: (...[$event]) => {
                                if (!(__VLS_ctx.bootstrap))
                                    return;
                                if (!!(!__VLS_ctx.curriculumBooks.length))
                                    return;
                                __VLS_ctx.openLessonDialog(unit.id, lesson);
                            }
                        };
                        __VLS_391.slots.default;
                        var __VLS_391;
                        const __VLS_396 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
                            ...{ 'onClick': {} },
                            link: true,
                            type: "danger",
                        }));
                        const __VLS_398 = __VLS_397({
                            ...{ 'onClick': {} },
                            link: true,
                            type: "danger",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_397));
                        let __VLS_400;
                        let __VLS_401;
                        let __VLS_402;
                        const __VLS_403 = {
                            onClick: (...[$event]) => {
                                if (!(__VLS_ctx.bootstrap))
                                    return;
                                if (!!(!__VLS_ctx.curriculumBooks.length))
                                    return;
                                __VLS_ctx.deleteLesson(lesson.id);
                            }
                        };
                        __VLS_399.slots.default;
                        var __VLS_399;
                        var __VLS_387;
                    }
                }
            }
        }
        var __VLS_315;
        const __VLS_404 = {}.ElTabPane;
        /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
        // @ts-ignore
        const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
            label: "AI Provider",
            name: "ai-providers",
        }));
        const __VLS_406 = __VLS_405({
            label: "AI Provider",
            name: "ai-providers",
        }, ...__VLS_functionalComponentArgsRest(__VLS_405));
        __VLS_407.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        const __VLS_408 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.isSavingAssistantPrompts),
            type: "primary",
        }));
        const __VLS_410 = __VLS_409({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.isSavingAssistantPrompts),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_409));
        let __VLS_412;
        let __VLS_413;
        let __VLS_414;
        const __VLS_415 = {
            onClick: (__VLS_ctx.saveAssistantPrompts)
        };
        __VLS_411.slots.default;
        var __VLS_411;
        const __VLS_416 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
            labelPosition: "top",
        }));
        const __VLS_418 = __VLS_417({
            labelPosition: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_417));
        __VLS_419.slots.default;
        const __VLS_420 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
            label: "通用 AI 学伴提示词",
        }));
        const __VLS_422 = __VLS_421({
            label: "通用 AI 学伴提示词",
        }, ...__VLS_functionalComponentArgsRest(__VLS_421));
        __VLS_423.slots.default;
        const __VLS_424 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
            modelValue: (__VLS_ctx.assistantPromptForm.general_prompt),
            rows: (7),
            type: "textarea",
        }));
        const __VLS_426 = __VLS_425({
            modelValue: (__VLS_ctx.assistantPromptForm.general_prompt),
            rows: (7),
            type: "textarea",
        }, ...__VLS_functionalComponentArgsRest(__VLS_425));
        var __VLS_423;
        const __VLS_428 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_429 = __VLS_asFunctionalComponent(__VLS_428, new __VLS_428({
            label: "当前课程学案 AI 学伴提示词",
        }));
        const __VLS_430 = __VLS_429({
            label: "当前课程学案 AI 学伴提示词",
        }, ...__VLS_functionalComponentArgsRest(__VLS_429));
        __VLS_431.slots.default;
        const __VLS_432 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
            modelValue: (__VLS_ctx.assistantPromptForm.lesson_prompt),
            rows: (9),
            type: "textarea",
        }));
        const __VLS_434 = __VLS_433({
            modelValue: (__VLS_ctx.assistantPromptForm.lesson_prompt),
            rows: (9),
            type: "textarea",
        }, ...__VLS_functionalComponentArgsRest(__VLS_433));
        var __VLS_431;
        var __VLS_419;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_436 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_437 = __VLS_asFunctionalComponent(__VLS_436, new __VLS_436({
            ...{ 'onClick': {} },
            plain: true,
        }));
        const __VLS_438 = __VLS_437({
            ...{ 'onClick': {} },
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_437));
        let __VLS_440;
        let __VLS_441;
        let __VLS_442;
        const __VLS_443 = {
            onClick: (__VLS_ctx.loadAIProviders)
        };
        __VLS_439.slots.default;
        var __VLS_439;
        const __VLS_444 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_446 = __VLS_445({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_445));
        let __VLS_448;
        let __VLS_449;
        let __VLS_450;
        const __VLS_451 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.bootstrap))
                    return;
                __VLS_ctx.openProviderDialog();
            }
        };
        __VLS_447.slots.default;
        var __VLS_447;
        if (!__VLS_ctx.aiProviders.length) {
            const __VLS_452 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
                description: "暂无 AI Provider 配置",
            }));
            const __VLS_454 = __VLS_453({
                description: "暂无 AI Provider 配置",
            }, ...__VLS_functionalComponentArgsRest(__VLS_453));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "list-stack" },
            });
            for (const [provider] of __VLS_getVForSourceType((__VLS_ctx.aiProviders))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (provider.id),
                    ...{ class: "list-card provider-card" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "panel-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                (provider.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                (provider.base_url);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row" },
                });
                const __VLS_456 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_457 = __VLS_asFunctionalComponent(__VLS_456, new __VLS_456({
                    type: (provider.is_default ? 'warning' : 'info'),
                    round: true,
                }));
                const __VLS_458 = __VLS_457({
                    type: (provider.is_default ? 'warning' : 'info'),
                    round: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_457));
                __VLS_459.slots.default;
                (provider.is_default ? '默认' : '候选');
                var __VLS_459;
                const __VLS_460 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_461 = __VLS_asFunctionalComponent(__VLS_460, new __VLS_460({
                    type: (provider.is_enabled ? 'success' : 'info'),
                    round: true,
                }));
                const __VLS_462 = __VLS_461({
                    type: (provider.is_enabled ? 'success' : 'info'),
                    round: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_461));
                __VLS_463.slots.default;
                (provider.is_enabled ? '已启用' : '已停用');
                var __VLS_463;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row provider-meta" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (provider.provider_type);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (provider.model_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (provider.has_api_key ? provider.masked_api_key : '未配置');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row provider-actions" },
                });
                const __VLS_464 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_465 = __VLS_asFunctionalComponent(__VLS_464, new __VLS_464({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }));
                const __VLS_466 = __VLS_465({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_465));
                let __VLS_468;
                let __VLS_469;
                let __VLS_470;
                const __VLS_471 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!!(!__VLS_ctx.aiProviders.length))
                            return;
                        __VLS_ctx.openProviderDialog(provider);
                    }
                };
                __VLS_467.slots.default;
                var __VLS_467;
                const __VLS_472 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }));
                const __VLS_474 = __VLS_473({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_473));
                let __VLS_476;
                let __VLS_477;
                let __VLS_478;
                const __VLS_479 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bootstrap))
                            return;
                        if (!!(!__VLS_ctx.aiProviders.length))
                            return;
                        __VLS_ctx.deleteProvider(provider.id);
                    }
                };
                __VLS_475.slots.default;
                var __VLS_475;
            }
        }
        var __VLS_407;
        var __VLS_23;
    }
}
var __VLS_15;
const __VLS_480 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
    modelValue: (__VLS_ctx.classDialogVisible),
    title: (__VLS_ctx.editingClassId ? '编辑班级' : '新增班级'),
    width: "520px",
}));
const __VLS_482 = __VLS_481({
    modelValue: (__VLS_ctx.classDialogVisible),
    title: (__VLS_ctx.editingClassId ? '编辑班级' : '新增班级'),
    width: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_481));
__VLS_483.slots.default;
const __VLS_484 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
    labelPosition: "top",
}));
const __VLS_486 = __VLS_485({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_485));
__VLS_487.slots.default;
const __VLS_488 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
    label: "年级",
}));
const __VLS_490 = __VLS_489({
    label: "年级",
}, ...__VLS_functionalComponentArgsRest(__VLS_489));
__VLS_491.slots.default;
const __VLS_492 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
    modelValue: (__VLS_ctx.classForm.grade_no),
    min: (1),
    max: (12),
}));
const __VLS_494 = __VLS_493({
    modelValue: (__VLS_ctx.classForm.grade_no),
    min: (1),
    max: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_493));
var __VLS_491;
const __VLS_496 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
    label: "班号",
}));
const __VLS_498 = __VLS_497({
    label: "班号",
}, ...__VLS_functionalComponentArgsRest(__VLS_497));
__VLS_499.slots.default;
const __VLS_500 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({
    modelValue: (__VLS_ctx.classForm.class_no),
    min: (1),
    max: (99),
}));
const __VLS_502 = __VLS_501({
    modelValue: (__VLS_ctx.classForm.class_no),
    min: (1),
    max: (99),
}, ...__VLS_functionalComponentArgsRest(__VLS_501));
var __VLS_499;
const __VLS_504 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({
    label: "班主任",
}));
const __VLS_506 = __VLS_505({
    label: "班主任",
}, ...__VLS_functionalComponentArgsRest(__VLS_505));
__VLS_507.slots.default;
const __VLS_508 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_509 = __VLS_asFunctionalComponent(__VLS_508, new __VLS_508({
    modelValue: (__VLS_ctx.classForm.head_teacher_name),
}));
const __VLS_510 = __VLS_509({
    modelValue: (__VLS_ctx.classForm.head_teacher_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_509));
var __VLS_507;
const __VLS_512 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
    label: "默认机房",
}));
const __VLS_514 = __VLS_513({
    label: "默认机房",
}, ...__VLS_functionalComponentArgsRest(__VLS_513));
__VLS_515.slots.default;
const __VLS_516 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
    modelValue: (__VLS_ctx.classForm.default_room_id),
    ...{ class: "full-width" },
    clearable: true,
}));
const __VLS_518 = __VLS_517({
    modelValue: (__VLS_ctx.classForm.default_room_id),
    ...{ class: "full-width" },
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_517));
__VLS_519.slots.default;
for (const [room] of __VLS_getVForSourceType((__VLS_ctx.bootstrap?.rooms || []))) {
    const __VLS_520 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
        key: (room.id),
        label: (room.name),
        value: (room.id),
    }));
    const __VLS_522 = __VLS_521({
        key: (room.id),
        label: (room.name),
        value: (room.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_521));
}
var __VLS_519;
var __VLS_515;
var __VLS_487;
{
    const { footer: __VLS_thisSlot } = __VLS_483.slots;
    const __VLS_524 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_525 = __VLS_asFunctionalComponent(__VLS_524, new __VLS_524({
        ...{ 'onClick': {} },
    }));
    const __VLS_526 = __VLS_525({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_525));
    let __VLS_528;
    let __VLS_529;
    let __VLS_530;
    const __VLS_531 = {
        onClick: (...[$event]) => {
            __VLS_ctx.classDialogVisible = false;
        }
    };
    __VLS_527.slots.default;
    var __VLS_527;
    const __VLS_532 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_533 = __VLS_asFunctionalComponent(__VLS_532, new __VLS_532({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_534 = __VLS_533({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_533));
    let __VLS_536;
    let __VLS_537;
    let __VLS_538;
    const __VLS_539 = {
        onClick: (__VLS_ctx.saveClass)
    };
    __VLS_535.slots.default;
    var __VLS_535;
}
var __VLS_483;
const __VLS_540 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_541 = __VLS_asFunctionalComponent(__VLS_540, new __VLS_540({
    modelValue: (__VLS_ctx.teacherDialogVisible),
    title: (__VLS_ctx.editingTeacherId ? '编辑教师' : '新增教师'),
    width: "560px",
}));
const __VLS_542 = __VLS_541({
    modelValue: (__VLS_ctx.teacherDialogVisible),
    title: (__VLS_ctx.editingTeacherId ? '编辑教师' : '新增教师'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_541));
__VLS_543.slots.default;
const __VLS_544 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_545 = __VLS_asFunctionalComponent(__VLS_544, new __VLS_544({
    labelPosition: "top",
}));
const __VLS_546 = __VLS_545({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_545));
__VLS_547.slots.default;
const __VLS_548 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_549 = __VLS_asFunctionalComponent(__VLS_548, new __VLS_548({
    label: "账号",
}));
const __VLS_550 = __VLS_549({
    label: "账号",
}, ...__VLS_functionalComponentArgsRest(__VLS_549));
__VLS_551.slots.default;
const __VLS_552 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_553 = __VLS_asFunctionalComponent(__VLS_552, new __VLS_552({
    modelValue: (__VLS_ctx.teacherForm.username),
}));
const __VLS_554 = __VLS_553({
    modelValue: (__VLS_ctx.teacherForm.username),
}, ...__VLS_functionalComponentArgsRest(__VLS_553));
var __VLS_551;
const __VLS_556 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_557 = __VLS_asFunctionalComponent(__VLS_556, new __VLS_556({
    label: "姓名",
}));
const __VLS_558 = __VLS_557({
    label: "姓名",
}, ...__VLS_functionalComponentArgsRest(__VLS_557));
__VLS_559.slots.default;
const __VLS_560 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_561 = __VLS_asFunctionalComponent(__VLS_560, new __VLS_560({
    modelValue: (__VLS_ctx.teacherForm.display_name),
}));
const __VLS_562 = __VLS_561({
    modelValue: (__VLS_ctx.teacherForm.display_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_561));
var __VLS_559;
const __VLS_564 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_565 = __VLS_asFunctionalComponent(__VLS_564, new __VLS_564({
    label: "职务",
}));
const __VLS_566 = __VLS_565({
    label: "职务",
}, ...__VLS_functionalComponentArgsRest(__VLS_565));
__VLS_567.slots.default;
const __VLS_568 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_569 = __VLS_asFunctionalComponent(__VLS_568, new __VLS_568({
    modelValue: (__VLS_ctx.teacherForm.title),
}));
const __VLS_570 = __VLS_569({
    modelValue: (__VLS_ctx.teacherForm.title),
}, ...__VLS_functionalComponentArgsRest(__VLS_569));
var __VLS_567;
const __VLS_572 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_573 = __VLS_asFunctionalComponent(__VLS_572, new __VLS_572({
    label: (__VLS_ctx.editingTeacherId ? '重置密码（留空不修改）' : '初始密码'),
}));
const __VLS_574 = __VLS_573({
    label: (__VLS_ctx.editingTeacherId ? '重置密码（留空不修改）' : '初始密码'),
}, ...__VLS_functionalComponentArgsRest(__VLS_573));
__VLS_575.slots.default;
const __VLS_576 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_577 = __VLS_asFunctionalComponent(__VLS_576, new __VLS_576({
    modelValue: (__VLS_ctx.teacherForm.password),
    showPassword: true,
}));
const __VLS_578 = __VLS_577({
    modelValue: (__VLS_ctx.teacherForm.password),
    showPassword: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_577));
var __VLS_575;
const __VLS_580 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_581 = __VLS_asFunctionalComponent(__VLS_580, new __VLS_580({
    label: "管理员权限",
}));
const __VLS_582 = __VLS_581({
    label: "管理员权限",
}, ...__VLS_functionalComponentArgsRest(__VLS_581));
__VLS_583.slots.default;
const __VLS_584 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_585 = __VLS_asFunctionalComponent(__VLS_584, new __VLS_584({
    modelValue: (__VLS_ctx.teacherForm.is_admin),
}));
const __VLS_586 = __VLS_585({
    modelValue: (__VLS_ctx.teacherForm.is_admin),
}, ...__VLS_functionalComponentArgsRest(__VLS_585));
var __VLS_583;
const __VLS_588 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_589 = __VLS_asFunctionalComponent(__VLS_588, new __VLS_588({
    label: "关联班级",
}));
const __VLS_590 = __VLS_589({
    label: "关联班级",
}, ...__VLS_functionalComponentArgsRest(__VLS_589));
__VLS_591.slots.default;
const __VLS_592 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_593 = __VLS_asFunctionalComponent(__VLS_592, new __VLS_592({
    modelValue: (__VLS_ctx.teacherForm.class_ids),
    ...{ class: "full-width" },
    filterable: true,
    multiple: true,
}));
const __VLS_594 = __VLS_593({
    modelValue: (__VLS_ctx.teacherForm.class_ids),
    ...{ class: "full-width" },
    filterable: true,
    multiple: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_593));
__VLS_595.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.bootstrap?.classes || []))) {
    const __VLS_596 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_597 = __VLS_asFunctionalComponent(__VLS_596, new __VLS_596({
        key: (item.id),
        label: (item.class_name),
        value: (item.id),
    }));
    const __VLS_598 = __VLS_597({
        key: (item.id),
        label: (item.class_name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_597));
}
var __VLS_595;
var __VLS_591;
var __VLS_547;
{
    const { footer: __VLS_thisSlot } = __VLS_543.slots;
    const __VLS_600 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_601 = __VLS_asFunctionalComponent(__VLS_600, new __VLS_600({
        ...{ 'onClick': {} },
    }));
    const __VLS_602 = __VLS_601({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_601));
    let __VLS_604;
    let __VLS_605;
    let __VLS_606;
    const __VLS_607 = {
        onClick: (...[$event]) => {
            __VLS_ctx.teacherDialogVisible = false;
        }
    };
    __VLS_603.slots.default;
    var __VLS_603;
    const __VLS_608 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_609 = __VLS_asFunctionalComponent(__VLS_608, new __VLS_608({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_610 = __VLS_609({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_609));
    let __VLS_612;
    let __VLS_613;
    let __VLS_614;
    const __VLS_615 = {
        onClick: (__VLS_ctx.saveTeacher)
    };
    __VLS_611.slots.default;
    var __VLS_611;
}
var __VLS_543;
const __VLS_616 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_617 = __VLS_asFunctionalComponent(__VLS_616, new __VLS_616({
    modelValue: (__VLS_ctx.roomDialogVisible),
    title: (__VLS_ctx.editingRoomId ? '编辑机房' : '新增机房'),
    width: "560px",
}));
const __VLS_618 = __VLS_617({
    modelValue: (__VLS_ctx.roomDialogVisible),
    title: (__VLS_ctx.editingRoomId ? '编辑机房' : '新增机房'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_617));
__VLS_619.slots.default;
const __VLS_620 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_621 = __VLS_asFunctionalComponent(__VLS_620, new __VLS_620({
    labelPosition: "top",
}));
const __VLS_622 = __VLS_621({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_621));
__VLS_623.slots.default;
const __VLS_624 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_625 = __VLS_asFunctionalComponent(__VLS_624, new __VLS_624({
    label: "机房名称",
}));
const __VLS_626 = __VLS_625({
    label: "机房名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_625));
__VLS_627.slots.default;
const __VLS_628 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_629 = __VLS_asFunctionalComponent(__VLS_628, new __VLS_628({
    modelValue: (__VLS_ctx.roomForm.name),
}));
const __VLS_630 = __VLS_629({
    modelValue: (__VLS_ctx.roomForm.name),
}, ...__VLS_functionalComponentArgsRest(__VLS_629));
var __VLS_627;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "admin-grid two-col" },
});
const __VLS_632 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_633 = __VLS_asFunctionalComponent(__VLS_632, new __VLS_632({
    label: "行数",
}));
const __VLS_634 = __VLS_633({
    label: "行数",
}, ...__VLS_functionalComponentArgsRest(__VLS_633));
__VLS_635.slots.default;
const __VLS_636 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_637 = __VLS_asFunctionalComponent(__VLS_636, new __VLS_636({
    modelValue: (__VLS_ctx.roomForm.row_count),
    min: (1),
    max: (__VLS_ctx.ROOM_GRID_MAX),
}));
const __VLS_638 = __VLS_637({
    modelValue: (__VLS_ctx.roomForm.row_count),
    min: (1),
    max: (__VLS_ctx.ROOM_GRID_MAX),
}, ...__VLS_functionalComponentArgsRest(__VLS_637));
var __VLS_635;
const __VLS_640 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_641 = __VLS_asFunctionalComponent(__VLS_640, new __VLS_640({
    label: "列数",
}));
const __VLS_642 = __VLS_641({
    label: "列数",
}, ...__VLS_functionalComponentArgsRest(__VLS_641));
__VLS_643.slots.default;
const __VLS_644 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_645 = __VLS_asFunctionalComponent(__VLS_644, new __VLS_644({
    modelValue: (__VLS_ctx.roomForm.col_count),
    min: (1),
    max: (__VLS_ctx.ROOM_GRID_MAX),
}));
const __VLS_646 = __VLS_645({
    modelValue: (__VLS_ctx.roomForm.col_count),
    min: (1),
    max: (__VLS_ctx.ROOM_GRID_MAX),
}, ...__VLS_functionalComponentArgsRest(__VLS_645));
var __VLS_643;
const __VLS_648 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_649 = __VLS_asFunctionalComponent(__VLS_648, new __VLS_648({
    label: "IP 前缀",
}));
const __VLS_650 = __VLS_649({
    label: "IP 前缀",
}, ...__VLS_functionalComponentArgsRest(__VLS_649));
__VLS_651.slots.default;
const __VLS_652 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_653 = __VLS_asFunctionalComponent(__VLS_652, new __VLS_652({
    modelValue: (__VLS_ctx.roomForm.ip_prefix),
    placeholder: "例如 10.7.1.",
}));
const __VLS_654 = __VLS_653({
    modelValue: (__VLS_ctx.roomForm.ip_prefix),
    placeholder: "例如 10.7.1.",
}, ...__VLS_functionalComponentArgsRest(__VLS_653));
var __VLS_651;
const __VLS_656 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_657 = __VLS_asFunctionalComponent(__VLS_656, new __VLS_656({
    label: "IP 起始序号",
}));
const __VLS_658 = __VLS_657({
    label: "IP 起始序号",
}, ...__VLS_functionalComponentArgsRest(__VLS_657));
__VLS_659.slots.default;
const __VLS_660 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_661 = __VLS_asFunctionalComponent(__VLS_660, new __VLS_660({
    modelValue: (__VLS_ctx.roomForm.ip_start),
    min: (1),
    max: (250),
}));
const __VLS_662 = __VLS_661({
    modelValue: (__VLS_ctx.roomForm.ip_start),
    min: (1),
    max: (250),
}, ...__VLS_functionalComponentArgsRest(__VLS_661));
var __VLS_659;
const __VLS_664 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_665 = __VLS_asFunctionalComponent(__VLS_664, new __VLS_664({
    label: "机房说明",
}));
const __VLS_666 = __VLS_665({
    label: "机房说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_665));
__VLS_667.slots.default;
const __VLS_668 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_669 = __VLS_asFunctionalComponent(__VLS_668, new __VLS_668({
    modelValue: (__VLS_ctx.roomForm.description),
    type: "textarea",
}));
const __VLS_670 = __VLS_669({
    modelValue: (__VLS_ctx.roomForm.description),
    type: "textarea",
}, ...__VLS_functionalComponentArgsRest(__VLS_669));
var __VLS_667;
var __VLS_623;
{
    const { footer: __VLS_thisSlot } = __VLS_619.slots;
    const __VLS_672 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_673 = __VLS_asFunctionalComponent(__VLS_672, new __VLS_672({
        ...{ 'onClick': {} },
    }));
    const __VLS_674 = __VLS_673({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_673));
    let __VLS_676;
    let __VLS_677;
    let __VLS_678;
    const __VLS_679 = {
        onClick: (...[$event]) => {
            __VLS_ctx.roomDialogVisible = false;
        }
    };
    __VLS_675.slots.default;
    var __VLS_675;
    const __VLS_680 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_681 = __VLS_asFunctionalComponent(__VLS_680, new __VLS_680({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_682 = __VLS_681({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_681));
    let __VLS_684;
    let __VLS_685;
    let __VLS_686;
    const __VLS_687 = {
        onClick: (__VLS_ctx.saveRoom)
    };
    __VLS_683.slots.default;
    var __VLS_683;
}
var __VLS_619;
const __VLS_688 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_689 = __VLS_asFunctionalComponent(__VLS_688, new __VLS_688({
    modelValue: (__VLS_ctx.bookDialogVisible),
    title: (__VLS_ctx.editingBookId ? '编辑教材' : '新增教材'),
    width: "560px",
}));
const __VLS_690 = __VLS_689({
    modelValue: (__VLS_ctx.bookDialogVisible),
    title: (__VLS_ctx.editingBookId ? '编辑教材' : '新增教材'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_689));
__VLS_691.slots.default;
const __VLS_692 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_693 = __VLS_asFunctionalComponent(__VLS_692, new __VLS_692({
    labelPosition: "top",
}));
const __VLS_694 = __VLS_693({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_693));
__VLS_695.slots.default;
const __VLS_696 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_697 = __VLS_asFunctionalComponent(__VLS_696, new __VLS_696({
    label: "教材名称",
}));
const __VLS_698 = __VLS_697({
    label: "教材名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_697));
__VLS_699.slots.default;
const __VLS_700 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_701 = __VLS_asFunctionalComponent(__VLS_700, new __VLS_700({
    modelValue: (__VLS_ctx.bookForm.name),
}));
const __VLS_702 = __VLS_701({
    modelValue: (__VLS_ctx.bookForm.name),
}, ...__VLS_functionalComponentArgsRest(__VLS_701));
var __VLS_699;
const __VLS_704 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_705 = __VLS_asFunctionalComponent(__VLS_704, new __VLS_704({
    label: "学科",
}));
const __VLS_706 = __VLS_705({
    label: "学科",
}, ...__VLS_functionalComponentArgsRest(__VLS_705));
__VLS_707.slots.default;
const __VLS_708 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_709 = __VLS_asFunctionalComponent(__VLS_708, new __VLS_708({
    modelValue: (__VLS_ctx.bookForm.subject),
}));
const __VLS_710 = __VLS_709({
    modelValue: (__VLS_ctx.bookForm.subject),
}, ...__VLS_functionalComponentArgsRest(__VLS_709));
var __VLS_707;
const __VLS_712 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_713 = __VLS_asFunctionalComponent(__VLS_712, new __VLS_712({
    label: "版本",
}));
const __VLS_714 = __VLS_713({
    label: "版本",
}, ...__VLS_functionalComponentArgsRest(__VLS_713));
__VLS_715.slots.default;
const __VLS_716 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_717 = __VLS_asFunctionalComponent(__VLS_716, new __VLS_716({
    modelValue: (__VLS_ctx.bookForm.edition),
}));
const __VLS_718 = __VLS_717({
    modelValue: (__VLS_ctx.bookForm.edition),
}, ...__VLS_functionalComponentArgsRest(__VLS_717));
var __VLS_715;
const __VLS_720 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_721 = __VLS_asFunctionalComponent(__VLS_720, new __VLS_720({
    label: "适用范围",
}));
const __VLS_722 = __VLS_721({
    label: "适用范围",
}, ...__VLS_functionalComponentArgsRest(__VLS_721));
__VLS_723.slots.default;
const __VLS_724 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_725 = __VLS_asFunctionalComponent(__VLS_724, new __VLS_724({
    modelValue: (__VLS_ctx.bookForm.grade_scope),
}));
const __VLS_726 = __VLS_725({
    modelValue: (__VLS_ctx.bookForm.grade_scope),
}, ...__VLS_functionalComponentArgsRest(__VLS_725));
var __VLS_723;
var __VLS_695;
{
    const { footer: __VLS_thisSlot } = __VLS_691.slots;
    const __VLS_728 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_729 = __VLS_asFunctionalComponent(__VLS_728, new __VLS_728({
        ...{ 'onClick': {} },
    }));
    const __VLS_730 = __VLS_729({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_729));
    let __VLS_732;
    let __VLS_733;
    let __VLS_734;
    const __VLS_735 = {
        onClick: (...[$event]) => {
            __VLS_ctx.bookDialogVisible = false;
        }
    };
    __VLS_731.slots.default;
    var __VLS_731;
    const __VLS_736 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_737 = __VLS_asFunctionalComponent(__VLS_736, new __VLS_736({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_738 = __VLS_737({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_737));
    let __VLS_740;
    let __VLS_741;
    let __VLS_742;
    const __VLS_743 = {
        onClick: (__VLS_ctx.saveBook)
    };
    __VLS_739.slots.default;
    var __VLS_739;
}
var __VLS_691;
const __VLS_744 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_745 = __VLS_asFunctionalComponent(__VLS_744, new __VLS_744({
    modelValue: (__VLS_ctx.unitDialogVisible),
    title: (__VLS_ctx.editingUnitId ? '编辑单元' : '新增单元'),
    width: "560px",
}));
const __VLS_746 = __VLS_745({
    modelValue: (__VLS_ctx.unitDialogVisible),
    title: (__VLS_ctx.editingUnitId ? '编辑单元' : '新增单元'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_745));
__VLS_747.slots.default;
const __VLS_748 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_749 = __VLS_asFunctionalComponent(__VLS_748, new __VLS_748({
    labelPosition: "top",
}));
const __VLS_750 = __VLS_749({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_749));
__VLS_751.slots.default;
const __VLS_752 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_753 = __VLS_asFunctionalComponent(__VLS_752, new __VLS_752({
    label: "学期序号",
}));
const __VLS_754 = __VLS_753({
    label: "学期序号",
}, ...__VLS_functionalComponentArgsRest(__VLS_753));
__VLS_755.slots.default;
const __VLS_756 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_757 = __VLS_asFunctionalComponent(__VLS_756, new __VLS_756({
    modelValue: (__VLS_ctx.unitForm.term_no),
    min: (1),
    max: (4),
}));
const __VLS_758 = __VLS_757({
    modelValue: (__VLS_ctx.unitForm.term_no),
    min: (1),
    max: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_757));
var __VLS_755;
const __VLS_760 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_761 = __VLS_asFunctionalComponent(__VLS_760, new __VLS_760({
    label: "单元序号",
}));
const __VLS_762 = __VLS_761({
    label: "单元序号",
}, ...__VLS_functionalComponentArgsRest(__VLS_761));
__VLS_763.slots.default;
const __VLS_764 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_765 = __VLS_asFunctionalComponent(__VLS_764, new __VLS_764({
    modelValue: (__VLS_ctx.unitForm.unit_no),
    min: (1),
    max: (99),
}));
const __VLS_766 = __VLS_765({
    modelValue: (__VLS_ctx.unitForm.unit_no),
    min: (1),
    max: (99),
}, ...__VLS_functionalComponentArgsRest(__VLS_765));
var __VLS_763;
const __VLS_768 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_769 = __VLS_asFunctionalComponent(__VLS_768, new __VLS_768({
    label: "单元标题",
}));
const __VLS_770 = __VLS_769({
    label: "单元标题",
}, ...__VLS_functionalComponentArgsRest(__VLS_769));
__VLS_771.slots.default;
const __VLS_772 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_773 = __VLS_asFunctionalComponent(__VLS_772, new __VLS_772({
    modelValue: (__VLS_ctx.unitForm.title),
}));
const __VLS_774 = __VLS_773({
    modelValue: (__VLS_ctx.unitForm.title),
}, ...__VLS_functionalComponentArgsRest(__VLS_773));
var __VLS_771;
var __VLS_751;
{
    const { footer: __VLS_thisSlot } = __VLS_747.slots;
    const __VLS_776 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_777 = __VLS_asFunctionalComponent(__VLS_776, new __VLS_776({
        ...{ 'onClick': {} },
    }));
    const __VLS_778 = __VLS_777({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_777));
    let __VLS_780;
    let __VLS_781;
    let __VLS_782;
    const __VLS_783 = {
        onClick: (...[$event]) => {
            __VLS_ctx.unitDialogVisible = false;
        }
    };
    __VLS_779.slots.default;
    var __VLS_779;
    const __VLS_784 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_785 = __VLS_asFunctionalComponent(__VLS_784, new __VLS_784({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_786 = __VLS_785({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_785));
    let __VLS_788;
    let __VLS_789;
    let __VLS_790;
    const __VLS_791 = {
        onClick: (__VLS_ctx.saveUnit)
    };
    __VLS_787.slots.default;
    var __VLS_787;
}
var __VLS_747;
const __VLS_792 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_793 = __VLS_asFunctionalComponent(__VLS_792, new __VLS_792({
    modelValue: (__VLS_ctx.lessonDialogVisible),
    title: (__VLS_ctx.editingLessonId ? '编辑课次' : '新增课次'),
    width: "560px",
}));
const __VLS_794 = __VLS_793({
    modelValue: (__VLS_ctx.lessonDialogVisible),
    title: (__VLS_ctx.editingLessonId ? '编辑课次' : '新增课次'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_793));
__VLS_795.slots.default;
const __VLS_796 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_797 = __VLS_asFunctionalComponent(__VLS_796, new __VLS_796({
    labelPosition: "top",
}));
const __VLS_798 = __VLS_797({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_797));
__VLS_799.slots.default;
const __VLS_800 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_801 = __VLS_asFunctionalComponent(__VLS_800, new __VLS_800({
    label: "课次序号",
}));
const __VLS_802 = __VLS_801({
    label: "课次序号",
}, ...__VLS_functionalComponentArgsRest(__VLS_801));
__VLS_803.slots.default;
const __VLS_804 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_805 = __VLS_asFunctionalComponent(__VLS_804, new __VLS_804({
    modelValue: (__VLS_ctx.lessonForm.lesson_no),
    min: (1),
    max: (99),
}));
const __VLS_806 = __VLS_805({
    modelValue: (__VLS_ctx.lessonForm.lesson_no),
    min: (1),
    max: (99),
}, ...__VLS_functionalComponentArgsRest(__VLS_805));
var __VLS_803;
const __VLS_808 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_809 = __VLS_asFunctionalComponent(__VLS_808, new __VLS_808({
    label: "课次标题",
}));
const __VLS_810 = __VLS_809({
    label: "课次标题",
}, ...__VLS_functionalComponentArgsRest(__VLS_809));
__VLS_811.slots.default;
const __VLS_812 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_813 = __VLS_asFunctionalComponent(__VLS_812, new __VLS_812({
    modelValue: (__VLS_ctx.lessonForm.title),
}));
const __VLS_814 = __VLS_813({
    modelValue: (__VLS_ctx.lessonForm.title),
}, ...__VLS_functionalComponentArgsRest(__VLS_813));
var __VLS_811;
const __VLS_816 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_817 = __VLS_asFunctionalComponent(__VLS_816, new __VLS_816({
    label: "课次摘要",
}));
const __VLS_818 = __VLS_817({
    label: "课次摘要",
}, ...__VLS_functionalComponentArgsRest(__VLS_817));
__VLS_819.slots.default;
const __VLS_820 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_821 = __VLS_asFunctionalComponent(__VLS_820, new __VLS_820({
    modelValue: (__VLS_ctx.lessonForm.summary),
    type: "textarea",
}));
const __VLS_822 = __VLS_821({
    modelValue: (__VLS_ctx.lessonForm.summary),
    type: "textarea",
}, ...__VLS_functionalComponentArgsRest(__VLS_821));
var __VLS_819;
var __VLS_799;
{
    const { footer: __VLS_thisSlot } = __VLS_795.slots;
    const __VLS_824 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_825 = __VLS_asFunctionalComponent(__VLS_824, new __VLS_824({
        ...{ 'onClick': {} },
    }));
    const __VLS_826 = __VLS_825({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_825));
    let __VLS_828;
    let __VLS_829;
    let __VLS_830;
    const __VLS_831 = {
        onClick: (...[$event]) => {
            __VLS_ctx.lessonDialogVisible = false;
        }
    };
    __VLS_827.slots.default;
    var __VLS_827;
    const __VLS_832 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_833 = __VLS_asFunctionalComponent(__VLS_832, new __VLS_832({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_834 = __VLS_833({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_833));
    let __VLS_836;
    let __VLS_837;
    let __VLS_838;
    const __VLS_839 = {
        onClick: (__VLS_ctx.saveLesson)
    };
    __VLS_835.slots.default;
    var __VLS_835;
}
var __VLS_795;
const __VLS_840 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_841 = __VLS_asFunctionalComponent(__VLS_840, new __VLS_840({
    modelValue: (__VLS_ctx.providerDialogVisible),
    title: (__VLS_ctx.editingProviderId ? '编辑 AI Provider' : '新增 AI Provider'),
    width: "560px",
}));
const __VLS_842 = __VLS_841({
    modelValue: (__VLS_ctx.providerDialogVisible),
    title: (__VLS_ctx.editingProviderId ? '编辑 AI Provider' : '新增 AI Provider'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_841));
__VLS_843.slots.default;
const __VLS_844 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_845 = __VLS_asFunctionalComponent(__VLS_844, new __VLS_844({
    labelPosition: "top",
}));
const __VLS_846 = __VLS_845({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_845));
__VLS_847.slots.default;
const __VLS_848 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_849 = __VLS_asFunctionalComponent(__VLS_848, new __VLS_848({
    label: "Provider 名称",
}));
const __VLS_850 = __VLS_849({
    label: "Provider 名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_849));
__VLS_851.slots.default;
const __VLS_852 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_853 = __VLS_asFunctionalComponent(__VLS_852, new __VLS_852({
    modelValue: (__VLS_ctx.providerForm.name),
}));
const __VLS_854 = __VLS_853({
    modelValue: (__VLS_ctx.providerForm.name),
}, ...__VLS_functionalComponentArgsRest(__VLS_853));
var __VLS_851;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "admin-grid two-col" },
});
const __VLS_856 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_857 = __VLS_asFunctionalComponent(__VLS_856, new __VLS_856({
    label: "Provider 类型",
}));
const __VLS_858 = __VLS_857({
    label: "Provider 类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_857));
__VLS_859.slots.default;
const __VLS_860 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_861 = __VLS_asFunctionalComponent(__VLS_860, new __VLS_860({
    modelValue: (__VLS_ctx.providerForm.provider_type),
    ...{ class: "full-width" },
}));
const __VLS_862 = __VLS_861({
    modelValue: (__VLS_ctx.providerForm.provider_type),
    ...{ class: "full-width" },
}, ...__VLS_functionalComponentArgsRest(__VLS_861));
__VLS_863.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.providerTypeOptions))) {
    const __VLS_864 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_865 = __VLS_asFunctionalComponent(__VLS_864, new __VLS_864({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_866 = __VLS_865({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_865));
}
var __VLS_863;
var __VLS_859;
const __VLS_868 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_869 = __VLS_asFunctionalComponent(__VLS_868, new __VLS_868({
    label: "默认模型",
}));
const __VLS_870 = __VLS_869({
    label: "默认模型",
}, ...__VLS_functionalComponentArgsRest(__VLS_869));
__VLS_871.slots.default;
const __VLS_872 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_873 = __VLS_asFunctionalComponent(__VLS_872, new __VLS_872({
    modelValue: (__VLS_ctx.providerForm.model_name),
}));
const __VLS_874 = __VLS_873({
    modelValue: (__VLS_ctx.providerForm.model_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_873));
var __VLS_871;
const __VLS_876 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_877 = __VLS_asFunctionalComponent(__VLS_876, new __VLS_876({
    label: "Base URL",
}));
const __VLS_878 = __VLS_877({
    label: "Base URL",
}, ...__VLS_functionalComponentArgsRest(__VLS_877));
__VLS_879.slots.default;
const __VLS_880 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_881 = __VLS_asFunctionalComponent(__VLS_880, new __VLS_880({
    modelValue: (__VLS_ctx.providerForm.base_url),
    placeholder: "https://api.openai.com/v1",
}));
const __VLS_882 = __VLS_881({
    modelValue: (__VLS_ctx.providerForm.base_url),
    placeholder: "https://api.openai.com/v1",
}, ...__VLS_functionalComponentArgsRest(__VLS_881));
var __VLS_879;
const __VLS_884 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_885 = __VLS_asFunctionalComponent(__VLS_884, new __VLS_884({
    label: (__VLS_ctx.editingProviderId ? 'API Key（留空不更新）' : 'API Key'),
}));
const __VLS_886 = __VLS_885({
    label: (__VLS_ctx.editingProviderId ? 'API Key（留空不更新）' : 'API Key'),
}, ...__VLS_functionalComponentArgsRest(__VLS_885));
__VLS_887.slots.default;
const __VLS_888 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_889 = __VLS_asFunctionalComponent(__VLS_888, new __VLS_888({
    modelValue: (__VLS_ctx.providerForm.api_key),
    showPassword: true,
    type: "password",
}));
const __VLS_890 = __VLS_889({
    modelValue: (__VLS_ctx.providerForm.api_key),
    showPassword: true,
    type: "password",
}, ...__VLS_functionalComponentArgsRest(__VLS_889));
var __VLS_887;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "admin-grid two-col" },
});
const __VLS_892 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_893 = __VLS_asFunctionalComponent(__VLS_892, new __VLS_892({
    label: "设为默认",
}));
const __VLS_894 = __VLS_893({
    label: "设为默认",
}, ...__VLS_functionalComponentArgsRest(__VLS_893));
__VLS_895.slots.default;
const __VLS_896 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_897 = __VLS_asFunctionalComponent(__VLS_896, new __VLS_896({
    modelValue: (__VLS_ctx.providerForm.is_default),
}));
const __VLS_898 = __VLS_897({
    modelValue: (__VLS_ctx.providerForm.is_default),
}, ...__VLS_functionalComponentArgsRest(__VLS_897));
var __VLS_895;
const __VLS_900 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_901 = __VLS_asFunctionalComponent(__VLS_900, new __VLS_900({
    label: "启用",
}));
const __VLS_902 = __VLS_901({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_901));
__VLS_903.slots.default;
const __VLS_904 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_905 = __VLS_asFunctionalComponent(__VLS_904, new __VLS_904({
    modelValue: (__VLS_ctx.providerForm.is_enabled),
}));
const __VLS_906 = __VLS_905({
    modelValue: (__VLS_ctx.providerForm.is_enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_905));
var __VLS_903;
var __VLS_847;
{
    const { footer: __VLS_thisSlot } = __VLS_843.slots;
    const __VLS_908 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_909 = __VLS_asFunctionalComponent(__VLS_908, new __VLS_908({
        ...{ 'onClick': {} },
    }));
    const __VLS_910 = __VLS_909({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_909));
    let __VLS_912;
    let __VLS_913;
    let __VLS_914;
    const __VLS_915 = {
        onClick: (...[$event]) => {
            __VLS_ctx.providerDialogVisible = false;
        }
    };
    __VLS_911.slots.default;
    var __VLS_911;
    const __VLS_916 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_917 = __VLS_asFunctionalComponent(__VLS_916, new __VLS_916({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.isSavingProvider),
        type: "primary",
    }));
    const __VLS_918 = __VLS_917({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.isSavingProvider),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_917));
    let __VLS_920;
    let __VLS_921;
    let __VLS_922;
    const __VLS_923 = {
        onClick: (__VLS_ctx.saveProvider)
    };
    __VLS_919.slots.default;
    var __VLS_919;
}
var __VLS_843;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['room-radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['file-input']} */ ;
/** @type {__VLS_StyleScopedClasses['room-grid-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['room-layout-board']} */ ;
/** @type {__VLS_StyleScopedClasses['room-layout-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['room-layout-axis']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-seat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-stack-gap']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['list-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['list-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['curriculum-block']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['list-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['list-card']} */ ;
/** @type {__VLS_StyleScopedClasses['provider-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['provider-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['provider-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ROOM_GRID_MAX: ROOM_GRID_MAX,
            seatImportAccept: seatImportAccept,
            providerTypeOptions: providerTypeOptions,
            activeTab: activeTab,
            bootstrap: bootstrap,
            curriculumBooks: curriculumBooks,
            aiProviders: aiProviders,
            selectedRoomId: selectedRoomId,
            roomSeatDraft: roomSeatDraft,
            roomGridRows: roomGridRows,
            roomGridCols: roomGridCols,
            draggingSeat: draggingSeat,
            dragOverCellKey: dragOverCellKey,
            seatImportInputRef: seatImportInputRef,
            isLoading: isLoading,
            isSavingSystem: isSavingSystem,
            isImportingSeats: isImportingSeats,
            errorMessage: errorMessage,
            systemForm: systemForm,
            assistantPromptForm: assistantPromptForm,
            classDialogVisible: classDialogVisible,
            teacherDialogVisible: teacherDialogVisible,
            roomDialogVisible: roomDialogVisible,
            bookDialogVisible: bookDialogVisible,
            unitDialogVisible: unitDialogVisible,
            lessonDialogVisible: lessonDialogVisible,
            providerDialogVisible: providerDialogVisible,
            isSavingProvider: isSavingProvider,
            isSavingAssistantPrompts: isSavingAssistantPrompts,
            editingClassId: editingClassId,
            editingTeacherId: editingTeacherId,
            editingRoomId: editingRoomId,
            editingBookId: editingBookId,
            editingUnitId: editingUnitId,
            editingLessonId: editingLessonId,
            editingProviderId: editingProviderId,
            classForm: classForm,
            teacherForm: teacherForm,
            roomForm: roomForm,
            bookForm: bookForm,
            unitForm: unitForm,
            lessonForm: lessonForm,
            providerForm: providerForm,
            selectedRoom: selectedRoom,
            roomLayoutStyle: roomLayoutStyle,
            roomLayoutCells: roomLayoutCells,
            roomName: roomName,
            teacherClassNames: teacherClassNames,
            loadCurriculum: loadCurriculum,
            loadAIProviders: loadAIProviders,
            loadPage: loadPage,
            handleSeatDragStart: handleSeatDragStart,
            handleSeatDragOver: handleSeatDragOver,
            handleSeatDragEnd: handleSeatDragEnd,
            handleSeatDrop: handleSeatDrop,
            handleRoomGridRowsChange: handleRoomGridRowsChange,
            handleRoomGridColsChange: handleRoomGridColsChange,
            downloadSeatTemplate: downloadSeatTemplate,
            openSeatImportPicker: openSeatImportPicker,
            handleSeatImportChange: handleSeatImportChange,
            saveSystemSettings: saveSystemSettings,
            saveAssistantPrompts: saveAssistantPrompts,
            openClassDialog: openClassDialog,
            saveClass: saveClass,
            deleteClass: deleteClass,
            openTeacherDialog: openTeacherDialog,
            saveTeacher: saveTeacher,
            deleteTeacher: deleteTeacher,
            openRoomDialog: openRoomDialog,
            saveRoom: saveRoom,
            deleteRoom: deleteRoom,
            addSeatDraft: addSeatDraft,
            removeSeatDraft: removeSeatDraft,
            saveSeatDraft: saveSeatDraft,
            openBookDialog: openBookDialog,
            saveBook: saveBook,
            deleteBook: deleteBook,
            openUnitDialog: openUnitDialog,
            saveUnit: saveUnit,
            deleteUnit: deleteUnit,
            openLessonDialog: openLessonDialog,
            saveLesson: saveLesson,
            deleteLesson: deleteLesson,
            openProviderDialog: openProviderDialog,
            saveProvider: saveProvider,
            deleteProvider: deleteProvider,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
