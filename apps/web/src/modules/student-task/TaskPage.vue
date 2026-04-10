<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">任务提交</p>
        <h2>{{ taskDetail?.title || `任务 ${route.params.taskId}` }}</h2>
        <p class="hero-copy">
          {{ taskDetail?.course.title || '正在加载课次信息' }}
          <span v-if="taskDetail"> · {{ taskDetail.course.unit_title }} · {{ taskDetail.course.lesson_title }}</span>
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
        <el-button
          v-if="taskDetail?.task_navigation.next_task"
          type="primary"
          plain
          @click="openNavigationTask(taskDetail.task_navigation.next_task)"
        >
          下一个任务
        </el-button>
        <el-button plain @click="goToPeerReview">作品互评</el-button>
        <el-button v-if="usesStandardSubmissionFlow && currentSubmission" plain @click="goToWorkDetail">查看已提交作品</el-button>
        <el-button
          v-if="currentSubmission?.status === 'reviewed'"
          :loading="isRevokingReview"
          plain
          type="warning"
          @click="revokeReviewedSubmission"
        >
          撤销评阅并继续提交
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

    <div v-if="taskDetail" class="metric-grid">
      <article class="mini-panel">
        <p class="metric-label">当前状态</p>
        <p class="metric-value metric-value--small">{{ submissionStatusLabel }}</p>
        <p class="metric-note">{{ submissionStatusNote }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">{{ ruleMetricLabel }}</p>
        <p class="metric-value metric-value--small">{{ ruleMetricValue }}</p>
        <p class="metric-note">{{ ruleMetricNote }}</p>
      </article>
      <article class="mini-panel">
        <p class="metric-label">{{ assetMetricLabel }}</p>
        <p class="metric-value">{{ assetMetricValue }}</p>
        <p class="metric-note">{{ assetMetricNote }}</p>
      </article>
      <article v-if="taskDetail.group_collaboration" class="mini-panel">
        <p class="metric-label">协作小组</p>
        <p class="metric-value metric-value--small">{{ taskDetail.group_collaboration.group_name }}</p>
        <p class="metric-note">
          {{ taskDetail.group_collaboration.member_count }} 人 · 我当前是{{ groupRoleLabel(taskDetail.group_collaboration.my_role) }}
        </p>
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
                    <span>{{ isDataSubmitTask ? '任务内容' : '任务说明' }}</span>
                    <el-tag round>{{ taskTypeLabel(taskDetail.task_type) }}</el-tag>
                  </div>
                </template>

                <div v-if="!isDataSubmitTask" class="description-block">
                  <RichTextContent :html="taskDetail.description" empty-text="当前任务还没有补充说明。" />
                </div>

                <el-divider v-if="!isDataSubmitTask" />

                <div v-if="isDiscussionTask" class="discussion-shell">
                  <div class="section-head">
                    <h3>课堂讨论</h3>
                    <span>围绕教师发布的主题直接回复，当前支持一层主题回复。</span>
                  </div>
                  <el-alert
                    :closable="false"
                    :title="taskConfig.topic || '教师暂未填写讨论主题，请先阅读任务说明后回复。'"
                    type="info"
                  />
                  <div class="discussion-compose-note">
                    请在下方“提交说明”中使用富文本编辑器填写观点，再点击“发布回复”同步到讨论区。
                  </div>
                  <div class="stack-list">
                    <article v-for="post in discussionPosts" :key="post.id" class="discussion-item">
                      <div class="discussion-meta">
                        <strong>{{ post.author.display_name }}</strong>
                        <span>{{ post.author.student_no || '学号未登记' }}</span>
                        <span>{{ formatDateTime(post.updated_at || post.created_at) }}</span>
                      </div>
                      <RichTextContent class="discussion-text-rich" :html="post.content" empty-text="" sanitize-preset="strict" />
                      <div v-if="post.replies?.length" class="discussion-replies">
                        <article v-for="reply in post.replies" :key="reply.id" class="discussion-reply">
                          <div class="discussion-meta">
                            <strong>{{ reply.author.display_name }}</strong>
                            <span>{{ reply.author.student_no || '学号未登记' }}</span>
                            <span>{{ formatDateTime(reply.updated_at || reply.created_at) }}</span>
                          </div>
                          <RichTextContent class="discussion-text-rich" :html="reply.content" empty-text="" sanitize-preset="strict" />
                        </article>
                      </div>
                    </article>
                    <p v-if="!isDiscussionLoading && !discussionPostCount" class="discussion-empty-text">还没有同学参与讨论，欢迎你先发言。</p>
                  </div>
                </div>

                <div v-else-if="isWebTask" class="embed-shell">
                  <div class="section-head">
                    <h3>任务页面</h3>
                    <span>教师发布的网页内容会直接嵌入到当前任务页中。</span>
                  </div>
                  <iframe
                    v-if="webTaskUrl"
                    :src="webTaskUrl"
                    :sandbox="taskEmbedSandboxFor(webTaskUrl)"
                    class="task-embed-frame"
                    title="网页任务"
                  ></iframe>
                  <el-empty v-else-if="isWebTaskResourcePreparing" description="任务资源初始化中，请稍候..." />
                  <el-empty v-else description="教师暂未上传网页任务资源或资源加载失败" />
                </div>

                <div v-else-if="isDataSubmitTask" class="embed-shell">
                  <div class="section-head">
                    <h3>数据提交任务</h3>
                    <span>先在提交页完成数据上报，再切换到可视化页查看结果。</span>
                  </div>
                  <div class="section-head section-head--compact">
                    <span>可以将提交页或可视化页在新标签页中打开，方便单独查看和连续使用。</span>
                    <div class="section-head__actions">
                      <el-button
                        plain
                        size="small"
                        :disabled="!dataSubmitFormUrl"
                        @click="openTaskResourceInNewTab(dataSubmitFormUrl, 'submit')"
                      >
                        新标签打开提交页
                      </el-button>
                      <el-button
                        plain
                        size="small"
                        :disabled="!dataSubmitVisualizationUrl"
                        @click="openTaskResourceInNewTab(dataSubmitVisualizationUrl, 'visualization')"
                      >
                        新标签打开可视化页
                      </el-button>
                    </div>
                  </div>
                  <el-tabs v-model="dataSubmitActiveTab">
                    <el-tab-pane label="学生提交页" name="submit">
                      <div class="data-submit-tab-pane">
                        <div class="description-block description-block--inline">
                          <RichTextContent :html="taskDetail.description" empty-text="当前任务还没有补充说明。" />
                        </div>
                        <iframe
                          v-if="dataSubmitFormUrl"
                          :src="dataSubmitFormUrl"
                          :sandbox="taskEmbedSandboxFor(dataSubmitFormUrl)"
                          class="task-embed-frame"
                          title="数据提交页"
                        ></iframe>
                        <el-empty v-else description="教师暂未上传数据提交页面" />
                      </div>
                    </el-tab-pane>
                    <el-tab-pane label="数据可视化页" name="visualization">
                      <iframe
                        v-if="dataSubmitVisualizationUrl"
                        :src="dataSubmitVisualizationUrl"
                        :sandbox="taskEmbedSandboxFor(dataSubmitVisualizationUrl)"
                        class="task-embed-frame"
                        title="数据可视化页"
                      ></iframe>
                      <el-empty v-else description="教师暂未上传可视化页面" />
                    </el-tab-pane>
                  </el-tabs>
                </div>

                <div v-if="usesStandardSubmissionFlow" class="submission-form">
                  <div class="section-head">
                    <h3>{{ submissionNoteTitle }}</h3>
                    <span>{{ submissionNoteHint }}</span>
                  </div>
                  <div class="submission-editor">
                    <RichTextEditor
                      v-model="submissionNote"
                      :min-height="260"
                      placeholder="写下你的设计思路、步骤说明、图片说明或补充内容。支持标题、列表、加粗、链接和图片。"
                    />
                  </div>

                  <div v-if="isDiscussionTask" class="action-group discussion-action-group">
                    <el-button :loading="isPostingDiscussion" type="primary" @click="postDiscussionReply">
                      发布回复
                    </el-button>
                    <el-button :loading="isDiscussionLoading" plain @click="loadDiscussionFeed">
                      刷新讨论
                    </el-button>
                  </div>

                  <div v-if="!isDiscussionTask" class="section-head section-head--compact">
                    <h3>作品附件</h3>
                    <span>支持多文件。重新选择附件后，本次提交会替换当前已保存附件。</span>
                  </div>

                  <input
                    v-if="!isDiscussionTask"
                    ref="fileInputRef"
                    class="file-input"
                    multiple
                    type="file"
                    @change="handleFileChange"
                  />

                  <div v-if="!isDiscussionTask" class="action-group">
                    <el-button :disabled="!taskDetail.can_submit" plain @click="openFilePicker">
                      选择附件
                    </el-button>
                    <el-button
                      v-if="selectedFiles.length"
                      :disabled="isSubmitting"
                      plain
                      @click="clearSelectedFiles"
                    >
                      清空本次选择
                    </el-button>
                  </div>

                  <el-alert
                    v-if="!taskDetail.can_submit"
                    :closable="false"
                    title="这份作业已经完成教师评价，不能再次提交。"
                    type="warning"
                  />

                  <div v-if="!isDiscussionTask" class="stack-list">
                    <article v-for="file in selectedFiles" :key="selectedFileKey(file)" class="file-item">
                      <div>
                        <p class="file-name">{{ file.name }}</p>
                        <p class="file-meta">{{ formatFileSize(file.size) }} · 本次提交附件</p>
                      </div>
                      <div class="file-actions">
                        <el-button
                          :loading="previewLoadingSelectedFileKey === selectedFileKey(file)"
                          :disabled="!isLocalFilePreviewable(file)"
                          link
                          type="primary"
                          @click="previewSelectedFile(file)"
                        >
                          预览
                        </el-button>
                        <el-button link type="danger" @click="removeSelectedFile(file.name)">
                          移除
                        </el-button>
                      </div>
                    </article>

                    <article
                      v-for="file in displayedCurrentFiles"
                      :key="`saved-${file.id}`"
                      class="file-item"
                    >
                      <div>
                        <p class="file-name">{{ file.name }}</p>
                        <p class="file-meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB · 已保存</p>
                      </div>
                      <div class="file-actions">
                        <el-tag round type="info">{{ file.role }}</el-tag>
                        <el-button
                          :loading="previewLoadingSavedFileId === file.id"
                          :disabled="!isSavedFilePreviewable(file)"
                          link
                          type="primary"
                          @click="previewSavedFile(file)"
                        >
                          预览
                        </el-button>
                        <el-button
                          :loading="downloadLoadingFileId === file.id"
                          link
                          type="primary"
                          @click="downloadSavedFile(file)"
                        >
                          下载
                        </el-button>
                      </div>
                    </article>

                    <el-empty
                      v-if="!selectedFiles.length && !displayedCurrentFiles.length"
                      description="还没有上传附件"
                    />
                  </div>
                </div>
              </el-card>
            </el-col>

            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>提交信息</template>

                <el-descriptions :column="1" border>
                  <el-descriptions-item label="课程">{{ taskDetail.course.title }}</el-descriptions-item>
                  <el-descriptions-item label="发布时间">
                    {{ formatDate(taskDetail.course.assigned_date) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="最近提交">
                    {{ formatDateTime(currentSubmission?.updated_at || null) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="提交方式">
                    {{ taskDetail.submission_scope === 'group' ? '小组共同提交' : '个人提交' }}
                  </el-descriptions-item>
                  <el-descriptions-item v-if="currentSubmission?.submission_scope === 'group'" label="最近提交人">
                    {{ currentSubmission?.submitted_by_name || '组内成员' }}
                  </el-descriptions-item>
                </el-descriptions>

                <div class="review-comment-panel">
                  <p class="review-comment-title">教师评语</p>
                  <RichTextContent
                    class="review-comment-content"
                    :html="currentSubmission?.teacher_comment || ''"
                    empty-text="教师暂未留下评语。"
                    sanitize-preset="strict"
                  />
                </div>

                <div class="tip-panel">
                  <p class="tip-title">本页规则</p>
                  <template v-if="isDiscussionTask">
                    <p>1. 当前任务支持“讨论互动 + 正式提交”双轨模式。</p>
                    <p>2. 请在下方“提交说明”中编辑内容后，直接点击“发布回复”同步到讨论区。</p>
                    <p>3. 教师评分以正式提交内容为准，讨论内容用于课堂交流。</p>
                  </template>
                  <template v-else-if="isWebTask">
                    <p>1. 当前任务通过网页页面完成，老师发布的网页会直接嵌入展示。</p>
                    <p>2. 完成网页互动后，请在下方补充提交说明并可上传结果附件。</p>
                    <p>3. 教师更新网页资源后，刷新页面即可看到最新内容。</p>
                  </template>
                  <template v-else-if="isDataSubmitTask">
                    <p>1. 当前任务通过数据页面完成，不需要在这里单独提交附件。</p>
                    <p>2. 先在提交页完成数据上报，再切换到可视化页查看结果。</p>
                    <p>3. 可视化页对学生开放，可直接查看全班结果展示。</p>
                  </template>
                  <template v-else>
                    <p>1. 不再保存草稿，点击提交就是正式保存。</p>
                    <p>2. {{ taskDetail.submission_scope === 'group' ? '当前任务按小组共同提交，组内成员看到的是同一份作品。' : '当前任务按个人独立提交。' }}</p>
                    <p>3. 若本次不重新选择附件，将保留当前已保存附件。</p>
                    <p v-if="taskDetail.submission_scope === 'group'">4. 可先同步共享草稿共同编辑作品说明，再由任一成员正式提交附件与最终版本。</p>
                  </template>
                </div>

                <el-button
                  v-if="usesStandardSubmissionFlow"
                  :disabled="!taskDetail.can_submit"
                  :loading="isSubmitting"
                  class="submit-button"
                  type="primary"
                  @click="submitTask"
                >
                  {{ submitButtonText }}
                </el-button>

                <el-button
                  v-if="taskDetail.task_navigation.next_task"
                  class="submit-button"
                  plain
                  @click="openNavigationTask(taskDetail.task_navigation.next_task)"
                >
                  进入下一任务
                </el-button>

                <el-button
                  v-if="currentSubmission?.status === 'reviewed'"
                  :loading="isRevokingReview"
                  class="submit-button"
                  plain
                  type="warning"
                  @click="revokeReviewedSubmission"
                >
                  撤销评阅并继续提交
                </el-button>
              </el-card>

              <el-card class="soft-card">
                <template #header>学案导读</template>
                <RichTextContent :html="taskDetail.course.content" empty-text="当前学案还没有补充导读内容。" />
              </el-card>

              <el-card v-if="taskDetail.group_collaboration && usesStandardSubmissionFlow" class="soft-card">
                <template #header>小组共同编辑</template>

                <div class="tip-panel">
                  <p class="tip-title">共享草稿</p>
                  <p>{{ groupDraftSummary }}</p>
                  <p>{{ groupDraftMeta }}</p>
                  <p>当前只同步作品说明；附件仍需由任一组员在正式提交时上传。</p>
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
                    同步到小组草稿
                  </el-button>
                  <el-button :disabled="!currentGroupDraft" plain @click="applyGroupDraft">
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
            </el-col>
          </el-row>

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

          <el-dialog
            v-model="filePreviewDialogVisible"
            :title="`附件预览 · ${filePreviewName || '未命名文件'}`"
            width="min(980px, 92vw)"
            append-to-body
            @closed="resetFilePreviewState"
          >
            <div v-loading="isFilePreviewLoading" class="file-preview-stage">
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
              <pre v-else-if="!isFilePreviewLoading && filePreviewKind === 'text'" class="file-preview-text">{{
                filePreviewText
              }}</pre>
              <div v-else class="file-preview-fallback">
                <p>当前文件暂不支持在线预览。</p>
                <p>可点击下载后在本地打开查看。</p>
              </div>
            </div>
          </el-dialog>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiGet, apiGetBlob, apiPost, apiPut, apiUpload } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import GroupDraftHistoryDialog from '@/modules/student-task/components/GroupDraftHistoryDialog.vue';
import { useAuthStore } from '@/stores/auth';
import { resolveIframeSandbox } from '@/utils/iframeTrust';
import { normalizeRichTextHtml } from '@/utils/richText';

type TaskSubmissionFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
  mime_type?: string;
  previewable?: boolean;
};

type FilePreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';

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

type RecommendedSubmissionFile = TaskSubmissionFile & {
  mime_type: string;
  previewable: boolean;
};

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

type TaskAssetManifestItem = {
  path: string;
  size_kb: number;
  mime_type?: string | null;
  slot?: string;
};

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

type TaskRuntimeSessionPayload = {
  task_id: number;
  expires_at: string | null;
  asset_base_path: string;
};

type TaskRuntimeRequestMessage = {
  source: 'learnsite-task-runtime-request';
  requestId: string;
  previewKey?: string;
  taskId: number;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyKind?: 'empty' | 'text' | 'base64';
  bodyValue?: string;
  bodyMimeType?: string;
};

type TaskRuntimeResponseMessage = {
  source: 'learnsite-task-runtime-response';
  requestId: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  error?: string;
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

type NavigationTask = {
  id: number;
  title: string;
  task_type: string;
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
    return '任务形态';
  }
  if (isDataSubmitTask.value) {
    return '任务形态';
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
    return '任务内容通过嵌入网页展示。';
  }
  if (isDataSubmitTask.value) {
    return '提交页与可视化页都可直接在当前任务中打开。';
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
    return '任务页面';
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
    return webTaskUrl.value ? '左侧已嵌入教师发布的网页任务内容。' : '教师暂未上传网页任务资源。';
  }
  if (isDataSubmitTask.value) {
    return dataSubmitFormUrl.value
      ? '先在提交页完成数据上报，再切换到可视化页查看结果。'
      : '教师暂未配置完整的数据任务页面。';
  }
  if (!currentSubmission.value) {
    return taskDetail.value?.submission_scope === 'group' ? '你的小组还没有提交这项任务。' : '你还没有提交这项任务。';
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
    return currentSubmission.value ? '更新讨论任务提交' : '提交讨论任务';
  }
  if (isWebTask.value) {
    return currentSubmission.value ? '更新网页任务提交' : '提交网页任务';
  }
  if (taskDetail.value.submission_scope === 'group') {
    return currentSubmission.value ? '再次提交小组作品' : '提交小组作品';
  }
  return currentSubmission.value ? '再次提交作品' : '提交作品';
});
const groupDraftSummary = computed(() => {
  if (!taskDetail.value?.group_collaboration) {
    return '当前任务不是小组协作任务。';
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
      errorMessage.value = error instanceof Error ? error.message : '任务运行时会话初始化失败';
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
    return '图文任务';
  }
  if (taskType === 'discussion') {
    return '讨论任务';
  }
  if (taskType === 'web_page') {
    return '网页任务';
  }
  if (taskType === 'data_submit') {
    return '数据提交任务';
  }
  if (taskType === 'programming') {
    return '编程任务';
  }
  if (taskType === 'upload_image') {
    return '上传作品';
  }
  if (taskType === 'reading') {
    return '阅读任务';
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
  revokeFilePreviewUrl();
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
  revokeFilePreviewUrl();
  isFilePreviewLoading.value = true;
  previewLoadingSelectedFileKey.value = selectedFileKey(file);
  previewLoadingSavedFileId.value = null;

  try {
    filePreviewKind.value = previewKind;
    if (previewKind === 'text') {
      filePreviewText.value = await file.text();
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
      filePreviewText.value = await blob.text();
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

function isAllowedTaskRuntimeUrl(rawUrl: string) {
  if (!taskDetail.value?.id) {
    return false;
  }
  try {
    const targetUrl = new URL(rawUrl, window.location.href);
    const taskBaseUrl = new URL(buildAbsoluteApiUrl(`${apiBaseUrl}/tasks/${taskDetail.value.id}/`));
    return targetUrl.origin === taskBaseUrl.origin && targetUrl.pathname.startsWith(taskBaseUrl.pathname);
  } catch {
    return false;
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
  const requestHeaders = new Headers(message.headers || {});
  requestHeaders.delete('authorization');
  requestHeaders.delete('cookie');

  const executeFetch = async () =>
    fetch(message.url, {
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
  if (!isAllowedTaskRuntimeUrl(message.url)) {
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
    errorMessage.value = error instanceof Error ? error.message : '加载任务详情失败';
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
    const message = submitBlockedMessage.value || '当前任务暂不可提交。';
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
    ElMessage.warning('任务路由解析失败，请刷新页面后重试');
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
.action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.description-block p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.8;
}

.description-block {
  min-height: 140px;
}

.description-block--inline {
  min-height: auto;
}

.submission-form {
  display: grid;
  gap: 20px;
}

.discussion-shell,
.embed-shell {
  display: grid;
  gap: 18px;
}

.data-submit-tab-pane {
  display: grid;
  gap: 16px;
}

.discussion-compose-note {
  color: var(--ls-muted);
  line-height: 1.7;
}

.discussion-action-group {
  margin-top: -8px;
}

.discussion-item,
.discussion-reply {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
}

.discussion-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--ls-muted);
  font-size: 13px;
}

.discussion-text-rich {
  margin: 0;
  color: var(--ls-ink);
  line-height: 1.8;
}

.discussion-text-rich :deep(p:last-child),
.discussion-text-rich :deep(ul:last-child),
.discussion-text-rich :deep(ol:last-child),
.discussion-text-rich :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.discussion-empty-text {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed var(--ls-border);
  color: var(--ls-muted);
  background: rgba(67, 109, 185, 0.04);
  line-height: 1.6;
  font-size: 13px;
}

.discussion-replies {
  display: grid;
  gap: 10px;
  padding-left: 16px;
  border-left: 2px solid rgba(67, 109, 185, 0.12);
}

.task-embed-frame {
  width: 100%;
  min-height: 520px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: #fff;
}

.submission-editor {
  margin-bottom: 8px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
}

.section-head__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.section-head h3 {
  margin: 0;
}

.section-head span {
  color: var(--ls-muted);
  font-size: 13px;
}

.section-head--compact {
  margin-top: 4px;
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

.file-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.file-name,
.file-meta {
  margin: 0;
}

.file-name {
  font-weight: 600;
}

.file-meta {
  margin-top: 4px;
  color: var(--ls-muted);
  font-size: 12px;
}

.file-preview-stage {
  min-height: 320px;
}

.file-preview-frame {
  width: 100%;
  min-height: 68vh;
  border: none;
  border-radius: 12px;
  background: #fff;
}

.file-preview-image {
  display: block;
  max-width: 100%;
  max-height: 68vh;
  margin: 0 auto;
  border-radius: 12px;
}

.file-preview-text {
  margin: 0;
  max-height: 68vh;
  overflow: auto;
  padding: 16px;
  border-radius: 12px;
  background: rgba(67, 109, 185, 0.08);
  color: #1f2a44;
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
  color: var(--ls-muted);
}

.file-preview-fallback p {
  margin: 0;
}

.tip-panel {
  margin-top: 20px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.review-comment-panel {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(67, 109, 185, 0.14);
  background: rgba(67, 109, 185, 0.05);
}

.review-comment-title {
  margin: 0 0 8px;
  color: var(--ls-ink);
  font-weight: 700;
}

.review-comment-content {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.review-comment-content :deep(p:last-child),
.review-comment-content :deep(ul:last-child),
.review-comment-content :deep(ol:last-child),
.review-comment-content :deep(blockquote:last-child) {
  margin-bottom: 0;
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

.submit-button {
  width: 100%;
  margin-top: 20px;
}

.metric-value--small {
  font-size: 22px;
}
</style>

