/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiDelete, apiGet, apiGetBlob, apiPost, apiPostBlob, apiPut } from '@/api/http';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import RichTextContent from '@/components/RichTextContent.vue';
import { useAuthStore } from '@/stores/auth';
const maxReviewScore = 120;
const previewableExtensions = new Set(['gif', 'jpeg', 'jpg', 'md', 'pdf', 'png', 'svg', 'txt', 'webp']);
const quickTemplateCount = 4;
const scoreGradeOptions = [
    { grade: 'G', label: 'G（推荐）', score: 120 },
    { grade: 'A', label: 'A', score: 100 },
    { grade: 'B', label: 'B', score: 80 },
    { grade: 'C', label: 'C', score: 60 },
    { grade: 'D', label: 'D', score: 40 },
    { grade: 'E', label: 'E', score: 20 },
    { grade: 'F', label: 'F', score: 0 },
];
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const tableRef = ref(null);
const taskData = ref(null);
const selectedSubmissionId = ref(null);
const selectedSubmissionIds = ref([]);
const reviewScore = ref(null);
const teacherComment = ref('');
const batchReviewScore = ref(null);
const batchTeacherComment = ref('');
const onlyPendingSubmissions = ref(true);
const selectedClassName = ref('');
const isLoading = ref(true);
const isSaving = ref(false);
const isBatchSaving = ref(false);
const isBatchDownloading = ref(false);
const errorMessage = ref('');
const gradingDialogVisible = ref(false);
const previewDialogVisible = ref(false);
const previewTitle = ref('');
const previewKind = ref('unsupported');
const previewUrl = ref('');
const previewText = ref('');
const isPreviewLoading = ref(false);
const previewLoadingFileId = ref(null);
const downloadLoadingFileId = ref(null);
const gradingPreviewFileId = ref(null);
const gradingPreviewKind = ref('unsupported');
const gradingPreviewUrl = ref('');
const gradingPreviewText = ref('');
const isGradingPreviewLoading = ref(false);
const reviewTemplates = ref([]);
const selectedSingleTemplateId = ref('');
const selectedBatchTemplateId = ref('');
const isTemplateLoading = ref(false);
const isTemplateSaving = ref(false);
const movingTemplateId = ref('');
const templateDialogVisible = ref(false);
const templateDialogTarget = ref('single');
const editingTemplateId = ref(null);
const templateForm = ref(createEmptyTemplateForm());
const taskItems = computed(() => taskData.value?.items || []);
const legacyTemplateStorageKey = computed(() => {
    const teacherKey = authStore.user?.id || authStore.user?.username || 'staff';
    return `learnsite-review-templates:${teacherKey}`;
});
const classOptions = computed(() => {
    const options = new Set();
    for (const item of taskItems.value) {
        options.add(item.class_name);
    }
    return Array.from(options);
});
const selectedSubmission = computed(() => {
    if (selectedSubmissionId.value === null) {
        return null;
    }
    return filteredItems.value.find((item) => item.submission_id === selectedSubmissionId.value) || null;
});
const filteredItems = computed(() => {
    return taskItems.value.filter((item) => {
        if (onlyPendingSubmissions.value && item.status === 'reviewed') {
            return false;
        }
        if (selectedClassName.value && item.class_name !== selectedClassName.value) {
            return false;
        }
        return true;
    });
});
const selectedSubmissionCount = computed(() => selectedSubmissionIds.value.length);
const selectedSubmissionIndex = computed(() => filteredItems.value.findIndex((item) => item.submission_id === selectedSubmissionId.value));
const hasPreviousSubmission = computed(() => selectedSubmissionIndex.value > 0);
const hasNextSubmission = computed(() => selectedSubmissionIndex.value >= 0 &&
    selectedSubmissionIndex.value < filteredItems.value.length - 1);
const selectedSubmissionProgressText = computed(() => {
    if (selectedSubmissionIndex.value < 0) {
        return '';
    }
    return `${selectedSubmissionIndex.value + 1} / ${filteredItems.value.length}`;
});
const gradingPreviewFile = computed(() => {
    if (!selectedSubmission.value || gradingPreviewFileId.value === null) {
        return null;
    }
    return selectedSubmission.value.files.find((file) => file.id === gradingPreviewFileId.value) || null;
});
const reviewSubmitButtonText = computed(() => hasNextSubmission.value ? '保存评语并进入下一份' : '保存当前修改');
const groupNameOptions = computed(() => {
    const names = new Set();
    for (const template of reviewTemplates.value) {
        if (template.group_name) {
            names.add(template.group_name);
        }
    }
    return Array.from(names).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
});
const groupedReviewTemplates = computed(() => {
    const sortedTemplates = [...reviewTemplates.value].sort(compareReviewTemplates);
    const groups = new Map();
    for (const template of sortedTemplates) {
        const key = template.group_name;
        const existing = groups.get(key);
        if (existing) {
            existing.templates.push(template);
            continue;
        }
        groups.set(key, {
            key,
            label: getTemplateGroupLabel(key),
            templates: [template],
        });
    }
    return Array.from(groups.values());
});
const quickTemplateGroups = computed(() => groupedReviewTemplates.value
    .map((group) => ({
    ...group,
    templates: group.templates.slice(0, quickTemplateCount),
}))
    .filter((group) => group.templates.length > 0));
