import { computed, ref } from 'vue';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import type {
  AIProviderModelDiscoveryResult,
  AIProviderRecord,
  AssistantPromptSettings,
  AssistantRuntimeSettings,
  BootstrapPayload,
  PromotionPreviewPayload,
} from '../adminTypes';

export const AI_PROVIDER_CONFIG_UPDATED_EVENT = 'learnsite:ai-provider-config-updated';
export const ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT = 'learnsite:assistant-runtime-config-updated';

export type SystemFormState = {
  platform_name: string;
  school_name: string;
  active_grade_nos: number[];
  theme_code: string;
  student_register_enabled: boolean;
  assistant_enabled: boolean;
  remote_proxy_url: string;
  auto_attendance_on_login: boolean;
  group_drive_file_max_count: number;
  group_drive_single_file_max_mb: number;
  group_drive_allowed_extensions: string;
  class_transfer_review_note_presets_text: string;
  class_transfer_unreview_reason_presets_text: string;
};

// 模块级单例：nav 计数、外壳与各 pane 共享同一份数据。
const bootstrap = ref<BootstrapPayload | null>(null);
const aiProviders = ref<AIProviderRecord[]>([]);
const systemForm = ref<SystemFormState>({
  platform_name: 'OW³教学评AI平台',
  school_name: '',
  active_grade_nos: [],
  theme_code: 'emblem',
  student_register_enabled: false,
  assistant_enabled: false,
  remote_proxy_url: '',
  auto_attendance_on_login: true,
  group_drive_file_max_count: 50,
  group_drive_single_file_max_mb: 20,
  group_drive_allowed_extensions: '',
  class_transfer_review_note_presets_text: '',
  class_transfer_unreview_reason_presets_text: '',
});
const assistantPromptForm = ref<AssistantPromptSettings>({ general_prompt: '', lesson_prompt: '' });
const assistantRuntimeForm = ref<AssistantRuntimeSettings>({
  temperature: 0.4,
  top_p: null,
  max_tokens: null,
  presence_penalty: null,
  frequency_penalty: null,
  streaming_enabled: true,
  thinking_enabled: false,
});
const promotionForm = ref({
  source_class_ids: [] as number[],
  grade_increment: 1,
  copy_teacher_assignments: true,
  archive_source_classes: true,
});
const promotionPreview = ref<PromotionPreviewPayload | null>(null);
const isLoading = ref(true);
const isSavingSystem = ref(false);
const errorMessage = ref('');
const isPreviewingPromotion = ref(false);
const isExecutingPromotion = ref(false);

export function notifyAIProviderConfigUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AI_PROVIDER_CONFIG_UPDATED_EVENT));
  }
}

export function notifyAssistantRuntimeConfigUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT));
  }
}

