<template>
  <div class="sw-program">
    <StudentPageHead :title="taskDetail?.title || `代码任务 ${route.params.taskId}`" :sub="headSub">
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
      <div class="sw-program__status">
        <span :class="['sw-chip', statusChipClass]">{{ submissionStatusLabel }}</span>
        <span class="sw-program__status-note">{{ submissionStatusNote }}</span>
      </div>

      <div class="sw-split">
        <div class="sw-program__main">
          <StudentPanel title="代码" :count="draftStatusLabel">
            <div class="code-toolbar">
              <p class="code-toolbar__name">{{ generatedCodeDisplayName }}</p>
              <div v-if="taskDetail.can_submit" class="code-toolbar__actions">
                <n-button size="small" secondary @click="restoreStarterCode">恢复起始代码</n-button>
                <n-button v-if="hasSubmittedCode" size="small" secondary @click="restoreSubmittedWork">
                  恢复最近提交
                </n-button>
                <n-button v-if="hasLocalDraft" size="small" secondary @click="clearLocalDraftManually">
                  清除本地草稿
                </n-button>
              </div>
            </div>

            <div v-if="taskDetail.can_submit" class="code-editor-shell">
              <textarea v-model="sourceCode" class="code-textarea" spellcheck="false"></textarea>
            </div>
            <pre v-else class="code-block">{{ sourceCode || '最近提交中没有检测到代码文件。' }}</pre>

            <div class="editor-footnote">
              <span>行数 {{ codeLineCount }}</span>
              <span>字符 {{ sourceCode.length }}</span>
              <span>{{ draftFootnote }}</span>
            </div>
          </StudentPanel>

          <StudentPanel title="任务说明">
            <div class="sw-prose">
              <RichTextContent :html="taskDetail.description" empty-text="当前代码任务还没有补充说明。" />
            </div>
          </StudentPanel>

          <StudentPanel title="实现说明">
            <RichTextEditor
              v-if="taskDetail.can_submit"
              v-model="reflectionNote"
              :min-height="220"
              placeholder="补充你的解题思路、关键步骤、运行结果说明或需要老师关注的地方。"
            />
            <div v-else class="sw-prose">
              <RichTextContent :html="reflectionNote" empty-text="这次提交没有填写额外说明。" />
            </div>
          </StudentPanel>

          <StudentPanel title="附件处理" flush>
            <div class="sw-program__files">
              <article class="sw-file">
                <span class="sw-file__main">
                  <span class="sw-file__name">{{ generatedCodeDisplayName }}</span>
                  <span class="sw-file__meta">主代码文件 · 提交时按编辑器内容自动生成</span>
                </span>
                <span class="sw-chip">自动生成</span>
              </article>

              <article v-for="file in selectedFiles" :key="selectedFileKey(file)" class="sw-file">
                <span class="sw-file__main">
                  <span class="sw-file__name">{{ file.name }}</span>
                  <span class="sw-file__meta">{{ formatFileSize(file.size) }} · 本次新增</span>
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
                v-for="file in currentSubmission?.files || []"
                :key="`saved-${file.id}`"
                class="sw-file"
              >
                <span class="sw-file__main">
                  <span class="sw-file__name">{{ file.name }}</span>
                  <span class="sw-file__meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB · 已保存</span>
                </span>
                <span class="sw-file__actions">
                  <span v-if="file.id === sourceCodeFileId" class="sw-chip">由编辑器替换</span>
                  <span v-else-if="keptExistingFileIds.includes(file.id)" class="sw-chip sw-chip--done">本次保留</span>
                  <span v-else class="sw-chip sw-chip--todo">本次不保留</span>
                  <n-button
                    v-if="file.id !== sourceCodeFileId && taskDetail.can_submit"
                    text
                    @click="toggleRetainedFile(file.id)"
                  >
                    {{ keptExistingFileIds.includes(file.id) ? '不保留' : '恢复保留' }}
                  </n-button>
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

              <p v-if="!selectedFiles.length && !currentSubmission?.files.length" class="sw-empty">
                暂时还没有提交附件。
              </p>
            </div>
          </StudentPanel>
        </div>

        <aside class="sw-split__aside">
          <StudentPanel title="提交">
            <dl class="sw-meta">
              <div><dt>课程</dt><dd>{{ taskDetail.course.title }}</dd></div>
              <div><dt>课次</dt><dd>{{ taskDetail.course.lesson_title }}</dd></div>
              <div><dt>最近提交</dt><dd>{{ formatDateTime(currentSubmission?.updated_at || null) }}</dd></div>
              <div><dt>提交方式</dt><dd>{{ taskDetail.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}</dd></div>
              <div v-if="currentSubmission?.submission_scope === 'group'">
                <dt>提交人</dt><dd>{{ currentSubmission?.submitted_by_name || '组内成员' }}</dd>
              </div>
              <div v-if="currentSubmission?.score !== null && currentSubmission?.score !== undefined">
                <dt>得分</dt><dd class="sw-meta__num">{{ currentSubmission.score }} 分</dd>
              </div>
            </dl>

            <div v-if="currentSubmission?.teacher_comment" class="sw-program__comment">
              <p class="sw-program__comment-title">教师评语</p>
              <RichTextContent
                class="sw-program__comment-body"
                :html="currentSubmission.teacher_comment"
                empty-text=""
                sanitize-preset="strict"
              />
            </div>

            <input
              ref="fileInputRef"
              class="file-input"
              multiple
              type="file"
              @change="handleFileChange"
            />

            <div class="sw-program__submit">
              <n-button :disabled="!taskDetail.can_submit" secondary @click="openFilePicker">
                选择补充附件
              </n-button>
              <n-button
                v-if="selectedFiles.length"
                :disabled="isSubmitting"
                secondary
                @click="clearSelectedFiles"
              >
                清空本次新增附件
              </n-button>
              <n-button
                block
                :disabled="!taskDetail.can_submit"
                :loading="isSubmitting"
                type="primary"
                @click="submitTask"
              >
                {{ submitButtonText }}
              </n-button>
              <p class="sw-program__hint">提交即保存；教师评价前可以再次提交覆盖。</p>
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

          <StudentPanel v-if="taskDetail.group_collaboration" title="小组共享草稿">
            <p class="sw-program__draft">
              {{ currentGroupDraft ? `版本 ${currentGroupDraft.version_no} · ${currentGroupDraft.updated_by_name || '组内成员'}` : '组内还没有共享草稿' }}
            </p>
            <p class="sw-program__hint">{{ groupDraftMeta }}</p>
            <div class="sw-program__draft-actions">
              <n-button
                size="small"
                :disabled="!groupDraftActionsEnabled"
                :loading="isGroupDraftSaving"
                secondary
                @click="saveGroupDraft"
              >
                同步代码到小组草稿
              </n-button>
              <n-button size="small" :disabled="!currentGroupDraft" secondary @click="restoreGroupDraft">
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
        description="优秀代码作品会在这里集中展示，方便同学参考结构、说明方式和附件组织。"
        empty-description="当前代码任务还没有推荐作品。"
        title="推荐代码作品"
      />

      <GroupDraftHistoryDialog
        v-if="taskDetail.group_collaboration"
        v-model="isGroupDraftHistoryVisible"
        :code-enabled="true"
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
import { NAlert, NButton, NDropdown, NEmpty, NModal, NSkeleton, NSpin } from 'naive-ui';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
import { normalizeRichTextHtml } from '@/utils/richText';

type NavigationTask = {
  id: number;
  title: string;
  task_type: string;
};

type TaskSubmissionFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
  mime_type: string;
  previewable: boolean;
};