const templateEditorHint = computed(() => {
    if (editingTemplateId.value) {
        return '修改模板后，单份评分和批量评分入口都会立即使用最新内容。';
    }
    if (templateDialogTarget.value === 'batch') {
        return '已按当前批量评分内容预填，可补充模板名称后保存。';
    }
    return '已按当前单份评分内容预填，可补充模板名称后保存。';
});
function statusLabel(status) {
    return status === 'reviewed' ? '已评阅' : '待评阅';
}
function statusTagType(status) {
    return status === 'reviewed' ? 'success' : 'warning';
}
function formatDateTime(value) {
    if (!value) {
        return '暂无记录';
    }
    return value.replace('T', ' ').slice(0, 16);
}
function getScoreGradeOption(score) {
    if (score === null) {
        return null;
    }
    return scoreGradeOptions.find((option) => option.score === score) || null;
}
function formatScoreText(score) {
    if (score === null) {
        return '--';
    }
    const option = getScoreGradeOption(score);
    return option ? `${option.grade} · ${score}` : `${score}`;
}
function formatScoreHelperText(score) {
    if (score === null) {
        return '未设置分数';
    }
    const option = getScoreGradeOption(score);
    return option ? `${option.label}，对应 ${score} 分` : `${score} 分`;
}
function rowClassName({ row }) {
    return row.submission_id === selectedSubmissionId.value ? 'current-row' : '';
}
function hasReviewContent(score, comment) {
    return score !== null || Boolean(comment.trim());
}
function createEmptyTemplateForm() {
    return {
        title: '',
        group_name: '',
        sort_order: null,
        score: null,
        comment: '',
    };
}
function createTemplateId() {
    return `template-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
function sanitizeTemplateScore(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) {
        return null;
    }
    return Math.min(maxReviewScore, Math.max(0, Math.round(score)));
}
function sanitizeTemplateSortOrder(sortOrder) {
    if (typeof sortOrder !== 'number' || Number.isNaN(sortOrder)) {
        return 1000;
    }
    return Math.min(9999, Math.max(0, Math.round(sortOrder)));
}
function normalizeTemplateGroupName(groupName) {
    return groupName?.trim() || '';
}
function getTemplateGroupLabel(groupName) {
    return groupName || '未分组';
}
function compareTemplateGroupName(left, right) {
    if (!left && right) {
        return -1;
    }
    if (left && !right) {
        return 1;
    }
    return left.localeCompare(right, 'zh-Hans-CN');
}
function compareReviewTemplates(left, right) {
    const groupComparison = compareTemplateGroupName(left.group_name, right.group_name);
    if (groupComparison !== 0) {
        return groupComparison;
    }
    if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
    }
    if ((left.updated_at || '') !== (right.updated_at || '')) {
        return (right.updated_at || '').localeCompare(left.updated_at || '');
    }
    return left.id.localeCompare(right.id);
}
function normalizeTemplate(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const candidate = input;
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const group_name = normalizeTemplateGroupName(candidate.group_name);
    const sort_order = sanitizeTemplateSortOrder(candidate.sort_order);
    const comment = typeof candidate.comment === 'string' ? candidate.comment.trim() : '';
    const score = sanitizeTemplateScore(candidate.score);
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createTemplateId();
    if (!title || (!comment && score === null)) {
        return null;
    }
    return {
        id,
        title,
        group_name,
        sort_order,
        score,
        comment,
        updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
    };
}
function readLegacyTemplates() {
    if (typeof window === 'undefined') {
        return [];
    }
    const raw = window.localStorage.getItem(legacyTemplateStorageKey.value);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((item) => normalizeTemplate(item))
            .filter((item) => item !== null);
    }
    catch {
        return [];
    }
}
function clearLegacyTemplates() {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(legacyTemplateStorageKey.value);
}
function templateSignature(template) {
    return [template.title.trim(), template.score ?? 'null', template.comment.trim()].join('::');
}
async function mergeLegacyTemplates(remoteTemplates) {
    if (!authStore.token) {
        return remoteTemplates;
    }
    const legacyTemplates = readLegacyTemplates();
    if (!legacyTemplates.length) {
        return remoteTemplates;
    }
    const remoteSignatures = new Set(remoteTemplates.map((template) => templateSignature(template)));
    const templatesToUpload = legacyTemplates.filter((template) => !remoteSignatures.has(templateSignature(template)));
    if (!templatesToUpload.length) {
        clearLegacyTemplates();
        return remoteTemplates;
    }
    for (const template of templatesToUpload) {
        await apiPost('/submissions/review-templates', {
            title: template.title,
            group_name: template.group_name,
            sort_order: template.sort_order,
            score: template.score,
            comment: template.comment,
        }, authStore.token);
    }
    clearLegacyTemplates();
    const payload = await apiGet('/submissions/review-templates', authStore.token);
    return payload.items;
}
async function loadReviewTemplates() {
    if (!authStore.token || !authStore.user?.id) {
        reviewTemplates.value = [];
        return;
    }
    isTemplateLoading.value = true;
    try {
        const payload = await apiGet('/submissions/review-templates', authStore.token);
        reviewTemplates.value = await mergeLegacyTemplates(payload.items);
    }
    catch (error) {
        const legacyTemplates = readLegacyTemplates();
        if (legacyTemplates.length) {
            reviewTemplates.value = legacyTemplates;
            ElMessage.warning('评分模板云端同步失败，已临时回退到本地模板');
            return;
        }
        reviewTemplates.value = [];
        ElMessage.error(error instanceof Error ? error.message : '加载评分模板失败');
    }
    finally {
        isTemplateLoading.value = false;
    }
}
function getTargetScore(target) {
    return target === 'single' ? reviewScore.value : batchReviewScore.value;
}
function getTargetComment(target) {
    return target === 'single' ? teacherComment.value : batchTeacherComment.value;
}
function setTargetScore(target, score) {
    if (target === 'single') {
        reviewScore.value = score;
        return;
    }
    batchReviewScore.value = score;
}
function setTargetComment(target, comment) {
    if (target === 'single') {
        teacherComment.value = comment;
        return;
    }
    batchTeacherComment.value = comment;
}
async function handleSingleScoreSelect(score) {
    if (isSaving.value) {
        return;
    }
    setTargetScore('single', score);
    await saveReview();
}
function buildTemplateFormFromTarget(source) {
    if (source === 'blank') {
        return createEmptyTemplateForm();
    }
    return {
        title: '',
        group_name: '',
        sort_order: null,
        score: getTargetScore(source),
        comment: getTargetComment(source),
    };
}
function joinComment(currentComment, nextComment) {
    const current = currentComment.trim();
    const next = nextComment.trim();
    if (!next) {
        return currentComment;
    }
    if (!current) {
        return next;
    }
    return `${current}\n${next}`;
}
function getTemplateById(templateId) {
    return reviewTemplates.value.find((template) => template.id === templateId) || null;
}
function applyTemplate(templateId, target, mode) {
    const template = getTemplateById(templateId);
    if (!template) {
        ElMessage.warning('未找到对应的评分模板');
        return;
    }
    if (target === 'single') {
        selectedSingleTemplateId.value = templateId;
    }
    else {
        selectedBatchTemplateId.value = templateId;
    }
    if (mode === 'replace') {
        if (template.score !== null) {
            setTargetScore(target, template.score);
        }
        if (template.comment) {
            setTargetComment(target, template.comment);
        }
        return;
    }
    if (template.comment) {
        setTargetComment(target, joinComment(getTargetComment(target), template.comment));
    }
}
function applySelectedTemplate(target, mode) {
    const templateId = target === 'single' ? selectedSingleTemplateId.value : selectedBatchTemplateId.value;
    if (!templateId) {
        ElMessage.warning('请先选择一个评分模板');
        return;
    }
    applyTemplate(templateId, target, mode);
}
function openTemplateManager(target) {
    templateDialogTarget.value = target;
    templateDialogVisible.value = true;
    if (!editingTemplateId.value &&
        !templateForm.value.title &&
        !templateForm.value.group_name &&
        !templateForm.value.comment &&
        templateForm.value.score === null &&
        templateForm.value.sort_order === null) {
        templateForm.value = buildTemplateFormFromTarget(target);
    }
}
function resetTemplateEditor() {
    editingTemplateId.value = null;
    templateForm.value = createEmptyTemplateForm();
}
function startCreateTemplate(source) {
    if (source !== 'blank') {
        templateDialogTarget.value = source;
    }
    editingTemplateId.value = null;
    templateForm.value = buildTemplateFormFromTarget(source);
}
function saveCurrentAsTemplate(target) {
    if (!hasReviewContent(getTargetScore(target), getTargetComment(target))) {
        ElMessage.warning('请先填写分数或评语，再保存为模板');
        return;
    }
    templateDialogTarget.value = target;
    templateDialogVisible.value = true;
    editingTemplateId.value = null;
    templateForm.value = buildTemplateFormFromTarget(target);
}
function startEditTemplate(templateId) {
    const template = getTemplateById(templateId);
    if (!template) {
        ElMessage.warning('未找到对应的评分模板');
        return;
    }
    templateDialogVisible.value = true;
    editingTemplateId.value = template.id;
    templateForm.value = {
        title: template.title,
        group_name: template.group_name,
        sort_order: template.sort_order,
        score: template.score,
        comment: template.comment,
    };
}
async function saveTemplate() {
    if (!authStore.token) {
        ElMessage.warning('请先登录教师账号');
        return;
    }
    const title = templateForm.value.title.trim();
    const group_name = normalizeTemplateGroupName(templateForm.value.group_name);
    const sort_order = templateForm.value.sort_order;
    const comment = templateForm.value.comment.trim();
    const score = templateForm.value.score;
    if (!title) {
        ElMessage.warning('请先填写模板名称');
        return;
    }
    if (!hasReviewContent(score, comment)) {
        ElMessage.warning('模板至少需要包含推荐分数或模板评语');
        return;
    }
    isTemplateSaving.value = true;
    try {
        const response = editingTemplateId.value
            ? await apiPut(`/submissions/review-templates/${editingTemplateId.value}`, { title, group_name, sort_order, score, comment }, authStore.token)
            : await apiPost('/submissions/review-templates', { title, group_name, sort_order, score, comment }, authStore.token);
        const payload = response.template;
        if (editingTemplateId.value) {
            reviewTemplates.value = reviewTemplates.value.map((template) => template.id === payload.id ? payload : template);
            ElMessage.success('评分模板已更新');
        }
        else {
            reviewTemplates.value = [payload, ...reviewTemplates.value];
            ElMessage.success('评分模板已保存');
        }
        selectedSingleTemplateId.value = payload.id;
        selectedBatchTemplateId.value = payload.id;
        editingTemplateId.value = payload.id;
        templateForm.value = {
            title: payload.title,
            group_name: payload.group_name,
            sort_order: payload.sort_order,
            score: payload.score,
            comment: payload.comment,
        };
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '保存评分模板失败');
    }
    finally {
        isTemplateSaving.value = false;
    }
}
async function deleteTemplate(templateId) {
    const template = getTemplateById(templateId);
    if (!template || !authStore.token) {
        return;
    }
    try {
        await ElMessageBox.confirm(`确定删除模板“${template.title}”吗？`, '删除评分模板', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    try {
        await apiDelete(`/submissions/review-templates/${templateId}`, authStore.token);
        reviewTemplates.value = reviewTemplates.value.filter((item) => item.id !== templateId);
        if (selectedSingleTemplateId.value === templateId) {
            selectedSingleTemplateId.value = '';
        }
        if (selectedBatchTemplateId.value === templateId) {
            selectedBatchTemplateId.value = '';
        }
        if (editingTemplateId.value === templateId) {
            resetTemplateEditor();
        }
        ElMessage.success('评分模板已删除');
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '删除评分模板失败');
    }
}
function getTemplateGroup(groupName) {
    return groupedReviewTemplates.value.find((group) => group.key === groupName) || null;
}
function canMoveTemplate(templateId, direction) {
    const template = getTemplateById(templateId);
    if (!template) {
        return false;
    }
    const group = getTemplateGroup(template.group_name);
    if (!group) {
        return false;
    }
    const index = group.templates.findIndex((item) => item.id === templateId);
    if (index === -1) {
        return false;
    }
    return direction === 'up' ? index > 0 : index < group.templates.length - 1;
}
async function moveTemplate(templateId, direction) {
    if (!authStore.token || !canMoveTemplate(templateId, direction)) {
        return;
    }
    const template = getTemplateById(templateId);
    if (!template) {
        return;
    }
    const group = getTemplateGroup(template.group_name);
    if (!group) {
        return;
    }
    const currentIndex = group.templates.findIndex((item) => item.id === templateId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const reorderedTemplates = [...group.templates];
    [reorderedTemplates[currentIndex], reorderedTemplates[targetIndex]] = [
        reorderedTemplates[targetIndex],
        reorderedTemplates[currentIndex],
    ];
    movingTemplateId.value = templateId;
    isTemplateSaving.value = true;
    try {
        await Promise.all(reorderedTemplates.map((item, index) => apiPut(`/submissions/review-templates/${item.id}`, {
            title: item.title,
            group_name: item.group_name,
            sort_order: (index + 1) * 10,
            score: item.score,
            comment: item.comment,
        }, authStore.token)));
        await loadReviewTemplates();
        ElMessage.success(direction === 'up' ? '模板已上移' : '模板已下移');
    }
    catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '调整模板顺序失败');
    }
    finally {
        movingTemplateId.value = '';
        isTemplateSaving.value = false;
    }
}
function isFilePreviewable(file) {
    if (typeof file.previewable === 'boolean') {
        return file.previewable;
    }
    return previewableExtensions.has(file.ext.toLowerCase());
}
function hydrateEditor(submission) {
    reviewScore.value = submission?.score ?? null;
    teacherComment.value = submission?.teacher_comment || '';
}
function resetBatchEditor() {
    batchReviewScore.value = null;
    batchTeacherComment.value = '';
}
function resetFilters() {
    onlyPendingSubmissions.value = true;
    selectedClassName.value = '';
}
function clearBatchSelection() {
    selectedSubmissionIds.value = [];
    resetBatchEditor();
    tableRef.value?.clearSelection();
}
function revokePreviewUrl() {
    if (!previewUrl.value) {
        return;
    }
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
}
function resetPreviewState() {
    revokePreviewUrl();
    previewKind.value = 'unsupported';
    previewText.value = '';
    previewTitle.value = '';
    isPreviewLoading.value = false;
    previewLoadingFileId.value = null;
}
function revokeGradingPreviewUrl() {
    if (!gradingPreviewUrl.value) {
        return;
    }
    URL.revokeObjectURL(gradingPreviewUrl.value);
    gradingPreviewUrl.value = '';
}
function resetGradingPreviewState() {
    revokeGradingPreviewUrl();
    gradingPreviewFileId.value = null;
    gradingPreviewKind.value = 'unsupported';
    gradingPreviewText.value = '';
    isGradingPreviewLoading.value = false;
}
function pickDefaultPreviewFile(submission) {
    if (!submission?.files.length) {
        return null;
    }
    return submission.files.find((file) => isFilePreviewable(file)) || submission.files[0];
}
function pickSubmission(preferredId) {
    const items = filteredItems.value;
    if (!items.length) {
        return null;
    }
    if (preferredId !== null) {
        const matched = items.find((item) => item.submission_id === preferredId);
        if (matched) {
            return matched;
        }
    }
    return items[0];
}
function syncSelectedSubmission(preferredId = selectedSubmissionId.value) {
    const nextSelected = pickSubmission(preferredId);
    selectedSubmissionId.value = nextSelected?.submission_id || null;
    hydrateEditor(nextSelected);
}
function selectSubmission(submissionId) {
    selectedSubmissionId.value = submissionId;
    hydrateEditor(taskData.value?.items.find((item) => item.submission_id === submissionId) || null);
}
function findRelativeSubmissionId(direction) {
    if (selectedSubmissionIndex.value < 0) {
        return null;
    }
    const nextIndex = direction === 'previous' ? selectedSubmissionIndex.value - 1 : selectedSubmissionIndex.value + 1;
    return filteredItems.value[nextIndex]?.submission_id || null;
}
function pickSubmissionIdAfterSave(currentSubmissionId) {
    const index = filteredItems.value.findIndex((item) => item.submission_id === currentSubmissionId);
    if (index === -1) {
        return null;
    }
    for (let nextIndex = index + 1; nextIndex < filteredItems.value.length; nextIndex += 1) {
        if (filteredItems.value[nextIndex]?.status !== 'reviewed') {
            return filteredItems.value[nextIndex].submission_id;
        }
    }
    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
        if (filteredItems.value[previousIndex]?.status !== 'reviewed') {
            return filteredItems.value[previousIndex].submission_id;
        }
    }
    return (filteredItems.value[index + 1]?.submission_id ||
        filteredItems.value[index - 1]?.submission_id ||
        null);
}
function moveToRelativeSubmission(direction) {
    const nextSubmissionId = findRelativeSubmissionId(direction);
    if (nextSubmissionId !== null) {
        selectSubmission(nextSubmissionId);
    }
}
function openGradingWorkspace(submissionId = selectedSubmissionId.value) {
    if (submissionId !== null) {
        selectSubmission(submissionId);
    }
    if (!selectedSubmission.value) {
        ElMessage.warning('请先选择一条学生作品');
        return;
    }
    gradingDialogVisible.value = true;
}
function handleCurrentChange(row) {
    if (row) {
        selectSubmission(row.submission_id);
    }
}
function handleRowClick(row) {
    selectSubmission(row.submission_id);
}
function handleSelectionChange(rows) {
    selectedSubmissionIds.value = rows.map((row) => row.submission_id);
}
function getDownloadFileName(contentDisposition, fallbackName) {
    if (!contentDisposition) {
        return fallbackName;
    }
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
        return decodeURIComponent(utf8Match[1]);
    }
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
function detectPreviewKind(file, blob) {
    const ext = file.ext.toLowerCase();
    const mediaType = blob.type || file.mime_type || '';
    if (ext === 'pdf' || mediaType.includes('pdf')) {
        return 'pdf';
    }
    if (mediaType.startsWith('image/') || ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(ext)) {
        return 'image';
    }
    if (mediaType.startsWith('text/') || ['md', 'txt'].includes(ext)) {
        return 'text';
    }
    return 'unsupported';
}
async function loadGradingPreview(file) {
    if (!file) {
        resetGradingPreviewState();
        return;
    }
    gradingPreviewFileId.value = file.id;
    gradingPreviewKind.value = 'unsupported';
    gradingPreviewText.value = '';
    revokeGradingPreviewUrl();
    if (!authStore.token) {
        errorMessage.value = '请先登录教师账号';
        return;
    }
    if (!isFilePreviewable(file)) {
        return;
    }
    isGradingPreviewLoading.value = true;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, authStore.token);
        const blob = await response.blob();
        const nextKind = detectPreviewKind(file, blob);
        gradingPreviewKind.value = nextKind;
        if (nextKind === 'text') {
            gradingPreviewText.value = await blob.text();
            return;
        }
        gradingPreviewUrl.value = URL.createObjectURL(blob);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载评分预览失败';
    }
    finally {
        isGradingPreviewLoading.value = false;
    }
}
async function syncGradingPreview() {
    const submission = selectedSubmission.value;
    const preferredFile = submission?.files.find((file) => file.id === gradingPreviewFileId.value) ||
        pickDefaultPreviewFile(submission);
    await loadGradingPreview(preferredFile || null);
}
async function loadTaskDetail(preferredSelectedId = selectedSubmissionId.value) {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        taskData.value = await apiGet(`/submissions/teacher/task/${route.params.taskId}`, authStore.token);
        syncSelectedSubmission(preferredSelectedId);
        await nextTick();
        clearBatchSelection();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '加载任务评分页失败';
    }
    finally {
        isLoading.value = false;
    }
}
async function saveReview() {
    if (!selectedSubmission.value || !authStore.token) {
        return;
    }
    if (!hasReviewContent(reviewScore.value, teacherComment.value)) {
        errorMessage.value = '请填写评分或教师评语后再保存';
        return;
    }
    isSaving.value = true;
    errorMessage.value = '';
    const currentSubmissionId = selectedSubmission.value.submission_id;
    const nextSubmissionId = pickSubmissionIdAfterSave(currentSubmissionId);
    const shouldKeepCurrentSubmissionVisible = onlyPendingSubmissions.value && nextSubmissionId === null;
    try {
        await apiPost(`/submissions/${currentSubmissionId}/score`, {
            score: reviewScore.value,
            teacher_comment: teacherComment.value.trim() || null,
        }, authStore.token);
        if (shouldKeepCurrentSubmissionVisible) {
            onlyPendingSubmissions.value = false;
        }
        ElMessage.success(shouldKeepCurrentSubmissionVisible
            ? '评分已保存，已切换为全部作品'
            : '评分已保存');
        await loadTaskDetail(shouldKeepCurrentSubmissionVisible ? currentSubmissionId : nextSubmissionId ?? currentSubmissionId);
        if (gradingDialogVisible.value) {
            if (selectedSubmission.value) {
                await syncGradingPreview();
            }
            else {
                gradingDialogVisible.value = false;
                ElMessage.success('当前筛选列表已经全部评分完成');
            }
        }
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '保存评分失败';
    }
    finally {
        isSaving.value = false;
    }
}
async function saveBatchReview() {
    if (!authStore.token || selectedSubmissionCount.value === 0) {
        return;
    }
    if (!hasReviewContent(batchReviewScore.value, batchTeacherComment.value)) {
        errorMessage.value = '请填写统一分数或统一评语后再批量保存';
        return;
    }
    isBatchSaving.value = true;
    errorMessage.value = '';
    const targetCount = selectedSubmissionCount.value;
    try {
        const payload = await apiPost('/submissions/batch-score', {
            submission_ids: selectedSubmissionIds.value,
            score: batchReviewScore.value,
            teacher_comment: batchTeacherComment.value.trim() || null,
        }, authStore.token);
        ElMessage.success(`已完成 ${payload.updated_count || targetCount} 份作品评分`);
        await loadTaskDetail();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '批量评分失败';
    }
    finally {
        isBatchSaving.value = false;
    }
}
async function downloadBatchFiles() {
    if (!authStore.token || selectedSubmissionCount.value === 0) {
        return;
    }
    isBatchDownloading.value = true;
    errorMessage.value = '';
    const targetCount = selectedSubmissionCount.value;
    try {
        const response = await apiPostBlob('/submissions/files/batch-download', {
            submission_ids: selectedSubmissionIds.value,
        }, authStore.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), `selected-submissions-${targetCount}.zip`));
        ElMessage.success(`已开始下载 ${targetCount} 份作品的附件压缩包`);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '批量下载附件失败';
    }
    finally {
        isBatchDownloading.value = false;
    }
}
async function previewFile(file) {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师账号';
        return;
    }
    previewDialogVisible.value = true;
    previewTitle.value = file.name;
    previewKind.value = 'unsupported';
    previewText.value = '';
    revokePreviewUrl();
    isPreviewLoading.value = true;
    previewLoadingFileId.value = file.id;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, authStore.token);
        const blob = await response.blob();
        const nextKind = detectPreviewKind(file, blob);
        previewKind.value = nextKind;
        if (nextKind === 'text') {
            previewText.value = await blob.text();
            return;
        }
        previewUrl.value = URL.createObjectURL(blob);
    }
    catch (error) {
        previewDialogVisible.value = false;
        errorMessage.value = error instanceof Error ? error.message : '附件预览失败';
    }
    finally {
        isPreviewLoading.value = false;
        previewLoadingFileId.value = null;
    }
}
async function downloadFile(file) {
    if (!authStore.token) {
        errorMessage.value = '请先登录教师账号';
        return;
    }
    downloadLoadingFileId.value = file.id;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '附件下载失败';
    }
    finally {
        downloadLoadingFileId.value = null;
    }
}
watch(() => route.params.taskId, () => {
    void loadTaskDetail();
});
watch(classOptions, (options) => {
    if (selectedClassName.value && !options.includes(selectedClassName.value)) {
        selectedClassName.value = '';
    }
});
watch(() => authStore.user?.id, () => {
    void loadReviewTemplates();
}, { immediate: true });
watch(reviewTemplates, (templates) => {
    const templateIds = new Set(templates.map((template) => template.id));
    if (selectedSingleTemplateId.value && !templateIds.has(selectedSingleTemplateId.value)) {
        selectedSingleTemplateId.value = '';
    }
    if (selectedBatchTemplateId.value && !templateIds.has(selectedBatchTemplateId.value)) {
        selectedBatchTemplateId.value = '';
    }
    if (editingTemplateId.value && !templateIds.has(editingTemplateId.value)) {
        resetTemplateEditor();
    }
}, { deep: true });
watch([onlyPendingSubmissions, selectedClassName], async () => {
    syncSelectedSubmission();
    await nextTick();
    clearBatchSelection();
});
watch(() => gradingDialogVisible.value, async (visible) => {
    if (!visible) {
        resetGradingPreviewState();
        return;
    }
    await nextTick();
    await syncGradingPreview();
});
watch(() => selectedSubmission.value?.submission_id, async () => {
    if (!gradingDialogVisible.value) {
        return;
    }
    await nextTick();
    await syncGradingPreview();
});
onMounted(() => {
    void loadTaskDetail();
});
onBeforeUnmount(() => {
    resetPreviewState();
    resetGradingPreviewState();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['batch-title']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-score']} */ ;
/** @type {__VLS_StyleScopedClasses['template-empty-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option-score']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-list']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-comment']} */ ;
/** @type {__VLS_StyleScopedClasses['template-editor-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-preview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-card']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-header']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-dialog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-sidebar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
/** @type {__VLS_StyleScopedClasses['template-select']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-chip-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-card']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['template-editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['template-editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
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
(__VLS_ctx.taskData?.task.title || `任务 ${__VLS_ctx.route.params.taskId}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
(__VLS_ctx.taskData?.task.course.title || '正在加载课程信息');
if (__VLS_ctx.taskData) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.taskData.task.course.unit_title);
    (__VLS_ctx.taskData.task.course.lesson_title);
}
const __VLS_0 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    wrap: true,
}));
const __VLS_2 = __VLS_1({
    wrap: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/staff/submissions');
    }
};
__VLS_7.slots.default;
var __VLS_7;
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isLoading),
    type: "primary",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isLoading),
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClick: (__VLS_ctx.loadTaskDetail)
};
__VLS_15.slots.default;
var __VLS_15;
var __VLS_3;
if (__VLS_ctx.errorMessage) {
    const __VLS_20 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_22 = __VLS_21({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
const __VLS_24 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_26 = __VLS_25({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_27.slots;
    const __VLS_28 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ class: "soft-card" },
    }));
    const __VLS_30 = __VLS_29({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        rows: (10),
    }));
    const __VLS_34 = __VLS_33({
        rows: (10),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    var __VLS_31;
}
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    if (__VLS_ctx.taskData) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack" },
        });
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
        (__VLS_ctx.taskData.summary.submission_count);
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
        (__VLS_ctx.taskData.summary.reviewed_count);
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
        (__VLS_ctx.taskData.summary.pending_count);
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
        (__VLS_ctx.taskData.summary.average_score ?? '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        /** @type {[typeof RecommendedWorksShowcase, ]} */ ;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent(RecommendedWorksShowcase, new RecommendedWorksShowcase({
            items: (__VLS_ctx.taskData.recommended_showcase.items),
            token: (__VLS_ctx.authStore.token || ''),
            description: "本任务下被评为 G 级的作品会自动进入这里，教师也可以直接查看推荐展示效果。",
            emptyDescription: "当前任务还没有推荐作品",
            title: "教师端推荐作品展示",
        }));
        const __VLS_37 = __VLS_36({
            items: (__VLS_ctx.taskData.recommended_showcase.items),
            token: (__VLS_ctx.authStore.token || ''),
            description: "本任务下被评为 G 级的作品会自动进入这里，教师也可以直接查看推荐展示效果。",
            emptyDescription: "当前任务还没有推荐作品",
            title: "教师端推荐作品展示",
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
        const __VLS_39 = {}.ElRow;
        /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
        // @ts-ignore
        const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
            gutter: (16),
        }));
        const __VLS_41 = __VLS_40({
            gutter: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_40));
        __VLS_42.slots.default;
        const __VLS_43 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
            lg: (15),
            sm: (24),
        }));
        const __VLS_45 = __VLS_44({
            lg: (15),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
        __VLS_46.slots.default;
        const __VLS_47 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
            ...{ class: "soft-card" },
        }));
        const __VLS_49 = __VLS_48({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_48));
        __VLS_50.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_50.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toolbar-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_51 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
                round: true,
                type: "info",
            }));
            const __VLS_53 = __VLS_52({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_52));
            __VLS_54.slots.default;
            (__VLS_ctx.formatDateTime(__VLS_ctx.taskData.summary.latest_submitted_at));
            var __VLS_54;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "filter-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "filter-label" },
            });
            const __VLS_55 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
                modelValue: (__VLS_ctx.onlyPendingSubmissions),
            }));
            const __VLS_57 = __VLS_56({
                modelValue: (__VLS_ctx.onlyPendingSubmissions),
            }, ...__VLS_functionalComponentArgsRest(__VLS_56));
            const __VLS_59 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
                modelValue: (__VLS_ctx.selectedClassName),
                ...{ class: "filter-select" },
                clearable: true,
                placeholder: "筛选班级",
            }));
            const __VLS_61 = __VLS_60({
                modelValue: (__VLS_ctx.selectedClassName),
                ...{ class: "filter-select" },
                clearable: true,
                placeholder: "筛选班级",
            }, ...__VLS_functionalComponentArgsRest(__VLS_60));
            __VLS_62.slots.default;
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.classOptions))) {
                const __VLS_63 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
                    key: (option),
                    label: (option),
                    value: (option),
                }));
                const __VLS_65 = __VLS_64({
                    key: (option),
                    label: (option),
                    value: (option),
                }, ...__VLS_functionalComponentArgsRest(__VLS_64));
            }
            var __VLS_62;
            if (__VLS_ctx.selectedClassName || !__VLS_ctx.onlyPendingSubmissions) {
                const __VLS_67 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
                    ...{ 'onClick': {} },
                    text: true,
                }));
                const __VLS_69 = __VLS_68({
                    ...{ 'onClick': {} },
                    text: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_68));
                let __VLS_71;
                let __VLS_72;
                let __VLS_73;
                const __VLS_74 = {
                    onClick: (__VLS_ctx.resetFilters)
                };
                __VLS_70.slots.default;
                var __VLS_70;
            }
            const __VLS_75 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
                round: true,
                type: "success",
            }));
            const __VLS_77 = __VLS_76({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_76));
            __VLS_78.slots.default;
            (__VLS_ctx.filteredItems.length);
            (__VLS_ctx.taskData.items.length);
            var __VLS_78;
        }
        if (!__VLS_ctx.taskData.items.length) {
            const __VLS_79 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
                description: "这个任务还没有学生提交作品。",
            }));
            const __VLS_81 = __VLS_80({
                description: "这个任务还没有学生提交作品。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_80));
        }
        else {
            if (!__VLS_ctx.filteredItems.length) {
                const __VLS_83 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
                    description: "当前筛选条件下没有作品。",
                }));
                const __VLS_85 = __VLS_84({
                    description: "当前筛选条件下没有作品。",
                }, ...__VLS_functionalComponentArgsRest(__VLS_84));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                    ...{ class: "batch-panel" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "batch-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "batch-title" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "batch-note" },
                });
                (__VLS_ctx.selectedSubmissionCount);
                const __VLS_87 = {}.ElSpace;
                /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
                // @ts-ignore
                const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
                    wrap: true,
                }));
                const __VLS_89 = __VLS_88({
                    wrap: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_88));
                __VLS_90.slots.default;
                const __VLS_91 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.selectedSubmissionCount === 0),
                    loading: (__VLS_ctx.isBatchDownloading),
                    plain: true,
                    type: "success",
                }));
                const __VLS_93 = __VLS_92({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.selectedSubmissionCount === 0),
                    loading: (__VLS_ctx.isBatchDownloading),
                    plain: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_92));
                let __VLS_95;
                let __VLS_96;
                let __VLS_97;
                const __VLS_98 = {
                    onClick: (__VLS_ctx.downloadBatchFiles)
                };
                __VLS_94.slots.default;
                var __VLS_94;
                const __VLS_99 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.selectedSubmissionCount === 0),
                    text: true,
                }));
                const __VLS_101 = __VLS_100({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.selectedSubmissionCount === 0),
                    text: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_100));
                let __VLS_103;
                let __VLS_104;
                let __VLS_105;
                const __VLS_106 = {
                    onClick: (__VLS_ctx.clearBatchSelection)
                };
                __VLS_102.slots.default;
                var __VLS_102;
                var __VLS_90;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                    ...{ class: "template-panel" },
                });
                __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isTemplateLoading) }, null, null);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "template-panel-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "template-panel-title" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "template-panel-note" },
                });
                const __VLS_107 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
                    ...{ 'onClick': {} },
                    text: true,
                }));
                const __VLS_109 = __VLS_108({
                    ...{ 'onClick': {} },
                    text: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_108));
                let __VLS_111;
                let __VLS_112;
                let __VLS_113;
                const __VLS_114 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!!(!__VLS_ctx.taskData.items.length))
                            return;
                        if (!!(!__VLS_ctx.filteredItems.length))
                            return;
                        __VLS_ctx.openTemplateManager('batch');
                    }
                };
                __VLS_110.slots.default;
                var __VLS_110;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "template-toolbar" },
                });
                const __VLS_115 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
                    modelValue: (__VLS_ctx.selectedBatchTemplateId),
                    ...{ class: "template-select" },
                    clearable: true,
                    filterable: true,
                    placeholder: "选择批量评分模板",
                }));
                const __VLS_117 = __VLS_116({
                    modelValue: (__VLS_ctx.selectedBatchTemplateId),
                    ...{ class: "template-select" },
                    clearable: true,
                    filterable: true,
                    placeholder: "选择批量评分模板",
                }, ...__VLS_functionalComponentArgsRest(__VLS_116));
                __VLS_118.slots.default;
                for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedReviewTemplates))) {
                    const __VLS_119 = {}.ElOptionGroup;
                    /** @type {[typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, ]} */ ;
                    // @ts-ignore
                    const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
                        key: (`batch-group-${group.key || 'ungrouped'}`),
                        label: (group.label),
                    }));
                    const __VLS_121 = __VLS_120({
                        key: (`batch-group-${group.key || 'ungrouped'}`),
                        label: (group.label),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_120));
                    __VLS_122.slots.default;
                    for (const [template] of __VLS_getVForSourceType((group.templates))) {
                        const __VLS_123 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
                            key: (template.id),
                            label: (template.title),
                            value: (template.id),
                        }));
                        const __VLS_125 = __VLS_124({
                            key: (template.id),
                            label: (template.title),
                            value: (template.id),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_124));
                        __VLS_126.slots.default;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "template-option" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                        (template.title);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "template-option-score" },
                        });
                        (template.sort_order);
                        (template.score === null ? ' · 仅评语' : ` · 建议等级 ${__VLS_ctx.formatScoreText(template.score)}`);
                        var __VLS_126;
                    }
                    var __VLS_122;
                }
                var __VLS_118;
                const __VLS_127 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
                    ...{ 'onClick': {} },
                    disabled: (!__VLS_ctx.selectedBatchTemplateId),
                    type: "primary",
                    plain: true,
                }));
                const __VLS_129 = __VLS_128({
                    ...{ 'onClick': {} },
                    disabled: (!__VLS_ctx.selectedBatchTemplateId),
                    type: "primary",
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_128));
                let __VLS_131;
                let __VLS_132;
                let __VLS_133;
                const __VLS_134 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!!(!__VLS_ctx.taskData.items.length))
                            return;
                        if (!!(!__VLS_ctx.filteredItems.length))
                            return;
                        __VLS_ctx.applySelectedTemplate('batch', 'replace');
                    }
                };
                __VLS_130.slots.default;
                var __VLS_130;
                const __VLS_135 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
                    ...{ 'onClick': {} },
                    disabled: (!__VLS_ctx.selectedBatchTemplateId),
                    plain: true,
                }));
                const __VLS_137 = __VLS_136({
                    ...{ 'onClick': {} },
                    disabled: (!__VLS_ctx.selectedBatchTemplateId),
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_136));
                let __VLS_139;
                let __VLS_140;
                let __VLS_141;
                const __VLS_142 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!!(!__VLS_ctx.taskData.items.length))
                            return;
                        if (!!(!__VLS_ctx.filteredItems.length))
                            return;
                        __VLS_ctx.applySelectedTemplate('batch', 'insert');
                    }
                };
                __VLS_138.slots.default;
                var __VLS_138;
                const __VLS_143 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
                    ...{ 'onClick': {} },
                    plain: true,
                }));
                const __VLS_145 = __VLS_144({
                    ...{ 'onClick': {} },
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_144));
                let __VLS_147;
                let __VLS_148;
                let __VLS_149;
                const __VLS_150 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!!(!__VLS_ctx.taskData.items.length))
                            return;
                        if (!!(!__VLS_ctx.filteredItems.length))
                            return;
                        __VLS_ctx.saveCurrentAsTemplate('batch');
                    }
                };
                __VLS_146.slots.default;
                var __VLS_146;
                if (__VLS_ctx.quickTemplateGroups.length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "template-group-stack" },
                    });
                    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.quickTemplateGroups))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (`batch-quick-${group.key || 'ungrouped'}`),
                            ...{ class: "quick-comment-row" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "filter-label" },
                        });
                        (group.label);
                        for (const [template] of __VLS_getVForSourceType((group.templates))) {
                            const __VLS_151 = {}.ElButton;
                            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                            // @ts-ignore
                            const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
                                ...{ 'onClick': {} },
                                key: (`batch-${template.id}`),
                                link: true,
                                type: "primary",
                            }));
                            const __VLS_153 = __VLS_152({
                                ...{ 'onClick': {} },
                                key: (`batch-${template.id}`),
                                link: true,
                                type: "primary",
                            }, ...__VLS_functionalComponentArgsRest(__VLS_152));
                            let __VLS_155;
                            let __VLS_156;
                            let __VLS_157;
                            const __VLS_158 = {
                                onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.taskData))
                                        return;
                                    if (!!(!__VLS_ctx.taskData.items.length))
                                        return;
                                    if (!!(!__VLS_ctx.filteredItems.length))
                                        return;
                                    if (!(__VLS_ctx.quickTemplateGroups.length))
                                        return;
                                    __VLS_ctx.applyTemplate(template.id, 'batch', 'insert');
                                }
                            };
                            __VLS_154.slots.default;
                            (template.title);
                            var __VLS_154;
                        }
                    }
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "template-empty-note" },
                    });
                }
                const __VLS_159 = {}.ElForm;
                /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
                // @ts-ignore
                const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
                    ...{ class: "batch-form" },
                    labelPosition: "top",
                }));
                const __VLS_161 = __VLS_160({
                    ...{ class: "batch-form" },
                    labelPosition: "top",
                }, ...__VLS_functionalComponentArgsRest(__VLS_160));
                __VLS_162.slots.default;
                const __VLS_163 = {}.ElRow;
                /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
                // @ts-ignore
                const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({
                    gutter: (12),
                }));
                const __VLS_165 = __VLS_164({
                    gutter: (12),
                }, ...__VLS_functionalComponentArgsRest(__VLS_164));
                __VLS_166.slots.default;
                const __VLS_167 = {}.ElCol;
                /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
                // @ts-ignore
                const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({
                    md: (8),
                    sm: (24),
                }));
                const __VLS_169 = __VLS_168({
                    md: (8),
                    sm: (24),
                }, ...__VLS_functionalComponentArgsRest(__VLS_168));
                __VLS_170.slots.default;
                const __VLS_171 = {}.ElFormItem;
                /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
                // @ts-ignore
                const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({
                    label: "统一等级评分",
                }));
                const __VLS_173 = __VLS_172({
                    label: "统一等级评分",
                }, ...__VLS_functionalComponentArgsRest(__VLS_172));
                __VLS_174.slots.default;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "grade-editor" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "grade-chip-grid" },
                });
                for (const [option] of __VLS_getVForSourceType((__VLS_ctx.scoreGradeOptions))) {
                    const __VLS_175 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_176 = __VLS_asFunctionalComponent(__VLS_175, new __VLS_175({
                        ...{ 'onClick': {} },
                        key: (`batch-grade-${option.grade}`),
                        plain: (__VLS_ctx.batchReviewScore !== option.score),
                        type: (__VLS_ctx.batchReviewScore === option.score ? 'primary' : undefined),
                    }));
                    const __VLS_177 = __VLS_176({
                        ...{ 'onClick': {} },
                        key: (`batch-grade-${option.grade}`),
                        plain: (__VLS_ctx.batchReviewScore !== option.score),
                        type: (__VLS_ctx.batchReviewScore === option.score ? 'primary' : undefined),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_176));
                    let __VLS_179;
                    let __VLS_180;
                    let __VLS_181;
                    const __VLS_182 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.taskData))
                                return;
                            if (!!(!__VLS_ctx.taskData.items.length))
                                return;
                            if (!!(!__VLS_ctx.filteredItems.length))
                                return;
                            __VLS_ctx.setTargetScore('batch', option.score);
                        }
                    };
                    __VLS_178.slots.default;
                    (option.grade);
                    (option.score);
                    var __VLS_178;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "grade-editor-footer" },
                });
                const __VLS_183 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({
                    round: true,
                    type: "success",
                }));
                const __VLS_185 = __VLS_184({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_184));
                __VLS_186.slots.default;
                (__VLS_ctx.formatScoreHelperText(__VLS_ctx.batchReviewScore));
                var __VLS_186;
                const __VLS_187 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
                    ...{ 'onClick': {} },
                    text: true,
                }));
                const __VLS_189 = __VLS_188({
                    ...{ 'onClick': {} },
                    text: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_188));
                let __VLS_191;
                let __VLS_192;
                let __VLS_193;
                const __VLS_194 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!!(!__VLS_ctx.taskData.items.length))
                            return;
                        if (!!(!__VLS_ctx.filteredItems.length))
                            return;
                        __VLS_ctx.setTargetScore('batch', null);
                    }
                };
                __VLS_190.slots.default;
                var __VLS_190;
                var __VLS_174;
                var __VLS_170;
                const __VLS_195 = {}.ElCol;
                /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
                // @ts-ignore
                const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                    md: (16),
                    sm: (24),
                }));
                const __VLS_197 = __VLS_196({
                    md: (16),
                    sm: (24),
                }, ...__VLS_functionalComponentArgsRest(__VLS_196));
                __VLS_198.slots.default;
                const __VLS_199 = {}.ElFormItem;
                /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
                // @ts-ignore
                const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({
                    label: "统一评语",
                }));
                const __VLS_201 = __VLS_200({
                    label: "统一评语",
                }, ...__VLS_functionalComponentArgsRest(__VLS_200));
                __VLS_202.slots.default;
                const __VLS_203 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
                    modelValue: (__VLS_ctx.batchTeacherComment),
                    autosize: ({ minRows: 2, maxRows: 4 }),
                    maxlength: "1000",
                    placeholder: "例如：整体完成度较高，再补充一个更贴近生活的应用案例。",
                    showWordLimit: true,
                    type: "textarea",
                }));
                const __VLS_205 = __VLS_204({
                    modelValue: (__VLS_ctx.batchTeacherComment),
                    autosize: ({ minRows: 2, maxRows: 4 }),
                    maxlength: "1000",
                    placeholder: "例如：整体完成度较高，再补充一个更贴近生活的应用案例。",
                    showWordLimit: true,
                    type: "textarea",
                }, ...__VLS_functionalComponentArgsRest(__VLS_204));
                var __VLS_202;
                var __VLS_198;
                var __VLS_166;
                var __VLS_162;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "batch-actions" },
                });
                const __VLS_207 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.selectedSubmissionCount === 0),
                    loading: (__VLS_ctx.isBatchSaving),
                    type: "primary",
                }));
                const __VLS_209 = __VLS_208({
                    ...{ 'onClick': {} },
                    disabled: (__VLS_ctx.selectedSubmissionCount === 0),
                    loading: (__VLS_ctx.isBatchSaving),
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_208));
                let __VLS_211;
                let __VLS_212;
                let __VLS_213;
                const __VLS_214 = {
                    onClick: (__VLS_ctx.saveBatchReview)
                };
                __VLS_210.slots.default;
                var __VLS_210;
                const __VLS_215 = {}.ElTable;
                /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
                // @ts-ignore
                const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
                    ...{ 'onCurrentChange': {} },
                    ...{ 'onRowClick': {} },
                    ...{ 'onSelectionChange': {} },
                    ref: "tableRef",
                    data: (__VLS_ctx.filteredItems),
                    rowClassName: (__VLS_ctx.rowClassName),
                    highlightCurrentRow: true,
                    rowKey: "submission_id",
                    stripe: true,
                }));
                const __VLS_217 = __VLS_216({
                    ...{ 'onCurrentChange': {} },
                    ...{ 'onRowClick': {} },
                    ...{ 'onSelectionChange': {} },
                    ref: "tableRef",
                    data: (__VLS_ctx.filteredItems),
                    rowClassName: (__VLS_ctx.rowClassName),
                    highlightCurrentRow: true,
                    rowKey: "submission_id",
                    stripe: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_216));
                let __VLS_219;
                let __VLS_220;
                let __VLS_221;
                const __VLS_222 = {
                    onCurrentChange: (__VLS_ctx.handleCurrentChange)
                };
                const __VLS_223 = {
                    onRowClick: (__VLS_ctx.handleRowClick)
                };
                const __VLS_224 = {
                    onSelectionChange: (__VLS_ctx.handleSelectionChange)
                };
                /** @type {typeof __VLS_ctx.tableRef} */ ;
                var __VLS_225 = {};
                __VLS_218.slots.default;
                const __VLS_227 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
                    type: "selection",
                    width: "48",
                }));
                const __VLS_229 = __VLS_228({
                    type: "selection",
                    width: "48",
                }, ...__VLS_functionalComponentArgsRest(__VLS_228));
                const __VLS_231 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
                    label: "学生",
                    minWidth: "160",
                }));
                const __VLS_233 = __VLS_232({
                    label: "学生",
                    minWidth: "160",
                }, ...__VLS_functionalComponentArgsRest(__VLS_232));
                __VLS_234.slots.default;
                {
                    const { default: __VLS_thisSlot } = __VLS_234.slots;
                    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (row.student_name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "table-note" },
                    });
                    (row.student_no);
                    (row.class_name);
                }
                var __VLS_234;
                const __VLS_235 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
                    label: "状态",
                    minWidth: "110",
                }));
                const __VLS_237 = __VLS_236({
                    label: "状态",
                    minWidth: "110",
                }, ...__VLS_functionalComponentArgsRest(__VLS_236));
                __VLS_238.slots.default;
                {
                    const { default: __VLS_thisSlot } = __VLS_238.slots;
                    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                    const __VLS_239 = {}.ElSpace;
                    /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
                    // @ts-ignore
                    const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
                        wrap: true,
                    }));
                    const __VLS_241 = __VLS_240({
                        wrap: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_240));
                    __VLS_242.slots.default;
                    const __VLS_243 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
                        type: (__VLS_ctx.statusTagType(row.status)),
                        round: true,
                    }));
                    const __VLS_245 = __VLS_244({
                        type: (__VLS_ctx.statusTagType(row.status)),
                        round: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_244));
                    __VLS_246.slots.default;
                    (__VLS_ctx.statusLabel(row.status));
                    var __VLS_246;
                    if (row.is_recommended) {
                        const __VLS_247 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
                            round: true,
                            type: "success",
                        }));
                        const __VLS_249 = __VLS_248({
                            round: true,
                            type: "success",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_248));
                        __VLS_250.slots.default;
                        var __VLS_250;
                    }
                    var __VLS_242;
                }
                var __VLS_238;
                const __VLS_251 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
                    label: "得分",
                    minWidth: "90",
                }));
                const __VLS_253 = __VLS_252({
                    label: "得分",
                    minWidth: "90",
                }, ...__VLS_functionalComponentArgsRest(__VLS_252));
                __VLS_254.slots.default;
                {
                    const { default: __VLS_thisSlot } = __VLS_254.slots;
                    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                    (__VLS_ctx.formatScoreText(row.score));
                }
                var __VLS_254;
                const __VLS_255 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
                    label: "附件",
                    minWidth: "90",
                    prop: "file_count",
                }));
                const __VLS_257 = __VLS_256({
                    label: "附件",
                    minWidth: "90",
                    prop: "file_count",
                }, ...__VLS_functionalComponentArgsRest(__VLS_256));
                const __VLS_259 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
                    label: "最近提交",
                    minWidth: "170",
                }));
                const __VLS_261 = __VLS_260({
                    label: "最近提交",
                    minWidth: "170",
                }, ...__VLS_functionalComponentArgsRest(__VLS_260));
                __VLS_262.slots.default;
                {
                    const { default: __VLS_thisSlot } = __VLS_262.slots;
                    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                    (__VLS_ctx.formatDateTime(row.updated_at));
                }
                var __VLS_262;
                const __VLS_263 = {}.ElTableColumn;
                /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                // @ts-ignore
                const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
                    label: "操作",
                    fixed: "right",
                    minWidth: "100",
                }));
                const __VLS_265 = __VLS_264({
                    label: "操作",
                    fixed: "right",
                    minWidth: "100",
                }, ...__VLS_functionalComponentArgsRest(__VLS_264));
                __VLS_266.slots.default;
                {
                    const { default: __VLS_thisSlot } = __VLS_266.slots;
                    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                    const __VLS_267 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }));
                    const __VLS_269 = __VLS_268({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_268));
                    let __VLS_271;
                    let __VLS_272;
                    let __VLS_273;
                    const __VLS_274 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.taskData))
                                return;
                            if (!!(!__VLS_ctx.taskData.items.length))
                                return;
                            if (!!(!__VLS_ctx.filteredItems.length))
                                return;
                            __VLS_ctx.openGradingWorkspace(row.submission_id);
                        }
                    };
                    __VLS_270.slots.default;
                    var __VLS_270;
                }
                var __VLS_266;
                var __VLS_218;
            }
        }
        var __VLS_50;
        var __VLS_46;
        const __VLS_275 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
            lg: (9),
            sm: (24),
        }));
        const __VLS_277 = __VLS_276({
            lg: (9),
            sm: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_276));
        __VLS_278.slots.default;
        const __VLS_279 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
            ...{ class: "soft-card" },
        }));
        const __VLS_281 = __VLS_280({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_280));
        __VLS_282.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_282.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "template-panel-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            if (__VLS_ctx.selectedSubmission) {
                const __VLS_283 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_284 = __VLS_asFunctionalComponent(__VLS_283, new __VLS_283({
                    ...{ 'onClick': {} },
                    text: true,
                }));
                const __VLS_285 = __VLS_284({
                    ...{ 'onClick': {} },
                    text: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_284));
                let __VLS_287;
                let __VLS_288;
                let __VLS_289;
                const __VLS_290 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!(__VLS_ctx.selectedSubmission))
                            return;
                        __VLS_ctx.openGradingWorkspace();
                    }
                };
                __VLS_286.slots.default;
                var __VLS_286;
            }
        }
        if (!__VLS_ctx.selectedSubmission) {
            const __VLS_291 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
                description: "请选择一条学生作品。",
            }));
            const __VLS_293 = __VLS_292({
                description: "请选择一条学生作品。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_292));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "page-stack" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "student-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.selectedSubmission.student_name);
            const __VLS_295 = {}.ElSpace;
            /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
            // @ts-ignore
            const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
                wrap: true,
            }));
            const __VLS_297 = __VLS_296({
                wrap: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_296));
            __VLS_298.slots.default;
            const __VLS_299 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_300 = __VLS_asFunctionalComponent(__VLS_299, new __VLS_299({
                type: (__VLS_ctx.statusTagType(__VLS_ctx.selectedSubmission.status)),
                round: true,
            }));
            const __VLS_301 = __VLS_300({
                type: (__VLS_ctx.statusTagType(__VLS_ctx.selectedSubmission.status)),
                round: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_300));
            __VLS_302.slots.default;
            (__VLS_ctx.statusLabel(__VLS_ctx.selectedSubmission.status));
            var __VLS_302;
            if (__VLS_ctx.selectedSubmission.is_recommended) {
                const __VLS_303 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
                    round: true,
                    type: "success",
                }));
                const __VLS_305 = __VLS_304({
                    round: true,
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_304));
                __VLS_306.slots.default;
                var __VLS_306;
            }
            var __VLS_298;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.selectedSubmission.student_no);
            (__VLS_ctx.selectedSubmission.class_name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.formatDateTime(__VLS_ctx.selectedSubmission.submitted_at));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "content-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            /** @type {[typeof RichTextContent, ]} */ ;
            // @ts-ignore
            const __VLS_307 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
                html: (__VLS_ctx.selectedSubmission.submission_note),
                emptyText: "学生没有填写作品说明。",
            }));
            const __VLS_308 = __VLS_307({
                html: (__VLS_ctx.selectedSubmission.submission_note),
                emptyText: "学生没有填写作品说明。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_307));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "content-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            if (!__VLS_ctx.selectedSubmission.files.length) {
                const __VLS_310 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
                    description: "暂无附件",
                }));
                const __VLS_312 = __VLS_311({
                    description: "暂无附件",
                }, ...__VLS_functionalComponentArgsRest(__VLS_311));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "stack-list" },
                });
                for (const [file] of __VLS_getVForSourceType((__VLS_ctx.selectedSubmission.files))) {
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
                    (file.ext.toUpperCase());
                    (file.size_kb);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "file-actions" },
                    });
                    const __VLS_314 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
                        round: true,
                        type: "info",
                    }));
                    const __VLS_316 = __VLS_315({
                        round: true,
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_315));
                    __VLS_317.slots.default;
                    (file.role);
                    var __VLS_317;
                    if (file.previewable) {
                        const __VLS_318 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
                            ...{ 'onClick': {} },
                            loading: (__VLS_ctx.previewLoadingFileId === file.id),
                            link: true,
                            type: "primary",
                        }));
                        const __VLS_320 = __VLS_319({
                            ...{ 'onClick': {} },
                            loading: (__VLS_ctx.previewLoadingFileId === file.id),
                            link: true,
                            type: "primary",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_319));
                        let __VLS_322;
                        let __VLS_323;
                        let __VLS_324;
                        const __VLS_325 = {
                            onClick: (...[$event]) => {
                                if (!(__VLS_ctx.taskData))
                                    return;
                                if (!!(!__VLS_ctx.selectedSubmission))
                                    return;
                                if (!!(!__VLS_ctx.selectedSubmission.files.length))
                                    return;
                                if (!(file.previewable))
                                    return;
                                __VLS_ctx.previewFile(file);
                            }
                        };
                        __VLS_321.slots.default;
                        var __VLS_321;
                    }
                    const __VLS_326 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
                        ...{ 'onClick': {} },
                        loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                        link: true,
                        type: "success",
                    }));
                    const __VLS_328 = __VLS_327({
                        ...{ 'onClick': {} },
                        loading: (__VLS_ctx.downloadLoadingFileId === file.id),
                        link: true,
                        type: "success",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
                    let __VLS_330;
                    let __VLS_331;
                    let __VLS_332;
                    const __VLS_333 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.taskData))
                                return;
                            if (!!(!__VLS_ctx.selectedSubmission))
                                return;
                            if (!!(!__VLS_ctx.selectedSubmission.files.length))
                                return;
                            __VLS_ctx.downloadFile(file);
                        }
                    };
                    __VLS_329.slots.default;
                    var __VLS_329;
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "template-panel" },
            });
            __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isTemplateLoading) }, null, null);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "template-panel-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "template-panel-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "template-panel-note" },
            });
            const __VLS_334 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
                ...{ 'onClick': {} },
                text: true,
            }));
            const __VLS_336 = __VLS_335({
                ...{ 'onClick': {} },
                text: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_335));
            let __VLS_338;
            let __VLS_339;
            let __VLS_340;
            const __VLS_341 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskData))
                        return;
                    if (!!(!__VLS_ctx.selectedSubmission))
                        return;
                    __VLS_ctx.openTemplateManager('single');
                }
            };
            __VLS_337.slots.default;
            var __VLS_337;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "template-toolbar" },
            });
            const __VLS_342 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
                modelValue: (__VLS_ctx.selectedSingleTemplateId),
                ...{ class: "template-select" },
                clearable: true,
                filterable: true,
                placeholder: "选择单份评分模板",
            }));
            const __VLS_344 = __VLS_343({
                modelValue: (__VLS_ctx.selectedSingleTemplateId),
                ...{ class: "template-select" },
                clearable: true,
                filterable: true,
                placeholder: "选择单份评分模板",
            }, ...__VLS_functionalComponentArgsRest(__VLS_343));
            __VLS_345.slots.default;
            for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedReviewTemplates))) {
                const __VLS_346 = {}.ElOptionGroup;
                /** @type {[typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, ]} */ ;
                // @ts-ignore
                const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
                    key: (`single-group-${group.key || 'ungrouped'}`),
                    label: (group.label),
                }));
                const __VLS_348 = __VLS_347({
                    key: (`single-group-${group.key || 'ungrouped'}`),
                    label: (group.label),
                }, ...__VLS_functionalComponentArgsRest(__VLS_347));
                __VLS_349.slots.default;
                for (const [template] of __VLS_getVForSourceType((group.templates))) {
                    const __VLS_350 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
                        key: (template.id),
                        label: (template.title),
                        value: (template.id),
                    }));
                    const __VLS_352 = __VLS_351({
                        key: (template.id),
                        label: (template.title),
                        value: (template.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_351));
                    __VLS_353.slots.default;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "template-option" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (template.title);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "template-option-score" },
                    });
                    (template.sort_order);
                    (template.score === null ? ' · 仅评语' : ` · 建议等级 ${__VLS_ctx.formatScoreText(template.score)}`);
                    var __VLS_353;
                }
                var __VLS_349;
            }
            var __VLS_345;
            const __VLS_354 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.selectedSingleTemplateId),
                type: "primary",
                plain: true,
            }));
            const __VLS_356 = __VLS_355({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.selectedSingleTemplateId),
                type: "primary",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_355));
            let __VLS_358;
            let __VLS_359;
            let __VLS_360;
            const __VLS_361 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskData))
                        return;
                    if (!!(!__VLS_ctx.selectedSubmission))
                        return;
                    __VLS_ctx.applySelectedTemplate('single', 'replace');
                }
            };
            __VLS_357.slots.default;
            var __VLS_357;
            const __VLS_362 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.selectedSingleTemplateId),
                plain: true,
            }));
            const __VLS_364 = __VLS_363({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.selectedSingleTemplateId),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_363));
            let __VLS_366;
            let __VLS_367;
            let __VLS_368;
            const __VLS_369 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskData))
                        return;
                    if (!!(!__VLS_ctx.selectedSubmission))
                        return;
                    __VLS_ctx.applySelectedTemplate('single', 'insert');
                }
            };
            __VLS_365.slots.default;
            var __VLS_365;
            const __VLS_370 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_371 = __VLS_asFunctionalComponent(__VLS_370, new __VLS_370({
                ...{ 'onClick': {} },
                plain: true,
            }));
            const __VLS_372 = __VLS_371({
                ...{ 'onClick': {} },
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_371));
            let __VLS_374;
            let __VLS_375;
            let __VLS_376;
            const __VLS_377 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskData))
                        return;
                    if (!!(!__VLS_ctx.selectedSubmission))
                        return;
                    __VLS_ctx.saveCurrentAsTemplate('single');
                }
            };
            __VLS_373.slots.default;
            var __VLS_373;
            if (__VLS_ctx.quickTemplateGroups.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "template-group-stack" },
                });
                for (const [group] of __VLS_getVForSourceType((__VLS_ctx.quickTemplateGroups))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (`single-quick-${group.key || 'ungrouped'}`),
                        ...{ class: "quick-comment-row" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "filter-label" },
                    });
                    (group.label);
                    for (const [template] of __VLS_getVForSourceType((group.templates))) {
                        const __VLS_378 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_379 = __VLS_asFunctionalComponent(__VLS_378, new __VLS_378({
                            ...{ 'onClick': {} },
                            key: (`single-${template.id}`),
                            link: true,
                            type: "primary",
                        }));
                        const __VLS_380 = __VLS_379({
                            ...{ 'onClick': {} },
                            key: (`single-${template.id}`),
                            link: true,
                            type: "primary",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_379));
                        let __VLS_382;
                        let __VLS_383;
                        let __VLS_384;
                        const __VLS_385 = {
                            onClick: (...[$event]) => {
                                if (!(__VLS_ctx.taskData))
                                    return;
                                if (!!(!__VLS_ctx.selectedSubmission))
                                    return;
                                if (!(__VLS_ctx.quickTemplateGroups.length))
                                    return;
                                __VLS_ctx.applyTemplate(template.id, 'single', 'insert');
                            }
                        };
                        __VLS_381.slots.default;
                        (template.title);
                        var __VLS_381;
                    }
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "template-empty-note" },
                });
            }
            const __VLS_386 = {}.ElForm;
            /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
            // @ts-ignore
            const __VLS_387 = __VLS_asFunctionalComponent(__VLS_386, new __VLS_386({
                labelPosition: "top",
            }));
            const __VLS_388 = __VLS_387({
                labelPosition: "top",
            }, ...__VLS_functionalComponentArgsRest(__VLS_387));
            __VLS_389.slots.default;
            const __VLS_390 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_391 = __VLS_asFunctionalComponent(__VLS_390, new __VLS_390({
                label: "教师等级评分",
            }));
            const __VLS_392 = __VLS_391({
                label: "教师等级评分",
            }, ...__VLS_functionalComponentArgsRest(__VLS_391));
            __VLS_393.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grade-editor" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grade-chip-grid" },
            });
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.scoreGradeOptions))) {
                const __VLS_394 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_395 = __VLS_asFunctionalComponent(__VLS_394, new __VLS_394({
                    ...{ 'onClick': {} },
                    key: (`single-grade-${option.grade}`),
                    disabled: (__VLS_ctx.isSaving),
                    plain: (__VLS_ctx.reviewScore !== option.score),
                    type: (__VLS_ctx.reviewScore === option.score ? 'primary' : undefined),
                }));
                const __VLS_396 = __VLS_395({
                    ...{ 'onClick': {} },
                    key: (`single-grade-${option.grade}`),
                    disabled: (__VLS_ctx.isSaving),
                    plain: (__VLS_ctx.reviewScore !== option.score),
                    type: (__VLS_ctx.reviewScore === option.score ? 'primary' : undefined),
                }, ...__VLS_functionalComponentArgsRest(__VLS_395));
                let __VLS_398;
                let __VLS_399;
                let __VLS_400;
                const __VLS_401 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.taskData))
                            return;
                        if (!!(!__VLS_ctx.selectedSubmission))
                            return;
                        __VLS_ctx.handleSingleScoreSelect(option.score);
                    }
                };
                __VLS_397.slots.default;
                (option.grade);
                (option.score);
                var __VLS_397;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grade-editor-footer" },
            });
            const __VLS_402 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_403 = __VLS_asFunctionalComponent(__VLS_402, new __VLS_402({
                round: true,
                type: "success",
            }));
            const __VLS_404 = __VLS_403({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_403));
            __VLS_405.slots.default;
            (__VLS_ctx.formatScoreHelperText(__VLS_ctx.reviewScore));
            var __VLS_405;
            const __VLS_406 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_407 = __VLS_asFunctionalComponent(__VLS_406, new __VLS_406({
                ...{ 'onClick': {} },
                disabled: (__VLS_ctx.isSaving),
                text: true,
            }));
            const __VLS_408 = __VLS_407({
                ...{ 'onClick': {} },
                disabled: (__VLS_ctx.isSaving),
                text: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_407));
            let __VLS_410;
            let __VLS_411;
            let __VLS_412;
            const __VLS_413 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.taskData))
                        return;
                    if (!!(!__VLS_ctx.selectedSubmission))
                        return;
                    __VLS_ctx.setTargetScore('single', null);
                }
            };
            __VLS_409.slots.default;
            var __VLS_409;
            var __VLS_393;
            const __VLS_414 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_415 = __VLS_asFunctionalComponent(__VLS_414, new __VLS_414({
                label: "教师评语",
            }));
            const __VLS_416 = __VLS_415({
                label: "教师评语",
            }, ...__VLS_functionalComponentArgsRest(__VLS_415));
            __VLS_417.slots.default;
            const __VLS_418 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_419 = __VLS_asFunctionalComponent(__VLS_418, new __VLS_418({
                modelValue: (__VLS_ctx.teacherComment),
                autosize: ({ minRows: 4, maxRows: 8 }),
                maxlength: "1000",
                placeholder: "写下本次作品的优点、修改建议或课堂反馈。",
                showWordLimit: true,
                type: "textarea",
            }));
            const __VLS_420 = __VLS_419({
                modelValue: (__VLS_ctx.teacherComment),
                autosize: ({ minRows: 4, maxRows: 8 }),
                maxlength: "1000",
                placeholder: "写下本次作品的优点、修改建议或课堂反馈。",
                showWordLimit: true,
                type: "textarea",
            }, ...__VLS_functionalComponentArgsRest(__VLS_419));
            var __VLS_417;
            var __VLS_389;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            const __VLS_422 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_423 = __VLS_asFunctionalComponent(__VLS_422, new __VLS_422({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.isSaving),
                ...{ class: "save-button" },
                type: "primary",
            }));
            const __VLS_424 = __VLS_423({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.isSaving),
                ...{ class: "save-button" },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_423));
            let __VLS_426;
            let __VLS_427;
            let __VLS_428;
            const __VLS_429 = {
                onClick: (__VLS_ctx.saveReview)
            };
            __VLS_425.slots.default;
            (__VLS_ctx.reviewSubmitButtonText);
            var __VLS_425;
        }
        var __VLS_282;
        var __VLS_278;
        var __VLS_42;
    }
}
var __VLS_27;
const __VLS_430 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_431 = __VLS_asFunctionalComponent(__VLS_430, new __VLS_430({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.gradingDialogVisible),
    destroyOnClose: true,
    fullscreen: true,
}));
const __VLS_432 = __VLS_431({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.gradingDialogVisible),
    destroyOnClose: true,
    fullscreen: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_431));
