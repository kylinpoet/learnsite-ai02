/// <reference types="../../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { apiDelete, apiGet, apiGetBlob, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const driveData = ref(null);
const activeTab = ref('personal');
const isLoading = ref(true);
const isUploading = ref(false);
const downloadingFileId = ref(null);
const deletingFileId = ref(null);
const errorMessage = ref('');
const selectedFiles = ref([]);
const fileInputRef = ref(null);
const isGroupTab = computed(() => activeTab.value === 'group');
const personalSpace = computed(() => driveData.value?.personal_space || null);
const groupSpace = computed(() => driveData.value?.group_space || null);
const currentSpace = computed(() => {
    if (isGroupTab.value) {
        return groupSpace.value?.enabled ? groupSpace.value : null;
    }
    return personalSpace.value;
});
const canUseCurrentSpace = computed(() => !isGroupTab.value || Boolean(groupSpace.value?.enabled));
const pageTitle = computed(() => {
    if (currentSpace.value) {
        return currentSpace.value.display_name;
    }
    return isGroupTab.value ? '小组共享网盘' : '我的个人网盘';
});
const groupDeleteRoleLabel = computed(() => (groupSpace.value?.my_role === 'leader' ? '组长管理' : '仅可删除自己上传'));
const groupDeleteRuleText = computed(() => {
    if (!groupSpace.value?.enabled) {
        return '当前还没有可用的小组共享空间。';
    }
    if (groupSpace.value.my_role === 'leader') {
        return '你当前是组长，可以删除本组全部共享文件。';
    }
    return '你可以上传、下载，并删除自己上传的共享文件。';
});
const heroCopy = computed(() => {
    if (isGroupTab.value) {
        if (groupSpace.value?.enabled) {
            return `${groupSpace.value.group_name} · ${groupSpace.value.class_name}，当前组员共享同一份资料空间。${groupDeleteRuleText.value}`;
        }
        return '当前还没有可用的小组共享空间，可先去小组页查看分组信息。';
    }
    return '这里用于保存你的个人学习资料，支持上传、下载和删除自己的网盘文件。';
});
const currentUploadLabel = computed(() => isGroupTab.value
    ? `上传到小组网盘${selectedFiles.value.length ? ` (${selectedFiles.value.length})` : ''}`
    : `上传到个人网盘${selectedFiles.value.length ? ` (${selectedFiles.value.length})` : ''}`);
