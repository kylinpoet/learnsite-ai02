<template>
  <div class="sw-task">
    <StudentPageHead :title="taskDetail?.title || `活动 ${route.params.taskId}`" :sub="headSub">
      <template #back>
        <button class="sw-back" type="button" @click="goToCourse">← 返回课程</button>
      </template>
      <template v-if="taskDetail" #actions>
        <n-dropdown :options="moreActionOptions" placement="bottom-end" trigger="click" @select="handleMoreAction">
          <n-button secondary>更多操作</n-button>
        </n-dropdown>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <n-alert
      v-if="taskDetail && submitBlockedMessage"
      :closable="false"
      :title="submitBlockedMessage"
      type="warning"
    />
    <n-alert
      v-if="taskDetail?.group_collaboration && !groupDiscussionEnabled && groupDiscussionMessage"
      :closable="false"
      :title="groupDiscussionMessage"
      type="warning"
    />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <template v-else-if="taskDetail">
      <div class="sw-task__status">
        <span :class="['sw-chip', statusChipClass]">{{ submissionStatusLabel }}</span>
        <span class="sw-task__status-note">{{ submissionStatusNote }}</span>
      </div>

      <div class="sw-split">
        <div class="sw-task__main">
          <StudentPanel
            :title="isDataSubmitTask ? '活动内容' : '活动说明'"
            :count="taskTypeLabel(taskDetail.task_type)"
          >
            <div v-if="!isDataSubmitTask" class="sw-prose">
              <RichTextContent :html="taskDetail.description" empty-text="当前活动还没有补充说明。" />
            </div>

            <div v-if="isDiscussionTask" class="sw-task__discussion">
              <n-alert
                :closable="false"
                :title="taskConfig.topic || '教师暂未填写讨论主题，请先阅读活动说明后回复。'"
                type="info"
              />
              <div class="sw-task__posts">
                <article v-for="post in discussionPosts" :key="post.id" class="sw-task__post">
                  <div class="sw-task__post-meta">
                    <strong>{{ post.author.display_name }}</strong>
                    <span>{{ post.author.student_no || '学号未登记' }}</span>
                    <span>{{ formatDateTime(post.updated_at || post.created_at) }}</span>
                  </div>
                  <RichTextContent class="sw-task__post-body" :html="post.content" empty-text="" sanitize-preset="strict" />
                  <div v-if="post.replies?.length" class="sw-task__replies">
                    <article v-for="reply in post.replies" :key="reply.id" class="sw-task__reply">
                      <div class="sw-task__post-meta">
                        <strong>{{ reply.author.display_name }}</strong>
                        <span>{{ reply.author.student_no || '学号未登记' }}</span>
                        <span>{{ formatDateTime(reply.updated_at || reply.created_at) }}</span>
                      </div>
                      <RichTextContent class="sw-task__post-body" :html="reply.content" empty-text="" sanitize-preset="strict" />
                    </article>
                  </div>
                </article>
                <p v-if="!isDiscussionLoading && !discussionPostCount" class="sw-empty">
                  还没有同学参与讨论，欢迎你先发言。
                </p>
              </div>
            </div>

            <div v-else-if="isWebTask" class="sw-task__embed">
              <iframe
                v-if="webTaskUrl"
                :src="webTaskUrl"
                :sandbox="taskEmbedSandboxFor(webTaskUrl)"
                class="task-embed-frame"
                title="网页活动"
              ></iframe>
              <n-empty v-else-if="isWebTaskResourcePreparing" description="活动资源初始化中，请稍候..." />
              <n-empty v-else description="教师暂未上传网页活动资源或资源加载失败" />
            </div>

            <div v-else-if="isDataSubmitTask" class="sw-task__embed">
              <div class="sw-task__embed-actions">
                <n-button
                  secondary
                  size="small"
                  :disabled="!dataSubmitFormUrl"
                  @click="openTaskResourceInNewTab(dataSubmitFormUrl, 'submit')"
                >
                  新标签打开提交页
                </n-button>
                <n-button
                  secondary
                  size="small"
                  :disabled="!dataSubmitVisualizationUrl"
                  @click="openTaskResourceInNewTab(dataSubmitVisualizationUrl, 'visualization')"
                >
                  新标签打开可视化页
                </n-button>
              </div>
              <n-tabs v-model:value="dataSubmitActiveTab">
                <n-tab-pane name="submit" tab="学生提交页">
                  <div class="data-submit-tab-pane">
                    <div class="sw-prose">
                      <RichTextContent :html="taskDetail.description" empty-text="当前活动还没有补充说明。" />
                    </div>
                    <iframe
                      v-if="dataSubmitFormUrl"
                      :src="dataSubmitFormUrl"
                      :sandbox="taskEmbedSandboxFor(dataSubmitFormUrl)"
                      class="task-embed-frame"
                      title="数据提交页"
                    ></iframe>
                    <n-empty v-else description="教师暂未上传数据提交页面" />
                  </div>
                </n-tab-pane>
                <n-tab-pane name="visualization" tab="数据可视化页">
                  <iframe
                    v-if="dataSubmitVisualizationUrl"
                    :src="dataSubmitVisualizationUrl"
                    :sandbox="taskEmbedSandboxFor(dataSubmitVisualizationUrl)"
                    class="task-embed-frame"
                    title="数据可视化页"
                  ></iframe>
                  <n-empty v-else description="教师暂未上传可视化页面" />
                </n-tab-pane>
              </n-tabs>
            </div>

            <div v-if="usesStandardSubmissionFlow" class="sw-task__form">
              <div class="sw-task__form-head">
                <h3 class="sw-task__form-title">{{ submissionNoteTitle }}</h3>
                <span class="sw-task__form-hint">{{ submissionNoteHint }}</span>
              </div>
              <div class="submission-editor">
                <RichTextEditor
                  v-model="submissionNote"
                  :min-height="260"
                  placeholder="写下你的设计思路、步骤说明、图片说明或补充内容。支持标题、列表、加粗、链接和图片。"
                />
              </div>

              <div v-if="isDiscussionTask" class="sw-task__form-actions">
                <n-button :loading="isPostingDiscussion" type="primary" @click="postDiscussionReply">
                  发布回复
                </n-button>
                <n-button :loading="isDiscussionLoading" secondary @click="loadDiscussionFeed">
                  刷新讨论
                </n-button>
              </div>

              <template v-else>
                <div class="sw-task__form-head sw-task__form-head--files">
                  <h3 class="sw-task__form-title">作品附件</h3>
                  <span class="sw-task__form-hint">重新选择后，本次提交会替换当前已保存附件。</span>
                </div>
                <input
                  ref="fileInputRef"
                  class="file-input"
                  multiple
                  type="file"
                  @change="handleFileChange"
                />
                <div class="sw-task__form-actions">
                  <n-button :disabled="!taskDetail.can_submit" secondary @click="openFilePicker">
                    选择附件
                  </n-button>
                  <n-button
                    v-if="selectedFiles.length"
                    :disabled="isSubmitting"
                    secondary
                    @click="clearSelectedFiles"
                  >
                    清空本次选择
                  </n-button>
                </div>

                <div class="sw-task__files">
                  <article
                    v-for="file in selectedFiles"
                    :key="selectedFileKey(file)"
                    class="sw-file"
                  >
                    <span class="sw-file__main">
                      <span class="sw-file__name">{{ file.name }}</span>
                      <span class="sw-file__meta">{{ formatFileSize(file.size) }} · 本次提交</span>
                    </span>
                    <span class="sw-file__actions">
                      <n-button
                        :loading="previewLoadingSelectedFileKey === selectedFileKey(file)"
                        :disabled="!isLocalFilePreviewable(file)"
                        text
                        @click="previewSelectedFile(file)"
                      >
                        预览
                      </n-button>
                      <n-button text @click="removeSelectedFile(file.name)">移除</n-button>
                    </span>
                  </article>

                  <article
                    v-for="file in displayedCurrentFiles"
                    :key="`saved-${file.id}`"
                    class="sw-file"
                  >
                    <span class="sw-file__main">
                      <span class="sw-file__name">{{ file.name }}</span>
                      <span class="sw-file__meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB · 已保存</span>
                    </span>
                    <span class="sw-file__actions">
                      <n-button
                        :loading="previewLoadingSavedFileId === file.id"
                        :disabled="!isSavedFilePreviewable(file)"
                        text
                        @click="previewSavedFile(file)"
                      >
                        预览
                      </n-button>
                      <n-button
                        :loading="downloadLoadingFileId === file.id"
                        text
                        @click="downloadSavedFile(file)"
                      >
                        下载
                      </n-button>
                    </span>
                  </article>

                  <p v-if="!selectedFiles.length && !displayedCurrentFiles.length" class="sw-empty">
                    还没有上传附件。
                  </p>
                </div>
              </template>
            </div>
          </StudentPanel>
        </div>

        <aside class="sw-split__aside">
          <StudentPanel title="提交">
            <dl class="sw-meta">
              <div><dt>课程</dt><dd>{{ taskDetail.course.title }}</dd></div>
              <div><dt>发布</dt><dd>{{ formatDate(taskDetail.course.assigned_date) }}</dd></div>
              <div><dt>最近提交</dt><dd>{{ formatDateTime(currentSubmission?.updated_at || null) }}</dd></div>
              <div><dt>提交方式</dt><dd>{{ taskDetail.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}</dd></div>
              <div v-if="currentSubmission?.submission_scope === 'group'">
                <dt>提交人</dt><dd>{{ currentSubmission?.submitted_by_name || '组内成员' }}</dd>
              </div>
              <div v-if="currentSubmission?.score !== null && currentSubmission?.score !== undefined">
                <dt>得分</dt><dd class="sw-meta__num">{{ currentSubmission.score }} 分</dd>
              </div>
            </dl>

            <div v-if="currentSubmission?.teacher_comment" class="sw-task__comment">
              <p class="sw-task__comment-title">教师评语</p>
              <RichTextContent
                class="sw-task__comment-body"
                :html="currentSubmission.teacher_comment"
                empty-text=""
                sanitize-preset="strict"
              />
            </div>

            <div class="sw-task__submit">
              <n-button
                v-if="usesStandardSubmissionFlow"
                block
                :disabled="!taskDetail.can_submit"
                :loading="isSubmitting"
                type="primary"
                @click="submitTask"
              >
                {{ submitButtonText }}
              </n-button>
              <p class="sw-task__hint">提交即保存；教师评价前可以再次提交覆盖。</p>
              <n-button
                v-if="taskDetail.task_navigation.next_task"
                block
                secondary
                @click="openNavigationTask(taskDetail.task_navigation.next_task)"
              >
                进入下一活动
              </n-button>
              <n-button
                v-if="currentSubmission?.status === 'reviewed'"
                block
                text
                :loading="isRevokingReview"
                type="warning"
                @click="revokeReviewedSubmission"
              >
                撤销评阅并继续提交
              </n-button>
            </div>
          </StudentPanel>

          <StudentPanel
            v-if="taskDetail.group_collaboration && usesStandardSubmissionFlow"
            title="小组共享草稿"
          >
            <p class="sw-task__draft">
              {{ currentGroupDraft ? `版本 ${currentGroupDraft.version_no} · ${currentGroupDraft.updated_by_name || '组内成员'}` : '组内还没有共享草稿' }}
            </p>
            <p class="sw-task__hint">{{ groupDraftMeta }}</p>
            <div class="sw-task__draft-actions">
              <n-button
                size="small"
                :disabled="!groupDraftActionsEnabled"
                :loading="isGroupDraftSaving"
                secondary
                @click="saveGroupDraft"
              >
                同步到小组草稿
              </n-button>
              <n-button size="small" :disabled="!currentGroupDraft" secondary @click="applyGroupDraft">
                恢复小组草稿
              </n-button>
              <n-button size="small" :loading="isRefreshingTask" secondary @click="refreshTaskDetail">
                刷新协作内容
              </n-button>
              <n-button size="small" secondary @click="isGroupDraftHistoryVisible = true">
                历史版本
              </n-button>
            </div>
          </StudentPanel>

          <StudentPanel v-if="taskDetail.course.content" title="学案导读">
            <div class="sw-prose">
              <RichTextContent :html="taskDetail.course.content" empty-text="这节课没有补充导读。" />
            </div>
          </StudentPanel>
        </aside>
      </div>

      <RecommendedWorksShowcase
        :items="taskDetail.recommended_showcase.items"
        :token="authStore.token || ''"
        description="教师评分为 G 级的作品会自动进入这里，便于同学参考优秀完成方式。"
        empty-description="当前课题还没有推荐作品"
        title="当前课题推荐作品展示"
      />

      <GroupDraftHistoryDialog
        v-if="taskDetail.group_collaboration"
        v-model="isGroupDraftHistoryVisible"
        :code-enabled="false"
        :task-id="taskDetail.id"
        :token="authStore.token || ''"
      />

      <n-modal
        v-model:show="filePreviewDialogVisible"
        preset="card"
        :title="`附件预览 · ${filePreviewName || '未命名文件'}`"
        style="width: min(980px, 92vw)"
        @after-leave="resetFilePreviewState"
      >
        <n-spin :show="isFilePreviewLoading">
          <div class="file-preview-stage">
            <iframe
              v-if="!isFilePreviewLoading && filePreviewKind === 'pdf' && filePreviewUrl"
              :src="filePreviewUrl"
              class="file-preview-frame"
              title="附件预览"
            ></iframe>
            <img
              v-else-if="!isFilePreviewLoading && filePreviewKind === 'image' && filePreviewUrl"
              :src="filePreviewUrl"
              alt="附件预览"
              class="file-preview-image"
            />
            <div v-else-if="!isFilePreviewLoading && filePreviewKind === 'text'" class="file-preview-text-shell">
              <div v-if="filePreviewTextCanExpand" class="file-preview-text-toolbar">
                <p>{{ filePreviewTextHint() }}</p>
                <n-button text type="primary" :loading="isFilePreviewTextExpanding" @click="toggleFilePreviewTextExpand">
                  {{ filePreviewTextExpanded ? '恢复截断' : '展开全文' }}
                </n-button>
              </div>
              <pre class="file-preview-text">{{ filePreviewText }}</pre>
            </div>
            <div v-else class="file-preview-fallback">
              <p>当前文件暂不支持在线预览。</p>
              <p>可点击下载后在本地打开查看。</p>
            </div>
          </div>
        </n-spin>
      </n-modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NDropdown, NEmpty, NModal, NSkeleton, NSpin, NTabPane, NTabs } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from '@/ui/feedback';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPost, apiPut, apiUpload } from '@/api/http';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import GroupDraftHistoryDialog from '@/modules/student-task/components/GroupDraftHistoryDialog.vue';