let __VLS_434;
let __VLS_435;
let __VLS_436;
const __VLS_437 = {
    onClosed: (__VLS_ctx.resetGradingPreviewState)
};
__VLS_433.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_433.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grading-dialog-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "template-manager-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "template-manager-note" },
    });
    (__VLS_ctx.selectedSubmission
        ? `${__VLS_ctx.selectedSubmission.student_name} · ${__VLS_ctx.selectedSubmission.student_no} · ${__VLS_ctx.selectedSubmission.class_name}`
        : '请选择一条学生作品');
    const __VLS_438 = {}.ElSpace;
    /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
    // @ts-ignore
    const __VLS_439 = __VLS_asFunctionalComponent(__VLS_438, new __VLS_438({
        wrap: true,
    }));
    const __VLS_440 = __VLS_439({
        wrap: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_439));
    __VLS_441.slots.default;
    if (__VLS_ctx.selectedSubmissionProgressText) {
        const __VLS_442 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_443 = __VLS_asFunctionalComponent(__VLS_442, new __VLS_442({
            round: true,
            type: "info",
        }));
        const __VLS_444 = __VLS_443({
            round: true,
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_443));
        __VLS_445.slots.default;
        (__VLS_ctx.selectedSubmissionProgressText);
        var __VLS_445;
    }
    const __VLS_446 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_447 = __VLS_asFunctionalComponent(__VLS_446, new __VLS_446({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.hasPreviousSubmission),
        plain: true,
    }));
    const __VLS_448 = __VLS_447({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.hasPreviousSubmission),
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_447));
    let __VLS_450;
    let __VLS_451;
    let __VLS_452;
    const __VLS_453 = {
        onClick: (...[$event]) => {
            __VLS_ctx.moveToRelativeSubmission('previous');
        }
    };
    __VLS_449.slots.default;
    var __VLS_449;
    const __VLS_454 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_455 = __VLS_asFunctionalComponent(__VLS_454, new __VLS_454({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.hasNextSubmission),
        plain: true,
    }));
    const __VLS_456 = __VLS_455({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.hasNextSubmission),
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_455));
    let __VLS_458;
    let __VLS_459;
    let __VLS_460;
    const __VLS_461 = {
        onClick: (...[$event]) => {
            __VLS_ctx.moveToRelativeSubmission('next');
        }
    };
    __VLS_457.slots.default;
    var __VLS_457;
    var __VLS_441;
}
if (__VLS_ctx.selectedSubmission) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grading-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "grading-preview-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "student-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "info-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedSubmission.student_name);
    const __VLS_462 = {}.ElSpace;
    /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
    // @ts-ignore
    const __VLS_463 = __VLS_asFunctionalComponent(__VLS_462, new __VLS_462({
        wrap: true,
    }));
    const __VLS_464 = __VLS_463({
        wrap: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_463));
    __VLS_465.slots.default;
    const __VLS_466 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_467 = __VLS_asFunctionalComponent(__VLS_466, new __VLS_466({
        type: (__VLS_ctx.statusTagType(__VLS_ctx.selectedSubmission.status)),
        round: true,
    }));
    const __VLS_468 = __VLS_467({
        type: (__VLS_ctx.statusTagType(__VLS_ctx.selectedSubmission.status)),
        round: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_467));
    __VLS_469.slots.default;
    (__VLS_ctx.statusLabel(__VLS_ctx.selectedSubmission.status));
    var __VLS_469;
    if (__VLS_ctx.selectedSubmission.is_recommended) {
        const __VLS_470 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_471 = __VLS_asFunctionalComponent(__VLS_470, new __VLS_470({
            round: true,
            type: "success",
        }));
        const __VLS_472 = __VLS_471({
            round: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_471));
        __VLS_473.slots.default;
        var __VLS_473;
    }
    var __VLS_465;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "section-note" },
    });
    (__VLS_ctx.selectedSubmission.student_no);
    (__VLS_ctx.selectedSubmission.class_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "section-note" },
    });
    (__VLS_ctx.formatDateTime(__VLS_ctx.selectedSubmission.submitted_at));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "section-note" },
    });
    (__VLS_ctx.formatScoreText(__VLS_ctx.reviewScore));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    /** @type {[typeof RichTextContent, ]} */ ;
    // @ts-ignore
    const __VLS_474 = __VLS_asFunctionalComponent(RichTextContent, new RichTextContent({
        html: (__VLS_ctx.selectedSubmission.submission_note),
        emptyText: "学生没有填写作品说明。",
    }));
    const __VLS_475 = __VLS_474({
        html: (__VLS_ctx.selectedSubmission.submission_note),
        emptyText: "学生没有填写作品说明。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_474));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "content-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-panel-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    const __VLS_477 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_478 = __VLS_asFunctionalComponent(__VLS_477, new __VLS_477({
        round: true,
        type: "success",
    }));
    const __VLS_479 = __VLS_478({
        round: true,
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_478));
    __VLS_480.slots.default;
    (__VLS_ctx.selectedSubmission.files.length);
    var __VLS_480;
    if (!__VLS_ctx.selectedSubmission.files.length) {
        const __VLS_481 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_482 = __VLS_asFunctionalComponent(__VLS_481, new __VLS_481({
            description: "暂无附件",
        }));
        const __VLS_483 = __VLS_482({
            description: "暂无附件",
        }, ...__VLS_functionalComponentArgsRest(__VLS_482));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grading-file-list" },
        });
        for (const [file] of __VLS_getVForSourceType((__VLS_ctx.selectedSubmission.files))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedSubmission))
                            return;
                        if (!!(!__VLS_ctx.selectedSubmission.files.length))
                            return;
                        __VLS_ctx.loadGradingPreview(file);
                    } },
                key: (file.id),
                ...{ class: ([
                        'grading-file-card',
                        { 'grading-file-card-active': __VLS_ctx.gradingPreviewFileId === file.id },
                    ]) },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "grading-file-name" },
            });
            (file.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "grading-file-meta" },
            });
            (file.ext.toUpperCase());
            (file.size_kb);
            (__VLS_ctx.isFilePreviewable(file) ? ' · 可直接展示' : ' · 仅下载');
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grading-preview-stage" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isGradingPreviewLoading) }, null, null);
        if (!__VLS_ctx.isGradingPreviewLoading && __VLS_ctx.gradingPreviewKind === 'pdf' && __VLS_ctx.gradingPreviewUrl) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.iframe)({
                src: (__VLS_ctx.gradingPreviewUrl),
                ...{ class: "preview-frame" },
                title: "评分工作台附件预览",
            });
        }
        else if (!__VLS_ctx.isGradingPreviewLoading && __VLS_ctx.gradingPreviewKind === 'image' && __VLS_ctx.gradingPreviewUrl) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (__VLS_ctx.gradingPreviewUrl),
                alt: "评分工作台附件预览",
                ...{ class: "preview-image" },
            });
        }
        else if (!__VLS_ctx.isGradingPreviewLoading && __VLS_ctx.gradingPreviewKind === 'text') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                ...{ class: "preview-text" },
            });
            (__VLS_ctx.gradingPreviewText);
        }
        else if (__VLS_ctx.gradingPreviewFile) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grading-preview-fallback" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            const __VLS_485 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_486 = __VLS_asFunctionalComponent(__VLS_485, new __VLS_485({
                ...{ 'onClick': {} },
                type: "success",
            }));
            const __VLS_487 = __VLS_486({
                ...{ 'onClick': {} },
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_486));
            let __VLS_489;
            let __VLS_490;
            let __VLS_491;
            const __VLS_492 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedSubmission))
                        return;
                    if (!!(!__VLS_ctx.selectedSubmission.files.length))
                        return;
                    if (!!(!__VLS_ctx.isGradingPreviewLoading && __VLS_ctx.gradingPreviewKind === 'pdf' && __VLS_ctx.gradingPreviewUrl))
                        return;
                    if (!!(!__VLS_ctx.isGradingPreviewLoading && __VLS_ctx.gradingPreviewKind === 'image' && __VLS_ctx.gradingPreviewUrl))
                        return;
                    if (!!(!__VLS_ctx.isGradingPreviewLoading && __VLS_ctx.gradingPreviewKind === 'text'))
                        return;
                    if (!(__VLS_ctx.gradingPreviewFile))
                        return;
                    __VLS_ctx.downloadFile(__VLS_ctx.gradingPreviewFile);
                }
            };
            __VLS_488.slots.default;
            var __VLS_488;
        }
        else if (!__VLS_ctx.isGradingPreviewLoading) {
            const __VLS_493 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_494 = __VLS_asFunctionalComponent(__VLS_493, new __VLS_493({
                description: "请选择一个附件进行查看",
            }));
            const __VLS_495 = __VLS_494({
                description: "请选择一个附件进行查看",
            }, ...__VLS_functionalComponentArgsRest(__VLS_494));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "grading-sidebar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "template-panel" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isTemplateLoading) }, null, null);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-panel-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "template-panel-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "template-panel-note" },
    });
    const __VLS_497 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_498 = __VLS_asFunctionalComponent(__VLS_497, new __VLS_497({
        ...{ 'onClick': {} },
        text: true,
    }));
    const __VLS_499 = __VLS_498({
        ...{ 'onClick': {} },
        text: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_498));
    let __VLS_501;
    let __VLS_502;
    let __VLS_503;
    const __VLS_504 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedSubmission))
                return;
            __VLS_ctx.openTemplateManager('single');
        }
    };
    __VLS_500.slots.default;
    var __VLS_500;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-toolbar" },
    });
    const __VLS_505 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_506 = __VLS_asFunctionalComponent(__VLS_505, new __VLS_505({
        modelValue: (__VLS_ctx.selectedSingleTemplateId),
        ...{ class: "template-select" },
        clearable: true,
        filterable: true,
        placeholder: "选择单份评分模板",
    }));
    const __VLS_507 = __VLS_506({
        modelValue: (__VLS_ctx.selectedSingleTemplateId),
        ...{ class: "template-select" },
        clearable: true,
        filterable: true,
        placeholder: "选择单份评分模板",
    }, ...__VLS_functionalComponentArgsRest(__VLS_506));
    __VLS_508.slots.default;
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedReviewTemplates))) {
        const __VLS_509 = {}.ElOptionGroup;
        /** @type {[typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, typeof __VLS_components.ElOptionGroup, typeof __VLS_components.elOptionGroup, ]} */ ;
        // @ts-ignore
        const __VLS_510 = __VLS_asFunctionalComponent(__VLS_509, new __VLS_509({
            key: (`dialog-single-group-${group.key || 'ungrouped'}`),
            label: (group.label),
        }));
        const __VLS_511 = __VLS_510({
            key: (`dialog-single-group-${group.key || 'ungrouped'}`),
            label: (group.label),
        }, ...__VLS_functionalComponentArgsRest(__VLS_510));
        __VLS_512.slots.default;
        for (const [template] of __VLS_getVForSourceType((group.templates))) {
            const __VLS_513 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_514 = __VLS_asFunctionalComponent(__VLS_513, new __VLS_513({
                key: (template.id),
                label: (template.title),
                value: (template.id),
            }));
            const __VLS_515 = __VLS_514({
                key: (template.id),
                label: (template.title),
                value: (template.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_514));
            __VLS_516.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "template-option" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (template.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "template-option-score" },
            });
            (template.sort_order);
            (template.score === null ? ' · 仅评语' : ` · 建议等级 ${__VLS_ctx.formatScoreText(template.score)}`);
            var __VLS_516;
        }
        var __VLS_512;
    }
    var __VLS_508;
    const __VLS_517 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_518 = __VLS_asFunctionalComponent(__VLS_517, new __VLS_517({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.selectedSingleTemplateId),
        type: "primary",
        plain: true,
    }));
    const __VLS_519 = __VLS_518({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.selectedSingleTemplateId),
        type: "primary",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_518));
    let __VLS_521;
    let __VLS_522;
    let __VLS_523;
    const __VLS_524 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedSubmission))
                return;
            __VLS_ctx.applySelectedTemplate('single', 'replace');
        }
    };
    __VLS_520.slots.default;
    var __VLS_520;
    const __VLS_525 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_526 = __VLS_asFunctionalComponent(__VLS_525, new __VLS_525({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.selectedSingleTemplateId),
        plain: true,
    }));
    const __VLS_527 = __VLS_526({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.selectedSingleTemplateId),
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_526));
    let __VLS_529;
    let __VLS_530;
    let __VLS_531;
    const __VLS_532 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedSubmission))
                return;
            __VLS_ctx.applySelectedTemplate('single', 'insert');
        }
    };
    __VLS_528.slots.default;
    var __VLS_528;
    const __VLS_533 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_534 = __VLS_asFunctionalComponent(__VLS_533, new __VLS_533({
        labelPosition: "top",
    }));
    const __VLS_535 = __VLS_534({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_534));
    __VLS_536.slots.default;
    const __VLS_537 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_538 = __VLS_asFunctionalComponent(__VLS_537, new __VLS_537({
        label: "教师等级评分",
    }));
    const __VLS_539 = __VLS_538({
        label: "教师等级评分",
    }, ...__VLS_functionalComponentArgsRest(__VLS_538));
    __VLS_540.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grade-editor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grade-chip-grid" },
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.scoreGradeOptions))) {
        const __VLS_541 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_542 = __VLS_asFunctionalComponent(__VLS_541, new __VLS_541({
            ...{ 'onClick': {} },
            key: (`dialog-grade-${option.grade}`),
            disabled: (__VLS_ctx.isSaving),
            plain: (__VLS_ctx.reviewScore !== option.score),
            type: (__VLS_ctx.reviewScore === option.score ? 'primary' : undefined),
        }));
        const __VLS_543 = __VLS_542({
            ...{ 'onClick': {} },
            key: (`dialog-grade-${option.grade}`),
            disabled: (__VLS_ctx.isSaving),
            plain: (__VLS_ctx.reviewScore !== option.score),
            type: (__VLS_ctx.reviewScore === option.score ? 'primary' : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_542));
        let __VLS_545;
        let __VLS_546;
        let __VLS_547;
        const __VLS_548 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedSubmission))
                    return;
                __VLS_ctx.handleSingleScoreSelect(option.score);
            }
        };
        __VLS_544.slots.default;
        (option.grade);
        (option.score);
        var __VLS_544;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grade-editor-footer" },
    });
    const __VLS_549 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_550 = __VLS_asFunctionalComponent(__VLS_549, new __VLS_549({
        round: true,
        type: "success",
    }));
    const __VLS_551 = __VLS_550({
        round: true,
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_550));
    __VLS_552.slots.default;
    (__VLS_ctx.formatScoreHelperText(__VLS_ctx.reviewScore));
    var __VLS_552;
    const __VLS_553 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_554 = __VLS_asFunctionalComponent(__VLS_553, new __VLS_553({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.isSaving),
        text: true,
    }));
    const __VLS_555 = __VLS_554({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.isSaving),
        text: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_554));
    let __VLS_557;
    let __VLS_558;
    let __VLS_559;
    const __VLS_560 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedSubmission))
                return;
            __VLS_ctx.setTargetScore('single', null);
        }
    };
    __VLS_556.slots.default;
    var __VLS_556;
    var __VLS_540;
    const __VLS_561 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_562 = __VLS_asFunctionalComponent(__VLS_561, new __VLS_561({
        label: "教师评语",
    }));
    const __VLS_563 = __VLS_562({
        label: "教师评语",
    }, ...__VLS_functionalComponentArgsRest(__VLS_562));
    __VLS_564.slots.default;
    const __VLS_565 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_566 = __VLS_asFunctionalComponent(__VLS_565, new __VLS_565({
        modelValue: (__VLS_ctx.teacherComment),
        autosize: ({ minRows: 10, maxRows: 16 }),
        maxlength: "1000",
        placeholder: "写下本次作品的优点、修改建议或课堂反馈。",
        showWordLimit: true,
        type: "textarea",
    }));
    const __VLS_567 = __VLS_566({
        modelValue: (__VLS_ctx.teacherComment),
        autosize: ({ minRows: 10, maxRows: 16 }),
        maxlength: "1000",
        placeholder: "写下本次作品的优点、修改建议或课堂反馈。",
        showWordLimit: true,
        type: "textarea",
    }, ...__VLS_functionalComponentArgsRest(__VLS_566));
    var __VLS_564;
    var __VLS_536;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "section-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grading-sidebar-actions" },
    });
    const __VLS_569 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_570 = __VLS_asFunctionalComponent(__VLS_569, new __VLS_569({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.hasPreviousSubmission),
        plain: true,
    }));
    const __VLS_571 = __VLS_570({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.hasPreviousSubmission),
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_570));
    let __VLS_573;
    let __VLS_574;
    let __VLS_575;
    const __VLS_576 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedSubmission))
                return;
            __VLS_ctx.moveToRelativeSubmission('previous');
        }
    };
    __VLS_572.slots.default;
    var __VLS_572;
    const __VLS_577 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_578 = __VLS_asFunctionalComponent(__VLS_577, new __VLS_577({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.isSaving),
        type: "primary",
    }));
    const __VLS_579 = __VLS_578({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.isSaving),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_578));
    let __VLS_581;
    let __VLS_582;
    let __VLS_583;
    const __VLS_584 = {
        onClick: (__VLS_ctx.saveReview)
    };
    __VLS_580.slots.default;
    (__VLS_ctx.reviewSubmitButtonText);
    var __VLS_580;
}
var __VLS_433;
const __VLS_585 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_586 = __VLS_asFunctionalComponent(__VLS_585, new __VLS_585({
    modelValue: (__VLS_ctx.templateDialogVisible),
    title: "评分模板管理",
    destroyOnClose: true,
    width: "min(980px, 94vw)",
}));
const __VLS_587 = __VLS_586({
    modelValue: (__VLS_ctx.templateDialogVisible),
    title: "评分模板管理",
    destroyOnClose: true,
    width: "min(980px, 94vw)",
}, ...__VLS_functionalComponentArgsRest(__VLS_586));
__VLS_588.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-manager-shell" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isTemplateLoading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "template-manager-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-manager-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "template-manager-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "template-manager-note" },
});
const __VLS_589 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_590 = __VLS_asFunctionalComponent(__VLS_589, new __VLS_589({
    wrap: true,
}));
const __VLS_591 = __VLS_590({
    wrap: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_590));