const currentSpaceNote = computed(() => {
    if (isGroupTab.value) {
        return `组员共享同一份文件列表。${groupDeleteRuleText.value}`;
    }
    return '支持上传、下载和删除。当前先不做文件夹层级。';
});
const currentEmptyDescription = computed(() => isGroupTab.value ? '小组网盘还是空的，先上传一份协作资料吧。' : '个人网盘还是空的，先上传一个文件吧。');
function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${bytes} B`;
}
function formatDateTime(value) {
    if (!value) {
        return '暂无记录';
    }
    return value.replace('T', ' ').slice(0, 16);
}
function roleLabel(role) {
    if (role === 'leader') {
        return '组长';
    }
    if (role === 'member') {
        return '组员';
    }
    return role || '未分配';
}
function selectedFileKey(file) {
    return `${file.name}-${file.size}-${file.lastModified}`;
}
function isCurrentUserUploader(file) {
    return Number(authStore.user?.id || 0) === file.uploaded_by_user_id;
}
function openFilePicker() {
    if (!canUseCurrentSpace.value) {
        return;
    }
    fileInputRef.value?.click();
}
function handleFileChange(event) {
    const input = event.target;
    selectedFiles.value = Array.from(input.files || []);
}
function clearSelectedFiles() {
    selectedFiles.value = [];
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}
function removeSelectedFile(fileName) {
    selectedFiles.value = selectedFiles.value.filter((file) => file.name !== fileName);
    if (!selectedFiles.value.length && fileInputRef.value) {
        fileInputRef.value.value = '';
    }
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
function syncTabFromRoute() {
    activeTab.value = route.query.tab === 'group' ? 'group' : 'personal';
}
function resolveDriveErrorMessage(error) {
    if (!(error instanceof Error)) {
        return '加载网盘失败';
    }
    if (error.message.trim() === 'Not Found') {
        return '当前后端尚未加载网盘接口，请重启本地 API 服务后再试。';
    }
    return error.message;
}
async function loadDrive() {
    if (!authStore.token) {
        errorMessage.value = '请先登录学生账号';
        isLoading.value = false;
        return;
    }
    isLoading.value = true;
    errorMessage.value = '';
    try {
        driveData.value = await apiGet('/drives/me', authStore.token);
    }
    catch (error) {
        errorMessage.value = resolveDriveErrorMessage(error);
    }
    finally {
        isLoading.value = false;
    }
}
async function uploadSelectedFiles() {
    if (!authStore.token || !selectedFiles.value.length || !canUseCurrentSpace.value) {
        return;
    }
    const formData = new FormData();
    selectedFiles.value.forEach((file) => {
        formData.append('files', file);
    });
    isUploading.value = true;
    errorMessage.value = '';
    try {
        const path = isGroupTab.value ? '/drives/group/files' : '/drives/me/files';
        driveData.value = await apiUpload(path, formData, authStore.token);
        clearSelectedFiles();
        ElMessage.success(isGroupTab.value ? '文件已上传到小组网盘' : '文件已上传到个人网盘');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '上传文件失败';
    }
    finally {
        isUploading.value = false;
    }
}
async function downloadFile(file) {
    if (!authStore.token) {
        return;
    }
    downloadingFileId.value = file.id;
    errorMessage.value = '';
    try {
        const response = await apiGetBlob(`/drives/files/${file.id}`, authStore.token);
        const blob = await response.blob();
        triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '下载文件失败';
    }
    finally {
        downloadingFileId.value = null;
    }
}
async function deleteFile(file) {
    if (!authStore.token || !file.can_delete) {
        return;
    }
    try {
        await ElMessageBox.confirm(`确定要删除“${file.name}”吗？删除后无法恢复。`, '删除网盘文件', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    deletingFileId.value = file.id;
    errorMessage.value = '';
    try {
        driveData.value = await apiDelete(`/drives/files/${file.id}`, authStore.token);
        ElMessage.success('文件已删除');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : '删除文件失败';
    }
    finally {
        deletingFileId.value = null;
    }
}
function handleTabChange() {
    clearSelectedFiles();
    void router.replace({
        path: '/student/drive',
        query: activeTab.value === 'group' ? { tab: 'group' } : {},
    });
}
async function goToGroups() {
    await router.push('/student/groups');
}
watch(() => route.query.tab, () => {
    syncTabFromRoute();
}, { immediate: true });
onMounted(() => {
    void loadDrive();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['toolbar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-files-title']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['table-note']} */ ;
/** @type {__VLS_StyleScopedClasses['action-note']} */ ;
/** @type {__VLS_StyleScopedClasses['group-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
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
(__VLS_ctx.pageTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hero-copy" },
});
(__VLS_ctx.heroCopy);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "action-group" },
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
    onClick: (__VLS_ctx.loadDrive)
};
__VLS_3.slots.default;
var __VLS_3;
const __VLS_8 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.canUseCurrentSpace),
    plain: true,
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.canUseCurrentSpace),
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.openFilePicker)
};
__VLS_11.slots.default;
var __VLS_11;
if (__VLS_ctx.selectedFiles.length) {
    const __VLS_16 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.canUseCurrentSpace),
        loading: (__VLS_ctx.isUploading),
        type: "success",
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onClick': {} },
        disabled: (!__VLS_ctx.canUseCurrentSpace),
        loading: (__VLS_ctx.isUploading),
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onClick: (__VLS_ctx.uploadSelectedFiles)
    };
    __VLS_19.slots.default;
    (__VLS_ctx.currentUploadLabel);
    var __VLS_19;
}
if (__VLS_ctx.selectedFiles.length) {
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.isUploading),
        plain: true,
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        disabled: (__VLS_ctx.isUploading),
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (__VLS_ctx.clearSelectedFiles)
    };
    __VLS_27.slots.default;
    var __VLS_27;
}
if (__VLS_ctx.errorMessage) {
    const __VLS_32 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }));
    const __VLS_34 = __VLS_33({
        closable: (false),
        title: (__VLS_ctx.errorMessage),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
const __VLS_36 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onTabChange': {} },
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_38 = __VLS_37({
    ...{ 'onTabChange': {} },
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onTabChange: (__VLS_ctx.handleTabChange)
};
__VLS_39.slots.default;
const __VLS_44 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "我的网盘",
    name: "personal",
}));
const __VLS_46 = __VLS_45({
    label: "我的网盘",
    name: "personal",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
const __VLS_48 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "小组网盘",
    name: "group",
}));
const __VLS_50 = __VLS_49({
    label: "小组网盘",
    name: "group",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
var __VLS_39;
const __VLS_52 = {}.ElSkeleton;
/** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}));
const __VLS_54 = __VLS_53({
    loading: (__VLS_ctx.isLoading),
    animated: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { template: __VLS_thisSlot } = __VLS_55.slots;
    const __VLS_56 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ class: "soft-card" },
    }));
    const __VLS_58 = __VLS_57({
        ...{ class: "soft-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        rows: (8),
    }));
    const __VLS_62 = __VLS_61({
        rows: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_59;
}
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    if (__VLS_ctx.currentSpace && __VLS_ctx.canUseCurrentSpace) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-stack" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "metric-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value" },
        });
        (__VLS_ctx.currentSpace.file_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.formatBytes(__VLS_ctx.currentSpace.used_bytes));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        (__VLS_ctx.formatBytes(__VLS_ctx.currentSpace.remaining_bytes));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.currentSpace.quota_mb);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "mini-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-value metric-value--small" },
        });
        (__VLS_ctx.currentSpace.usage_percent);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "metric-note" },
        });
        if (__VLS_ctx.isGroupTab && __VLS_ctx.groupSpace?.enabled) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                ...{ class: "mini-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "metric-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "metric-value" },
            });
            (__VLS_ctx.groupSpace.member_count);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "metric-note" },
            });
            (__VLS_ctx.roleLabel(__VLS_ctx.groupSpace.my_role));
            (__VLS_ctx.groupSpace.class_name || '当前班级');
        }
        if (__VLS_ctx.isGroupTab && __VLS_ctx.groupSpace?.enabled) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                ...{ class: "mini-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "metric-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "metric-value metric-value--small" },
            });
            (__VLS_ctx.groupDeleteRoleLabel);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "metric-note" },
            });
            (__VLS_ctx.groupDeleteRuleText);
        }
        const __VLS_64 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ class: "soft-card" },
        }));
        const __VLS_66 = __VLS_65({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_67.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_68 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                round: true,
                type: (__VLS_ctx.isGroupTab ? 'warning' : 'success'),
            }));
            const __VLS_70 = __VLS_69({
                round: true,
                type: (__VLS_ctx.isGroupTab ? 'warning' : 'success'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            __VLS_71.slots.default;
            (__VLS_ctx.currentSpace.display_name);
            var __VLS_71;
        }
        const __VLS_72 = {}.ElProgress;
        /** @type {[typeof __VLS_components.ElProgress, typeof __VLS_components.elProgress, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            percentage: (Math.min(__VLS_ctx.currentSpace.usage_percent, 100)),
            strokeWidth: (18),
            status: "success",
        }));
        const __VLS_74 = __VLS_73({
            percentage: (Math.min(__VLS_ctx.currentSpace.usage_percent, 100)),
            strokeWidth: (18),
            status: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "section-note" },
        });
        (__VLS_ctx.formatBytes(__VLS_ctx.currentSpace.used_bytes));
        (__VLS_ctx.currentSpace.quota_mb);
        if (__VLS_ctx.isGroupTab && __VLS_ctx.groupSpace?.enabled) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.groupSpace.member_count);
        }
        var __VLS_67;
        const __VLS_76 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            ...{ class: "soft-card" },
        }));
        const __VLS_78 = __VLS_77({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_79.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toolbar-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-note" },
            });
            (__VLS_ctx.currentSpaceNote);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "action-group compact-actions" },
            });
            const __VLS_80 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.canUseCurrentSpace),
                plain: true,
            }));
            const __VLS_82 = __VLS_81({
                ...{ 'onClick': {} },
                disabled: (!__VLS_ctx.canUseCurrentSpace),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            let __VLS_84;
            let __VLS_85;
            let __VLS_86;
            const __VLS_87 = {
                onClick: (__VLS_ctx.openFilePicker)
            };
            __VLS_83.slots.default;
            var __VLS_83;
            if (__VLS_ctx.selectedFiles.length) {
                const __VLS_88 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                    ...{ 'onClick': {} },
                    disabled: (!__VLS_ctx.canUseCurrentSpace),
                    loading: (__VLS_ctx.isUploading),
                    type: "primary",
                }));
                const __VLS_90 = __VLS_89({
                    ...{ 'onClick': {} },
                    disabled: (!__VLS_ctx.canUseCurrentSpace),
                    loading: (__VLS_ctx.isUploading),
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_89));
                let __VLS_92;
                let __VLS_93;
                let __VLS_94;
                const __VLS_95 = {
                    onClick: (__VLS_ctx.uploadSelectedFiles)
                };
                __VLS_91.slots.default;
                (__VLS_ctx.currentUploadLabel);
                var __VLS_91;
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (__VLS_ctx.handleFileChange) },
            ref: "fileInputRef",
            ...{ class: "file-input" },
            multiple: true,
            type: "file",
        });
        /** @type {typeof __VLS_ctx.fileInputRef} */ ;
        if (__VLS_ctx.selectedFiles.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "selected-files-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "selected-files-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stack-list" },
            });
            for (const [file] of __VLS_getVForSourceType((__VLS_ctx.selectedFiles))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (__VLS_ctx.selectedFileKey(file)),
                    ...{ class: "file-item" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "file-name" },
                });
                (file.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "file-meta" },
                });
                (__VLS_ctx.formatBytes(file.size));
                const __VLS_96 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }));
                const __VLS_98 = __VLS_97({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_97));
                let __VLS_100;
                let __VLS_101;
                let __VLS_102;
                const __VLS_103 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.currentSpace && __VLS_ctx.canUseCurrentSpace))
                            return;
                        if (!(__VLS_ctx.selectedFiles.length))
                            return;
                        __VLS_ctx.removeSelectedFile(file.name);
                    }
                };
                __VLS_99.slots.default;
                var __VLS_99;
            }
        }
        if (!__VLS_ctx.currentSpace.files.length) {
            const __VLS_104 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                description: (__VLS_ctx.currentEmptyDescription),
            }));
            const __VLS_106 = __VLS_105({
                description: (__VLS_ctx.currentEmptyDescription),
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        }
        else {
            const __VLS_108 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                data: (__VLS_ctx.currentSpace.files),
                stripe: true,
            }));
            const __VLS_110 = __VLS_109({
                data: (__VLS_ctx.currentSpace.files),
                stripe: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            const __VLS_112 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                label: "文件名",
                minWidth: "280",
            }));
            const __VLS_114 = __VLS_113({
                label: "文件名",
                minWidth: "280",
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
            __VLS_115.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_115.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (row.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "table-note" },
                });
                (row.original_name !== row.name ? `原始文件名：${row.original_name}` : '已按当前名称保存');
            }
            var __VLS_115;
            const __VLS_116 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                label: "上传者",
                minWidth: "170",
            }));
            const __VLS_118 = __VLS_117({
                label: "上传者",
                minWidth: "170",
            }, ...__VLS_functionalComponentArgsRest(__VLS_117));
            __VLS_119.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_119.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (row.uploaded_by_name || '未知成员');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "table-note" },
                });
                (row.uploaded_by_student_no || '暂无学号');
                if (__VLS_ctx.isCurrentUserUploader(row)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
            }
            var __VLS_119;
            const __VLS_120 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
                label: "类型",
                minWidth: "100",
            }));
            const __VLS_122 = __VLS_121({
                label: "类型",
                minWidth: "100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_121));
            __VLS_123.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_123.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.ext.toUpperCase());
            }
            var __VLS_123;
            const __VLS_124 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                label: "大小",
                minWidth: "120",
            }));
            const __VLS_126 = __VLS_125({
                label: "大小",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
            __VLS_127.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_127.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (__VLS_ctx.formatBytes(row.size_bytes));
            }
            var __VLS_127;
            const __VLS_128 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
                label: "更新时间",
                minWidth: "170",
            }));
            const __VLS_130 = __VLS_129({
                label: "更新时间",
                minWidth: "170",
            }, ...__VLS_functionalComponentArgsRest(__VLS_129));
            __VLS_131.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_131.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (__VLS_ctx.formatDateTime(row.updated_at));
            }
            var __VLS_131;
            const __VLS_132 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                label: "操作",
                minWidth: "210",
                fixed: "right",
            }));
            const __VLS_134 = __VLS_133({
                label: "操作",
                minWidth: "210",
                fixed: "right",
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            __VLS_135.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_135.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "row-actions" },
                });
                const __VLS_136 = {}.ElSpace;
                /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
                // @ts-ignore
                const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                    wrap: true,
                }));
                const __VLS_138 = __VLS_137({
                    wrap: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_137));
                __VLS_139.slots.default;
                const __VLS_140 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                    ...{ 'onClick': {} },
                    loading: (__VLS_ctx.downloadingFileId === row.id),
                    link: true,
                    type: "primary",
                }));
                const __VLS_142 = __VLS_141({
                    ...{ 'onClick': {} },
                    loading: (__VLS_ctx.downloadingFileId === row.id),
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_141));
                let __VLS_144;
                let __VLS_145;
                let __VLS_146;
                const __VLS_147 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.currentSpace && __VLS_ctx.canUseCurrentSpace))
                            return;
                        if (!!(!__VLS_ctx.currentSpace.files.length))
                            return;
                        __VLS_ctx.downloadFile(row);
                    }
                };
                __VLS_143.slots.default;
                var __VLS_143;
                const __VLS_148 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                    ...{ 'onClick': {} },
                    disabled: (!row.can_delete),
                    loading: (__VLS_ctx.deletingFileId === row.id),
                    link: true,
                    type: "danger",
                }));
                const __VLS_150 = __VLS_149({
                    ...{ 'onClick': {} },
                    disabled: (!row.can_delete),
                    loading: (__VLS_ctx.deletingFileId === row.id),
                    link: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_149));
                let __VLS_152;
                let __VLS_153;
                let __VLS_154;
                const __VLS_155 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.currentSpace && __VLS_ctx.canUseCurrentSpace))
                            return;
                        if (!!(!__VLS_ctx.currentSpace.files.length))
                            return;
                        __VLS_ctx.deleteFile(row);
                    }
                };
                __VLS_151.slots.default;
                var __VLS_151;
                var __VLS_139;
                if (__VLS_ctx.isGroupTab && !row.can_delete) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "action-note" },
                    });
                }
            }
            var __VLS_135;
            var __VLS_111;
        }
        var __VLS_79;
    }
    else {
        const __VLS_156 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            ...{ class: "soft-card" },
        }));
        const __VLS_158 = __VLS_157({
            ...{ class: "soft-card" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        __VLS_159.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_159.slots;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-placeholder" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.groupSpace?.message || '当前还没有可用的小组空间。');
        const __VLS_160 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            ...{ 'onClick': {} },
            plain: true,
        }));
        const __VLS_162 = __VLS_161({
            ...{ 'onClick': {} },
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        let __VLS_164;
        let __VLS_165;
        let __VLS_166;
        const __VLS_167 = {
            onClick: (__VLS_ctx.goToGroups)
        };
        __VLS_163.slots.default;
        var __VLS_163;
        var __VLS_159;
    }
}
var __VLS_55;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-label']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-value--small']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['info-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['file-input']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-files-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-files-title']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-list']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['table-note']} */ ;
/** @type {__VLS_StyleScopedClasses['table-note']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['action-note']} */ ;
/** @type {__VLS_StyleScopedClasses['soft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['group-placeholder']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            activeTab: activeTab,
            isLoading: isLoading,
            isUploading: isUploading,
            downloadingFileId: downloadingFileId,
            deletingFileId: deletingFileId,
            errorMessage: errorMessage,
            selectedFiles: selectedFiles,
            fileInputRef: fileInputRef,
            isGroupTab: isGroupTab,
            groupSpace: groupSpace,
            currentSpace: currentSpace,
            canUseCurrentSpace: canUseCurrentSpace,
            pageTitle: pageTitle,
            groupDeleteRoleLabel: groupDeleteRoleLabel,
            groupDeleteRuleText: groupDeleteRuleText,
            heroCopy: heroCopy,
            currentUploadLabel: currentUploadLabel,
            currentSpaceNote: currentSpaceNote,
            currentEmptyDescription: currentEmptyDescription,
            formatBytes: formatBytes,
            formatDateTime: formatDateTime,
            roleLabel: roleLabel,
            selectedFileKey: selectedFileKey,
            isCurrentUserUploader: isCurrentUserUploader,
            openFilePicker: openFilePicker,
            handleFileChange: handleFileChange,
            clearSelectedFiles: clearSelectedFiles,
            removeSelectedFile: removeSelectedFile,
            loadDrive: loadDrive,
            uploadSelectedFiles: uploadSelectedFiles,
            downloadFile: downloadFile,
            deleteFile: deleteFile,
            handleTabChange: handleTabChange,
            goToGroups: goToGroups,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