import { useAuthStore } from '@/stores/auth';
import { resolveIframeSandbox } from '@/utils/iframeTrust';
import { normalizeRichTextHtml } from '@/utils/richText';
import { formatDateTime } from '@/utils/datetime';
import { triggerBrowserDownload } from '@/utils/download';
import type { GroupTaskDraft, NavigationTask } from '@/types/domain';
import type { TaskRuntimeRequestMessage, TaskRuntimeResponseMessage, TaskRuntimeSessionPayload } from '@/types/taskRuntime';
import type { TaskSubmissionFile, RecommendedSubmissionItem } from '@/types/submission';
import type { TaskSubmission, TaskAssetManifestItem } from './taskTypes';
import { detectFilePreviewKind, type FilePreviewKind } from '@/utils/filePreview';

type TaskConfigState = {
  topic: string;
  entry_path: string;
  assets: TaskAssetManifestItem[];
  endpoint_token: string;
  submit_entry_path: string;
  visualization_entry_path: string;
  submit_assets: TaskAssetManifestItem[];
  visualization_assets: TaskAssetManifestItem[];
  submit_api_path: string;
  records_api_path: string;
};

type DiscussionPost = {
  id: number;
  task_id: number;
  parent_post_id: number | null;
  content: string;
  created_at: string | null;
  updated_at: string | null;
  author: {
    user_id: number | null;
    display_name: string;
    student_no: string | null;
    user_type: string;
  };
  replies?: DiscussionPost[];
};