__VLS_592.slots.default;
const __VLS_593 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_594 = __VLS_asFunctionalComponent(__VLS_593, new __VLS_593({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_595 = __VLS_594({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_594));
let __VLS_597;
let __VLS_598;
let __VLS_599;
const __VLS_600 = {
    onClick: (...[$event]) => {
        __VLS_ctx.startCreateTemplate('blank');
    }
};
__VLS_596.slots.default;
var __VLS_596;
const __VLS_601 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_602 = __VLS_asFunctionalComponent(__VLS_601, new __VLS_601({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
}));
const __VLS_603 = __VLS_602({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_602));
let __VLS_605;
let __VLS_606;
let __VLS_607;
const __VLS_608 = {
    onClick: (...[$event]) => {
        __VLS_ctx.startCreateTemplate(__VLS_ctx.templateDialogTarget);
    }
};
__VLS_604.slots.default;
var __VLS_604;
var __VLS_592;
if (!__VLS_ctx.reviewTemplates.length) {
    const __VLS_609 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_610 = __VLS_asFunctionalComponent(__VLS_609, new __VLS_609({
        description: "还没有评分模板，可从当前评分内容生成第一条模板。",
    }));
    const __VLS_611 = __VLS_610({
        description: "还没有评分模板，可从当前评分内容生成第一条模板。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_610));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "template-card-list" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedReviewTemplates))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            key: (`manager-group-${group.key || 'ungrouped'}`),
            ...{ class: "template-group-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "template-group-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "template-group-title" },
        });
        (group.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "template-group-note" },
        });
        (group.templates.length);
        for (const [template] of __VLS_getVForSourceType((group.templates))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (template.id),
                ...{ class: (['template-card', { 'template-card-active': __VLS_ctx.editingTemplateId === template.id }]) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "template-card-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "template-card-title" },
            });
            (template.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "template-meta-row" },
            });
            const __VLS_613 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_614 = __VLS_asFunctionalComponent(__VLS_613, new __VLS_613({
                round: true,
                type: "info",
            }));
            const __VLS_615 = __VLS_614({
                round: true,
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_614));
            __VLS_616.slots.default;
            (group.label);
            var __VLS_616;
            const __VLS_617 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_618 = __VLS_asFunctionalComponent(__VLS_617, new __VLS_617({
                round: true,
                type: "success",
            }));
            const __VLS_619 = __VLS_618({
                round: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_618));
            __VLS_620.slots.default;
            (template.sort_order);
            var __VLS_620;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "template-card-score" },
            });
            (template.score === null ? '仅评语模板' : `建议等级：${__VLS_ctx.formatScoreText(template.score)}`);
            const __VLS_621 = {}.ElSpace;
            /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
            // @ts-ignore
            const __VLS_622 = __VLS_asFunctionalComponent(__VLS_621, new __VLS_621({
                wrap: true,
            }));
            const __VLS_623 = __VLS_622({
                wrap: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_622));
            __VLS_624.slots.default;
            const __VLS_625 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_626 = __VLS_asFunctionalComponent(__VLS_625, new __VLS_625({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.canMoveTemplate(template.id, 'up') || __VLS_ctx.isTemplateSaving),
                loading: (__VLS_ctx.movingTemplateId === template.id && __VLS_ctx.isTemplateSaving),
                link: true,
            }));
            const __VLS_627 = __VLS_626({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.canMoveTemplate(template.id, 'up') || __VLS_ctx.isTemplateSaving),
                loading: (__VLS_ctx.movingTemplateId === template.id && __VLS_ctx.isTemplateSaving),
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_626));
            let __VLS_629;
            let __VLS_630;
            let __VLS_631;
            const __VLS_632 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.reviewTemplates.length))
                        return;
                    __VLS_ctx.moveTemplate(template.id, 'up');
                }
            };
            __VLS_628.slots.default;
            var __VLS_628;
            const __VLS_633 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_634 = __VLS_asFunctionalComponent(__VLS_633, new __VLS_633({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.canMoveTemplate(template.id, 'down') || __VLS_ctx.isTemplateSaving),
                loading: (__VLS_ctx.movingTemplateId === template.id && __VLS_ctx.isTemplateSaving),
                link: true,
            }));
            const __VLS_635 = __VLS_634({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.canMoveTemplate(template.id, 'down') || __VLS_ctx.isTemplateSaving),
                loading: (__VLS_ctx.movingTemplateId === template.id && __VLS_ctx.isTemplateSaving),
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_634));
            let __VLS_637;
            let __VLS_638;
            let __VLS_639;
            const __VLS_640 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.reviewTemplates.length))
                        return;
                    __VLS_ctx.moveTemplate(template.id, 'down');
                }
            };
            __VLS_636.slots.default;
            var __VLS_636;
            const __VLS_641 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_642 = __VLS_asFunctionalComponent(__VLS_641, new __VLS_641({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_643 = __VLS_642({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_642));
            let __VLS_645;
            let __VLS_646;
            let __VLS_647;
            const __VLS_648 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.reviewTemplates.length))
                        return;
                    __VLS_ctx.applyTemplate(template.id, 'single', 'replace');
                }
            };
            __VLS_644.slots.default;
            var __VLS_644;
            const __VLS_649 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_650 = __VLS_asFunctionalComponent(__VLS_649, new __VLS_649({
                ...{ 'onClick': {} },
                link: true,
                type: "success",
            }));
            const __VLS_651 = __VLS_650({
                ...{ 'onClick': {} },
                link: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_650));
            let __VLS_653;
            let __VLS_654;
            let __VLS_655;
            const __VLS_656 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.reviewTemplates.length))
                        return;
                    __VLS_ctx.applyTemplate(template.id, 'batch', 'replace');
                }
            };
            __VLS_652.slots.default;
            var __VLS_652;
            const __VLS_657 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_658 = __VLS_asFunctionalComponent(__VLS_657, new __VLS_657({
                ...{ 'onClick': {} },
                link: true,
            }));
            const __VLS_659 = __VLS_658({
                ...{ 'onClick': {} },
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_658));
            let __VLS_661;
            let __VLS_662;
            let __VLS_663;
            const __VLS_664 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.reviewTemplates.length))
                        return;
                    __VLS_ctx.startEditTemplate(template.id);
                }
            };
            __VLS_660.slots.default;
            var __VLS_660;
            const __VLS_665 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_666 = __VLS_asFunctionalComponent(__VLS_665, new __VLS_665({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_667 = __VLS_666({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_666));
            let __VLS_669;
            let __VLS_670;
            let __VLS_671;
            const __VLS_672 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.reviewTemplates.length))
                        return;
                    __VLS_ctx.deleteTemplate(template.id);
                }
            };
            __VLS_668.slots.default;
            var __VLS_668;
            var __VLS_624;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "template-card-comment" },
            });
            (template.comment || '该模板只设置推荐等级分。');
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "template-editor-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-panel-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "template-panel-title" },
});
(__VLS_ctx.editingTemplateId ? '编辑模板' : '新建模板');
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "template-panel-note" },
});
(__VLS_ctx.templateEditorHint);
if (__VLS_ctx.editingTemplateId ||
    __VLS_ctx.templateForm.title ||
    __VLS_ctx.templateForm.group_name ||
    __VLS_ctx.templateForm.comment ||
    __VLS_ctx.templateForm.score !== null ||
    __VLS_ctx.templateForm.sort_order !== null) {
    const __VLS_673 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_674 = __VLS_asFunctionalComponent(__VLS_673, new __VLS_673({
        ...{ 'onClick': {} },
        text: true,
    }));
    const __VLS_675 = __VLS_674({
        ...{ 'onClick': {} },
        text: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_674));
    let __VLS_677;
    let __VLS_678;
    let __VLS_679;
    const __VLS_680 = {
        onClick: (__VLS_ctx.resetTemplateEditor)
    };
    __VLS_676.slots.default;
    var __VLS_676;
}
const __VLS_681 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_682 = __VLS_asFunctionalComponent(__VLS_681, new __VLS_681({
    labelPosition: "top",
}));
const __VLS_683 = __VLS_682({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_682));
__VLS_684.slots.default;
const __VLS_685 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_686 = __VLS_asFunctionalComponent(__VLS_685, new __VLS_685({
    label: "模板名称",
}));
const __VLS_687 = __VLS_686({
    label: "模板名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_686));
__VLS_688.slots.default;
const __VLS_689 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_690 = __VLS_asFunctionalComponent(__VLS_689, new __VLS_689({
    modelValue: (__VLS_ctx.templateForm.title),
    maxlength: "30",
    placeholder: "例如：课堂展示完成度高",
    showWordLimit: true,
}));
const __VLS_691 = __VLS_690({
    modelValue: (__VLS_ctx.templateForm.title),
    maxlength: "30",
    placeholder: "例如：课堂展示完成度高",
    showWordLimit: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_690));
var __VLS_688;
const __VLS_693 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_694 = __VLS_asFunctionalComponent(__VLS_693, new __VLS_693({
    label: "模板分组",
}));
const __VLS_695 = __VLS_694({
    label: "模板分组",
}, ...__VLS_functionalComponentArgsRest(__VLS_694));
__VLS_696.slots.default;
const __VLS_697 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_698 = __VLS_asFunctionalComponent(__VLS_697, new __VLS_697({
    modelValue: (__VLS_ctx.templateForm.group_name),
    allowCreate: true,
    clearable: true,
    defaultFirstOption: true,
    filterable: true,
    placeholder: "例如：课堂表现 / 改进建议",
    ...{ style: {} },
}));
const __VLS_699 = __VLS_698({
    modelValue: (__VLS_ctx.templateForm.group_name),
    allowCreate: true,
    clearable: true,
    defaultFirstOption: true,
    filterable: true,
    placeholder: "例如：课堂表现 / 改进建议",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_698));
__VLS_700.slots.default;
for (const [groupName] of __VLS_getVForSourceType((__VLS_ctx.groupNameOptions))) {
    const __VLS_701 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_702 = __VLS_asFunctionalComponent(__VLS_701, new __VLS_701({
        key: (groupName),
        label: (groupName),
        value: (groupName),
    }));
    const __VLS_703 = __VLS_702({
        key: (groupName),
        label: (groupName),
        value: (groupName),
    }, ...__VLS_functionalComponentArgsRest(__VLS_702));
}
var __VLS_700;
var __VLS_696;
const __VLS_705 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_706 = __VLS_asFunctionalComponent(__VLS_705, new __VLS_705({
    label: "排序值",
}));
const __VLS_707 = __VLS_706({
    label: "排序值",
}, ...__VLS_functionalComponentArgsRest(__VLS_706));
__VLS_708.slots.default;
const __VLS_709 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_710 = __VLS_asFunctionalComponent(__VLS_709, new __VLS_709({
    modelValue: (__VLS_ctx.templateForm.sort_order),
    max: (9999),
    min: (0),
    controlsPosition: "right",
    placeholder: "留空则自动排到组内末尾",
    ...{ style: {} },
}));
const __VLS_711 = __VLS_710({
    modelValue: (__VLS_ctx.templateForm.sort_order),
    max: (9999),
    min: (0),
    controlsPosition: "right",
    placeholder: "留空则自动排到组内末尾",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_710));
var __VLS_708;
const __VLS_713 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_714 = __VLS_asFunctionalComponent(__VLS_713, new __VLS_713({
    label: "推荐等级分",
}));
const __VLS_715 = __VLS_714({
    label: "推荐等级分",
}, ...__VLS_functionalComponentArgsRest(__VLS_714));
__VLS_716.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grade-editor" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grade-chip-grid" },
});
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.scoreGradeOptions))) {
    const __VLS_717 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_718 = __VLS_asFunctionalComponent(__VLS_717, new __VLS_717({
        ...{ 'onClick': {} },
        key: (`template-grade-${option.grade}`),
        plain: (__VLS_ctx.templateForm.score !== option.score),
        type: (__VLS_ctx.templateForm.score === option.score ? 'primary' : undefined),
    }));
    const __VLS_719 = __VLS_718({
        ...{ 'onClick': {} },
        key: (`template-grade-${option.grade}`),
        plain: (__VLS_ctx.templateForm.score !== option.score),
        type: (__VLS_ctx.templateForm.score === option.score ? 'primary' : undefined),
    }, ...__VLS_functionalComponentArgsRest(__VLS_718));
    let __VLS_721;
    let __VLS_722;
    let __VLS_723;
    const __VLS_724 = {
        onClick: (...[$event]) => {
            __VLS_ctx.templateForm.score = option.score;
        }
    };
    __VLS_720.slots.default;
    (option.grade);
    (option.score);
    var __VLS_720;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grade-editor-footer" },
});
const __VLS_725 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_726 = __VLS_asFunctionalComponent(__VLS_725, new __VLS_725({
    round: true,
    type: "success",
}));
const __VLS_727 = __VLS_726({
    round: true,
    type: "success",
}, ...__VLS_functionalComponentArgsRest(__VLS_726));
__VLS_728.slots.default;
(__VLS_ctx.formatScoreHelperText(__VLS_ctx.templateForm.score));
var __VLS_728;
const __VLS_729 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_730 = __VLS_asFunctionalComponent(__VLS_729, new __VLS_729({
    ...{ 'onClick': {} },
    text: true,
}));
const __VLS_731 = __VLS_730({
    ...{ 'onClick': {} },
    text: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_730));
