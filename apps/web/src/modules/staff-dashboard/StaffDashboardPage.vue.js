/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
const router = useRouter();
const authStore = useAuthStore();
const dashboard = ref(null);
const errorMessage = ref('');
const isLoading = ref(true);
const isLaunching = ref(false);
const launchForm = ref({ class_id: null, plan_id: null });
const groupOverview = ref(null);
const groupError = ref('');
const groupLoading = ref(false);
const downloadingGroupFileId = ref(null);
const groupTaskProgress = ref(null);
const groupTaskProgressError = ref('');
const groupTaskProgressLoading = ref(false);
const groupManagerVisible = ref(false);
const groupManagerData = ref(null);
const groupManagerError = ref('');
const groupManagerLoading = ref(false);
const groupManagerSaving = ref(false);
const groupManagerCreating = ref(false);
const groupManagerRebuilding = ref(false);
const editableGroups = ref([]);
const editableStudents = ref([]);
const rebuildGroupCount = ref(1);
const draggingStudentUserId = ref(null);
const activeDropZoneKey = ref(null);
let groupRequestKey = 0;
let groupTaskProgressRequestKey = 0;
let groupManagerRequestKey = 0;
const pageTitle = computed(() => {
    const user = dashboard.value?.current_user;
    return user ? (user.title ? `${user.display_name} · ${user.title}` : user.display_name) : '教师工作台';
});
const focusClassId = computed(() => launchForm.value.class_id ?? dashboard.value?.focus_class_id ?? dashboard.value?.launchpad.default_class_id ?? null);
const focusRoster = computed(() => dashboard.value?.class_rosters.find((item) => item.class_id === focusClassId.value) ?? null);
const selectedClass = computed(() => dashboard.value?.launchpad.classes.find((item) => item.id === launchForm.value.class_id) ?? null);
const selectedPlan = computed(() => dashboard.value?.launchpad.ready_plans.find((item) => item.id === launchForm.value.plan_id) ?? null);
const focusGroupSummary = computed(() => groupOverview.value?.class ?? null);
const groupTaskProgressSummary = computed(() => groupTaskProgress.value?.summary ?? null);
const seatGridStyle = computed(() => ({ gridTemplateColumns: `repeat(${focusRoster.value?.room?.col_count || 1}, minmax(0, 1fr))` }));
const sortedEditableStudents = computed(() => [...editableStudents.value].sort((a, b) => a.student_no.localeCompare(b.student_no, 'zh-CN')));
const unassignedStudents = computed(() => sortedEditableStudents.value.filter((student) => student.target_group_id === null));
const unassignedStudentCount = computed(() => editableStudents.value.filter((student) => student.target_group_id === null).length);
const draggingStudent = computed(() => editableStudents.value.find((student) => student.user_id === draggingStudentUserId.value) ?? null);
const groupTaskCompletionRows = computed(() => {
    const payload = groupTaskProgress.value;
    if (!payload || !payload.tasks.length) {
        return [];
    }
    const rows = new Map();
    for (const task of payload.tasks) {
        for (const item of task.items) {
            const existing = rows.get(item.group_id) ?? {
                group_id: item.group_id,
                group_no: item.group_no,
                group_name: item.group_name,
                leader_name: item.leader_name,
                member_count: item.member_count,
                total_task_count: payload.tasks.length,
                submitted_count: 0,
                reviewed_count: 0,
                pending_count: 0,
                completion_percent: 0,
                review_percent: 0,
            };
            if (item.status !== 'not_started') {
                existing.submitted_count += 1;
            }
            if (item.status === 'reviewed') {
                existing.reviewed_count += 1;
            }
            rows.set(item.group_id, existing);
        }
    }
    return Array.from(rows.values())
        .map((row) => {
        const pending_count = Math.max(row.total_task_count - row.submitted_count, 0);
        return {
            ...row,
            pending_count,
            completion_percent: progressPercent(row.submitted_count, row.total_task_count),
            review_percent: progressPercent(row.reviewed_count, row.total_task_count),
        };
    })
        .sort((left, right) => left.group_no - right.group_no || left.group_id - right.group_id);
});
const launchPreviewText = computed(() => {
    if (!selectedClass.value || !selectedPlan.value)
        return '请选择班级和学案，然后一键开课。';
    return `将“${selectedPlan.value.title}”推送到 ${selectedClass.value.class_name}，学生登录后会自动签到，并在座位图和小组面板中同步呈现。`;
});
function formatClock(value) {
    return value.replace('T', ' ').slice(11, 16);
}
function formatDateTime(value) {
    if (!value)
        return '暂无记录';
    return value.replace('T', ' ').slice(0, 16);
}
function activityTagType(eventType) {
    if (eventType === 'attendance')
        return 'success';
    if (eventType === 'drive_upload')
        return 'warning';
    if (eventType === 'submission_reviewed')
        return 'danger';
    return 'info';
}
function operationTagType(eventType) {
    if (eventType.includes('deleted'))
        return 'danger';
    if (eventType.includes('reviewed'))
        return 'warning';
    if (eventType.includes('submitted'))
        return 'success';
    if (eventType.includes('draft'))
        return 'info';
    return 'primary';
}
function formatBytes(bytes = 0) {
    if (bytes >= 1024 * 1024)
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024)
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${bytes} B`;
}
function progressPercent(doneCount, totalCount) {
    if (!totalCount)
        return 0;
    return Math.round((doneCount / totalCount) * 100);
}
function roleText(role) {
    if (role === 'leader')
        return '组长';
    if (role === 'member')
        return '成员';
    if (role === 'teacher')
        return '教师';
    if (role === 'admin')
        return '管理员';
    if (role === 'student')
        return '学生';
    return '未分组';
}
function groupTaskStatusText(status) {
    if (status === 'reviewed')
        return '已评阅';
    if (status === 'submitted')
        return '已提交';
    return '未开始';
}
function groupTaskStatusType(status) {
    if (status === 'reviewed')
        return 'success';
    if (status === 'submitted')
        return 'warning';
    return 'info';
}
function getDownloadFileName(contentDisposition, fallbackName) {
    if (!contentDisposition)
        return fallbackName;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match)
        return decodeURIComponent(utf8Match[1]);
    const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return basicMatch?.[1] || fallbackName;
}
function triggerBrowserDownload(blob, fileName) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}
function applyDefaults(payload) {
    launchForm.value.class_id = launchForm.value.class_id ?? payload.focus_class_id ?? payload.launchpad.default_class_id ?? payload.launchpad.classes[0]?.id ?? null;
    launchForm.value.plan_id = launchForm.value.plan_id ?? payload.launchpad.default_plan_id ?? payload.launchpad.ready_plans[0]?.id ?? null;
}
function hydrateGroupManager(payload) {
    groupManagerData.value = payload;
    editableGroups.value = payload.groups.map((group) => ({
        id: group.id,
        group_no: group.group_no,
        name: group.name,
        description: group.description || '',
        leader_user_id: group.leader_user_id,
        file_count: group.file_count,
        used_bytes: group.used_bytes,
        has_shared_files: group.has_shared_files,
    }));
    editableStudents.value = payload.students.map((student) => ({ ...student, target_group_id: student.current_group_id }));
    rebuildGroupCount.value = payload.groups.filter((group) => group.member_count > 0).length || payload.groups.length || 1;
    editableGroups.value.forEach((group) => ensureGroupLeader(group.id));
}
function groupMembers(groupId) {
    return [...editableStudents.value]
        .filter((student) => student.target_group_id === groupId)
        .sort((a, b) => a.student_no.localeCompare(b.student_no, 'zh-CN'));
}
function ensureGroupLeader(groupId) {
    const group = editableGroups.value.find((item) => item.id === groupId);
    if (!group)
        return;
    const members = groupMembers(groupId);
    if (!members.length) {
        group.leader_user_id = null;
        return;
    }
    if (!members.some((member) => member.user_id === group.leader_user_id)) {
        group.leader_user_id = members[0].user_id;
    }
}
function updateGroupLeader(groupId, leaderUserId) {
    const group = editableGroups.value.find((item) => item.id === groupId);
    if (!group)
        return;
    group.leader_user_id = leaderUserId ?? null;
    ensureGroupLeader(groupId);
}
function updateStudentGroup(student, nextGroupId) {
    const previousGroupId = student.target_group_id;
    const normalizedNextGroupId = nextGroupId ?? null;
    student.target_group_id = normalizedNextGroupId;
    if (previousGroupId !== null)
        ensureGroupLeader(previousGroupId);
    if (normalizedNextGroupId !== null)
        ensureGroupLeader(normalizedNextGroupId);
}
function dropZoneKey(groupId) {
    return groupId === null ? 'unassigned' : `group-${groupId}`;
}
function isDropZoneActive(groupId) {
    return activeDropZoneKey.value === dropZoneKey(groupId);
}
function handleStudentDragStart(student, event) {
    draggingStudentUserId.value = student.user_id;
    activeDropZoneKey.value = dropZoneKey(student.target_group_id);
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(student.user_id));
    }
}
function handleStudentDragEnd() {
    draggingStudentUserId.value = null;
    activeDropZoneKey.value = null;
}
function handleDropZoneDragOver(event, groupId) {
    if (!draggingStudentUserId.value)
        return;
    event.preventDefault();
    activeDropZoneKey.value = dropZoneKey(groupId);
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
}
function handleDropZoneDragLeave(event, groupId) {
    const currentTarget = event.currentTarget;
    const nextTarget = event.relatedTarget;
    if (currentTarget instanceof HTMLElement && nextTarget instanceof Node && currentTarget.contains(nextTarget)) {
        return;
    }
    if (activeDropZoneKey.value === dropZoneKey(groupId)) {
        activeDropZoneKey.value = null;
    }
}
function handleDropZoneDrop(event, groupId) {
    event.preventDefault();
    const rawStudentId = event.dataTransfer?.getData('text/plain') || String(draggingStudentUserId.value ?? '');
    const studentId = Number(rawStudentId);
    const student = editableStudents.value.find((item) => item.user_id === studentId);
    if (!student) {
        handleStudentDragEnd();
        return;
    }
    updateStudentGroup(student, groupId);
    activeDropZoneKey.value = dropZoneKey(groupId);
    handleStudentDragEnd();
}
function isStudentLeader(student) {
    if (student.target_group_id === null)
        return false;
    const group = editableGroups.value.find((item) => item.id === student.target_group_id);
    return group?.leader_user_id === student.user_id;
}
function canDeleteGroup(group) {
    return groupMembers(group.id).length === 0 && !group.has_shared_files && !groupManagerSaving.value;
}
async function loadDashboard() {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师或管理员账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiGet('/staff/dashboard', authStore.token);
        dashboard.value = payload;
        applyDefaults(payload);
        await Promise.all([
            loadGroupOverview(focusClassId.value),
            loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
        ]);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载教师工作台失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function loadGroupOverview(classId) {
    const requestKey = ++groupRequestKey;
    if (!authStore.token || !classId) {
        groupOverview.value = null;
        groupError.value = '';
        groupLoading.value = false;
        return;
    }
    groupLoading.value = true;
    groupError.value = '';
    try {
        const payload = await apiGet(`/staff/classes/${classId}/groups`, authStore.token);
        if (requestKey !== groupRequestKey)
            return;
        groupOverview.value = payload;
    }
    catch (error) {
        if (requestKey !== groupRequestKey)
            return;
        groupOverview.value = null;
        groupError.value = error instanceof Error ? error.message : '加载班级小组失败';
    }
    finally {
        if (requestKey === groupRequestKey)
            groupLoading.value = false;
    }
}
async function loadGroupTaskProgress(classId, planId) {
    const requestKey = ++groupTaskProgressRequestKey;
    if (!authStore.token || !classId || !planId) {
        groupTaskProgress.value = null;
        groupTaskProgressError.value = '';
        groupTaskProgressLoading.value = false;
        return;
    }
    groupTaskProgressLoading.value = true;
    groupTaskProgressError.value = '';
    try {
        const payload = await apiGet(`/staff/classes/${classId}/plans/${planId}/group-task-progress`, authStore.token);
        if (requestKey !== groupTaskProgressRequestKey)
            return;
        groupTaskProgress.value = payload;
    }
    catch (error) {
        if (requestKey !== groupTaskProgressRequestKey)
            return;
        groupTaskProgress.value = null;
        groupTaskProgressError.value = error instanceof Error ? error.message : '加载小组任务进度失败';
    }
    finally {
        if (requestKey === groupTaskProgressRequestKey)
            groupTaskProgressLoading.value = false;
    }
}
async function loadGroupManagement(classId) {
    const requestKey = ++groupManagerRequestKey;
    if (!authStore.token || !classId) {
        groupManagerData.value = null;
        editableGroups.value = [];
        editableStudents.value = [];
        groupManagerError.value = '';
        groupManagerLoading.value = false;
        return;
    }
    groupManagerLoading.value = true;
    groupManagerError.value = '';
    try {
        const payload = await apiGet(`/staff/classes/${classId}/group-management`, authStore.token);
        if (requestKey !== groupManagerRequestKey)
            return;
        hydrateGroupManager(payload);
    }
    catch (error) {
        if (requestKey !== groupManagerRequestKey)
            return;
        groupManagerData.value = null;
        editableGroups.value = [];
        editableStudents.value = [];
        groupManagerError.value = error instanceof Error ? error.message : '加载分组维护数据失败';
    }
    finally {
        if (requestKey === groupManagerRequestKey)
            groupManagerLoading.value = false;
    }
}
async function refreshFocusGroupOverview() {
    await loadGroupOverview(focusClassId.value);
}
async function refreshGroupTaskProgress() {
    await loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id);
}
async function startClassroom() {
    if (!authStore.token || !launchForm.value.class_id || !launchForm.value.plan_id)
        return;
    isLaunching.value = true;
    errorMessage.value = '';
    try {
        const payload = await apiPost('/classroom/sessions', { class_id: launchForm.value.class_id, plan_id: launchForm.value.plan_id }, authStore.token);
        ElMessage.success(`课堂已开启，已同步到 ${payload.progress_created_count} 位学生`);
        await router.push(`/staff/classroom/${payload.session.session_id}`);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '开始上课失败';
    }
    finally {
        isLaunching.value = false;
    }
}
async function downloadGroupFile(file) {
    if (!authStore.token)
        return;
    downloadingGroupFileId.value = file.id;
    groupError.value = '';
    try {
        const response = await apiGetBlob(`/staff/drives/files/${file.id}`, authStore.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
    }
    catch (error) {
        groupError.value = error instanceof Error ? error.message : '下载共享文件失败';
    }
    finally {
        downloadingGroupFileId.value = null;
    }
}
async function openGroupManager() {
    groupManagerVisible.value = true;
    await loadGroupManagement(focusClassId.value);
}
function openTaskReview(taskId) {
    void router.push(`/staff/submissions/${taskId}`);
}
async function createGroup() {
    if (!authStore.token || !focusClassId.value)
        return;
    groupManagerCreating.value = true;
    groupManagerError.value = '';
    try {
        const payload = await apiPost(`/staff/classes/${focusClassId.value}/groups`, {}, authStore.token);
        hydrateGroupManager(payload);
        await Promise.all([
            loadGroupOverview(focusClassId.value),
            loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
        ]);
        ElMessage.success('已新增一个空小组');
    }
    catch (error) {
        groupManagerError.value = error instanceof Error ? error.message : '新增小组失败';
    }
    finally {
        groupManagerCreating.value = false;
    }
}
async function rebuildGroups() {
    if (!authStore.token || !focusClassId.value || !editableStudents.value.length)
        return;
    const targetGroupCount = Math.max(1, Math.min(rebuildGroupCount.value, editableStudents.value.length));
    try {
        await ElMessageBox.confirm(`将按 ${targetGroupCount} 个小组重新分配当前班级所有学生。已有共享文件会保留在原小组空间中，是否继续？`, '一键重组', { type: 'warning', confirmButtonText: '继续重组', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    groupManagerRebuilding.value = true;
    groupManagerError.value = '';
    try {
        const payload = await apiPost(`/staff/classes/${focusClassId.value}/groups/rebuild`, { group_count: targetGroupCount }, authStore.token);
        hydrateGroupManager(payload);
        await Promise.all([
            loadGroupOverview(focusClassId.value),
            loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
        ]);
        ElMessage.success('已完成一键重组');
    }
    catch (error) {
        groupManagerError.value = error instanceof Error ? error.message : '一键重组失败';
    }
    finally {
        groupManagerRebuilding.value = false;
    }
}
async function deleteGroup(group) {
    if (!authStore.token || !canDeleteGroup(group))
        return;
    try {
        await ElMessageBox.confirm(`确定删除“${group.name}”吗？只有空组且无共享文件的小组才能删除。`, '删除小组', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    groupManagerError.value = '';
    try {
        const payload = await apiDelete(`/staff/groups/${group.id}`, authStore.token);
        hydrateGroupManager(payload);
        await Promise.all([
            loadGroupOverview(focusClassId.value),
            loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
        ]);
        ElMessage.success('小组已删除');
    }
    catch (error) {
        groupManagerError.value = error instanceof Error ? error.message : '删除小组失败';
    }
}
async function saveGroupManagement() {
    if (!authStore.token || !focusClassId.value)
        return;
    groupManagerSaving.value = true;
    groupManagerError.value = '';
    try {
        const groupsPayload = editableGroups.value.map((group) => {
            const members = groupMembers(group.id);
            const leaderUserId = members.find((member) => member.user_id === group.leader_user_id)?.user_id ?? members[0]?.user_id ?? null;
            return {
                id: group.id,
                name: group.name.trim(),
                description: group.description.trim() || null,
                leader_user_id: leaderUserId,
                member_user_ids: members.map((member) => member.user_id),
            };
        });
        const payload = await apiPut(`/staff/classes/${focusClassId.value}/group-management`, { groups: groupsPayload }, authStore.token);
        hydrateGroupManager(payload);
        await Promise.all([
            loadGroupOverview(focusClassId.value),
            loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
        ]);
        ElMessage.success('分组调整已保存');
    }
    catch (error) {
        groupManagerError.value = error instanceof Error ? error.message : '保存分组失败';
    }
    finally {
        groupManagerSaving.value = false;
    }
}
function openLaunchpad() {
    void router.push('/staff/classroom');
}
function openRoomSettings() {
    void router.push({ path: '/staff/admin/system', query: { tab: 'rooms' } });
}
watch(focusClassId, (classId, previousClassId) => {
    if (classId !== previousClassId) {
        void loadGroupOverview(classId);
        if (groupManagerVisible.value)
            void loadGroupManagement(classId);
        return;
    }
    if (!groupOverview.value)
        void loadGroupOverview(classId);
}, { immediate: false });
watch(groupManagerVisible, (visible) => {
    if (visible)
        void loadGroupManagement(focusClassId.value);
});
watch([focusClassId, () => launchForm.value.plan_id], ([classId, planId], [previousClassId, previousPlanId]) => {
    if (classId !== previousClassId || planId !== previousPlanId) {
        void loadGroupTaskProgress(classId, planId);
        return;
    }
    if (!groupTaskProgress.value)
        void loadGroupTaskProgress(classId, planId);
}, { immediate: false });
onMounted(() => {
    void loadDashboard();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card-top']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['history-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-skeleton-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-overview-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-description']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['group-manager-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-member-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['group-manager-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['group-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['history-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-skeleton-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-overview-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['task-progress-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['launch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card-top']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['history-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['member-strip']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-stack teacher-dashboard" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "hero-panel dashboard-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.pageTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chip-row" },
});
for (const [role] of __VLS_getVForSourceType((__VLS_ctx.dashboard?.current_user.roles || []))) {
    const __VLS_0 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        key: (role),
        round: true,
        type: (role === 'admin' ? 'warning' : 'success'),
    }));
    const __VLS_2 = __VLS_1({
        key: (role),
        round: true,
        type: (role === 'admin' ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    (role === 'admin' ? '管理员权限' : '教师权限');
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chip-row hero-actions" },
});
const __VLS_4 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (__VLS_ctx.openLaunchpad)
};
__VLS_7.slots.default;
var __VLS_7;
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/staff/lesson-plans');
    }
};
__VLS_15.slots.default;
var __VLS_15;
const __VLS_20 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/staff/submissions');
    }
};
__VLS_23.slots.default;
var __VLS_23;
if (__VLS_ctx.errorMessage) {
    const __VLS_28 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_30 = __VLS_29({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
const __VLS_32 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_34 = __VLS_33({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_35.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "soft-card panel" },
    });
    const __VLS_36 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        rows: (10),
    }));
    const __VLS_38 = __VLS_37({
        rows: (10),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
}
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    if (__VLS_ctx.dashboard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_40 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            round: true,
        }));
        const __VLS_42 = __VLS_41({
            round: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        (__VLS_ctx.selectedClass?.student_count || 0);
        var __VLS_43;
        const __VLS_44 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            round: true,
            type: "success",
        }));
        const __VLS_46 = __VLS_45({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        (__VLS_ctx.selectedPlan?.task_count || 0);
        var __VLS_47;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "launch-row" },
        });
        const __VLS_48 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            modelValue: (__VLS_ctx.launchForm.class_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择班级",
        }));
        const __VLS_50 = __VLS_49({
            modelValue: (__VLS_ctx.launchForm.class_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择班级",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dashboard.launchpad.classes))) {
            const __VLS_52 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                key: (item.id),
                label: (`${item.class_name} · ${item.student_count}人 · 已签到${item.checked_in_count}人`),
                value: (item.id),
            }));
            const __VLS_54 = __VLS_53({
                key: (item.id),
                label: (`${item.class_name} · ${item.student_count}人 · 已签到${item.checked_in_count}人`),
                value: (item.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        }
        var __VLS_51;
        const __VLS_56 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            modelValue: (__VLS_ctx.launchForm.plan_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择学案",
        }));
        const __VLS_58 = __VLS_57({
            modelValue: (__VLS_ctx.launchForm.plan_id),
            ...{ class: "full-width" },
            filterable: true,
            placeholder: "请选择学案",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dashboard.launchpad.ready_plans))) {
            const __VLS_60 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                key: (item.id),
                label: (`${item.title} · ${item.unit_title} / ${item.lesson_title}`),
                value: (item.id),
            }));
            const __VLS_62 = __VLS_61({
                key: (item.id),
                label: (`${item.title} · ${item.unit_title} / ${item.lesson_title}`),
                value: (item.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        }
        var __VLS_59;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.launchForm.class_id || !__VLS_ctx.launchForm.plan_id),
            loading: (__VLS_ctx.isLaunching),
            type: "primary",
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            disabled: (!__VLS_ctx.launchForm.class_id || !__VLS_ctx.launchForm.plan_id),
            loading: (__VLS_ctx.isLaunching),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (__VLS_ctx.startClassroom)
        };
        __VLS_67.slots.default;
        var __VLS_67;
        if (__VLS_ctx.authStore.isAdmin) {
            const __VLS_72 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                ...{ 'onClick': {} },
                plain: true,
            }));
            const __VLS_74 = __VLS_73({
                ...{ 'onClick': {} },
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            let __VLS_76;
            let __VLS_77;
            let __VLS_78;
            const __VLS_79 = {
                onClick: (__VLS_ctx.openRoomSettings)
            };
            __VLS_75.slots.default;
            var __VLS_75;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "hint-box" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "hint-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        (__VLS_ctx.launchPreviewText);
        if (__VLS_ctx.focusRoster) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "soft-card panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "panel-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "eyebrow" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            (__VLS_ctx.focusRoster.class_name);
            if (__VLS_ctx.focusRoster.room) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.focusRoster.room.name);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chip-row" },
            });
            const __VLS_80 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                round: true,
            }));
            const __VLS_82 = __VLS_81({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            __VLS_83.slots.default;
            (__VLS_ctx.focusRoster.student_count);
            var __VLS_83;
            const __VLS_84 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                round: true,
                type: "success",
            }));
            const __VLS_86 = __VLS_85({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            __VLS_87.slots.default;
            (__VLS_ctx.focusRoster.checked_in_count);
            var __VLS_87;
            const __VLS_88 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                round: true,
                type: "warning",
            }));
            const __VLS_90 = __VLS_89({
                round: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            __VLS_91.slots.default;
            (__VLS_ctx.focusRoster.pending_signin_count);
            var __VLS_91;
            if (__VLS_ctx.focusRoster.room) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "seat-grid" },
                    ...{ style: (__VLS_ctx.seatGridStyle) },
                });
                for (const [seat] of __VLS_getVForSourceType((__VLS_ctx.focusRoster.seats))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                        key: (seat.seat_id),
                        ...{ class: "seat-card" },
                        ...{ class: ({
                                'seat-card-empty': !seat.student,
                                'seat-card-signed': seat.signed_in_today,
                                'seat-card-disabled': !seat.is_enabled,
                            }) },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "seat-top" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (seat.seat_label);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (seat.ip_address);
                    if (seat.student) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "seat-name" },
                        });
                        (seat.student.display_name);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "seat-meta" },
                        });
                        (seat.student.student_no);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "seat-meta" },
                        });
                        (seat.checked_in_at ? `签到 ${__VLS_ctx.formatClock(seat.checked_in_at)}` : '未签到');
                    }
                    else {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "seat-name seat-name-empty" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "seat-meta" },
                        });
                        (seat.hostname || '空座位');
                    }
                }
            }
            else {
                const __VLS_92 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                    description: "当前班级还没有绑定机房，请先维护座位表",
                }));
                const __VLS_94 = __VLS_93({
                    description: "当前班级还没有绑定机房，请先维护座位表",
                }, ...__VLS_functionalComponentArgsRest(__VLS_93));
            }
            if (__VLS_ctx.focusRoster.unassigned_students.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "hint-box" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "hint-title" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row" },
                });
                for (const [student] of __VLS_getVForSourceType((__VLS_ctx.focusRoster.unassigned_students))) {
                    const __VLS_96 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                        key: (student.user_id),
                        round: true,
                        type: "info",
                    }));
                    const __VLS_98 = __VLS_97({
                        key: (student.user_id),
                        round: true,
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
                    __VLS_99.slots.default;
                    (student.display_name);
                    (student.student_no);
                    var __VLS_99;
                }
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_100 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            round: true,
        }));
        const __VLS_102 = __VLS_101({
            round: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        (__VLS_ctx.focusGroupSummary?.group_count || 0);
        var __VLS_103;
        const __VLS_104 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            round: true,
            type: "success",
        }));
        const __VLS_106 = __VLS_105({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        __VLS_107.slots.default;
        (__VLS_ctx.focusGroupSummary?.shared_file_count || 0);
        var __VLS_107;
        const __VLS_108 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            ...{ 'onClick': {} },
            plain: true,
            loading: (__VLS_ctx.groupLoading),
        }));
        const __VLS_110 = __VLS_109({
            ...{ 'onClick': {} },
            plain: true,
            loading: (__VLS_ctx.groupLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        let __VLS_112;
        let __VLS_113;
        let __VLS_114;
        const __VLS_115 = {
            onClick: (__VLS_ctx.refreshFocusGroupOverview)
        };
        __VLS_111.slots.default;
        var __VLS_111;
        const __VLS_116 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            ...{ 'onClick': {} },
            plain: true,
            disabled: (!__VLS_ctx.focusClassId),
        }));
        const __VLS_118 = __VLS_117({
            ...{ 'onClick': {} },
            plain: true,
            disabled: (!__VLS_ctx.focusClassId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        let __VLS_120;
        let __VLS_121;
        let __VLS_122;
        const __VLS_123 = {
            onClick: (__VLS_ctx.openGroupManager)
        };
        __VLS_119.slots.default;
        var __VLS_119;
        if (__VLS_ctx.groupError) {
            const __VLS_124 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                closable: (false),
                title: (__VLS_ctx.groupError),
                ...{ class: "section-alert" },
                type: "error",
            }));
            const __VLS_126 = __VLS_125({
                closable: (false),
                title: (__VLS_ctx.groupError),
                ...{ class: "section-alert" },
                type: "error",
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        }
        else if (__VLS_ctx.groupLoading) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "group-grid" },
            });
            for (const [index] of __VLS_getVForSourceType((2))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (index),
                    ...{ class: "group-card group-card-skeleton" },
                });
                const __VLS_128 = {}.ElSkeleton;
                /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
                // @ts-ignore
                const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
                    animated: true,
                    rows: (7),
                }));
                const __VLS_130 = __VLS_129({
                    animated: true,
                    rows: (7),
                }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            }
        }
        else if (__VLS_ctx.groupOverview) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chip-row class-summary-row" },
            });
            const __VLS_132 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                round: true,
            }));
            const __VLS_134 = __VLS_133({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            __VLS_135.slots.default;
            (__VLS_ctx.groupOverview.class.class_name);
            var __VLS_135;
            const __VLS_136 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                round: true,
            }));
            const __VLS_138 = __VLS_137({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_137));
            __VLS_139.slots.default;
            (__VLS_ctx.groupOverview.class.student_count);
            var __VLS_139;
            const __VLS_140 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                round: true,
                type: "success",
            }));
            const __VLS_142 = __VLS_141({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_141));
            __VLS_143.slots.default;
            (__VLS_ctx.groupOverview.class.checked_in_count);
            var __VLS_143;
            if (__VLS_ctx.groupOverview.groups.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "group-grid" },
                });
                for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupOverview.groups))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                        key: (group.id),
                        ...{ class: "group-card" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "group-card-top" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-name" },
                    });
                    (group.name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-note" },
                    });
                    (group.group_no);
                    if (group.leader_name) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                        (group.leader_name);
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "chip-row group-chip-row" },
                    });
                    const __VLS_144 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                        round: true,
                    }));
                    const __VLS_146 = __VLS_145({
                        round: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
                    __VLS_147.slots.default;
                    (group.member_count);
                    var __VLS_147;
                    const __VLS_148 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                        round: true,
                        type: "success",
                    }));
                    const __VLS_150 = __VLS_149({
                        round: true,
                        type: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
                    __VLS_151.slots.default;
                    (group.checked_in_count);
                    var __VLS_151;
                    const __VLS_152 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_154 = __VLS_153({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
                    __VLS_155.slots.default;
                    (group.pending_count);
                    var __VLS_155;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-description" },
                    });
                    (group.description || '本组可共享资料、协作编辑和提交课堂任务素材。');
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "member-strip" },
                    });
                    for (const [member] of __VLS_getVForSourceType((group.members))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                            key: (member.user_id),
                            ...{ class: "member-pill" },
                            ...{ class: ({ 'member-pill-signed': member.checked_in_today }) },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "member-pill-top" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "member-name" },
                        });
                        (member.display_name);
                        const __VLS_156 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                            round: true,
                            size: "small",
                            type: (member.role === 'leader' ? 'success' : 'info'),
                        }));
                        const __VLS_158 = __VLS_157({
                            round: true,
                            size: "small",
                            type: (member.role === 'leader' ? 'success' : 'info'),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
                        __VLS_159.slots.default;
                        (member.role === 'leader' ? '组长' : '成员');
                        var __VLS_159;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-note" },
                        });
                        (member.student_no);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-note" },
                        });
                        (member.seat_label || '未绑定座位');
                        if (member.room_name) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                            (member.room_name);
                        }
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-note" },
                        });
                        (member.checked_in_today ? `签到 ${__VLS_ctx.formatDateTime(member.checked_in_at)}` : '未签到');
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "drive-panel" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "panel-head drive-panel-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-name group-name-small" },
                    });
                    (group.shared_drive.display_name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-note" },
                    });
                    (__VLS_ctx.formatBytes(group.shared_drive.used_bytes));
                    (group.shared_drive.quota_mb);
                    const __VLS_160 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_162 = __VLS_161({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
                    __VLS_163.slots.default;
                    (group.shared_drive.file_count);
                    var __VLS_163;
                    const __VLS_164 = {}.ElProgress;
                    /** @type {[typeof __VLS_components.ElProgress, typeof __VLS_components.elProgress, ]} */ ;
                    // @ts-ignore
                    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                        percentage: (Math.min(group.shared_drive.usage_percent, 100)),
                        strokeWidth: (16),
                        status: "success",
                    }));
                    const __VLS_166 = __VLS_165({
                        percentage: (Math.min(group.shared_drive.usage_percent, 100)),
                        strokeWidth: (16),
                        status: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
                    if (group.shared_drive.files.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "file-list" },
                        });
                        for (const [file] of __VLS_getVForSourceType((group.shared_drive.files.slice(0, 5)))) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                                key: (file.id),
                                ...{ class: "file-item" },
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                ...{ class: "file-main" },
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-name" },
                            });
                            (file.name);
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-meta" },
                            });
                            (file.ext.toUpperCase() || 'FILE');
                            (file.size_kb);
                            (__VLS_ctx.formatDateTime(file.updated_at));
                            const __VLS_168 = {}.ElButton;
                            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                            // @ts-ignore
                            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                                ...{ 'onClick': {} },
                                link: true,
                                type: "primary",
                                loading: (__VLS_ctx.downloadingGroupFileId === file.id),
                            }));
                            const __VLS_170 = __VLS_169({
                                ...{ 'onClick': {} },
                                link: true,
                                type: "primary",
                                loading: (__VLS_ctx.downloadingGroupFileId === file.id),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_169));
                            let __VLS_172;
                            let __VLS_173;
                            let __VLS_174;
                            const __VLS_175 = {
                                onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.dashboard))
                                        return;
                                    if (!!(__VLS_ctx.groupError))
                                        return;
                                    if (!!(__VLS_ctx.groupLoading))
                                        return;
                                    if (!(__VLS_ctx.groupOverview))
                                        return;
                                    if (!(__VLS_ctx.groupOverview.groups.length))
                                        return;
                                    if (!(group.shared_drive.files.length))
                                        return;
                                    __VLS_ctx.downloadGroupFile(file);
                                }
                            };
                            __VLS_171.slots.default;
                            var __VLS_171;
                        }
                    }
                    else {
                        const __VLS_176 = {}.ElEmpty;
                        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                        // @ts-ignore
                        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                            description: "这个小组还没有共享文件",
                            imageSize: (72),
                        }));
                        const __VLS_178 = __VLS_177({
                            description: "这个小组还没有共享文件",
                            imageSize: (72),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "activity-panel" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "panel-head drive-panel-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-name group-name-small" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-note" },
                    });
                    const __VLS_180 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                        round: true,
                        type: "info",
                    }));
                    const __VLS_182 = __VLS_181({
                        round: true,
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
                    __VLS_183.slots.default;
                    (group.activity_feed.length);
                    var __VLS_183;
                    if (group.activity_feed.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "activity-list" },
                        });
                        for (const [event] of __VLS_getVForSourceType((group.activity_feed.slice(0, 4)))) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                                key: (event.id),
                                ...{ class: "activity-item" },
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                ...{ class: "panel-head activity-head" },
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-name" },
                            });
                            (event.title);
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-meta" },
                            });
                            (event.description);
                            const __VLS_184 = {}.ElTag;
                            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                            // @ts-ignore
                            const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                                round: true,
                                size: "small",
                                type: (__VLS_ctx.activityTagType(event.event_type)),
                            }));
                            const __VLS_186 = __VLS_185({
                                round: true,
                                size: "small",
                                type: (__VLS_ctx.activityTagType(event.event_type)),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_185));
                            __VLS_187.slots.default;
                            (event.event_label);
                            var __VLS_187;
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-meta" },
                            });
                            (__VLS_ctx.formatDateTime(event.occurred_at));
                            if (event.actor_name) {
                                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                                (event.actor_name);
                            }
                            if (event.actor_student_no) {
                                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                                (event.actor_student_no);
                            }
                        }
                    }
                    else {
                        const __VLS_188 = {}.ElEmpty;
                        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                        // @ts-ignore
                        const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                            description: "这个小组还没有新的课堂动态",
                            imageSize: (72),
                        }));
                        const __VLS_190 = __VLS_189({
                            description: "这个小组还没有新的课堂动态",
                            imageSize: (72),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_189));
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "activity-panel" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "panel-head drive-panel-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-name group-name-small" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-note" },
                    });
                    const __VLS_192 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_194 = __VLS_193({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
                    __VLS_195.slots.default;
                    (group.operation_logs.length);
                    var __VLS_195;
                    if (group.operation_logs.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "activity-list" },
                        });
                        for (const [log] of __VLS_getVForSourceType((group.operation_logs.slice(0, 4)))) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                                key: (`group-log-${log.id}`),
                                ...{ class: "activity-item" },
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                ...{ class: "panel-head activity-head" },
                            });
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-name" },
                            });
                            (log.title);
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-meta" },
                            });
                            (log.description);
                            const __VLS_196 = {}.ElTag;
                            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                            // @ts-ignore
                            const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                                round: true,
                                size: "small",
                                type: (__VLS_ctx.operationTagType(log.event_type)),
                            }));
                            const __VLS_198 = __VLS_197({
                                round: true,
                                size: "small",
                                type: (__VLS_ctx.operationTagType(log.event_type)),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_197));
                            __VLS_199.slots.default;
                            (log.event_label);
                            var __VLS_199;
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                                ...{ class: "file-meta" },
                            });
                            (__VLS_ctx.formatDateTime(log.occurred_at));
                            if (log.actor_name) {
                                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                                (log.actor_name);
                            }
                            if (log.actor_role) {
                                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                                (__VLS_ctx.roleText(log.actor_role));
                            }
                        }
                    }
                    else {
                        const __VLS_200 = {}.ElEmpty;
                        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                        // @ts-ignore
                        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                            description: "这个小组还没有操作日志",
                            imageSize: (72),
                        }));
                        const __VLS_202 = __VLS_201({
                            description: "这个小组还没有操作日志",
                            imageSize: (72),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
                    }
                }
            }
            else {
                const __VLS_204 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
                    description: "当前班级还没有建立小组",
                }));
                const __VLS_206 = __VLS_205({
                    description: "当前班级还没有建立小组",
                }, ...__VLS_functionalComponentArgsRest(__VLS_205));
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chip-row" },
        });
        const __VLS_208 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
            round: true,
        }));
        const __VLS_210 = __VLS_209({
            round: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        __VLS_211.slots.default;
        (__VLS_ctx.groupTaskProgressSummary?.task_count || 0);
        var __VLS_211;
        const __VLS_212 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            round: true,
            type: "success",
        }));
        const __VLS_214 = __VLS_213({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        (__VLS_ctx.groupTaskProgressSummary?.submitted_count || 0);
        (__VLS_ctx.groupTaskProgressSummary?.slot_count || 0);
        var __VLS_215;
        const __VLS_216 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            round: true,
            type: "warning",
        }));
        const __VLS_218 = __VLS_217({
            round: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        (__VLS_ctx.groupTaskProgressSummary?.reviewed_count || 0);
        (__VLS_ctx.groupTaskProgressSummary?.slot_count || 0);
        var __VLS_219;
        const __VLS_220 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            ...{ 'onClick': {} },
            plain: true,
            loading: (__VLS_ctx.groupTaskProgressLoading),
        }));
        const __VLS_222 = __VLS_221({
            ...{ 'onClick': {} },
            plain: true,
            loading: (__VLS_ctx.groupTaskProgressLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        let __VLS_224;
        let __VLS_225;
        let __VLS_226;
        const __VLS_227 = {
            onClick: (__VLS_ctx.refreshGroupTaskProgress)
        };
        __VLS_223.slots.default;
        var __VLS_223;
        if (__VLS_ctx.groupTaskProgressError) {
            const __VLS_228 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
                closable: (false),
                title: (__VLS_ctx.groupTaskProgressError),
                ...{ class: "section-alert" },
                type: "error",
            }));
            const __VLS_230 = __VLS_229({
                closable: (false),
                title: (__VLS_ctx.groupTaskProgressError),
                ...{ class: "section-alert" },
                type: "error",
            }, ...__VLS_functionalComponentArgsRest(__VLS_229));
        }
        else if (!__VLS_ctx.focusClassId || !__VLS_ctx.launchForm.plan_id) {
            const __VLS_232 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                description: "请先在页面顶部选择班级和学案",
            }));
            const __VLS_234 = __VLS_233({
                description: "请先在页面顶部选择班级和学案",
            }, ...__VLS_functionalComponentArgsRest(__VLS_233));
        }
        else if (__VLS_ctx.groupTaskProgressLoading) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "progress-skeleton-grid" },
            });
            for (const [index] of __VLS_getVForSourceType((2))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (index),
                    ...{ class: "progress-card progress-card-skeleton" },
                });
                const __VLS_236 = {}.ElSkeleton;
                /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
                // @ts-ignore
                const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
                    animated: true,
                    rows: (8),
                }));
                const __VLS_238 = __VLS_237({
                    animated: true,
                    rows: (8),
                }, ...__VLS_functionalComponentArgsRest(__VLS_237));
            }
        }
        else if (__VLS_ctx.groupTaskProgress) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chip-row class-summary-row" },
            });
            const __VLS_240 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                round: true,
            }));
            const __VLS_242 = __VLS_241({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_241));
            __VLS_243.slots.default;
            (__VLS_ctx.groupTaskProgress.class.class_name);
            var __VLS_243;
            const __VLS_244 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
                round: true,
                type: "success",
            }));
            const __VLS_246 = __VLS_245({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_245));
            __VLS_247.slots.default;
            (__VLS_ctx.groupTaskProgress.plan.title);
            var __VLS_247;
            const __VLS_248 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
                round: true,
            }));
            const __VLS_250 = __VLS_249({
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_249));
            __VLS_251.slots.default;
            (__VLS_ctx.groupTaskProgress.plan.unit_title);
            (__VLS_ctx.groupTaskProgress.plan.lesson_title);
            var __VLS_251;
            if (!__VLS_ctx.groupTaskProgress.tasks.length) {
                const __VLS_252 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
                    description: "当前学案还没有设置小组共同提交任务",
                }));
                const __VLS_254 = __VLS_253({
                    description: "当前学案还没有设置小组共同提交任务",
                }, ...__VLS_functionalComponentArgsRest(__VLS_253));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "progress-overview-grid" },
                });
                for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupTaskCompletionRows))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                        key: (group.group_id),
                        ...{ class: "progress-card" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "group-card-top" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-name" },
                    });
                    (group.group_name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-note" },
                    });
                    (group.group_no);
                    if (group.leader_name) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                        (group.leader_name);
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "chip-row group-chip-row" },
                    });
                    const __VLS_256 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
                        round: true,
                    }));
                    const __VLS_258 = __VLS_257({
                        round: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
                    __VLS_259.slots.default;
                    (group.member_count);
                    var __VLS_259;
                    const __VLS_260 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
                        round: true,
                        type: "success",
                    }));
                    const __VLS_262 = __VLS_261({
                        round: true,
                        type: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
                    __VLS_263.slots.default;
                    (group.submitted_count);
                    (group.total_task_count);
                    var __VLS_263;
                    const __VLS_264 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_266 = __VLS_265({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_265));
                    __VLS_267.slots.default;
                    (group.reviewed_count);
                    var __VLS_267;
                    const __VLS_268 = {}.ElProgress;
                    /** @type {[typeof __VLS_components.ElProgress, typeof __VLS_components.elProgress, ]} */ ;
                    // @ts-ignore
                    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                        percentage: (group.completion_percent),
                        strokeWidth: (16),
                        status: "success",
                    }));
                    const __VLS_270 = __VLS_269({
                        percentage: (group.completion_percent),
                        strokeWidth: (16),
                        status: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "chip-row progress-chip-row" },
                    });
                    const __VLS_272 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
                        round: true,
                    }));
                    const __VLS_274 = __VLS_273({
                        round: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_273));
                    __VLS_275.slots.default;
                    (group.pending_count);
                    var __VLS_275;
                    const __VLS_276 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
                        round: true,
                        type: "info",
                    }));
                    const __VLS_278 = __VLS_277({
                        round: true,
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
                    __VLS_279.slots.default;
                    (group.review_percent);
                    var __VLS_279;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "task-progress-list" },
                });
                for (const [task] of __VLS_getVForSourceType((__VLS_ctx.groupTaskProgress.tasks))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                        key: (task.task_id),
                        ...{ class: "progress-card" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "panel-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-name" },
                    });
                    (task.task_title);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "group-note" },
                    });
                    (task.task_type === 'programming' ? '编程任务' : '上传任务');
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "chip-row group-chip-row" },
                    });
                    const __VLS_280 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                        round: true,
                        type: "success",
                    }));
                    const __VLS_282 = __VLS_281({
                        round: true,
                        type: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
                    __VLS_283.slots.default;
                    (task.submitted_count);
                    (__VLS_ctx.groupTaskProgress.summary.group_count);
                    var __VLS_283;
                    const __VLS_284 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                        round: true,
                        type: "warning",
                    }));
                    const __VLS_286 = __VLS_285({
                        round: true,
                        type: "warning",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
                    __VLS_287.slots.default;
                    (task.reviewed_count);
                    (__VLS_ctx.groupTaskProgress.summary.group_count);
                    var __VLS_287;
                    const __VLS_288 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }));
                    const __VLS_290 = __VLS_289({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
                    let __VLS_292;
                    let __VLS_293;
                    let __VLS_294;
                    const __VLS_295 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.dashboard))
                                return;
                            if (!!(__VLS_ctx.groupTaskProgressError))
                                return;
                            if (!!(!__VLS_ctx.focusClassId || !__VLS_ctx.launchForm.plan_id))
                                return;
                            if (!!(__VLS_ctx.groupTaskProgressLoading))
                                return;
                            if (!(__VLS_ctx.groupTaskProgress))
                                return;
                            if (!!(!__VLS_ctx.groupTaskProgress.tasks.length))
                                return;
                            __VLS_ctx.openTaskReview(task.task_id);
                        }
                    };
                    __VLS_291.slots.default;
                    var __VLS_291;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "progress-bar-stack" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "progress-line" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "member-note" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "member-note" },
                    });
                    (__VLS_ctx.progressPercent(task.submitted_count, __VLS_ctx.groupTaskProgress.summary.group_count));
                    const __VLS_296 = {}.ElProgress;
                    /** @type {[typeof __VLS_components.ElProgress, typeof __VLS_components.elProgress, ]} */ ;
                    // @ts-ignore
                    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
                        percentage: (__VLS_ctx.progressPercent(task.submitted_count, __VLS_ctx.groupTaskProgress.summary.group_count)),
                        strokeWidth: (14),
                        status: "success",
                    }));
                    const __VLS_298 = __VLS_297({
                        percentage: (__VLS_ctx.progressPercent(task.submitted_count, __VLS_ctx.groupTaskProgress.summary.group_count)),
                        strokeWidth: (14),
                        status: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "progress-line" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "member-note" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "member-note" },
                    });
                    (__VLS_ctx.progressPercent(task.reviewed_count, __VLS_ctx.groupTaskProgress.summary.group_count));
                    const __VLS_300 = {}.ElProgress;
                    /** @type {[typeof __VLS_components.ElProgress, typeof __VLS_components.elProgress, ]} */ ;
                    // @ts-ignore
                    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
                        percentage: (__VLS_ctx.progressPercent(task.reviewed_count, __VLS_ctx.groupTaskProgress.summary.group_count)),
                        strokeWidth: (14),
                        color: "#d48a1f",
                    }));
                    const __VLS_302 = __VLS_301({
                        percentage: (__VLS_ctx.progressPercent(task.reviewed_count, __VLS_ctx.groupTaskProgress.summary.group_count)),
                        strokeWidth: (14),
                        color: "#d48a1f",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "task-progress-grid" },
                    });
                    for (const [item] of __VLS_getVForSourceType((task.items))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                            key: (`${task.task_id}-${item.group_id}`),
                            ...{ class: "task-progress-item" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "group-card-top" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-name" },
                        });
                        (item.group_name);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-note" },
                        });
                        (item.group_no);
                        if (item.leader_name) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                            (item.leader_name);
                        }
                        const __VLS_304 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
                            round: true,
                            type: (__VLS_ctx.groupTaskStatusType(item.status)),
                        }));
                        const __VLS_306 = __VLS_305({
                            round: true,
                            type: (__VLS_ctx.groupTaskStatusType(item.status)),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_305));
                        __VLS_307.slots.default;
                        (__VLS_ctx.groupTaskStatusText(item.status));
                        var __VLS_307;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "chip-row progress-chip-row" },
                        });
                        const __VLS_308 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
                            round: true,
                        }));
                        const __VLS_310 = __VLS_309({
                            round: true,
                        }, ...__VLS_functionalComponentArgsRest(__VLS_309));
                        __VLS_311.slots.default;
                        (item.member_count);
                        var __VLS_311;
                        const __VLS_312 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
                            round: true,
                            type: "info",
                        }));
                        const __VLS_314 = __VLS_313({
                            round: true,
                            type: "info",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
                        __VLS_315.slots.default;
                        (item.file_count);
                        var __VLS_315;
                        if (item.score !== null) {
                            const __VLS_316 = {}.ElTag;
                            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                            // @ts-ignore
                            const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
                                round: true,
                                type: "success",
                            }));
                            const __VLS_318 = __VLS_317({
                                round: true,
                                type: "success",
                            }, ...__VLS_functionalComponentArgsRest(__VLS_317));
                            __VLS_319.slots.default;
                            (item.score);
                            var __VLS_319;
                        }
                        if (item.is_recommended) {
                            const __VLS_320 = {}.ElTag;
                            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                            // @ts-ignore
                            const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
                                round: true,
                                type: "warning",
                            }));
                            const __VLS_322 = __VLS_321({
                                round: true,
                                type: "warning",
                            }, ...__VLS_functionalComponentArgsRest(__VLS_321));
                            __VLS_323.slots.default;
                            var __VLS_323;
                        }
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-note" },
                        });
                        (item.submitted_by_name ? `提交人 ${item.submitted_by_name}` : '还没有小组提交记录');
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "member-note" },
                        });
                        (item.updated_at ? `更新时间 ${__VLS_ctx.formatDateTime(item.updated_at)}` : '等待本组开始提交');
                        if (item.submission_id) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                ...{ class: "chip-row" },
                            });
                            const __VLS_324 = {}.ElButton;
                            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                            // @ts-ignore
                            const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
                                ...{ 'onClick': {} },
                                link: true,
                                type: "primary",
                            }));
                            const __VLS_326 = __VLS_325({
                                ...{ 'onClick': {} },
                                link: true,
                                type: "primary",
                            }, ...__VLS_functionalComponentArgsRest(__VLS_325));
                            let __VLS_328;
                            let __VLS_329;
                            let __VLS_330;
                            const __VLS_331 = {
                                onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.dashboard))
                                        return;
                                    if (!!(__VLS_ctx.groupTaskProgressError))
                                        return;
                                    if (!!(!__VLS_ctx.focusClassId || !__VLS_ctx.launchForm.plan_id))
                                        return;
                                    if (!!(__VLS_ctx.groupTaskProgressLoading))
                                        return;
                                    if (!(__VLS_ctx.groupTaskProgress))
                                        return;
                                    if (!!(!__VLS_ctx.groupTaskProgress.tasks.length))
                                        return;
                                    if (!(item.submission_id))
                                        return;
                                    __VLS_ctx.openTaskReview(task.task_id);
                                }
                            };
                            __VLS_327.slots.default;
                            var __VLS_327;
                        }
                    }
                }
            }
        }
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
        (__VLS_ctx.dashboard.stats.class_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
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
        (__VLS_ctx.dashboard.today_overview.checked_in_today);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.dashboard.today_overview.pending_signin_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric-tile" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.dashboard.today_overview.active_session_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.dashboard.today_overview.active_class_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "metric-tile" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.dashboard.today_overview.pending_review_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.dashboard.today_overview.recommended_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "history-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        if (!__VLS_ctx.dashboard.recent_sessions.length) {
            const __VLS_332 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
                description: "还没有课堂记录",
            }));
            const __VLS_334 = __VLS_333({
                description: "还没有课堂记录",
            }, ...__VLS_functionalComponentArgsRest(__VLS_333));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "list-stack" },
            });
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dashboard.recent_sessions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (item.session_id),
                    ...{ class: "list-card" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "panel-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                (item.plan.title);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                (item.class.name);
                (item.plan.lesson_title);
                const __VLS_336 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
                    round: true,
                    type: (item.status === 'active' ? 'warning' : 'success'),
                }));
                const __VLS_338 = __VLS_337({
                    round: true,
                    type: (item.status === 'active' ? 'warning' : 'success'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_337));
                __VLS_339.slots.default;
                (item.status === 'active' ? '进行中' : '已结束');
                var __VLS_339;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row" },
                });
                const __VLS_340 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
                    round: true,
                }));
                const __VLS_342 = __VLS_341({
                    round: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_341));
                __VLS_343.slots.default;
                (__VLS_ctx.formatDateTime(item.started_at));
                var __VLS_343;
                const __VLS_344 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
                    round: true,
                    type: "success",
                }));
                const __VLS_346 = __VLS_345({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_345));
                __VLS_347.slots.default;
                (item.submission_count);
                var __VLS_347;
                const __VLS_348 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
                    round: true,
                    type: "warning",
                }));
                const __VLS_350 = __VLS_349({
                    round: true,
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_349));
                __VLS_351.slots.default;
                (item.pending_review_count);
                var __VLS_351;
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "soft-card panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        if (!__VLS_ctx.dashboard.recent_plans.length) {
            const __VLS_352 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
                description: "暂无已发布学案",
            }));
            const __VLS_354 = __VLS_353({
                description: "暂无已发布学案",
            }, ...__VLS_functionalComponentArgsRest(__VLS_353));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "list-stack" },
            });
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dashboard.recent_plans))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (item.id),
                    ...{ class: "list-card" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
                (item.title);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                (item.unit_title);
                (item.lesson_title);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "chip-row" },
                });
                const __VLS_356 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
                    round: true,
                }));
                const __VLS_358 = __VLS_357({
                    round: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_357));
                __VLS_359.slots.default;
                (item.assigned_date);
                var __VLS_359;
                const __VLS_360 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
                    round: true,
                    type: "success",
                }));
                const __VLS_362 = __VLS_361({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_361));
                __VLS_363.slots.default;
                (item.task_count);
                var __VLS_363;
                const __VLS_364 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
                    round: true,
                    type: "warning",
                }));
                const __VLS_366 = __VLS_365({
                    round: true,
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_365));
                __VLS_367.slots.default;
                (item.pending_count);
                var __VLS_367;
            }
        }
    }
}
var __VLS_35;
const __VLS_368 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
    modelValue: (__VLS_ctx.groupManagerVisible),
    withHeader: (false),
    destroyOnClose: true,
    size: "78%",
}));
const __VLS_370 = __VLS_369({
    modelValue: (__VLS_ctx.groupManagerVisible),
    withHeader: (false),
    destroyOnClose: true,
    size: "78%",
}, ...__VLS_functionalComponentArgsRest(__VLS_369));
__VLS_371.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "group-manager-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "drawer-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
(__VLS_ctx.groupManagerData?.class.class_name || __VLS_ctx.selectedClass?.class_name || '当前班级');
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "section-note" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chip-row" },
});
const __VLS_372 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
    round: true,
}));
const __VLS_374 = __VLS_373({
    round: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_373));
__VLS_375.slots.default;
(__VLS_ctx.groupManagerData?.class.student_count || __VLS_ctx.editableStudents.length);
var __VLS_375;
const __VLS_376 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
    round: true,
    type: "success",
}));
const __VLS_378 = __VLS_377({
    round: true,
    type: "success",
}, ...__VLS_functionalComponentArgsRest(__VLS_377));
__VLS_379.slots.default;
(__VLS_ctx.groupManagerData?.class.checked_in_count || 0);
var __VLS_379;
const __VLS_380 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
    round: true,
    type: "warning",
}));
const __VLS_382 = __VLS_381({
    round: true,
    type: "warning",
}, ...__VLS_functionalComponentArgsRest(__VLS_381));
__VLS_383.slots.default;
(__VLS_ctx.unassignedStudentCount);
var __VLS_383;
if (__VLS_ctx.groupManagerError) {
    const __VLS_384 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
        closable: (false),
        title: (__VLS_ctx.groupManagerError),
        type: "error",
    }));
    const __VLS_386 = __VLS_385({
        closable: (false),
        title: (__VLS_ctx.groupManagerError),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_385));
}
const __VLS_388 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
    loading: (__VLS_ctx.groupManagerLoading),
    animated: true,
}));
const __VLS_390 = __VLS_389({
    loading: (__VLS_ctx.groupManagerLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_389));
__VLS_391.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_391.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "soft-card panel" },
    });
    const __VLS_392 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
        rows: (14),
    }));
    const __VLS_394 = __VLS_393({
        rows: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
}
{
    const { default: __VLS_thisSlot } = __VLS_391.slots;
    if (__VLS_ctx.groupManagerData) {
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "inline-label" },
        });
        const __VLS_396 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
            modelValue: (__VLS_ctx.rebuildGroupCount),
            min: (1),
            max: (Math.max(__VLS_ctx.editableStudents.length, 1)),
            controlsPosition: "right",
        }));
        const __VLS_398 = __VLS_397({
            modelValue: (__VLS_ctx.rebuildGroupCount),
            min: (1),
            max: (Math.max(__VLS_ctx.editableStudents.length, 1)),
            controlsPosition: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_397));
        const __VLS_400 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.groupManagerRebuilding),
            type: "warning",
        }));
        const __VLS_402 = __VLS_401({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.groupManagerRebuilding),
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_401));
        let __VLS_404;
        let __VLS_405;
        let __VLS_406;
        const __VLS_407 = {
            onClick: (__VLS_ctx.rebuildGroups)
        };
        __VLS_403.slots.default;
        var __VLS_403;
        const __VLS_408 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.groupManagerCreating),
            plain: true,
        }));
        const __VLS_410 = __VLS_409({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.groupManagerCreating),
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_409));
        let __VLS_412;
        let __VLS_413;
        let __VLS_414;
        const __VLS_415 = {
            onClick: (__VLS_ctx.createGroup)
        };
        __VLS_411.slots.default;
        var __VLS_411;
        const __VLS_416 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.groupManagerSaving),
            type: "primary",
        }));
        const __VLS_418 = __VLS_417({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.groupManagerSaving),
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_417));
        let __VLS_420;
        let __VLS_421;
        let __VLS_422;
        const __VLS_423 = {
            onClick: (__VLS_ctx.saveGroupManagement)
        };
        __VLS_419.slots.default;
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
        const __VLS_424 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
            round: true,
            type: "warning",
        }));
        const __VLS_426 = __VLS_425({
            round: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_425));
        __VLS_427.slots.default;
        (__VLS_ctx.groupManagerData.operation_logs.length);
        var __VLS_427;
        if (__VLS_ctx.groupManagerData.operation_logs.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "history-grid" },
            });
            for (const [log] of __VLS_getVForSourceType((__VLS_ctx.groupManagerData.operation_logs))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (`class-log-${log.id}`),
                    ...{ class: "list-card" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "panel-head activity-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "group-name group-name-small" },
                });
                (log.title);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                (log.description);
                const __VLS_428 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_429 = __VLS_asFunctionalComponent(__VLS_428, new __VLS_428({
                    round: true,
                    size: "small",
                    type: (__VLS_ctx.operationTagType(log.event_type)),
                }));
                const __VLS_430 = __VLS_429({
                    round: true,
                    size: "small",
                    type: (__VLS_ctx.operationTagType(log.event_type)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_429));
                __VLS_431.slots.default;
                (log.event_label);
                var __VLS_431;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "member-note" },
                });
                (__VLS_ctx.formatDateTime(log.occurred_at));
                if (log.group_name) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (log.group_name);
                }
                if (log.actor_name) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (log.actor_name);
                }
                if (log.actor_role) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (__VLS_ctx.roleText(log.actor_role));
                }
            }
        }
        else {
            const __VLS_432 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
                description: "当前班级还没有可追溯的小组操作记录",
            }));
            const __VLS_434 = __VLS_433({
                description: "当前班级还没有可追溯的小组操作记录",
            }, ...__VLS_functionalComponentArgsRest(__VLS_433));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-manager-grid" },
        });
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
        const __VLS_436 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_437 = __VLS_asFunctionalComponent(__VLS_436, new __VLS_436({
            round: true,
        }));
        const __VLS_438 = __VLS_437({
            round: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_437));
        __VLS_439.slots.default;
        (__VLS_ctx.editableGroups.length);
        var __VLS_439;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-edit-grid" },
        });
        for (const [group] of __VLS_getVForSourceType((__VLS_ctx.editableGroups))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                ...{ onDragover: (...[$event]) => {
                        if (!(__VLS_ctx.groupManagerData))
                            return;
                        __VLS_ctx.handleDropZoneDragOver($event, group.id);
                    } },
                ...{ onDragleave: (...[$event]) => {
                        if (!(__VLS_ctx.groupManagerData))
                            return;
                        __VLS_ctx.handleDropZoneDragLeave($event, group.id);
                    } },
                ...{ onDrop: (...[$event]) => {
                        if (!(__VLS_ctx.groupManagerData))
                            return;
                        __VLS_ctx.handleDropZoneDrop($event, group.id);
                    } },
                key: (group.id),
                ...{ class: "group-edit-card" },
                ...{ class: ({ 'group-edit-card-active': __VLS_ctx.isDropZoneActive(group.id) }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "panel-head group-edit-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "group-name" },
            });
            (group.group_no);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "group-note" },
            });
            (__VLS_ctx.groupMembers(group.id).length);
            if (group.has_shared_files) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (group.file_count);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-note" },
            });
            const __VLS_440 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
                disabled: (!__VLS_ctx.canDeleteGroup(group)),
            }));
            const __VLS_442 = __VLS_441({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
                disabled: (!__VLS_ctx.canDeleteGroup(group)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_441));
            let __VLS_444;
            let __VLS_445;
            let __VLS_446;
            const __VLS_447 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.groupManagerData))
                        return;
                    __VLS_ctx.deleteGroup(group);
                }
            };
            __VLS_443.slots.default;
            var __VLS_443;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "group-edit-form" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "edit-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_448 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_449 = __VLS_asFunctionalComponent(__VLS_448, new __VLS_448({
                modelValue: (group.name),
                maxlength: "80",
            }));
            const __VLS_450 = __VLS_449({
                modelValue: (group.name),
                maxlength: "80",
            }, ...__VLS_functionalComponentArgsRest(__VLS_449));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "edit-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_452 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
                modelValue: (group.description),
                rows: (2),
                maxlength: "500",
                showWordLimit: true,
                type: "textarea",
            }));
            const __VLS_454 = __VLS_453({
                modelValue: (group.description),
                rows: (2),
                maxlength: "500",
                showWordLimit: true,
                type: "textarea",
            }, ...__VLS_functionalComponentArgsRest(__VLS_453));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "edit-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_456 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_457 = __VLS_asFunctionalComponent(__VLS_456, new __VLS_456({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (group.leader_user_id),
                ...{ class: "full-width" },
                clearable: true,
                placeholder: "先给这个组分配成员",
            }));
            const __VLS_458 = __VLS_457({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (group.leader_user_id),
                ...{ class: "full-width" },
                clearable: true,
                placeholder: "先给这个组分配成员",
            }, ...__VLS_functionalComponentArgsRest(__VLS_457));
            let __VLS_460;
            let __VLS_461;
            let __VLS_462;
            const __VLS_463 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!(__VLS_ctx.groupManagerData))
                        return;
                    __VLS_ctx.updateGroupLeader(group.id, $event);
                }
            };
            __VLS_459.slots.default;
            for (const [member] of __VLS_getVForSourceType((__VLS_ctx.groupMembers(group.id)))) {
                const __VLS_464 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_465 = __VLS_asFunctionalComponent(__VLS_464, new __VLS_464({
                    key: (member.user_id),
                    label: (`${member.display_name} · ${member.student_no}`),
                    value: (member.user_id),
                }));
                const __VLS_466 = __VLS_465({
                    key: (member.user_id),
                    label: (`${member.display_name} · ${member.student_no}`),
                    value: (member.user_id),
                }, ...__VLS_functionalComponentArgsRest(__VLS_465));
            }
            var __VLS_459;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "member-preview-list" },
            });
            for (const [member] of __VLS_getVForSourceType((__VLS_ctx.groupMembers(group.id)))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    ...{ onDragstart: (...[$event]) => {
                            if (!(__VLS_ctx.groupManagerData))
                                return;
                            __VLS_ctx.handleStudentDragStart(member, $event);
                        } },
                    ...{ onDragend: (__VLS_ctx.handleStudentDragEnd) },
                    key: (member.user_id),
                    ...{ class: "drag-member-chip" },
                    ...{ class: ({
                            'drag-member-chip-leader': group.leader_user_id === member.user_id,
                            'drag-member-chip-dragging': __VLS_ctx.draggingStudentUserId === member.user_id,
                        }) },
                    draggable: "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "member-name" },
                });
                (member.display_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "member-note" },
                });
                (member.student_no);
                const __VLS_468 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_469 = __VLS_asFunctionalComponent(__VLS_468, new __VLS_468({
                    round: true,
                    size: "small",
                    type: (group.leader_user_id === member.user_id ? 'success' : 'info'),
                }));
                const __VLS_470 = __VLS_469({
                    round: true,
                    size: "small",
                    type: (group.leader_user_id === member.user_id ? 'success' : 'info'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_469));
                __VLS_471.slots.default;
                (group.leader_user_id === member.user_id ? '组长' : '成员');
                var __VLS_471;
            }
            if (!__VLS_ctx.groupMembers(group.id).length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "drop-zone-empty" },
                });
            }
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
        const __VLS_472 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({
            round: true,
            type: (__VLS_ctx.draggingStudent ? 'success' : 'info'),
        }));
        const __VLS_474 = __VLS_473({
            round: true,
            type: (__VLS_ctx.draggingStudent ? 'success' : 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_473));
        __VLS_475.slots.default;
        (__VLS_ctx.draggingStudent ? `拖拽中：${__VLS_ctx.draggingStudent.display_name}` : '拖拽已启用');
        var __VLS_475;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onDragover: (...[$event]) => {
                    if (!(__VLS_ctx.groupManagerData))
                        return;
                    __VLS_ctx.handleDropZoneDragOver($event, null);
                } },
            ...{ onDragleave: (...[$event]) => {
                    if (!(__VLS_ctx.groupManagerData))
                        return;
                    __VLS_ctx.handleDropZoneDragLeave($event, null);
                } },
            ...{ onDrop: (...[$event]) => {
                    if (!(__VLS_ctx.groupManagerData))
                        return;
                    __VLS_ctx.handleDropZoneDrop($event, null);
                } },
            ...{ class: "unassigned-pool" },
            ...{ class: ({ 'unassigned-pool-active': __VLS_ctx.isDropZoneActive(null) }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "group-name group-name-small" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        const __VLS_476 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
            round: true,
            type: "warning",
        }));
        const __VLS_478 = __VLS_477({
            round: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_477));
        __VLS_479.slots.default;
        (__VLS_ctx.unassignedStudents.length);
        var __VLS_479;
        if (__VLS_ctx.unassignedStudents.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "member-preview-list" },
            });
            for (const [student] of __VLS_getVForSourceType((__VLS_ctx.unassignedStudents))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    ...{ onDragstart: (...[$event]) => {
                            if (!(__VLS_ctx.groupManagerData))
                                return;
                            if (!(__VLS_ctx.unassignedStudents.length))
                                return;
                            __VLS_ctx.handleStudentDragStart(student, $event);
                        } },
                    ...{ onDragend: (__VLS_ctx.handleStudentDragEnd) },
                    key: (student.user_id),
                    ...{ class: "drag-member-chip drag-member-chip-unassigned" },
                    ...{ class: ({ 'drag-member-chip-dragging': __VLS_ctx.draggingStudentUserId === student.user_id }) },
                    draggable: "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "member-name" },
                });
                (student.display_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "member-note" },
                });
                (student.student_no);
                const __VLS_480 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
                    round: true,
                    size: "small",
                    type: "warning",
                }));
                const __VLS_482 = __VLS_481({
                    round: true,
                    size: "small",
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_481));
                __VLS_483.slots.default;
                var __VLS_483;
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "drop-zone-empty" },
            });
        }
        const __VLS_484 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
            data: (__VLS_ctx.sortedEditableStudents),
            stripe: true,
        }));
        const __VLS_486 = __VLS_485({
            data: (__VLS_ctx.sortedEditableStudents),
            stripe: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_485));
        __VLS_487.slots.default;
        const __VLS_488 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
            label: "学生",
            minWidth: "180",
        }));
        const __VLS_490 = __VLS_489({
            label: "学生",
            minWidth: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_489));
        __VLS_491.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_491.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-name" },
            });
            (row.display_name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-note" },
            });
            (row.student_no);
        }
        var __VLS_491;
        const __VLS_492 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
            label: "座位 / 签到",
            minWidth: "190",
        }));
        const __VLS_494 = __VLS_493({
            label: "座位 / 签到",
            minWidth: "190",
        }, ...__VLS_functionalComponentArgsRest(__VLS_493));
        __VLS_495.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_495.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-note" },
            });
            (row.seat_label || '未绑定座位');
            if (row.room_name) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (row.room_name);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-note" },
            });
            (row.checked_in_today ? `签到 ${__VLS_ctx.formatDateTime(row.checked_in_at)}` : '未签到');
        }
        var __VLS_495;
        const __VLS_496 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
            label: "当前状态",
            minWidth: "180",
        }));
        const __VLS_498 = __VLS_497({
            label: "当前状态",
            minWidth: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_497));
        __VLS_499.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_499.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-note" },
            });
            (row.current_group_name || '未分组');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "member-note" },
            });
            (__VLS_ctx.roleText(row.current_role));
        }
        var __VLS_499;
        const __VLS_500 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({
            label: "调整到小组",
            minWidth: "220",
        }));
        const __VLS_502 = __VLS_501({
            label: "调整到小组",
            minWidth: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_501));
        __VLS_503.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_503.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_504 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (row.target_group_id),
                ...{ class: "full-width" },
                clearable: true,
                placeholder: "暂不分组",
            }));
            const __VLS_506 = __VLS_505({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (row.target_group_id),
                ...{ class: "full-width" },
                clearable: true,
                placeholder: "暂不分组",
            }, ...__VLS_functionalComponentArgsRest(__VLS_505));
            let __VLS_508;
            let __VLS_509;
            let __VLS_510;
            const __VLS_511 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!(__VLS_ctx.groupManagerData))
                        return;
                    __VLS_ctx.updateStudentGroup(row, $event);
                }
            };
            __VLS_507.slots.default;
            for (const [group] of __VLS_getVForSourceType((__VLS_ctx.editableGroups))) {
                const __VLS_512 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
                    key: (group.id),
                    label: (`${group.name} · 第${group.group_no}组`),
                    value: (group.id),
                }));
                const __VLS_514 = __VLS_513({
                    key: (group.id),
                    label: (`${group.name} · 第${group.group_no}组`),
                    value: (group.id),
                }, ...__VLS_functionalComponentArgsRest(__VLS_513));
            }
            var __VLS_507;
        }
        var __VLS_503;
        const __VLS_516 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
            label: "当前组内身份",
            minWidth: "120",
        }));
        const __VLS_518 = __VLS_517({
            label: "当前组内身份",
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_517));
        __VLS_519.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_519.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_520 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
                round: true,
                type: (__VLS_ctx.isStudentLeader(row) ? 'success' : row.target_group_id ? 'info' : 'warning'),
            }));
            const __VLS_522 = __VLS_521({
                round: true,
                type: (__VLS_ctx.isStudentLeader(row) ? 'success' : row.target_group_id ? 'info' : 'warning'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_521));
            __VLS_523.slots.default;
            (__VLS_ctx.isStudentLeader(row) ? '组长' : row.target_group_id ? '成员' : '未分组');
            var __VLS_523;
        }
        var __VLS_519;
        var __VLS_487;
    }
}
var __VLS_391;
var __VLS_371;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['teacher-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['launch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['hint-box']} */ ;
/** @type {__VLS_StyleScopedClasses['hint-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-top']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-name']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-name']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-name-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['hint-box']} */ ;
/** @type {__VLS_StyleScopedClasses['hint-title']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['group-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['class-summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['group-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card-top']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['group-description']} */ ;
/** @type {__VLS_StyleScopedClasses['member-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['member-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['member-pill-top']} */ ;
/** @type {__VLS_StyleScopedClasses['member-name']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['drive-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['drive-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name-small']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['file-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-main']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['drive-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name-small']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-list']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-item']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-head']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['drive-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name-small']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-list']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-item']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-head']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-skeleton-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-card']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-card-skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['class-summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-overview-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-card']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card-top']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['task-progress-list']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-bar-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-line']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-line']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['task-progress-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['task-progress-item']} */ ;
/** @type {__VLS_StyleScopedClasses['group-card-top']} */ ;
/** @type {__VLS_StyleScopedClasses['member-name']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['history-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['list-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['list-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['list-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['list-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['group-manager-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-label']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['history-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['list-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name-small']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['group-manager-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['group-edit-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['group-edit-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-edit-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['group-edit-form']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-label']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-label']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-label']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
/** @type {__VLS_StyleScopedClasses['member-preview-list']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-member-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['member-name']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['unassigned-pool']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name']} */ ;
/** @type {__VLS_StyleScopedClasses['group-name-small']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-preview-list']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-member-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-member-chip-unassigned']} */ ;
/** @type {__VLS_StyleScopedClasses['member-name']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-zone-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['member-name']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['member-note']} */ ;
/** @type {__VLS_StyleScopedClasses['full-width']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            router: router,
            authStore: authStore,
            dashboard: dashboard,
            errorMessage: errorMessage,
            isLoading: isLoading,
            isLaunching: isLaunching,
            launchForm: launchForm,
            groupOverview: groupOverview,
            groupError: groupError,
            groupLoading: groupLoading,
            downloadingGroupFileId: downloadingGroupFileId,
            groupTaskProgress: groupTaskProgress,
            groupTaskProgressError: groupTaskProgressError,
            groupTaskProgressLoading: groupTaskProgressLoading,
            groupManagerVisible: groupManagerVisible,
            groupManagerData: groupManagerData,
            groupManagerError: groupManagerError,
            groupManagerLoading: groupManagerLoading,
            groupManagerSaving: groupManagerSaving,
            groupManagerCreating: groupManagerCreating,
            groupManagerRebuilding: groupManagerRebuilding,
            editableGroups: editableGroups,
            editableStudents: editableStudents,
            rebuildGroupCount: rebuildGroupCount,
            draggingStudentUserId: draggingStudentUserId,
            pageTitle: pageTitle,
            focusClassId: focusClassId,
            focusRoster: focusRoster,
            selectedClass: selectedClass,
            selectedPlan: selectedPlan,
            focusGroupSummary: focusGroupSummary,
            groupTaskProgressSummary: groupTaskProgressSummary,
            seatGridStyle: seatGridStyle,
            sortedEditableStudents: sortedEditableStudents,
            unassignedStudents: unassignedStudents,
            unassignedStudentCount: unassignedStudentCount,
            draggingStudent: draggingStudent,
            groupTaskCompletionRows: groupTaskCompletionRows,
            launchPreviewText: launchPreviewText,
            formatClock: formatClock,
            formatDateTime: formatDateTime,
            activityTagType: activityTagType,
            operationTagType: operationTagType,
            formatBytes: formatBytes,
            progressPercent: progressPercent,
            roleText: roleText,
            groupTaskStatusText: groupTaskStatusText,
            groupTaskStatusType: groupTaskStatusType,
            groupMembers: groupMembers,
            updateGroupLeader: updateGroupLeader,
            updateStudentGroup: updateStudentGroup,
            isDropZoneActive: isDropZoneActive,
            handleStudentDragStart: handleStudentDragStart,
            handleStudentDragEnd: handleStudentDragEnd,
            handleDropZoneDragOver: handleDropZoneDragOver,
            handleDropZoneDragLeave: handleDropZoneDragLeave,
            handleDropZoneDrop: handleDropZoneDrop,
            isStudentLeader: isStudentLeader,
            canDeleteGroup: canDeleteGroup,
            refreshFocusGroupOverview: refreshFocusGroupOverview,
            refreshGroupTaskProgress: refreshGroupTaskProgress,
            startClassroom: startClassroom,
            downloadGroupFile: downloadGroupFile,
            openGroupManager: openGroupManager,
            openTaskReview: openTaskReview,
            createGroup: createGroup,
            rebuildGroups: rebuildGroups,
            deleteGroup: deleteGroup,
            saveGroupManagement: saveGroupManagement,
            openLaunchpad: openLaunchpad,
            openRoomSettings: openRoomSettings,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