type DiscussionFeedPayload = {
  task_id?: number;
  topic?: string;
  count?: number;
  items?: DiscussionPost[];
  posts?: DiscussionPost[];
};

type TaskDetailPayload = {
  id: number;
  title: string;
  task_type: string;
  submission_scope: 'individual' | 'group';
  description: string | null;
  config: Record<string, unknown> | null;
  is_required: boolean;
  course: {
    id: number;
    title: string;
    content: string | null;
    assigned_date: string;
    lesson_title: string;
    unit_title: string;
  };
  submission_policy: {
    direct_submit: boolean;
    allow_resubmit_until_reviewed: boolean;
    draft_enabled: boolean;
  };
  task_navigation: {
    previous_task: NavigationTask | null;
    next_task: NavigationTask | null;
  };
  group_collaboration: {
    group_id: number;
    group_name: string;
    group_no: number;
    class_name: string | null;
    my_role: string | null;
    member_count: number;
    members: Array<{
      user_id: number;
      display_name: string;
      student_no: string;
      role: string;
    }>;
  } | null;
  group_draft: GroupTaskDraft | null;
  current_submission: TaskSubmission | null;
  recommended_showcase: {
    count: number;
    items: RecommendedSubmissionItem[];
  };
  can_submit: boolean;
  submit_blocked_message?: string;
  classroom_capabilities?: {
    session_active: boolean;
    session_id: number | null;
    class_id: number | null;
    switches: Record<string, boolean>;
    ip_lock: {
      enabled: boolean;
      allowed: boolean;
      client_ip: string | null;
      message: string;
    };
    programming_control?: {
      enabled: boolean;
      message: string;
    };
    group_discussion?: {
      enabled: boolean;
      message: string;
    };
  };
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const taskEmbedSandboxFor = (src: string | null | undefined) => resolveIframeSandbox(src);
const runtimeSessionRefreshBufferMs = 15_000;
const routeNavigationTimeoutMs = 1_200;
const textPreviewSliceBytes = 256 * 1024;

const taskDetail = ref<TaskDetailPayload | null>(null);
const submissionNote = ref('');
const selectedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isLoading = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const downloadLoadingFileId = ref<number | null>(null);
const isGroupDraftSaving = ref(false);
const isRefreshingTask = ref(false);
const isGroupDraftHistoryVisible = ref(false);
const discussionPosts = ref<DiscussionPost[]>([]);
const isDiscussionLoading = ref(false);
const isPostingDiscussion = ref(false);
const isRevokingReview = ref(false);
const filePreviewDialogVisible = ref(false);
const isFilePreviewLoading = ref(false);
const filePreviewName = ref('');
const filePreviewKind = ref<FilePreviewKind>('unsupported');
const filePreviewUrl = ref('');
const filePreviewText = ref('');
const filePreviewTextBlob = ref<Blob | null>(null);
const filePreviewTextCanExpand = ref(false);
const filePreviewTextExpanded = ref(false);
const filePreviewTextTotalBytes = ref(0);
const isFilePreviewTextExpanding = ref(false);
const previewLoadingSavedFileId = ref<number | null>(null);
const previewLoadingSelectedFileKey = ref<string | null>(null);
const dataSubmitActiveTab = ref<'submit' | 'visualization'>('submit');
const taskRuntimeSessionExpiresAt = ref<string | null>(null);
const taskRuntimeSessionLoading = ref(false);
const taskRuntimeSessionTaskId = ref<number | null>(null);
let latestLoadTaskRequestId = 0;
let latestRuntimeSessionRequestId = 0;

const currentSubmission = computed(() => taskDetail.value?.current_submission || null);
const currentGroupDraft = computed(() => taskDetail.value?.group_draft || null);
const submitBlockedMessage = computed(() => taskDetail.value?.submit_blocked_message || '');
const groupDiscussionCapability = computed(() => taskDetail.value?.classroom_capabilities?.group_discussion);
const groupDiscussionEnabled = computed(() => groupDiscussionCapability.value?.enabled ?? true);
const groupDiscussionMessage = computed(() => groupDiscussionCapability.value?.message || '');
const groupDraftActionsEnabled = computed(
  () => Boolean(taskDetail.value?.can_submit) && groupDiscussionEnabled.value
);
const isDiscussionTask = computed(() => taskDetail.value?.task_type === 'discussion');
const isWebTask = computed(() => taskDetail.value?.task_type === 'web_page');
const isDataSubmitTask = computed(() => taskDetail.value?.task_type === 'data_submit');
const usesStandardSubmissionFlow = computed(() => !isDataSubmitTask.value);
const submissionNoteTitle = computed(() => {
  if (isDiscussionTask.value || isWebTask.value) {
    return '提交说明';
  }
  return '作品说明';
});
const submissionNoteHint = computed(() => {
  if (isDiscussionTask.value) {
    return '可整理你的讨论结论、观点总结或课后反思，提交后教师可直接评分。';
  }
  if (isWebTask.value) {
    return '完成网页互动后，补充你的完成说明、结果截图说明或学习总结。';
  }
  return '支持富文本排版，提交后即保存，教师评价前可再次提交。';
});
const displayedCurrentFiles = computed(() => {
  if (selectedFiles.value.length) {
    return [];
  }
  return currentSubmission.value?.files || [];
});
const ruleMetricLabel = computed(() => {
  if (isDiscussionTask.value) {
    return '互动方式';
  }
  if (isWebTask.value) {
    return '活动形态';
  }
  if (isDataSubmitTask.value) {
    return '活动形态';
  }
  return '提交规则';
});
const ruleMetricValue = computed(() => {
  if (isDiscussionTask.value) {
    return '主题回复';
  }
  if (isWebTask.value) {
    return '网页互动';
  }
  if (isDataSubmitTask.value) {
    return '数据提交';
  }
  return '直接提交即保存';
});
const ruleMetricNote = computed(() => {
  if (isDiscussionTask.value) {
    return '围绕教师主题直接回复，不需要上传附件。';
  }
  if (isWebTask.value) {
    return '活动内容通过嵌入网页展示。';
  }
  if (isDataSubmitTask.value) {
    return '提交页与可视化页都可直接在当前活动中打开。';
  }
  return '教师评价前，可以再次提交覆盖作品。';
});
const assetMetricLabel = computed(() => {
  if (isDiscussionTask.value) {
    return '讨论回复';
  }
  if (isWebTask.value) {
    return '页面资源';
  }
  if (isDataSubmitTask.value) {
    return '活动页面';
  }
  return '已保存附件';
});
const assetMetricValue = computed(() => {
  if (isDiscussionTask.value) {
    return discussionReplyCount.value;
  }
  if (isWebTask.value) {
    return taskConfig.value.assets.length;
  }
  if (isDataSubmitTask.value) {
    return Number(Boolean(dataSubmitFormUrl.value)) + Number(Boolean(dataSubmitVisualizationUrl.value));
  }
  return currentSubmission.value?.files.length || 0;
});
const assetMetricNote = computed(() => {
  if (isDiscussionTask.value) {
    return discussionReplyCount.value ? '包含主题下的全部回复数量。' : '还没有同学参与讨论。';
  }
  if (isWebTask.value) {
    return webTaskUrl.value ? `入口文件：${taskConfig.value.entry_path}` : '教师暂未上传网页资源。';
  }
  if (isDataSubmitTask.value) {
    return dataSubmitVisualizationUrl.value ? '提交页与可视化页都已就绪。' : '等待教师补充完整页面资源。';
  }
  return selectedFiles.value.length ? '本次选中的附件将替换当前附件。' : '不重新选附件时，会保留当前附件。';
});
const submissionStatusLabel = computed(() => {
  if (isDiscussionTask.value) {
    return discussionReplyCount.value ? '讨论进行中' : '待参与讨论';
  }
  if (isWebTask.value) {
    return webTaskUrl.value ? '页面已就绪' : '等待资源';
  }
  if (isDataSubmitTask.value) {
    return dataSubmitFormUrl.value ? '页面已就绪' : '等待资源';
  }
  if (!currentSubmission.value) {
    return '未提交';
  }
  return currentSubmission.value.status === 'reviewed' ? '已评价' : '待教师评价';
});
const submissionStatusNote = computed(() => {
  if (isDiscussionTask.value) {
    return discussionReplyCount.value
      ? `当前共有 ${discussionReplyCount.value} 条讨论回复。`
      : '先阅读主题，再发布你的观点。';
  }
  if (isWebTask.value) {
    return webTaskUrl.value ? '左侧已嵌入教师发布的网页活动内容。' : '教师暂未上传网页活动资源。';
  }
  if (isDataSubmitTask.value) {
    return dataSubmitFormUrl.value
      ? '先在提交页完成数据上报，再切换到可视化页查看结果。'
      : '教师暂未配置完整的数据活动页面。';
  }
  if (!currentSubmission.value) {
    return taskDetail.value?.submission_scope === 'group' ? '你的小组还没有提交这项活动。' : '你还没有提交这项活动。';
  }
  if (currentSubmission.value.status === 'reviewed') {
    return currentSubmission.value.submission_scope === 'group'
      ? '教师已经完成本组评价，本次提交入口会关闭。'
      : '教师已经完成评价，本次提交入口会关闭。';
  }
  return currentSubmission.value.submission_scope === 'group'
    ? '当前是小组共同提交作品，组内成员都可以再次提交覆盖。'
    : '当前作品还未评价，你可以再次提交覆盖。';
});
const submitButtonText = computed(() => {
  if (!taskDetail.value) return '提交作品';
  if (isDiscussionTask.value) {
    return currentSubmission.value ? '更新讨论活动提交' : '提交讨论活动';
  }
  if (isWebTask.value) {
    return currentSubmission.value ? '更新网页活动提交' : '提交网页活动';
  }
  if (taskDetail.value.submission_scope === 'group') {
    return currentSubmission.value ? '再次提交小组作品' : '提交小组作品';
  }
  return currentSubmission.value ? '再次提交作品' : '提交作品';
});
const groupDraftSummary = computed(() => {
  if (!taskDetail.value?.group_collaboration) {
    return '当前活动不是小组协作活动。';
  }
  if (!currentGroupDraft.value) {
    return '组内还没有共享草稿，可以先同步作品说明再继续讨论附件分工。';
  }
  return currentGroupDraft.value.submission_note
    ? '当前编辑器可以恢复到最近一次共享草稿内容。'
    : '当前共享草稿中还没有作品说明内容。';
});
const groupDraftMeta = computed(() => {
  if (!currentGroupDraft.value) {
    return '刷新页面后会读取组内最近一次同步的共享草稿。';
  }
  return [
    currentGroupDraft.value.updated_by_name ? `最近同步人 ${currentGroupDraft.value.updated_by_name}` : '组内成员',
    currentGroupDraft.value.updated_at ? `同步时间 ${formatDateTime(currentGroupDraft.value.updated_at)}` : '暂无时间',
  ].join(' · ');
});

const headSub = computed(() => {
  const detail = taskDetail.value;
  if (!detail) {
    return '';
  }
  return [detail.course.title, detail.course.unit_title, detail.course.lesson_title]
    .filter(Boolean)
    .join(' · ');
});

const statusChipClass = computed(() => {
  const status = currentSubmission.value?.status;
  if (status === 'reviewed') {
    return 'sw-chip--done';
  }
  if (status === 'submitted') {
    return '';
  }
  return 'sw-chip--todo';
});

const moreActionOptions = computed(() => {
  const options: Array<{ label: string; key: string }> = [];
  if (taskDetail.value?.task_navigation.previous_task) {
    options.push({ label: '上一个活动', key: 'prev' });
  }
  if (taskDetail.value?.task_navigation.next_task) {
    options.push({ label: '下一个活动', key: 'next' });
  }
  options.push({ label: '作品互评', key: 'peer-review' });
  if (usesStandardSubmissionFlow.value && currentSubmission.value) {
    options.push({ label: '查看已提交作品', key: 'work-detail' });
  }
  if (currentSubmission.value?.status === 'reviewed') {
    options.push({ label: '撤销评阅并继续提交', key: 'revoke' });
  }
  return options;
});

function handleMoreAction(key: string) {
  if (key === 'prev') {
    const task = taskDetail.value?.task_navigation.previous_task;
    if (task) {
      void openNavigationTask(task);
    }
    return;
  }
  if (key === 'next') {
    const task = taskDetail.value?.task_navigation.next_task;
    if (task) {
      void openNavigationTask(task);
    }
    return;
  }
  if (key === 'peer-review') {
    void goToPeerReview();
    return;
  }
  if (key === 'work-detail') {
    void goToWorkDetail();
    return;
  }
  if (key === 'revoke') {
    void revokeReviewedSubmission();
  }
}

function normalizeRouteParam(value: string | string[] | number | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]) : '';
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function resolveCourseId() {
  const routeCourseId = normalizeRouteParam(route.params.courseId as string | string[] | undefined);
  if (routeCourseId) {
    return routeCourseId;
  }
  return normalizeRouteParam(taskDetail.value?.course.id);
}