let __VLS_733;
let __VLS_734;
let __VLS_735;
const __VLS_736 = {
    onClick: (...[$event]) => {
        __VLS_ctx.templateForm.score = null;
    }
};
__VLS_732.slots.default;
var __VLS_732;
const __VLS_737 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_738 = __VLS_asFunctionalComponent(__VLS_737, new __VLS_737({
    modelValue: (__VLS_ctx.templateForm.score),
    max: (__VLS_ctx.maxReviewScore),
    min: (0),
    controlsPosition: "right",
    placeholder: "可留空，支持 0-120",
    ...{ style: {} },
}));
const __VLS_739 = __VLS_738({
    modelValue: (__VLS_ctx.templateForm.score),
    max: (__VLS_ctx.maxReviewScore),
    min: (0),
    controlsPosition: "right",
    placeholder: "可留空，支持 0-120",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_738));
var __VLS_716;
const __VLS_741 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_742 = __VLS_asFunctionalComponent(__VLS_741, new __VLS_741({
    label: "模板评语",
}));
const __VLS_743 = __VLS_742({
    label: "模板评语",
}, ...__VLS_functionalComponentArgsRest(__VLS_742));
__VLS_744.slots.default;
const __VLS_745 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_746 = __VLS_asFunctionalComponent(__VLS_745, new __VLS_745({
    modelValue: (__VLS_ctx.templateForm.comment),
    autosize: ({ minRows: 6, maxRows: 10 }),
    maxlength: "1000",
    placeholder: "写入可复用的教师评语，支持一键套用或快捷插入。",
    showWordLimit: true,
    type: "textarea",
}));
const __VLS_747 = __VLS_746({
    modelValue: (__VLS_ctx.templateForm.comment),
    autosize: ({ minRows: 6, maxRows: 10 }),
    maxlength: "1000",
    placeholder: "写入可复用的教师评语，支持一键套用或快捷插入。",
    showWordLimit: true,
    type: "textarea",
}, ...__VLS_functionalComponentArgsRest(__VLS_746));
var __VLS_744;
var __VLS_684;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-editor-actions" },
});
const __VLS_749 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_750 = __VLS_asFunctionalComponent(__VLS_749, new __VLS_749({
    ...{ 'onClick': {} },
    plain: true,
}));
const __VLS_751 = __VLS_750({
    ...{ 'onClick': {} },
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_750));
let __VLS_753;
let __VLS_754;
let __VLS_755;
const __VLS_756 = {
    onClick: (__VLS_ctx.resetTemplateEditor)
};
__VLS_752.slots.default;
var __VLS_752;
const __VLS_757 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_758 = __VLS_asFunctionalComponent(__VLS_757, new __VLS_757({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isTemplateSaving),
    type: "primary",
}));
const __VLS_759 = __VLS_758({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.isTemplateSaving),
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_758));
let __VLS_761;
let __VLS_762;
let __VLS_763;
const __VLS_764 = {
    onClick: (__VLS_ctx.saveTemplate)
};
__VLS_760.slots.default;
(__VLS_ctx.editingTemplateId ? '保存模板修改' : '保存为新模板');
var __VLS_760;
var __VLS_588;
const __VLS_765 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_766 = __VLS_asFunctionalComponent(__VLS_765, new __VLS_765({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.previewDialogVisible),
    title: (__VLS_ctx.previewTitle),
    destroyOnClose: true,
    width: "min(960px, 92vw)",
}));
const __VLS_767 = __VLS_766({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.previewDialogVisible),
    title: (__VLS_ctx.previewTitle),
    destroyOnClose: true,
    width: "min(960px, 92vw)",
}, ...__VLS_functionalComponentArgsRest(__VLS_766));
let __VLS_769;
let __VLS_770;
let __VLS_771;
const __VLS_772 = {
    onClosed: (__VLS_ctx.resetPreviewState)
};
__VLS_768.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-shell" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isPreviewLoading) }, null, null);
if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'pdf' && __VLS_ctx.previewUrl) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.iframe)({
        src: (__VLS_ctx.previewUrl),
        ...{ class: "preview-frame" },
        title: "附件预览",
    });
}
else if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'image' && __VLS_ctx.previewUrl) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        src: (__VLS_ctx.previewUrl),
        alt: "附件预览",
        ...{ class: "preview-image" },
    });
}
else if (!__VLS_ctx.isPreviewLoading && __VLS_ctx.previewKind === 'text') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "preview-text" },
    });
    (__VLS_ctx.previewText);
}
else if (!__VLS_ctx.isPreviewLoading) {
    const __VLS_773 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_774 = __VLS_asFunctionalComponent(__VLS_773, new __VLS_773({
        description: "当前文件暂不支持在线预览，请直接下载查看。",
    }));
    const __VLS_775 = __VLS_774({
        description: "当前文件暂不支持在线预览，请直接下载查看。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_774));
}
var __VLS_768;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
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
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-header']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-title']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['template-select']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option-score']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-comment-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
/** @type {__VLS_StyleScopedClasses['template-empty-note']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-form']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-chip-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['table-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['student-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-main']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['template-select']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option-score']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-comment-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-label']} */ ;
/** @type {__VLS_StyleScopedClasses['template-empty-note']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-chip-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['save-button']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-dialog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-note']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-preview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['student-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['content-block']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-list']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-preview-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-image']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-text']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-preview-fallback']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['template-select']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option']} */ ;
/** @type {__VLS_StyleScopedClasses['template-option-score']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-chip-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['grading-sidebar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-list']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-manager-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-list']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-section']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-group-note']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-meta-row']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-score']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card-comment']} */ ;
/** @type {__VLS_StyleScopedClasses['template-editor-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['template-panel-note']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-chip-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grade-editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['template-editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-image']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-text']} */ ;
// @ts-ignore
var __VLS_226 = __VLS_225;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RecommendedWorksShowcase: RecommendedWorksShowcase,
            RichTextContent: RichTextContent,
            maxReviewScore: maxReviewScore,
            scoreGradeOptions: scoreGradeOptions,
            route: route,
            router: router,
            authStore: authStore,
            tableRef: tableRef,
            taskData: taskData,
            reviewScore: reviewScore,
            teacherComment: teacherComment,
            batchReviewScore: batchReviewScore,
            batchTeacherComment: batchTeacherComment,
            onlyPendingSubmissions: onlyPendingSubmissions,
            selectedClassName: selectedClassName,
            isLoading: isLoading,
            isSaving: isSaving,
            isBatchSaving: isBatchSaving,
            isBatchDownloading: isBatchDownloading,
            errorMessage: errorMessage,
            gradingDialogVisible: gradingDialogVisible,
            previewDialogVisible: previewDialogVisible,
            previewTitle: previewTitle,
            previewKind: previewKind,
            previewUrl: previewUrl,
            previewText: previewText,
            isPreviewLoading: isPreviewLoading,
            previewLoadingFileId: previewLoadingFileId,
            downloadLoadingFileId: downloadLoadingFileId,
            gradingPreviewFileId: gradingPreviewFileId,
            gradingPreviewKind: gradingPreviewKind,
            gradingPreviewUrl: gradingPreviewUrl,
            gradingPreviewText: gradingPreviewText,
            isGradingPreviewLoading: isGradingPreviewLoading,
            reviewTemplates: reviewTemplates,
            selectedSingleTemplateId: selectedSingleTemplateId,
            selectedBatchTemplateId: selectedBatchTemplateId,
            isTemplateLoading: isTemplateLoading,
            isTemplateSaving: isTemplateSaving,
            movingTemplateId: movingTemplateId,
            templateDialogVisible: templateDialogVisible,
            templateDialogTarget: templateDialogTarget,
            editingTemplateId: editingTemplateId,
            templateForm: templateForm,
            classOptions: classOptions,
            selectedSubmission: selectedSubmission,
            filteredItems: filteredItems,
            selectedSubmissionCount: selectedSubmissionCount,
            hasPreviousSubmission: hasPreviousSubmission,
            hasNextSubmission: hasNextSubmission,
            selectedSubmissionProgressText: selectedSubmissionProgressText,
            gradingPreviewFile: gradingPreviewFile,
            reviewSubmitButtonText: reviewSubmitButtonText,
            groupNameOptions: groupNameOptions,
            groupedReviewTemplates: groupedReviewTemplates,
            quickTemplateGroups: quickTemplateGroups,
            templateEditorHint: templateEditorHint,
            statusLabel: statusLabel,
            statusTagType: statusTagType,
            formatDateTime: formatDateTime,
            formatScoreText: formatScoreText,
            formatScoreHelperText: formatScoreHelperText,
            rowClassName: rowClassName,
            setTargetScore: setTargetScore,
            handleSingleScoreSelect: handleSingleScoreSelect,
            applyTemplate: applyTemplate,
            applySelectedTemplate: applySelectedTemplate,
            openTemplateManager: openTemplateManager,
            resetTemplateEditor: resetTemplateEditor,
            startCreateTemplate: startCreateTemplate,
            saveCurrentAsTemplate: saveCurrentAsTemplate,
            startEditTemplate: startEditTemplate,
            saveTemplate: saveTemplate,
            deleteTemplate: deleteTemplate,
            canMoveTemplate: canMoveTemplate,
            moveTemplate: moveTemplate,
            isFilePreviewable: isFilePreviewable,
            resetFilters: resetFilters,
            clearBatchSelection: clearBatchSelection,
            resetPreviewState: resetPreviewState,
            resetGradingPreviewState: resetGradingPreviewState,
            moveToRelativeSubmission: moveToRelativeSubmission,
            openGradingWorkspace: openGradingWorkspace,
            handleCurrentChange: handleCurrentChange,
            handleRowClick: handleRowClick,
            handleSelectionChange: handleSelectionChange,
            loadGradingPreview: loadGradingPreview,
            loadTaskDetail: loadTaskDetail,
            saveReview: saveReview,
            saveBatchReview: saveBatchReview,
            downloadBatchFiles: downloadBatchFiles,
            previewFile: previewFile,
            downloadFile: downloadFile,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