export function useAdminBootstrap() {
  const authStore = useAuthStore();
  const appStore = useAppStore();

  const themeOptions = computed(() =>
    (bootstrap.value?.theme_presets ?? []).map((item) => ({ label: item.name, value: item.code }))
  );
  const classOptions = computed(() =>
    (bootstrap.value?.classes ?? []).map((item) => ({ label: item.class_name, value: item.id }))
  );
  const classOptionsWithCount = computed(() =>
    (bootstrap.value?.classes ?? []).map((item) => ({
      label: `${item.class_name}（${item.student_count}人）`,
      value: item.id,
    }))
  );
  const classOptionsWithSpacedCount = computed(() =>
    (bootstrap.value?.classes ?? []).map((item) => ({
      label: `${item.class_name}（${item.student_count} 人）`,
      value: item.id,
    }))
  );
  const roomOptions = computed(() =>
    (bootstrap.value?.rooms ?? []).map((item) => ({ label: item.name, value: item.id }))
  );

  async function loadBootstrap() {
    bootstrap.value = await apiGet<BootstrapPayload>('/settings/admin/bootstrap', authStore.token);
    systemForm.value = { ...bootstrap.value.system, active_grade_nos: [...bootstrap.value.system.active_grade_nos] };
    assistantPromptForm.value = { ...bootstrap.value.assistant_prompts };
    assistantRuntimeForm.value = { ...bootstrap.value.assistant_runtime };
    const allClassIds = new Set(bootstrap.value.classes.map((item) => item.id));
    const sourceClassIds = promotionForm.value.source_class_ids.filter((item) => allClassIds.has(item));
    promotionForm.value.source_class_ids = sourceClassIds.length
      ? sourceClassIds
      : bootstrap.value.classes.filter((item) => item.student_count > 0).map((item) => item.id);
    if (!promotionForm.value.source_class_ids.length) {
      promotionPreview.value = null;
    }
  }

  async function loadAIProviders() {
    const payload = await apiGet<{ items: AIProviderRecord[] }>('/settings/ai-providers', authStore.token);
    aiProviders.value = payload.items;
  }

  async function saveSystemSettings() {
    if (!authStore.token) return;
    isSavingSystem.value = true;
    try {
      const { platform_name: _platformName, ...systemSettingsPayload } = systemForm.value;
      void _platformName;
      const payload = await apiPut<BootstrapPayload['system']>('/settings/system', systemSettingsPayload, authStore.token);
      systemForm.value = { ...payload, active_grade_nos: [...payload.active_grade_nos] };
      appStore.applySystemTheme(payload.theme_code);
      appStore.applyPlatformTitle(payload.platform_name);
      ElMessage.success('系统参数已更新');
      await loadBootstrap();
    } finally {
      isSavingSystem.value = false;
    }
  }

  async function previewPromotions() {
    if (!authStore.token) return;
    if (!promotionForm.value.source_class_ids.length) {
      ElMessage.warning('请先选择至少一个待升班级');
      return;
    }

    isPreviewingPromotion.value = true;
    try {
      const payload = await apiPost<PromotionPreviewPayload>(
        '/settings/admin/promotions/preview',
        {
          source_class_ids: [...promotionForm.value.source_class_ids],
          grade_increment: promotionForm.value.grade_increment,
        },
        authStore.token
      );
      promotionPreview.value = payload;
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '升班预览失败');
    } finally {
      isPreviewingPromotion.value = false;
    }
  }

  async function executePromotions() {
    if (!authStore.token) return;
    if (!promotionForm.value.source_class_ids.length) {
      ElMessage.warning('请先选择至少一个待升班级');
      return;
    }

    await ElMessageBox.confirm('确认执行升班吗？该操作会迁移学生并可能归档原班级。');
    isExecutingPromotion.value = true;
    try {
      const payload = await apiPost<
        BootstrapPayload & {
          promotion_preview?: PromotionPreviewPayload;
          promotion_result?: {
            moved_student_count: number;
            created_target_count: number;
            reused_target_count: number;
            archived_count: number;
            blocked_count: number;
          };
        }
      >(
        '/settings/admin/promotions/execute',
        {
          source_class_ids: [...promotionForm.value.source_class_ids],
          grade_increment: promotionForm.value.grade_increment,
          copy_teacher_assignments: promotionForm.value.copy_teacher_assignments,
          archive_source_classes: promotionForm.value.archive_source_classes,
        },
        authStore.token
      );
      bootstrap.value = payload;
      systemForm.value = { ...payload.system, active_grade_nos: [...payload.system.active_grade_nos] };
      promotionPreview.value = payload.promotion_preview || null;
      const result = payload.promotion_result;
      if (result) {
        ElMessage.success(
          `升班完成：迁移 ${result.moved_student_count} 人，新建 ${result.created_target_count} 班，归档 ${result.archived_count} 班`
        );
      } else {
        ElMessage.success('升班活动已完成');
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '执行升班失败');
    } finally {
      isExecutingPromotion.value = false;
    }
  }

  return {
    // state
    bootstrap,
    aiProviders,
    systemForm,
    assistantPromptForm,
    assistantRuntimeForm,
    promotionForm,
    promotionPreview,
    isLoading,
    isSavingSystem,
    isPreviewingPromotion,
    isExecutingPromotion,
    errorMessage,
    // computed
    themeOptions,
    classOptions,
    classOptionsWithCount,
    classOptionsWithSpacedCount,
    roomOptions,
    // actions
    loadBootstrap,
    loadAIProviders,
    saveSystemSettings,
    previewPromotions,
    executePromotions,
  };
}

export { apiDelete, apiGet, apiPost, apiPut };
export type { AIProviderModelDiscoveryResult, AIProviderRecord };