function resolveCourseRoutePath() {
  const courseId = resolveCourseId();
  if (!courseId) {
    return '';
  }
  return router.resolve(`/student/courses/${courseId}`).fullPath;
}

async function navigateToPath(targetPath: string) {
  const normalizedTarget = targetPath.trim();
  if (!normalizedTarget) {
    return;
  }
  const resolvedTarget = router.resolve(normalizedTarget).fullPath;
  if (router.currentRoute.value.fullPath === resolvedTarget) {
    return;
  }

  const fallbackTimer = window.setTimeout(() => {
    if (router.currentRoute.value.fullPath !== resolvedTarget) {
      window.location.assign(resolvedTarget);
    }
  }, routeNavigationTimeoutMs);

  try {
    await router.push(resolvedTarget);
  } catch {
    // Ignore router navigation failure and use fallback below.
  } finally {
    window.clearTimeout(fallbackTimer);
  }

  if (router.currentRoute.value.fullPath !== resolvedTarget) {
    window.location.assign(resolvedTarget);
  }
}

function pickInitialSubmissionNote(payload: TaskDetailPayload) {
  const submissionText = payload.current_submission?.submission_note || '';
  const draftText = payload.group_draft?.submission_note || '';
  if (!payload.group_collaboration || !payload.group_draft) {
    return submissionText;
  }
  if (!payload.current_submission) {
    return draftText || submissionText;
  }
  const draftTime = Date.parse(payload.group_draft.updated_at || '');
  const submissionTime = Date.parse(payload.current_submission.updated_at || '');
  if (!Number.isNaN(draftTime) && (Number.isNaN(submissionTime) || draftTime >= submissionTime)) {
    return draftText || submissionText;
  }
  return submissionText || draftText;
}