type TaskSubmission = {
  id: number;
  status: 'submitted' | 'reviewed';
  score: number | null;
  is_recommended: boolean;
  peer_review_score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  can_resubmit: boolean;
  submission_scope: 'individual' | 'group';
  group_id: number | null;
  group_name: string | null;
  group_no: number | null;
  submitted_by_name: string | null;
  submitted_by_student_no: string | null;
  files: TaskSubmissionFile[];
};

type RecommendedSubmissionFile = TaskSubmissionFile;

type RecommendedSubmissionItem = {
  submission_id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  files: RecommendedSubmissionFile[];
};

type GroupTaskDraft = {
  id: number;
  submission_note: string | null;
  source_code: string | null;
  version_no: number;
  updated_at: string | null;
  updated_by_name: string | null;
  updated_by_student_no: string | null;
};

type ProgrammingTaskPayload = {
  id: number;
  title: string;
  task_type: string;
  submission_scope: 'individual' | 'group';
  description: string | null;
  is_required: boolean;
  course: {
    id: number;
    title: string;
    assigned_date: string;
    lesson_title: string;
    unit_title: string;
    book_title: string;
    content: string | null;
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

type LocalDraft = {
  code: string;
  note: string;
  updated_at: string;
};

type FilePreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';

const textPreviewSliceBytes = 256 * 1024;
const CODE_FILE_EXTENSIONS = new Set(['py', 'txt', 'md', 'html', 'css', 'js', 'ts', 'json']);
const previewableImageExtensions = new Set(['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const previewableTextExtensions = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'log',
  'html',
  'css',
  'js',
  'ts',
  'xml',
  'yml',
  'yaml',
  'py',
]);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const taskDetail = ref<ProgrammingTaskPayload | null>(null);
const sourceCode = ref('');
const reflectionNote = ref('');
const submittedCode = ref('');
const sourceCodeFileId = ref<number | null>(null);
const selectedFiles = ref<File[]>([]);
const keptExistingFileIds = ref<number[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isLoading = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const downloadLoadingFileId = ref<number | null>(null);
const isGroupDraftSaving = ref(false);
const isRefreshingTask = ref(false);
const isGroupDraftHistoryVisible = ref(false);
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
const editorOrigin = ref<'starter' | 'submission' | 'local' | 'group'>('starter');
const localDraftUpdatedAt = ref<string | null>(null);

let draftPersistTimer: number | null = null;
let isHydratingForm = false;

const currentSubmission = computed(() => taskDetail.value?.current_submission || null);
const currentGroupDraft = computed(() => taskDetail.value?.group_draft || null);
const submitBlockedMessage = computed(() => taskDetail.value?.submit_blocked_message || '');
const groupDiscussionCapability = computed(() => taskDetail.value?.classroom_capabilities?.group_discussion);
const groupDiscussionEnabled = computed(() => groupDiscussionCapability.value?.enabled ?? true);
const groupDiscussionMessage = computed(() => groupDiscussionCapability.value?.message || '');
const groupDraftActionsEnabled = computed(
  () => Boolean(taskDetail.value?.can_submit) && groupDiscussionEnabled.value
);
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
    options.push({ label: '上一个任务', key: 'prev' });
  }
  if (taskDetail.value?.task_navigation.next_task) {
    options.push({ label: '下一个任务', key: 'next' });
  }
  options.push({ label: '作品互评', key: 'peer-review' });
  if (currentSubmission.value) {
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

const generatedCodeDisplayName = computed(() => buildGeneratedCodeFileName(taskDetail.value?.id || Number(route.params.taskId)));
const codeLineCount = computed(() => (sourceCode.value ? sourceCode.value.split(/\r?\n/).length : 0));
const hasSubmittedCode = computed(() => Boolean(submittedCode.value.trim()));
const hasLocalDraft = computed(() => editorOrigin.value === 'local' && Boolean(localDraftUpdatedAt.value));
const submissionStatusLabel = computed(() => {
  if (!currentSubmission.value) {
    return '未提交';
  }
  return currentSubmission.value.status === 'reviewed' ? '已评价' : '待教师评价';
});
const submissionStatusNote = computed(() => {
  if (!currentSubmission.value) {
    return taskDetail.value?.submission_scope === 'group' ? '你的小组还没有提交这项代码任务。' : '你还没有提交这项代码任务。';
  }
  if (currentSubmission.value.status === 'reviewed') {
    return '教师已经完成评价，本次提交入口会关闭。';
  }
  return taskDetail.value?.submission_scope === 'group'
    ? '当前是小组共同作品，重新提交会覆盖本组当前保存内容。'
    : '当前作品尚未评价，可以继续修改后再次提交。';
});
const draftStatusLabel = computed(() => {
  if (editorOrigin.value === 'local') {
    return '本地草稿';
  }
  if (editorOrigin.value === 'submission') {
    return '最近提交';
  }
  if (editorOrigin.value === 'group') {
    return '小组草稿';
  }
  return '起始代码';
});
const draftFootnote = computed(() => {
  if (editorOrigin.value === 'local' && localDraftUpdatedAt.value) {
    return `本地草稿保存于 ${formatDateTime(localDraftUpdatedAt.value)}`;
  }
  if (editorOrigin.value === 'group' && localDraftUpdatedAt.value) {
    return `小组草稿同步于 ${formatDateTime(localDraftUpdatedAt.value)}`;
  }
  if (editorOrigin.value === 'submission') {
    return '已载入最近一次提交的代码与说明。';
  }
  return '已载入任务起始代码，可在此基础上继续完成。';
});
const submitButtonText = computed(() => {
  if (!taskDetail.value) {
    return '提交代码作品';
  }
  if (taskDetail.value.submission_scope === 'group') {
    return currentSubmission.value ? '再次提交小组代码作品' : '提交小组代码作品';
  }
  return currentSubmission.value ? '再次提交代码作品' : '提交代码作品';
});
const groupDraftSummary = computed(() => {
  if (!taskDetail.value?.group_collaboration) {
    return '当前任务不是小组共同编辑任务。';
  }
  if (!currentGroupDraft.value) {
    return '组内还没有共享草稿，可以先同步代码和实现说明，再由组员继续补充。';
  }
  return currentGroupDraft.value.source_code
    ? '当前可以恢复到组内最近一次共享的代码与说明。'
    : '当前共享草稿中还没有同步代码内容。';
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

function buildDraftStorageKey() {
  return `learnsite-code-draft:${authStore.user?.id || 'student'}:${route.params.taskId}`;
}

function buildGeneratedCodeFileName(taskId: number) {
  return `learnsite-task-${taskId}.py`;
}

function buildStarterCode(payload: ProgrammingTaskPayload) {
  return [
    `# ${payload.title}`,
    '# 在这里编写你的 Python 程序',
    '# 提交时系统会自动生成 .py 附件',
    '',
    'def main():',
    '    print("请在这里完成任务")',
    '',
    '',
    'if __name__ == "__main__":',
    '    main()',
  ].join('\n');
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
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

function detectFilePreviewKind(ext: string, mimeType: string): FilePreviewKind {
  const normalizedExt = ext.toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedExt === 'pdf' || normalizedMimeType.includes('pdf')) {
    return 'pdf';
  }
  if (normalizedMimeType.startsWith('image/') || previewableImageExtensions.has(normalizedExt)) {
    return 'image';
  }
  if (normalizedMimeType.startsWith('text/') || previewableTextExtensions.has(normalizedExt)) {
    return 'text';
  }
  return 'unsupported';
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
  return detectFilePreviewKind(getFileExtension(file.name), file.type || '') !== 'unsupported';
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

function groupRoleLabel(role: string | null | undefined) {
  if (role === 'leader') {
    return '组长';
  }
  if (role === 'member') {
    return '组员';
  }
  return '未分组成员';
}

function buildTaskRoute(task: NavigationTask) {
  const courseId = taskDetail.value?.course.id || route.params.courseId;
  if (task.task_type === 'reading') {
    return `/student/courses/${courseId}/readings/${task.id}`;
  }
  if (task.task_type === 'programming') {
    return `/student/courses/${courseId}/programs/${task.id}`;
  }
  return `/student/courses/${courseId}/tasks/${task.id}`;
}

function loadLocalDraft(): LocalDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(buildDraftStorageKey());
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    return {
      code: typeof parsed.code === 'string' ? parsed.code : '',
      note: typeof parsed.note === 'string' ? parsed.note : '',
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : '',
    };
  } catch {
    return null;
  }
}

function clearDraftStorage() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(buildDraftStorageKey());
  localDraftUpdatedAt.value = null;
}

function persistLocalDraftNow() {
  if (typeof window === 'undefined' || !taskDetail.value?.can_submit) {
    return;
  }

  const normalizedCode = sourceCode.value.replace(/\r\n/g, '\n');
  const normalizedNote = normalizeRichTextHtml(reflectionNote.value);
  if (!normalizedCode.trim() && !normalizedNote) {
    clearDraftStorage();
    return;
  }

  const draft: LocalDraft = {
    code: normalizedCode,
    note: normalizedNote,
    updated_at: new Date().toISOString(),
  };
  window.localStorage.setItem(buildDraftStorageKey(), JSON.stringify(draft));
  editorOrigin.value = 'local';
  localDraftUpdatedAt.value = draft.updated_at;
}

function scheduleLocalDraftPersist() {
  if (draftPersistTimer !== null) {
    window.clearTimeout(draftPersistTimer);
  }
  draftPersistTimer = window.setTimeout(() => {
    persistLocalDraftNow();
    draftPersistTimer = null;
  }, 400);
}

function applyEditorState(
  code: string,
  note: string,
  origin: 'starter' | 'submission' | 'local' | 'group',
  updatedAt: string | null = null
) {
  isHydratingForm = true;
  sourceCode.value = code;
  reflectionNote.value = note;
  editorOrigin.value = origin;
  localDraftUpdatedAt.value = updatedAt;
  isHydratingForm = false;
}

function restoreStarterCode() {
  if (!taskDetail.value) {
    return;
  }
  clearDraftStorage();
  applyEditorState(buildStarterCode(taskDetail.value), reflectionNote.value, 'starter');
  ElMessage.success('已恢复起始代码');
}

function restoreSubmittedWork() {
  if (!taskDetail.value) {
    return;
  }
  clearDraftStorage();
  applyEditorState(
    submittedCode.value || (taskDetail.value.can_submit ? buildStarterCode(taskDetail.value) : ''),
    currentSubmission.value?.submission_note || '',
    'submission'
  );
  ElMessage.success('已恢复最近一次提交内容');
}

function restoreGroupDraft() {
  if (!taskDetail.value || !currentGroupDraft.value) {
    return;
  }
  clearDraftStorage();
  applyEditorState(
    currentGroupDraft.value.source_code || submittedCode.value || (taskDetail.value.can_submit ? buildStarterCode(taskDetail.value) : ''),
    currentGroupDraft.value.submission_note || currentSubmission.value?.submission_note || '',
    'group',
    currentGroupDraft.value.updated_at || null
  );
  ElMessage.success('已恢复到小组共享草稿');
}

function clearLocalDraftManually() {
  clearDraftStorage();
  if (currentSubmission.value) {
    restoreSubmittedWork();
    return;
  }
  restoreStarterCode();
}

function pickSourceCodeFile(files: TaskSubmissionFile[], taskId: number) {
  const generatedName = buildGeneratedCodeFileName(taskId);
  const exactMatch = files.find((file) => file.name === generatedName);
  if (exactMatch) {
    return exactMatch;
  }
  return files.find((file) => CODE_FILE_EXTENSIONS.has(file.ext.toLowerCase())) || null;
}

async function loadSubmittedCode(payload: ProgrammingTaskPayload) {
  const files = payload.current_submission?.files || [];
  const codeFile = pickSourceCodeFile(files, payload.id);
  if (!codeFile || !authStore.token) {
    return { code: '', fileId: null as number | null };
  }

  try {
    const response = await apiGetBlob(`/submissions/files/${codeFile.id}?disposition=inline`, authStore.token);
    return {
      code: await response.text(),
      fileId: codeFile.id,
    };
  } catch {
    ElMessage.warning('任务详情已加载，但未能读取最近提交的代码文件。');
    return { code: '', fileId: null };
  }
}

async function hydrateTaskDetail(payload: ProgrammingTaskPayload) {
  taskDetail.value = payload;
  selectedFiles.value = [];
  submittedCode.value = '';
  sourceCodeFileId.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }

  const draft = loadLocalDraft();
  const submittedWork = await loadSubmittedCode(payload);
  submittedCode.value = submittedWork.code;
  sourceCodeFileId.value = submittedWork.fileId;
  keptExistingFileIds.value = (payload.current_submission?.files || [])
    .filter((file) => file.id !== submittedWork.fileId)
    .map((file) => file.id);

  const fallbackCode = payload.can_submit ? buildStarterCode(payload) : '';
  if (draft && (draft.code || draft.note)) {
    applyEditorState(
      draft.code || submittedWork.code || fallbackCode,
      draft.note || payload.current_submission?.submission_note || '',
      'local',
      draft.updated_at || null
    );
    return;
  }

  if (payload.group_draft && (payload.group_draft.source_code || payload.group_draft.submission_note)) {
    applyEditorState(
      payload.group_draft.source_code || submittedWork.code || fallbackCode,
      payload.group_draft.submission_note || payload.current_submission?.submission_note || '',
      'group',
      payload.group_draft.updated_at || null
    );
    return;
  }

  if (submittedWork.code || payload.current_submission?.submission_note) {
    applyEditorState(
      submittedWork.code || fallbackCode,
      payload.current_submission?.submission_note || '',
      'submission'
    );
    return;
  }

  applyEditorState(fallbackCode, '', 'starter');
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

function toggleRetainedFile(fileId: number) {
  if (keptExistingFileIds.value.includes(fileId)) {
    keptExistingFileIds.value = keptExistingFileIds.value.filter((id) => id !== fileId);
    return;
  }
  keptExistingFileIds.value = [...keptExistingFileIds.value, fileId];
}

function getDownloadFileName(contentDisposition: string | null, fallbackName: string) {
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

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
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

async function buildPreservedFiles() {
  if (!currentSubmission.value || !authStore.token) {
    return [] as File[];
  }

  const retainedFiles = currentSubmission.value.files.filter((file) => keptExistingFileIds.value.includes(file.id));
  return Promise.all(
    retainedFiles.map(async (file) => {
      const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
      const blob = await response.blob();
      return new File([blob], file.name, {
        type: blob.type || file.mime_type || 'application/octet-stream',
      });
    })
  );
}

async function buildUploadFiles() {
  if (!taskDetail.value) {
    return [] as File[];
  }

  const codeFile = new File(
    [sourceCode.value.replace(/\r\n/g, '\n')],
    buildGeneratedCodeFileName(taskDetail.value.id),
    { type: 'text/x-python' }
  );
  const preservedFiles = await buildPreservedFiles();
  return [codeFile, ...preservedFiles, ...selectedFiles.value];
}

async function loadTask() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const payload = await apiGet<ProgrammingTaskPayload>(`/tasks/${route.params.taskId}`, authStore.token);
    if (payload.task_type !== 'programming') {
      await router.replace(buildTaskRoute({ id: payload.id, title: payload.title, task_type: payload.task_type }));
      return;
    }
    await hydrateTaskDetail(payload);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载代码任务失败';
  } finally {
    isLoading.value = false;
  }
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
      {
        submission_note: normalizeRichTextHtml(reflectionNote.value),
        source_code: sourceCode.value.replace(/\r\n/g, '\n'),
      },
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
    const message = submitBlockedMessage.value || '当前编程任务暂不可提交。';
    errorMessage.value = message;
    ElMessage.warning(message);
    return;
  }
  if (!sourceCode.value.trim()) {
    errorMessage.value = '请先编写代码后再提交';
    return;
  }

  const hadSubmission = Boolean(currentSubmission.value);
  const formData = new FormData();
  formData.append('submission_note', normalizeRichTextHtml(reflectionNote.value));
  formData.append('draft_source_code', sourceCode.value.replace(/\r\n/g, '\n'));

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    const files = await buildUploadFiles();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const payload = await apiUpload<ProgrammingTaskPayload>(
      `/tasks/${taskDetail.value.id}/submit`,
      formData,
      authStore.token
    );

    clearDraftStorage();
    await hydrateTaskDetail(payload);
    ElMessage.success(
      taskDetail.value.submission_scope === 'group'
        ? hadSubmission
          ? '小组代码作品已更新提交'
          : '小组代码作品提交成功'
        : hadSubmission
          ? '代码作品已更新提交'
          : '代码作品提交成功'
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '提交代码作品失败';
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

async function openNavigationTask(task: NavigationTask) {
  await router.push(buildTaskRoute(task));
}

async function goToCourse() {
  const courseId = taskDetail.value?.course.id || route.params.courseId;
  await router.push(`/student/courses/${courseId}`);
}

async function goToPeerReview() {
  await router.push(`/student/reviews/${route.params.taskId}`);
}

async function goToWorkDetail() {
  if (!currentSubmission.value) {
    return;
  }
  await router.push(`/student/work/${currentSubmission.value.id}`);
}

watch(
  [sourceCode, reflectionNote],
  () => {
    if (isHydratingForm || !taskDetail.value?.can_submit) {
      return;
    }
    scheduleLocalDraftPersist();
  }
);

watch(
  () => route.params.taskId,
  () => {
    void loadTask();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (draftPersistTimer !== null) {
    window.clearTimeout(draftPersistTimer);
  }
  resetFilePreviewState();
});
</script>

<style scoped>
.sw-program {
  display: grid;
  gap: var(--sw-section-gap);
}

.sw-program__status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border: 1px solid var(--sw-line);
  border-radius: var(--sw-r-card);
  background: var(--sw-surface);
}

.sw-program__status-note {
  min-width: 0;
  overflow: hidden;
  color: var(--sw-muted);
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sw-program__main {
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

/* 代码编辑 */
.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.code-toolbar__name {
  margin: 0;
  color: var(--sw-ink);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
}

.code-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.code-editor-shell {
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: var(--sw-surface-2);
  overflow: hidden;
}

.code-textarea,
.code-block {
  width: 100%;
  min-height: 460px;
  margin: 0;
  padding: 16px 18px;
  border: none;
  background: transparent;
  color: var(--sw-ink);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre;
  tab-size: 2;
  box-sizing: border-box;
}

.code-textarea {
  resize: vertical;
  outline: none;
}

.code-block {
  border: 1px solid var(--sw-line-soft);
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.editor-footnote {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 10px;
  color: var(--sw-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 附件 */
.sw-program__files {
  display: grid;
}

.sw-file {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  padding: 10px 18px;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.sw-program__files .sw-empty {
  padding: 16px 18px;
}

.file-input {
  display: none;
}

/* 右栏 */
.sw-meta {
  display: grid;
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

.sw-program__comment {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--sw-surface-2);
}

.sw-program__comment-title {
  margin: 0 0 6px;
  color: var(--sw-ink);
  font-size: 12px;
  font-weight: 600;
}

.sw-program__comment-body {
  margin: 0;
  color: var(--sw-text);
  font-size: 13px;
  line-height: 1.65;
}

.sw-program__comment-body :deep(p:last-child),
.sw-program__comment-body :deep(ul:last-child),
.sw-program__comment-body :deep(ol:last-child),
.sw-program__comment-body :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.sw-program__submit {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.sw-program__hint {
  margin: 0;
  color: var(--sw-muted);
  font-size: 12px;
  line-height: 1.5;
}

.sw-program__draft {
  margin: 0 0 6px;
  color: var(--sw-ink);
  font-size: 13px;
  font-weight: 500;
}

.sw-program__draft-actions {
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
  .sw-program__status {
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .sw-program__status-note {
    white-space: normal;
  }

  .code-textarea,
  .code-block {
    min-height: 340px;
  }
}
</style>
