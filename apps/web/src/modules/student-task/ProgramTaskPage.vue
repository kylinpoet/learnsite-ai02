<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">代码任务</p>
        <h2>{{ taskDetail?.title || `代码任务 ${route.params.taskId}` }}</h2>
        <p class="hero-copy">
          {{ taskDetail?.course.title || '正在加载课次信息' }}
          <span v-if="taskDetail">
            · {{ taskDetail.course.book_title }} · {{ taskDetail.course.unit_title }} · {{ taskDetail.course.lesson_title }}
          </span>
        </p>
      </div>
      <div class="action-group">
        <el-button plain @click="goToCourse">返回课程</el-button>
        <el-button
          v-if="taskDetail?.task_navigation.previous_task"
          plain
          @click="openNavigationTask(taskDetail.task_navigation.previous_task)"
        >
          上一个任务
        </el-button>
        <el-button plain @click="goToPeerReview">作品互评</el-button>
        <el-button v-if="currentSubmission" plain @click="goToWorkDetail">查看已提交作品</el-button>
        <el-button
          v-if="taskDetail?.task_navigation.next_task"
          plain
          type="primary"
          @click="openNavigationTask(taskDetail.task_navigation.next_task)"
        >
          下一个任务
        </el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <el-alert
      v-if="taskDetail && submitBlockedMessage"
      :closable="false"
      :title="submitBlockedMessage"
      type="warning"
    />
    <el-alert
      v-if="taskDetail?.group_collaboration && !groupDiscussionEnabled && groupDiscussionMessage"
      :closable="false"
      :title="groupDiscussionMessage"
      type="warning"
    />
    <el-alert
      v-if="taskDetail"
      :closable="false"
      class="mode-alert"
      title="当前为代码任务基础版：支持真实任务加载、本地草稿、代码文件提交和推荐作品展示；在线运行沙箱后续接入。"
      type="info"
    />

    <div v-if="taskDetail" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">提交状态</p>
        <p class="metric-value metric-value--small">{{ submissionStatusLabel }}</p>
        <p class="metric-note">{{ submissionStatusNote }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">草稿来源</p>
        <p class="metric-value metric-value--small">{{ draftStatusLabel }}</p>
        <p class="metric-note">{{ draftFootnote }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">代码规模</p>
        <p class="metric-value">{{ codeLineCount }}</p>
        <p class="metric-note">共 {{ sourceCode.length }} 个字符，将自动生成 `.py` 代码附件。</p>
      </article>
      <article v-if="taskDetail.group_collaboration" class="mini-panel">
        <p class="metric-label">协作小组</p>
        <p class="metric-value metric-value--small">{{ taskDetail.group_collaboration.group_name }}</p>
        <p class="metric-note">
          {{ taskDetail.group_collaboration.member_count }} 人 · 我当前是{{ groupRoleLabel(taskDetail.group_collaboration.my_role) }}
        </p>
      </article>
      <article v-else class="mini-panel">
        <p class="metric-label">提交方式</p>
        <p class="metric-value metric-value--small">
          {{ taskDetail.submission_scope === 'group' ? '小组提交' : '个人提交' }}
        </p>
        <p class="metric-note">代码会作为作品附件保存，并出现在作品详情页与教师评分页中。</p>
      </article>
    </div>

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="10" />
        </el-card>
      </template>

      <template #default>
        <div v-if="taskDetail" class="page-stack">
          <el-row :gutter="16">
            <el-col :lg="15" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="info-row">
                    <span>代码编辑区</span>
                    <div class="editor-tag-row">
                      <el-tag round type="warning">Python 基础版</el-tag>
                      <el-tag round type="success">{{ draftStatusLabel }}</el-tag>
                    </div>
                  </div>
                </template>

                <div class="code-toolbar">
                  <div>
                    <p class="toolbar-title">主代码文件</p>
                    <p class="toolbar-note">
                      {{ generatedCodeDisplayName }} 会在提交时自动生成；如果已有历史附件，默认会保留其他非代码附件。
                    </p>
                  </div>
                  <div v-if="taskDetail.can_submit" class="action-group">
                    <el-button plain @click="restoreStarterCode">示例代码</el-button>
                    <el-button v-if="hasSubmittedCode" plain @click="restoreSubmittedWork">恢复最近提交</el-button>
                    <el-button v-if="hasLocalDraft" plain @click="clearLocalDraftManually">清除本地草稿</el-button>
                  </div>
                </div>

                <div v-if="taskDetail.can_submit" class="code-editor-shell">
                  <textarea
                    v-model="sourceCode"
                    class="code-textarea"
                    spellcheck="false"
                  ></textarea>
                </div>
                <pre v-else class="code-block">{{ sourceCode || '最近提交中没有检测到代码文件。' }}</pre>

                <div class="editor-footnote">
                  <span>行数 {{ codeLineCount }}</span>
                  <span>字符 {{ sourceCode.length }}</span>
                  <span>{{ draftFootnote }}</span>
                </div>
              </el-card>

              <el-card class="soft-card">
                <template #header>任务说明</template>
                <RichTextContent :html="taskDetail.description" empty-text="当前代码任务还没有补充说明。" />
              </el-card>

              <el-card class="soft-card">
                <template #header>实现说明</template>
                <RichTextEditor
                  v-if="taskDetail.can_submit"
                  v-model="reflectionNote"
                  :min-height="220"
                  placeholder="补充你的解题思路、关键步骤、运行结果说明或需要老师关注的地方。"
                />
                <RichTextContent
                  v-else
                  :html="reflectionNote"
                  empty-text="这次提交没有填写额外说明。"
                />
              </el-card>
            </el-col>

            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>提交信息</template>

                <el-descriptions :column="1" border>
                  <el-descriptions-item label="课程">{{ taskDetail.course.title }}</el-descriptions-item>
                  <el-descriptions-item label="课次">{{ taskDetail.course.lesson_title }}</el-descriptions-item>
                  <el-descriptions-item label="当前状态">{{ submissionStatusLabel }}</el-descriptions-item>
                  <el-descriptions-item label="最近提交">
                    {{ formatDateTime(currentSubmission?.updated_at || null) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="提交范围">
                    {{ taskDetail.submission_scope === 'group' ? '小组作品' : '个人作品' }}
                  </el-descriptions-item>
                    <el-descriptions-item v-if="currentSubmission?.submission_scope === 'group'" label="最近提交人">
                      {{ currentSubmission?.submitted_by_name || '组内成员' }}
                    </el-descriptions-item>
                  </el-descriptions>

                  <div class="tip-panel">
                    <p class="tip-title">本页规则</p>
                    <p>1. 当前版本不提供在线运行沙箱，重点先打通代码编写、保存草稿和作品提交闭环。</p>
                    <p>2. 每次提交都会生成新的主代码文件，其他已保存附件默认保留，也可以手动排除。</p>
                    <p>3. {{ taskDetail.submission_scope === 'group' ? '当前任务按小组共同提交，组内成员看到的是同一份作品。' : '当前任务按个人独立提交。' }}</p>
                    <p v-if="taskDetail.submission_scope === 'group'">
                      4. 组内可先同步共享草稿共同编辑代码，再由任一成员正式提交；本地草稿仍只保存在你的当前浏览器。
                    </p>
                  </div>

                <input
                  ref="fileInputRef"
                  class="file-input"
                  multiple
                  type="file"
                  @change="handleFileChange"
                />

                <div class="page-stack page-stack--compact">
                  <el-button :disabled="!taskDetail.can_submit" plain @click="openFilePicker">
                    选择补充附件
                  </el-button>
                  <el-button
                    v-if="selectedFiles.length"
                    :disabled="isSubmitting"
                    plain
                    @click="clearSelectedFiles"
                  >
                    清空本次新增附件
                  </el-button>
                  <el-button
                    :disabled="!taskDetail.can_submit"
                    :loading="isSubmitting"
                    class="full-width"
                    type="primary"
                    @click="submitTask"
                  >
                    {{ submitButtonText }}
                  </el-button>
                </div>
              </el-card>

              <el-card v-if="taskDetail.group_collaboration" class="soft-card">
                <template #header>小组共同编辑</template>

                <div class="tip-panel">
                  <p class="tip-title">共享草稿</p>
                  <p>{{ groupDraftSummary }}</p>
                  <p>{{ groupDraftMeta }}</p>
                  <p>共享草稿会同步代码编辑区和实现说明，不会覆盖你的本地草稿，附件仍在正式提交时处理。</p>
                </div>

                <div class="file-actions">
                  <el-tag round type="info">
                    {{ currentGroupDraft ? `版本 ${currentGroupDraft.version_no}` : '未同步' }}
                  </el-tag>
                  <el-tag v-if="currentGroupDraft?.updated_by_name" round type="success">
                    {{ currentGroupDraft.updated_by_name }}
                  </el-tag>
                </div>

                <div class="page-stack page-stack--compact">
                  <el-button
                    :disabled="!groupDraftActionsEnabled"
                    :loading="isGroupDraftSaving"
                    plain
                    type="primary"
                    @click="saveGroupDraft"
                  >
                    同步代码到小组草稿
                  </el-button>
                  <el-button :disabled="!currentGroupDraft" plain @click="restoreGroupDraft">
                    恢复小组草稿
                  </el-button>
                  <el-button :loading="isRefreshingTask" plain @click="refreshTaskDetail">
                    刷新协作内容
                  </el-button>
                  <el-button plain @click="isGroupDraftHistoryVisible = true">
                    历史版本
                  </el-button>
                </div>
              </el-card>

              <el-card class="soft-card">
                <template #header>附件处理</template>

                <div class="stack-list">
                  <article class="file-item">
                    <div>
                      <p class="file-name">{{ generatedCodeDisplayName }}</p>
                      <p class="file-meta">主代码文件 · 会根据当前编辑器内容自动生成</p>
                    </div>
                    <el-tag round type="warning">自动生成</el-tag>
                  </article>

                  <article
                    v-for="file in selectedFiles"
                    :key="selectedFileKey(file)"
                    class="file-item"
                  >
                    <div>
                      <p class="file-name">{{ file.name }}</p>
                      <p class="file-meta">{{ formatFileSize(file.size) }} · 本次新增附件</p>
                    </div>
                    <el-button link type="danger" @click="removeSelectedFile(file.name)">
                      移除
                    </el-button>
                  </article>

                  <article
                    v-for="file in currentSubmission?.files || []"
                    :key="`saved-${file.id}`"
                    class="file-item"
                  >
                    <div>
                      <p class="file-name">{{ file.name }}</p>
                      <p class="file-meta">
                        {{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB · 已保存附件
                      </p>
                    </div>
                    <div class="file-actions">
                      <el-tag v-if="file.id === sourceCodeFileId" round type="warning">由编辑器替换</el-tag>
                      <el-tag v-else-if="keptExistingFileIds.includes(file.id)" round type="success">本次保留</el-tag>
                      <el-tag v-else round type="info">本次不保留</el-tag>
                      <el-button
                        v-if="file.id !== sourceCodeFileId && taskDetail.can_submit"
                        link
                        type="danger"
                        @click="toggleRetainedFile(file.id)"
                      >
                        {{ keptExistingFileIds.includes(file.id) ? '本次不保留' : '恢复保留' }}
                      </el-button>
                      <el-button
                        :loading="downloadLoadingFileId === file.id"
                        link
                        @click="downloadSavedFile(file)"
                      >
                        下载
                      </el-button>
                    </div>
                  </article>

                  <el-empty
                    v-if="!selectedFiles.length && !currentSubmission?.files.length"
                    description="暂时还没有提交附件。"
                  />
                </div>
              </el-card>

              <el-card class="soft-card">
                <template #header>学案导读</template>
                <RichTextContent :html="taskDetail.course.content" empty-text="当前学案还没有补充导读内容。" />
              </el-card>
            </el-col>
          </el-row>

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
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPut, apiUpload } from '@/api/http';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
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

const CODE_FILE_EXTENSIONS = new Set(['py', 'txt', 'md', 'html', 'css', 'js', 'ts', 'json']);

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
  return '示例代码';
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
  return '示例代码仅作为起点，可直接覆盖修改。';
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
    '# 在这里编写你的 Python 代码',
    '# 提交时会自动生成 .py 附件',
    '',
    'def main():',
    '    print("Hello LearnSite")',
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

function selectedFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
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
  ElMessage.success('已恢复为示例代码');
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
});
</script>

<style scoped>
.action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.mode-alert {
  margin-top: 4px;
}

.editor-tag-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.code-toolbar,
.editor-footnote,
.file-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-title,
.toolbar-note,
.file-name,
.file-meta {
  margin: 0;
}

.toolbar-title {
  font-weight: 700;
}

.toolbar-note,
.editor-footnote,
.file-meta {
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.7;
}

.code-editor-shell {
  margin-top: 16px;
  border-radius: 20px;
  border: 1px solid rgba(67, 109, 185, 0.16);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.03), rgba(15, 23, 42, 0.05)),
    rgba(255, 255, 255, 0.96);
  overflow: hidden;
}

.code-textarea,
.code-block {
  width: 100%;
  min-height: 420px;
  margin: 0;
  padding: 18px 20px;
  border: none;
  background: transparent;
  color: #1f2a44;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre;
  tab-size: 2;
  box-sizing: border-box;
}

.code-textarea {
  resize: vertical;
  outline: none;
}

.editor-footnote {
  margin-top: 12px;
}

.tip-panel {
  margin-top: 20px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.tip-panel p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.8;
}

.tip-title {
  margin-bottom: 8px;
  color: var(--ls-ink) !important;
  font-weight: 700;
}

.file-input {
  display: none;
}

.file-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px dashed var(--ls-border);
}

.file-item:last-child {
  border-bottom: none;
}

.file-name {
  font-weight: 600;
}

.full-width {
  width: 100%;
}

.page-stack--compact {
  margin-top: 16px;
  gap: 10px;
}

.metric-value--small {
  font-size: 22px;
}

@media (max-width: 960px) {
  .code-textarea,
  .code-block {
    min-height: 320px;
  }
}
</style>