function hydrateTaskDetail(payload: TaskDetailPayload) {
  taskDetail.value = payload;
  dataSubmitActiveTab.value = 'submit';
  submissionNote.value = pickInitialSubmissionNote(payload);
  selectedFiles.value = [];
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function parseAssetManifest(value: unknown): TaskAssetManifestItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      path: typeof item.path === 'string' ? item.path : '',
      size_kb: typeof item.size_kb === 'number' ? item.size_kb : 0,
      mime_type: typeof item.mime_type === 'string' ? item.mime_type : null,
      slot: typeof item.slot === 'string' ? item.slot : undefined,
    }))
    .filter((item) => item.path);
}

function normalizeTaskConfig(rawConfig: unknown): TaskConfigState {
  const base: TaskConfigState = {
    topic: '',
    entry_path: 'index.html',
    assets: [],
    endpoint_token: '',
    submit_entry_path: 'index.html',
    visualization_entry_path: 'index.html',
    submit_assets: [],
    visualization_assets: [],
    submit_api_path: '',
    records_api_path: '',
  };
  if (!rawConfig || typeof rawConfig !== 'object') {
    return base;
  }
  const config = rawConfig as Record<string, unknown>;
  base.topic = typeof config.topic === 'string' ? config.topic : '';
  base.entry_path = typeof config.entry_path === 'string' ? config.entry_path : base.entry_path;
  base.assets = parseAssetManifest(config.assets);
  base.endpoint_token = typeof config.endpoint_token === 'string' ? config.endpoint_token : '';
  base.submit_entry_path =
    typeof config.submit_entry_path === 'string' ? config.submit_entry_path : base.submit_entry_path;
  base.visualization_entry_path =
    typeof config.visualization_entry_path === 'string'
      ? config.visualization_entry_path
      : base.visualization_entry_path;
  base.submit_assets = parseAssetManifest(config.submit_assets);
  base.visualization_assets = parseAssetManifest(config.visualization_assets);
  base.submit_api_path = typeof config.submit_api_path === 'string' ? config.submit_api_path : '';
  base.records_api_path = typeof config.records_api_path === 'string' ? config.records_api_path : '';
  return base;
}

const taskConfig = computed(() => normalizeTaskConfig(taskDetail.value?.config));

function buildAbsoluteApiUrl(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    return '';
  }
  try {
    return new URL(normalized, window.location.origin).toString();
  } catch {
    return normalized;
  }
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isTaskRuntimeSessionValidForTask(taskId: number | null | undefined) {
  if (!taskId) {
    return false;
  }
  if (taskRuntimeSessionTaskId.value !== taskId) {
    return false;
  }
  return parseTimestamp(taskRuntimeSessionExpiresAt.value) - runtimeSessionRefreshBufferMs > Date.now();
}

const taskRuntimeSessionValid = computed(() => {
  return isTaskRuntimeSessionValidForTask(taskDetail.value?.id ?? null);
});

async function ensureTaskRuntimeSession(force = false, requestedTaskId?: number) {
  const taskId = requestedTaskId ?? taskDetail.value?.id;
  if (!taskId || !authStore.token) {
    return false;
  }
  if (!force && isTaskRuntimeSessionValidForTask(taskId)) {
    return true;
  }

  const requestId = ++latestRuntimeSessionRequestId;
  taskRuntimeSessionLoading.value = true;
  try {
    const payload = await apiPost<TaskRuntimeSessionPayload>(
      `/tasks/${taskId}/runtime-session`,
      {},
      authStore.token
    );
    if (requestId !== latestRuntimeSessionRequestId) {
      return false;
    }
    taskRuntimeSessionTaskId.value = taskId;
    taskRuntimeSessionExpiresAt.value = payload.expires_at;
    return true;
  } catch (error) {
    if (requestId === latestRuntimeSessionRequestId) {
      errorMessage.value = error instanceof Error ? error.message : '活动运行时会话初始化失败';
    }
    return false;
  } finally {
    if (requestId === latestRuntimeSessionRequestId) {
      taskRuntimeSessionLoading.value = false;
    }
  }
}

function encodeAssetPath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function withAccessToken(url: string) {
  const normalized = url.trim();
  if (!normalized || !authStore.token) {
    return normalized;
  }

  try {
    const parsedUrl = new URL(normalized, window.location.origin);
    parsedUrl.searchParams.set('access_token', authStore.token);
    return parsedUrl.toString();
  } catch {
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}access_token=${encodeURIComponent(authStore.token)}`;
  }
}

function taskAssetUrl(slot: 'web' | 'data_submit_form' | 'data_submit_visualization', entryPath: string) {
  const currentTaskId = taskDetail.value?.id;
  if (!currentTaskId || !entryPath) {
    return '';
  }
  return withAccessToken(
    buildAbsoluteApiUrl(`${apiBaseUrl}/tasks/${currentTaskId}/assets/${slot}/${encodeAssetPath(entryPath)}`)
  );
}

const webTaskUrl = computed(() =>
  taskConfig.value.assets.length ? taskAssetUrl('web', taskConfig.value.entry_path) : ''
);
const dataSubmitFormUrl = computed(() =>
  taskConfig.value.submit_assets.length
    ? taskAssetUrl('data_submit_form', taskConfig.value.submit_entry_path)
    : ''
);
const dataSubmitVisualizationUrl = computed(() =>
  taskConfig.value.visualization_assets.length
    ? taskAssetUrl('data_submit_visualization', taskConfig.value.visualization_entry_path)
    : ''
);
const isWebTaskResourcePreparing = computed(
  () => isWebTask.value && taskConfig.value.assets.length > 0 && taskRuntimeSessionLoading.value && !webTaskUrl.value
);
const discussionPostCount = computed(() =>
  Array.isArray(discussionPosts.value) ? discussionPosts.value.length : 0
);
const discussionReplyCount = computed(() =>
  (Array.isArray(discussionPosts.value) ? discussionPosts.value : []).reduce(
    (count, post) => count + 1 + (post.replies?.length || 0),
    0
  )
);

function normalizeDiscussionFeedItems(payload: DiscussionFeedPayload) {
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload.posts)) {
    return payload.posts;
  }
  return [];
}

function taskTypeLabel(taskType: string) {
  if (taskType === 'rich_text') {
    return '图文活动';
  }
  if (taskType === 'discussion') {
    return '讨论活动';
  }
  if (taskType === 'web_page') {
    return '网页活动';
  }
  if (taskType === 'data_submit') {
    return '数据提交活动';
  }
  if (taskType === 'programming') {
    return '编程活动';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读活动';
  }
  return taskType;
}

function groupRoleLabel(role: string | null | undefined) {
  if (role === 'leader') {
    return '组长';
  }
  if (role === 'member') {
    return '组员';
  }
  return '未分组成员';
}

function formatDate(value: string) {
  return value.split('-').join('.');
}

function formatFileSize(size: number) {
  const sizeKb = Math.max(1, Math.ceil(size / 1024));
  return `${sizeKb} KB`;
}

function formatByteSize(size: number) {
  if (size <= 0) {
    return '0 B';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function selectedFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.');
  if (index < 0) {
    return '';
  }
  return fileName.slice(index + 1).toLowerCase();
}

function resetFilePreviewTextState() {
  filePreviewTextBlob.value = null;
  filePreviewTextCanExpand.value = false;
  filePreviewTextExpanded.value = false;
  filePreviewTextTotalBytes.value = 0;
  isFilePreviewTextExpanding.value = false;
}

async function setTextPreviewContentFromBlob(blob: Blob, expandFull = false) {
  filePreviewTextBlob.value = blob;
  filePreviewTextTotalBytes.value = blob.size;
  filePreviewTextCanExpand.value = blob.size > textPreviewSliceBytes;

  if (!filePreviewTextCanExpand.value || expandFull) {
    filePreviewText.value = await blob.text();
    filePreviewTextExpanded.value = filePreviewTextCanExpand.value;
    return;
  }

  filePreviewText.value = await blob.slice(0, textPreviewSliceBytes).text();
  filePreviewTextExpanded.value = false;
}

function filePreviewTextHint() {
  if (!filePreviewTextCanExpand.value) {
    return '';
  }
  if (filePreviewTextExpanded.value) {
    return `已展开全文，文件大小 ${formatByteSize(filePreviewTextTotalBytes.value)}`;
  }
  return `当前仅显示前 ${formatByteSize(textPreviewSliceBytes)}，完整文件为 ${formatByteSize(filePreviewTextTotalBytes.value)}`;
}

function revokeFilePreviewUrl() {
  if (!filePreviewUrl.value) {
    return;
  }
  URL.revokeObjectURL(filePreviewUrl.value);
  filePreviewUrl.value = '';
}

function resetFilePreviewState() {
  isFilePreviewLoading.value = false;
  previewLoadingSavedFileId.value = null;
  previewLoadingSelectedFileKey.value = null;
  filePreviewKind.value = 'unsupported';
  filePreviewText.value = '';
  filePreviewName.value = '';
  resetFilePreviewTextState();
  revokeFilePreviewUrl();
}

async function toggleFilePreviewTextExpand() {
  if (!filePreviewTextBlob.value || !filePreviewTextCanExpand.value) {
    return;
  }

  isFilePreviewTextExpanding.value = true;
  try {
    await setTextPreviewContentFromBlob(filePreviewTextBlob.value, !filePreviewTextExpanded.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载文本预览失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isFilePreviewTextExpanding.value = false;
  }
}

function isLocalFilePreviewable(file: File) {
  const kind = detectFilePreviewKind(getFileExtension(file.name), file.type || '');
  return kind !== 'unsupported';
}

function isSavedFilePreviewable(file: TaskSubmissionFile) {
  if (typeof file.previewable === 'boolean') {
    return file.previewable;
  }
  return detectFilePreviewKind(file.ext || '', file.mime_type || '') !== 'unsupported';
}

async function previewSelectedFile(file: File) {
  const previewKind = detectFilePreviewKind(getFileExtension(file.name), file.type || '');
  if (previewKind === 'unsupported') {
    ElMessage.info('当前文件暂不支持在线预览，请下载后查看');
    return;
  }

  filePreviewDialogVisible.value = true;
  filePreviewName.value = file.name;
  filePreviewKind.value = 'unsupported';
  filePreviewText.value = '';
  resetFilePreviewTextState();
  revokeFilePreviewUrl();
  isFilePreviewLoading.value = true;
  previewLoadingSelectedFileKey.value = selectedFileKey(file);
  previewLoadingSavedFileId.value = null;

  try {
    filePreviewKind.value = previewKind;
    if (previewKind === 'text') {
      await setTextPreviewContentFromBlob(file, false);
      return;
    }
    filePreviewUrl.value = URL.createObjectURL(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载附件预览失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isFilePreviewLoading.value = false;
    previewLoadingSelectedFileKey.value = null;
  }
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFiles.value = Array.from(input.files || []);
}

function removeSelectedFile(fileName: string) {
  selectedFiles.value = selectedFiles.value.filter((file) => file.name !== fileName);
  if (!selectedFiles.value.length && fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function clearSelectedFiles() {
  selectedFiles.value = [];
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function getDownloadFileName(contentDisposition: string | null, fallbackName: string) {
  if (!contentDisposition) {
    return fallbackName;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return basicMatch?.[1] || fallbackName;
}

async function downloadSavedFile(file: TaskSubmissionFile) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }

  downloadLoadingFileId.value = file.id;
  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载附件失败');
  } finally {
    downloadLoadingFileId.value = null;
  }
}

async function previewSavedFile(file: TaskSubmissionFile) {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }
  if (!isSavedFilePreviewable(file)) {
    ElMessage.info('当前文件暂不支持在线预览，请下载后查看');
    return;
  }

  filePreviewDialogVisible.value = true;
  filePreviewName.value = file.name;
  filePreviewKind.value = 'unsupported';
  filePreviewText.value = '';
  resetFilePreviewTextState();
  revokeFilePreviewUrl();
  isFilePreviewLoading.value = true;
  previewLoadingSavedFileId.value = file.id;
  previewLoadingSelectedFileKey.value = null;

  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, authStore.token);
    const blob = await response.blob();
    const nextKind = detectFilePreviewKind(file.ext || '', blob.type || file.mime_type || '');
    filePreviewKind.value = nextKind;
    if (nextKind === 'text') {
      await setTextPreviewContentFromBlob(blob, false);
      return;
    }
    if (nextKind === 'image' || nextKind === 'pdf') {
      filePreviewUrl.value = URL.createObjectURL(blob);
      return;
    }
    ElMessage.info('当前文件暂不支持在线预览，请下载后查看');
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载附件预览失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isFilePreviewLoading.value = false;
    previewLoadingSavedFileId.value = null;
  }
}

function isTaskRuntimeRequestMessage(value: unknown): value is TaskRuntimeRequestMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<TaskRuntimeRequestMessage>;
  return (
    payload.source === 'learnsite-task-runtime-request' &&
    typeof payload.requestId === 'string' &&
    typeof payload.taskId === 'number' &&
    typeof payload.url === 'string'
  );
}

function toTaskRuntimeResponseMessage(
  requestId: string,
  payload: Omit<TaskRuntimeResponseMessage, 'source' | 'requestId'>
): TaskRuntimeResponseMessage {
  return {
    source: 'learnsite-task-runtime-response',
    requestId,
    ...payload,
  };
}

function postTaskRuntimeResponse(target: MessageEventSource | null, message: TaskRuntimeResponseMessage) {
  if (!target || typeof (target as WindowProxy).postMessage !== 'function') {
    return;
  }
  (target as WindowProxy).postMessage(message, '*');
}

function normalizeTaskRuntimeUrl(rawUrl: string) {
  if (!taskDetail.value?.id) {
    return '';
  }
  try {
    const targetUrl = new URL(rawUrl, window.location.href);
    const taskBaseUrl = new URL(buildAbsoluteApiUrl(`${apiBaseUrl}/tasks/${taskDetail.value.id}/`));
    if (!targetUrl.pathname.startsWith(taskBaseUrl.pathname)) {
      return '';
    }
    return new URL(`${targetUrl.pathname}${targetUrl.search}`, taskBaseUrl.origin).toString();
  } catch {
    return '';
  }
}

function decodeTaskRuntimeBody(message: TaskRuntimeRequestMessage) {
  if (message.bodyKind === 'text') {
    return message.bodyValue || '';
  }
  if (message.bodyKind === 'base64') {
    const binary = window.atob(message.bodyValue || '');
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: message.bodyMimeType || 'application/octet-stream' });
  }
  return undefined;
}

async function encodeTaskRuntimeResponseBody(response: Response) {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return window.btoa(binary);
}

async function forwardTaskRuntimeRequest(message: TaskRuntimeRequestMessage) {
  const normalizedUrl = normalizeTaskRuntimeUrl(message.url);
  if (!normalizedUrl) {
    throw new Error('Task runtime request is not allowed');
  }
  const requestHeaders = new Headers(message.headers || {});
  requestHeaders.delete('authorization');
  requestHeaders.delete('cookie');

  const executeFetch = async () =>
    fetch(normalizedUrl, {
      method: message.method || 'GET',
      headers: requestHeaders,
      body: decodeTaskRuntimeBody(message),
      credentials: 'include',
    });

  let response = await executeFetch();
  if (response.status === 401 && (await ensureTaskRuntimeSession(true))) {
    response = await executeFetch();
  }
  return response;
}

async function handleTaskRuntimeMessage(event: MessageEvent) {
  if (!isTaskRuntimeRequestMessage(event.data)) {
    return;
  }
  const message = event.data;
  if (!taskDetail.value?.id || message.taskId !== taskDetail.value.id) {
    postTaskRuntimeResponse(
      event.source,
      toTaskRuntimeResponseMessage(message.requestId, { error: 'Task runtime target mismatch' })
    );
    return;
  }
  if (!normalizeTaskRuntimeUrl(message.url)) {
    postTaskRuntimeResponse(
      event.source,
      toTaskRuntimeResponseMessage(message.requestId, { error: 'Task runtime request is not allowed' })
    );
    return;
  }

  try {
    await ensureTaskRuntimeSession();
    const response = await forwardTaskRuntimeRequest(message);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const bodyBase64 = await encodeTaskRuntimeResponseBody(response);
    postTaskRuntimeResponse(
      event.source,
      toTaskRuntimeResponseMessage(message.requestId, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        bodyBase64,
      })
    );
  } catch (error) {
    postTaskRuntimeResponse(
      event.source,
      toTaskRuntimeResponseMessage(message.requestId, {
        error: error instanceof Error ? error.message : 'Task runtime request failed',
      })
    );
  }
}

async function loadTask() {
  const activeTaskId = normalizeRouteParam(route.params.taskId as string | string[] | undefined);
  if (!activeTaskId) {
    return;
  }

  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  const requestId = ++latestLoadTaskRequestId;
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiGet<TaskDetailPayload>(`/tasks/${activeTaskId}`, authStore.token);
    if (
      requestId !== latestLoadTaskRequestId ||
      normalizeRouteParam(route.params.taskId as string | string[] | undefined) !== activeTaskId
    ) {
      return;
    }
    hydrateTaskDetail(payload);
    if (payload.task_type === 'web_page' || payload.task_type === 'data_submit') {
      if (taskRuntimeSessionTaskId.value !== payload.id) {
        taskRuntimeSessionExpiresAt.value = null;
      }
      await ensureTaskRuntimeSession(true, payload.id);
    } else {
      taskRuntimeSessionTaskId.value = null;
      taskRuntimeSessionExpiresAt.value = null;
    }
    if (payload.task_type === 'discussion') {
      await loadDiscussionFeed();
    } else {
      discussionPosts.value = [];
    }
  } catch (error) {
    if (requestId !== latestLoadTaskRequestId) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : '加载活动详情失败';
  } finally {
    if (requestId === latestLoadTaskRequestId) {
      isLoading.value = false;
    }
  }
}

async function loadDiscussionFeed() {
  if (!taskDetail.value?.id || !authStore.token) {
    discussionPosts.value = [];
    return;
  }

  isDiscussionLoading.value = true;
  try {
    const payload = await apiGet<DiscussionFeedPayload>(
      `/tasks/${taskDetail.value.id}/discussion`,
      authStore.token
    );
    discussionPosts.value = normalizeDiscussionFeedItems(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载讨论内容失败';
    errorMessage.value = message;
    discussionPosts.value = [];
  } finally {
    isDiscussionLoading.value = false;
  }
}

async function postDiscussionReply() {
  if (!taskDetail.value?.id || !authStore.token) {
    return;
  }
  const discussionContent = normalizeRichTextHtml(submissionNote.value);
  if (!discussionContent) {
    ElMessage.warning('请先在提交说明中输入讨论内容');
    return;
  }

  isPostingDiscussion.value = true;
  try {
    await apiPost(
      `/tasks/${taskDetail.value.id}/discussion/posts`,
      { content: discussionContent },
      authStore.token
    );
    await loadDiscussionFeed();
    ElMessage.success('讨论回复已发布');
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布讨论回复失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isPostingDiscussion.value = false;
  }
}

function applyGroupDraft() {
  if (!currentGroupDraft.value) {
    return;
  }
  submissionNote.value = currentGroupDraft.value.submission_note || '';
  ElMessage.success('已恢复到小组共享草稿');
}

async function refreshTaskDetail() {
  isRefreshingTask.value = true;
  try {
    await loadTask();
    ElMessage.success('已刷新协作内容');
  } finally {
    isRefreshingTask.value = false;
  }
}

async function saveGroupDraft() {
  if (!taskDetail.value?.group_collaboration || !authStore.token) {
    return;
  }
  if (!groupDiscussionEnabled.value) {
    const message = groupDiscussionMessage.value || '课堂暂时关闭了小组讨论。';
    errorMessage.value = message;
    ElMessage.warning(message);
    return;
  }

  isGroupDraftSaving.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPut<GroupTaskDraft | null>(
      `/tasks/${taskDetail.value.id}/group-draft`,
      { submission_note: normalizeRichTextHtml(submissionNote.value), source_code: '' },
      authStore.token
    );
    if (taskDetail.value) {
      taskDetail.value.group_draft = payload;
    }
    ElMessage.success(payload ? '已同步到小组共享草稿' : '已清空小组共享草稿');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '同步小组草稿失败';
  } finally {
    isGroupDraftSaving.value = false;
  }
}

async function submitTask() {
  if (!taskDetail.value || !authStore.token) {
    return;
  }
  if (!taskDetail.value.can_submit) {
    const message = submitBlockedMessage.value || '当前活动暂不可提交。';
    errorMessage.value = message;
    ElMessage.warning(message);
    return;
  }

  const hadSubmission = Boolean(currentSubmission.value);
  const formData = new FormData();
  formData.append('submission_note', normalizeRichTextHtml(submissionNote.value));
  selectedFiles.value.forEach((file) => {
    formData.append('files', file);
  });

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiUpload<TaskDetailPayload>(
      `/tasks/${taskDetail.value.id}/submit`,
      formData,
      authStore.token
    );
    hydrateTaskDetail(payload);
    ElMessage.success(
      taskDetail.value.submission_scope === 'group'
        ? hadSubmission
          ? '小组作品已更新提交'
          : '小组作品提交成功'
        : hadSubmission
          ? '作品已更新提交'
          : '作品提交成功'
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '提交作品失败';
  } finally {
    isSubmitting.value = false;
  }
}

async function revokeReviewedSubmission() {
  if (!currentSubmission.value || !authStore.token) {
    errorMessage.value = '请先登录学生账号';
    return;
  }
  if (currentSubmission.value.status !== 'reviewed') {
    ElMessage.info('当前作品未处于已评阅状态');
    return;
  }

  isRevokingReview.value = true;
  try {
    await apiPost(`/submissions/${currentSubmission.value.id}/revoke`, {}, authStore.token);
    ElMessage.success('已撤销评阅，可继续提交修改');
    await loadTask();
  } catch (error) {
    const message = error instanceof Error ? error.message : '撤销评阅失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    isRevokingReview.value = false;
  }
}

async function goToCourse() {
  const targetPath = resolveCourseRoutePath();
  if (!targetPath) {
    ElMessage.warning('课程信息未加载完成，请稍后重试');
    return;
  }
  await navigateToPath(targetPath);
}

function buildTaskRoute(task: NavigationTask) {
  const courseId = resolveCourseId();
  if (!courseId) {
    return '';
  }
  if (task.task_type === 'reading') {
    return `/student/courses/${courseId}/readings/${task.id}`;
  }
  if (task.task_type === 'programming') {
    return `/student/courses/${courseId}/programs/${task.id}`;
  }
  return `/student/courses/${courseId}/tasks/${task.id}`;
}

async function openNavigationTask(task: NavigationTask) {
  const targetPath = buildTaskRoute(task);
  if (!targetPath) {
    ElMessage.warning('活动路由解析失败，请刷新页面后重试');
    return;
  }
  await navigateToPath(targetPath);
}

async function goToWorkDetail() {
  if (!currentSubmission.value) {
    return;
  }
  await router.push(`/student/work/${currentSubmission.value.id}`);
}

async function goToPeerReview() {
  await router.push(`/student/reviews/${route.params.taskId}`);
}

function openTaskResourceInNewTab(url: string, label: 'submit' | 'visualization') {
  const pageLabel = label === 'submit' ? '数据提交页' : '数据可视化页';

  if (!url) {
    ElMessage.warning(`${pageLabel} 还没有可打开的页面资源`);
    return;
  }

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!openedWindow) {
    ElMessage.warning(`浏览器拦截了${pageLabel}的新标签页，请允许弹窗后重试`);
  }
}

onMounted(() => {
  window.addEventListener('message', handleTaskRuntimeMessage);
  void loadTask();
});

watch(
  () => normalizeRouteParam(route.params.taskId as string | string[] | undefined),
  (nextTaskId, previousTaskId) => {
    if (!nextTaskId) {
      return;
    }
    if (nextTaskId === previousTaskId) {
      return;
    }
    void loadTask();
  }
);

onBeforeUnmount(() => {
  latestLoadTaskRequestId += 1;
  latestRuntimeSessionRequestId += 1;
  resetFilePreviewState();
  window.removeEventListener('message', handleTaskRuntimeMessage);
});
</script>

<style scoped>
.sw-task {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-task__status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border: 1px solid var(--sw-line);
  border-radius: var(--sw-r-card);
  background: var(--sw-surface);
}

.sw-task__status-note {
  min-width: 0;
  overflow: hidden;
  color: var(--sw-muted);
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sw-task__main {
  display: grid;
  gap: var(--sw-gap);
  min-width: 0;
}

.sw-prose {
  max-width: 76ch;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.75;
}

/* 讨论 */
.sw-task__discussion {
  display: grid;
  gap: 16px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--sw-line-soft);
}

.sw-task__posts {
  display: grid;
  gap: 10px;
}

.sw-task__post,
.sw-task__reply {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.sw-task__reply {
  border: 0;
  background: var(--sw-surface);
}

.sw-task__post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--sw-muted);
  font-size: 12px;
}

.sw-task__post-meta strong {
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 600;
}

.sw-task__post-body {
  margin: 0;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.7;
}

.sw-task__post-body :deep(p:last-child),
.sw-task__post-body :deep(ul:last-child),
.sw-task__post-body :deep(ol:last-child),
.sw-task__post-body :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.sw-task__replies {
  display: grid;
  gap: 8px;
  padding-left: 14px;
  border-left: 1px solid var(--sw-line);
}

/* 嵌入页 */
.sw-task__embed {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.sw-task__embed-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-embed-frame {
  width: 100%;
  min-height: 520px;
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: #ffffff;
}

/* 提交表单 */
.sw-task__form {
  display: grid;
  gap: 14px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--sw-line-soft);
}

.sw-task__form-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}

.sw-task__form-head--files {
  margin-top: 6px;
}

.sw-task__form-title {
  margin: 0;
  color: var(--sw-ink);
  font-size: 15px;
  font-weight: 600;
}

.sw-task__form-hint {
  color: var(--sw-muted);
  font-size: 12px;
  line-height: 1.5;
}

.sw-task__form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.submission-editor {
  margin-bottom: 4px;
}

.file-input {
  display: none;
}

.sw-task__files {
  display: grid;
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  overflow: hidden;
}

.sw-file {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  padding: 10px 14px;
}

.sw-file + .sw-file {
  border-top: 1px solid var(--sw-line-soft);
}

.sw-file__main {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.sw-file__name {
  overflow: hidden;
  color: var(--sw-ink);
  font-size: 13.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sw-file__meta {
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sw-file__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.sw-task__files .sw-empty {
  padding: 14px;
}

/* 右栏 */
.sw-meta {
  display: grid;
  gap: 0;
  margin: 0;
}

.sw-meta > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

.sw-meta > div + div {
  border-top: 1px solid var(--sw-line-soft);
}

.sw-meta dt {
  flex: none;
  color: var(--sw-muted);
  font-size: 12px;
}

.sw-meta dd {
  margin: 0;
  overflow: hidden;
  color: var(--sw-ink);
  font-size: 13px;
  text-align: right;
  text-overflow: ellipsis;
}

.sw-meta__num {
  font-variant-numeric: tabular-nums;
}

.sw-task__comment {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.sw-task__comment-title {
  margin: 0 0 6px;
  color: var(--sw-ink);
  font-size: 12px;
  font-weight: 600;
}

.sw-task__comment-body {
  margin: 0;
  color: var(--sw-text);
  font-size: 13px;
  line-height: 1.65;
}

.sw-task__comment-body :deep(p:last-child),
.sw-task__comment-body :deep(ul:last-child),
.sw-task__comment-body :deep(ol:last-child),
.sw-task__comment-body :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.sw-task__submit {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.sw-task__hint {
  margin: 0;
  color: var(--sw-muted);
  font-size: 12px;
  line-height: 1.5;
}

.sw-task__draft {
  margin: 0 0 6px;
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 500;
}

.sw-task__draft-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

/* 附件预览弹窗 */
.file-preview-stage {
  min-height: 320px;
}

.file-preview-frame {
  width: 100%;
  min-height: 68vh;
  border: none;
  border-radius: 8px;
  background: #ffffff;
}

.file-preview-image {
  display: block;
  max-width: 100%;
  max-height: 68vh;
  margin: 0 auto;
  border-radius: 8px;
}

.file-preview-text-shell {
  display: grid;
  gap: 10px;
}

.file-preview-text-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.file-preview-text-toolbar p {
  margin: 0;
  color: var(--sw-muted);
  font-size: 12px;
}

.file-preview-text {
  margin: 0;
  max-height: 68vh;
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  background: var(--ls-code-bg);
  color: var(--ls-code-text);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.file-preview-fallback {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  text-align: center;
  color: var(--sw-muted);
}

.file-preview-fallback p {
  margin: 0;
}

@media (max-width: 960px) {
  .sw-task__status {
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .sw-task__status-note {
    white-space: normal;
  }

  .task-embed-frame {
    min-height: 420px;
  }
}
</style>
