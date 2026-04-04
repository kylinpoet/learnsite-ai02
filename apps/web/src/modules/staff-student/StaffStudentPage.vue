<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">学生管理</p>
        <h2>班级学生维护</h2>
        <p class="hero-copy">
          支持按班级查看学生、重置密码、停用或恢复账号、解除分组，并快速追踪个人作品记录。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading || isLoadingTransferRequests" type="primary" @click="refreshAll">
          刷新
        </el-button>
        <el-button :disabled="!students?.selected_class_id" plain @click="downloadStudents">
          导出学生表
        </el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="11" />
        </el-card>
      </template>

      <template #default>
        <div v-if="students" class="page-stack">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">学生数</p>
              <p class="metric-value">{{ students.summary.student_count }}</p>
              <p class="metric-note">当前筛选条件</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">活跃账号</p>
              <p class="metric-value">{{ students.summary.active_count }}</p>
              <p class="metric-note">可登录学生</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已停用</p>
              <p class="metric-value">{{ students.summary.inactive_count }}</p>
              <p class="metric-note">可在本页恢复</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已分组</p>
              <p class="metric-value">{{ students.summary.grouped_count }}</p>
              <p class="metric-note">当前班级分组成员</p>
            </article>
          </div>

          <el-card class="soft-card">
            <template #header>
              <div class="toolbar-row">
                <div class="filter-row">
                  <el-select v-model="filters.classId" class="filter-select" placeholder="选择班级" @change="loadStudents">
                    <el-option
                      v-for="item in students.classes"
                      :key="item.id"
                      :label="`${item.class_name} · 活跃 ${item.active_count}/${item.student_count}`"
                      :value="item.id"
                    />
                  </el-select>
                  <el-input
                    v-model="filters.keyword"
                    class="filter-select"
                    clearable
                    placeholder="按学号/账号/姓名搜索"
                    @keyup.enter="loadStudents"
                    @clear="loadStudents"
                  />
                  <el-checkbox v-model="filters.includeInactive" @change="loadStudents">
                    包含停用账号
                  </el-checkbox>
                </div>
                <el-tag v-if="students.selected_class" round>
                  {{ students.selected_class.class_name }}
                </el-tag>
              </div>
              <div class="batch-row">
                <el-tag round type="info">已选 {{ selectedStudentIds.length }} 人</el-tag>
                <el-button plain :disabled="!hasSelectedStudents" @click="runBatchAction('deactivate')">
                  批量停用
                </el-button>
                <el-button plain :disabled="!hasSelectedStudents" @click="runBatchAction('activate')">
                  批量恢复
                </el-button>
                <el-button plain :disabled="!hasSelectedStudents" @click="runBatchAction('ungroup')">
                  批量解除分组
                </el-button>
                <el-button plain :disabled="!hasSelectedStudents" @click="runBatchAction('reset_password')">
                  批量重置密码
                </el-button>
              </div>
            </template>

            <el-empty v-if="!students.items.length" description="当前筛选条件下没有学生" />

            <el-table
              v-else
              ref="studentTableRef"
              :data="students.items"
              row-key="user_id"
              stripe
              @selection-change="handleSelectionChange"
            >
              <el-table-column type="selection" width="48" />
              <el-table-column label="学号" min-width="110" prop="student_no" />
              <el-table-column label="账号" min-width="110" prop="username" />
              <el-table-column label="姓名" min-width="120" prop="display_name" />
              <el-table-column label="状态" min-width="100">
                <template #default="{ row }">
                  <el-tag :type="row.is_active ? 'success' : 'warning'" round>
                    {{ row.is_active ? '启用' : '停用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="分组" min-width="170">
                <template #default="{ row }">
                  <span v-if="row.current_group_name">
                    {{ row.current_group_name }}
                    <el-tag round size="small" :type="row.current_role === 'leader' ? 'success' : 'info'">
                      {{ row.current_role === 'leader' ? '组长' : '组员' }}
                    </el-tag>
                  </span>
                  <span v-else>未分组</span>
                </template>
              </el-table-column>
              <el-table-column label="座位" min-width="150">
                <template #default="{ row }">
                  {{ row.seat_label || '--' }}
                  <span v-if="row.room_name"> · {{ row.room_name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="签到" min-width="130">
                <template #default="{ row }">
                  {{ row.checked_in_today ? `已签到 ${formatDateTime(row.checked_in_at)}` : '未签到' }}
                </template>
              </el-table-column>
              <el-table-column label="提交/评阅" min-width="130">
                <template #default="{ row }">
                  {{ row.submission_count }} / {{ row.reviewed_submission_count }}
                </template>
              </el-table-column>
              <el-table-column label="最近提交" min-width="160">
                <template #default="{ row }">{{ formatDateTime(row.latest_submission_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" fixed="right" min-width="300">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openResetPassword(row)">重置密码</el-button>
                  <el-button link type="primary" @click="openStudentSubmissions(row)">作品记录</el-button>
                  <el-button link @click="removeFromGroup(row)" :disabled="!row.current_group_id">
                    解除分组
                  </el-button>
                  <el-button
                    link
                    :type="row.is_active ? 'danger' : 'success'"
                    @click="toggleStudentStatus(row)"
                  >
                    {{ row.is_active ? '停用账号' : '恢复账号' }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card class="soft-card">
            <template #header>
              <div class="toolbar-row">
                <div class="filter-row">
                  <el-select
                    v-model="transferFilters.classId"
                    clearable
                    class="filter-select"
                    placeholder="按班级筛选申请"
                    @change="loadTransferRequests"
                  >
                    <el-option
                      v-for="item in students.classes"
                      :key="item.id"
                      :label="item.class_name"
                      :value="item.id"
                    />
                  </el-select>
                  <el-select
                    v-model="transferFilters.status"
                    class="filter-select status-filter"
                    @change="loadTransferRequests"
                  >
                    <el-option label="待审核" value="pending" />
                    <el-option label="已通过" value="approved" />
                    <el-option label="已拒绝" value="rejected" />
                    <el-option label="全部状态" value="" />
                  </el-select>
                  <el-button
                    plain
                    type="primary"
                    :disabled="!currentStudentClassId"
                    @click="quickFilterPendingForCurrentClass"
                  >
                    {{ currentStudentClassName ? `仅看${currentStudentClassName}待审核` : '仅看当前班待审核' }}
                  </el-button>
                  <el-button
                    plain
                    :disabled="isTransferFilterResetDisabled"
                    @click="resetTransferFiltersToAll"
                  >
                    恢复为全部状态
                  </el-button>
                  <el-button plain @click="loadTransferRequests">刷新申请</el-button>
                  <el-select
                    v-model="selectedReviewNotePreset"
                    clearable
                    class="preset-select"
                    placeholder="审核常用语预设"
                  >
                    <el-option
                      v-for="item in transferReviewNotePresetOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-select
                    v-model="selectedUnreviewReasonPreset"
                    clearable
                    class="preset-select"
                    placeholder="撤销原因模板"
                  >
                    <el-option
                      v-for="item in transferUnreviewReasonPresetOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                </div>
                <el-space wrap>
                  <el-tag round type="warning">待审核 {{ pendingTransferCount }} 条</el-tag>
                  <el-tag round type="success">待审已选 {{ selectedPendingTransferRequestIds.length }} 条</el-tag>
                  <el-tag round type="info">已处理已选 {{ selectedReviewedTransferRequestIds.length }} 条</el-tag>
                  <el-tag round>当前 {{ transferRequests.length }} 条</el-tag>
                  <el-button plain @click="selectPendingTransferRequests">全选待审核</el-button>
                  <el-button plain :disabled="!hasSelectedTransferRows" @click="clearTransferSelection">
                    清空选择
                  </el-button>
                  <el-button
                    plain
                    type="success"
                    :disabled="
                      !transferFilters.classId || isBatchReviewingTransfers || isBatchUnreviewingTransfers
                    "
                    :loading="isClassQuickReviewing && activeClassQuickReviewDecision === 'approve'"
                    @click="quickBatchReviewCurrentClass('approve')"
                  >
                    当前班待审一键通过
                  </el-button>
                  <el-button
                    plain
                    type="danger"
                    :disabled="
                      !transferFilters.classId || isBatchReviewingTransfers || isBatchUnreviewingTransfers
                    "
                    :loading="isClassQuickReviewing && activeClassQuickReviewDecision === 'reject'"
                    @click="quickBatchReviewCurrentClass('reject')"
                  >
                    当前班待审一键拒绝
                  </el-button>
                  <el-button
                    plain
                    type="success"
                    :disabled="!selectedPendingTransferRequestIds.length || isBatchUnreviewingTransfers"
                    :loading="isBatchReviewingTransfers && activeBatchReviewDecision === 'approve'"
                    @click="batchReviewClassTransferRequests('approve')"
                  >
                    批量通过
                  </el-button>
                  <el-button
                    plain
                    type="danger"
                    :disabled="!selectedPendingTransferRequestIds.length || isBatchUnreviewingTransfers"
                    :loading="isBatchReviewingTransfers && activeBatchReviewDecision === 'reject'"
                    @click="batchReviewClassTransferRequests('reject')"
                  >
                    批量拒绝
                  </el-button>
                  <el-button
                    plain
                    type="warning"
                    :disabled="!selectedReviewedTransferRequestIds.length || isBatchReviewingTransfers"
                    :loading="isBatchUnreviewingTransfers"
                    @click="batchUnreviewClassTransferRequests"
                  >
                    批量撤销审核
                  </el-button>
                </el-space>
              </div>
            </template>

            <el-skeleton :loading="isLoadingTransferRequests" animated>
              <template #template>
                <el-skeleton :rows="6" />
              </template>
              <template #default>
                <el-empty v-if="!transferRequests.length" description="暂无转班申请记录" />
                <el-table
                  v-else
                  ref="transferTableRef"
                  :data="transferRequests"
                  row-key="id"
                  stripe
                  @selection-change="handleTransferSelectionChange"
                >
                  <el-table-column type="selection" width="48" :selectable="isTransferRequestSelectable" />
                  <el-table-column label="申请时间" min-width="160">
                    <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
                  </el-table-column>
                  <el-table-column label="学生" min-width="170">
                    <template #default="{ row }">
                      {{ row.student.name }}（{{ row.student.student_no }}）
                    </template>
                  </el-table-column>
                  <el-table-column label="原班级" min-width="120">
                    <template #default="{ row }">{{ row.current_class.class_name }}</template>
                  </el-table-column>
                  <el-table-column label="目标班级" min-width="120">
                    <template #default="{ row }">{{ row.target_class.class_name }}</template>
                  </el-table-column>
                  <el-table-column label="申请说明" min-width="180">
                    <template #default="{ row }">{{ row.reason || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="状态" min-width="100">
                    <template #default="{ row }">
                      <el-tag :type="classTransferStatusType(row.status)" round>
                        {{ classTransferStatusLabel(row.status) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="审核备注" min-width="180">
                    <template #default="{ row }">{{ row.review_note || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="审核人" min-width="120">
                    <template #default="{ row }">{{ row.reviewed_by_name || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="操作" min-width="180" fixed="right">
                    <template #default="{ row }">
                      <el-space v-if="row.status === 'pending'" wrap>
                        <el-button
                          link
                          type="success"
                          :loading="reviewingTransferId === row.id"
                          @click="reviewClassTransferRequest(row, 'approve')"
                        >
                          通过
                        </el-button>
                        <el-button
                          link
                          type="danger"
                          :loading="reviewingTransferId === row.id"
                          @click="reviewClassTransferRequest(row, 'reject')"
                        >
                          拒绝
                        </el-button>
                      </el-space>
                      <span v-else>已处理</span>
                    </template>
                  </el-table-column>
                </el-table>
              </template>
            </el-skeleton>
          </el-card>

          <el-card class="soft-card">
            <template #header>
              <div class="toolbar-row">
                <div class="filter-row">
                  <el-select
                    v-model="auditFilters.classId"
                    clearable
                    class="filter-select"
                    placeholder="按班级筛选审计"
                    @change="loadProfileChangeAudits"
                  >
                    <el-option
                      v-for="item in profileAuditClassOptions"
                      :key="item.id"
                      :label="item.class_name"
                      :value="item.id"
                    />
                  </el-select>
                  <el-select
                    v-model="auditFilters.eventType"
                    clearable
                    class="filter-select"
                    placeholder="按事件筛选"
                    @change="loadProfileChangeAudits"
                  >
                    <el-option
                      v-for="item in profileAuditEventTypeOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-input
                    v-model="auditFilters.keyword"
                    class="filter-select"
                    clearable
                    placeholder="搜索学生/学号/操作说明"
                    @keyup.enter="loadProfileChangeAudits"
                    @clear="loadProfileChangeAudits"
                  />
                  <el-button plain @click="loadProfileChangeAudits">查询</el-button>
                  <el-button plain @click="exportProfileChangeAudits">导出 CSV</el-button>
                </div>
                <el-space wrap>
                  <el-tag round type="info">资料变更审计</el-tag>
                  <el-tag
                    v-if="activeAuditBatchToken"
                    closable
                    round
                    type="success"
                    @close="clearAuditBatchFilter"
                  >
                    同批记录：{{ activeAuditBatchToken }}
                  </el-tag>
                  <el-tag round>当前 {{ profileChangeAudits.length }} 条</el-tag>
                  <el-tag round type="warning">总计 {{ profileChangeAuditTotalCount }} 条</el-tag>
                </el-space>
              </div>
            </template>

            <el-skeleton :loading="isLoadingProfileChangeAudits" animated>
              <template #template>
                <el-skeleton :rows="6" />
              </template>
              <template #default>
                <el-empty v-if="!profileChangeAudits.length" description="暂无资料变更审计记录" />
                <el-table v-else :data="profileChangeAudits" stripe>
                  <el-table-column label="时间" min-width="160">
                    <template #default="{ row }">{{ formatDateTime(row.occurred_at) }}</template>
                  </el-table-column>
                  <el-table-column label="事件" min-width="150">
                    <template #default="{ row }">{{ row.event_label || row.event_type }}</template>
                  </el-table-column>
                  <el-table-column label="班级" min-width="120">
                    <template #default="{ row }">{{ row.class_name || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="目标班级" min-width="170">
                    <template #default="{ row }">
                      <div class="audit-copy-cell">
                        <span>{{ row.target_class_name || '--' }}</span>
                        <el-button
                          v-if="row.target_class_name"
                          link
                          type="primary"
                          @click="copyAuditField(row.target_class_name, '目标班级')"
                        >
                          复制
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作人" min-width="150">
                    <template #default="{ row }">
                      {{ row.actor_name || '--' }}
                      <el-tag v-if="row.actor_role" size="small" round type="info">{{ auditActorRoleLabel(row.actor_role) }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作者账号" min-width="170">
                    <template #default="{ row }">
                      <div class="audit-copy-cell">
                        <span>{{ row.actor_username || '--' }}</span>
                        <el-button
                          v-if="row.actor_username"
                          link
                          type="primary"
                          @click="copyAuditField(row.actor_username, '操作者账号')"
                        >
                          复制
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="学生" min-width="170">
                    <template #default="{ row }">
                      {{ row.target_student_name || '--' }}
                      <span v-if="row.target_student_no">（{{ row.target_student_no }}）</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="字段" min-width="120">
                    <template #default="{ row }">{{ row.field_label || row.field_key || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="变更前" min-width="160">
                    <template #default="{ row }">{{ row.before_value || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="变更后" min-width="160">
                    <template #default="{ row }">{{ row.after_value || '--' }}</template>
                  </el-table-column>
                  <el-table-column label="处理批次号" min-width="220">
                    <template #default="{ row }">
                      <div class="audit-copy-cell">
                        <span>{{ row.batch_token || '--' }}</span>
                        <el-button
                          v-if="row.batch_token"
                          link
                          type="warning"
                          @click="filterAuditByBatchToken(row.batch_token)"
                        >
                          同批记录
                        </el-button>
                        <el-button
                          v-if="row.batch_token"
                          link
                          type="primary"
                          @click="copyAuditField(row.batch_token, '处理批次号')"
                        >
                          复制
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="说明" min-width="260">
                    <template #default="{ row }">{{ row.description || '--' }}</template>
                  </el-table-column>
                </el-table>
              </template>
            </el-skeleton>
          </el-card>
        </div>
      </template>
    </el-skeleton>

    <el-drawer v-model="submissionDrawerVisible" append-to-body size="720px" title="学生作品记录">
      <el-skeleton :loading="isLoadingStudentSubmissions" animated>
        <template #template>
          <el-card class="soft-card"><el-skeleton :rows="8" /></el-card>
        </template>
        <template #default>
          <div v-if="studentSubmissions">
            <p class="section-note">
              {{ studentSubmissions.student.class_name }} ·
              {{ studentSubmissions.student.display_name }}（{{ studentSubmissions.student.student_no }}）
            </p>
            <el-empty v-if="!studentSubmissions.items.length" description="暂无作品记录" />
            <el-table v-else :data="studentSubmissions.items" stripe>
              <el-table-column label="任务" min-width="200" prop="task_title" />
              <el-table-column label="学案" min-width="220" prop="plan_title" />
              <el-table-column label="状态" min-width="100">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'reviewed' ? 'success' : 'warning'" round>
                    {{ row.status === 'reviewed' ? '已评阅' : '已提交' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="分数" min-width="90">
                <template #default="{ row }">{{ row.score ?? '--' }}</template>
              </el-table-column>
              <el-table-column label="文件数" min-width="90" prop="file_count" />
              <el-table-column label="提交时间" min-width="160">
                <template #default="{ row }">{{ formatDateTime(row.submitted_at || row.updated_at) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </el-skeleton>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type StudentItem = {
  user_id: number;
  student_no: string;
  username: string;
  display_name: string;
  gender: string;
  is_active: boolean;
  checked_in_today: boolean;
  checked_in_at: string | null;
  seat_label: string | null;
  room_name: string | null;
  current_group_id: number | null;
  current_group_name: string | null;
  current_role: 'leader' | 'member' | null;
  submission_count: number;
  reviewed_submission_count: number;
  pending_review_count: number;
  latest_submission_at: string | null;
};

type StudentsPayload = {
  classes: Array<{
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
    active_count: number;
    inactive_count: number;
  }>;
  selected_class_id: number | null;
  selected_class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
  } | null;
  summary: {
    student_count: number;
    active_count: number;
    inactive_count: number;
    checked_in_today: number;
    grouped_count: number;
  };
  items: StudentItem[];
};

type StudentSubmissionPayload = {
  student: {
    user_id: number;
    student_no: string;
    display_name: string;
    class_id: number;
    class_name: string;
  };
  items: Array<{
    submission_id: number;
    task_id: number;
    task_title: string;
    plan_id: number;
    plan_title: string;
    status: string;
    score: number | null;
    is_recommended: boolean;
    submission_scope: string;
    group_id: number | null;
    group_name: string | null;
    file_count: number;
    submitted_at: string | null;
    updated_at: string | null;
  }>;
};

type StudentBatchAction = 'activate' | 'deactivate' | 'ungroup' | 'reset_password';
type StudentBatchActionPayload = {
  batch_result: {
    action: StudentBatchAction;
    processed_count: number;
    affected_count: number;
    skipped_count: number;
    used_default_password_rule?: boolean;
  };
};

type ClassTransferRequestItem = {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  reason: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  student: {
    user_id: number;
    name: string;
    student_no: string;
  };
  current_class: {
    id: number;
    class_name: string;
    grade_no: number;
  };
  target_class: {
    id: number;
    class_name: string;
    grade_no: number;
  };
};

type ClassTransferBatchReviewPayload = {
  batch_result: {
    decision: 'approve' | 'reject';
    selected_count: number;
    processed_count: number;
    skipped_count: number;
    approved_count: number;
    rejected_count: number;
    audit_batch_token?: string | null;
  };
  items: ClassTransferRequestItem[];
};

type ClassTransferBatchUnreviewPayload = {
  batch_result: {
    selected_count: number;
    processed_count: number;
    skipped_count: number;
    rolled_back_approved_count: number;
    reopened_rejected_count: number;
    audit_batch_token?: string | null;
  };
  items: ClassTransferRequestItem[];
};

type ProfileChangeAuditItem = {
  id: number;
  occurred_at: string;
  event_type: string;
  event_label: string;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_role: string | null;
  target_student_user_id: number | null;
  target_student_name: string | null;
  target_student_no: string | null;
  class_id: number | null;
  class_name: string | null;
  target_class_name: string | null;
  field_key: string | null;
  field_label: string | null;
  before_value: string | null;
  after_value: string | null;
  batch_token: string | null;
  description: string | null;
};

type ProfileChangeAuditPayload = {
  items: ProfileChangeAuditItem[];
  total_count: number;
  limit: number;
  event_types: Array<{
    value: string;
    label: string;
  }>;
  classes: Array<{
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
  }>;
};

type TransferPresetOption = {
  label: string;
  value: string;
};

type TransferPresetSystemSettingsPayload = {
  class_transfer_review_note_presets_text?: string | null;
  class_transfer_unreview_reason_presets_text?: string | null;
};

const defaultTransferReviewNotePresetOptions: TransferPresetOption[] = [
  {
    label: '通过 · 班额协调完成',
    value: '同意调班，班额与教学安排已协调，请按新班级参加后续课程与作业。',
  },
  {
    label: '通过 · 家校沟通确认',
    value: '同意调班，已完成家校沟通确认，请关注新班级课堂通知。',
  },
  {
    label: '拒绝 · 班级容量不足',
    value: '暂不通过，本次目标班级容量已满，建议后续重新发起申请。',
  },
  {
    label: '拒绝 · 学习进度稳定优先',
    value: '暂不通过，当前学习进度建议保持原班级，以保证学习连续性。',
  },
];

const defaultTransferUnreviewReasonPresetOptions: TransferPresetOption[] = [
  {
    label: '撤销 · 信息需补充',
    value: '撤销本次审核，申请信息待补充后重新审核。',
  },
  {
    label: '撤销 · 班级容量变更',
    value: '撤销本次审核，因班级容量变化需重新核对后再处理。',
  },
  {
    label: '撤销 · 教务安排调整',
    value: '撤销本次审核，教务安排发生调整，申请恢复为待审核。',
  },
];

const authStore = useAuthStore();
const students = ref<StudentsPayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const studentTableRef = ref<any>(null);
const transferTableRef = ref<any>(null);
const selectedStudentIds = ref<number[]>([]);
const filters = ref({
  classId: undefined as number | undefined,
  keyword: '',
  includeInactive: false,
});
const submissionDrawerVisible = ref(false);
const isLoadingStudentSubmissions = ref(false);
const studentSubmissions = ref<StudentSubmissionPayload | null>(null);
const hasSelectedStudents = computed(() => selectedStudentIds.value.length > 0);
const transferFilters = ref({
  classId: undefined as number | undefined,
  status: 'pending' as '' | 'pending' | 'approved' | 'rejected',
});
const transferRequests = ref<ClassTransferRequestItem[]>([]);
const isLoadingTransferRequests = ref(false);
const reviewingTransferId = ref<number | null>(null);
const selectedTransferRows = ref<ClassTransferRequestItem[]>([]);
const transferReviewNotePresetOptions = ref<TransferPresetOption[]>([...defaultTransferReviewNotePresetOptions]);
const transferUnreviewReasonPresetOptions = ref<TransferPresetOption[]>([...defaultTransferUnreviewReasonPresetOptions]);
const selectedReviewNotePreset = ref('');
const selectedUnreviewReasonPreset = ref('');
const isBatchReviewingTransfers = ref(false);
const activeBatchReviewDecision = ref<'approve' | 'reject' | null>(null);
const isBatchUnreviewingTransfers = ref(false);
const isClassQuickReviewing = ref(false);
const activeClassQuickReviewDecision = ref<'approve' | 'reject' | null>(null);
const pendingTransferCount = computed(
  () => transferRequests.value.filter((item) => item.status === 'pending').length
);
const currentStudentClassId = computed(
  () => filters.value.classId || students.value?.selected_class_id || undefined
);
const currentStudentClassName = computed(() => {
  const classId = currentStudentClassId.value;
  if (!classId || !students.value) {
    return '';
  }
  const matched = students.value.classes.find((item) => item.id === classId);
  return matched?.class_name || '';
});
const isTransferFilterResetDisabled = computed(
  () => transferFilters.value.classId === undefined && transferFilters.value.status === ''
);
const selectedPendingTransferRequestIds = computed(() =>
  selectedTransferRows.value.filter((item) => item.status === 'pending').map((item) => item.id)
);
const selectedReviewedTransferRequestIds = computed(() =>
  selectedTransferRows.value
    .filter((item) => item.status === 'approved' || item.status === 'rejected')
    .map((item) => item.id)
);
const hasSelectedTransferRows = computed(() => selectedTransferRows.value.length > 0);
const auditFilters = ref({
  classId: undefined as number | undefined,
  eventType: '' as string,
  keyword: '',
  batchToken: '',
});
const profileChangeAudits = ref<ProfileChangeAuditItem[]>([]);
const profileChangeAuditTotalCount = ref(0);
const isLoadingProfileChangeAudits = ref(false);
const profileAuditEventTypeOptions = ref<Array<{ value: string; label: string }>>([]);
const profileAuditClassOptions = ref<Array<{ id: number; class_name: string; grade_no: number; class_no: number }>>([]);
const activeAuditBatchToken = computed(() => auditFilters.value.batchToken.trim());

function formatDateTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function extractFilename(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = disposition.match(/filename="([^"]+)"/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }
  return fallback;
}

function copyTextWithFallback(value: string) {
  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  return copied;
}

async function copyAuditField(rawValue: string | null | undefined, label: string) {
  const value = rawValue?.trim();
  if (!value) {
    ElMessage.warning(`${label}为空，无法复制`);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else if (!copyTextWithFallback(value)) {
      throw new Error('clipboard fallback failed');
    }
    ElMessage.success(`${label}已复制`);
  } catch (error) {
    if (copyTextWithFallback(value)) {
      ElMessage.success(`${label}已复制`);
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `${label}复制失败`);
  }
}

function normalizeOptionalInput(value: string | null | undefined) {
  const normalized = value?.trim() || '';
  return normalized || null;
}

function parseTransferPresetText(rawValue: string | null | undefined): TransferPresetOption[] {
  const options: TransferPresetOption[] = [];
  const seenValues = new Set<string>();
  for (const rawLine of String(rawValue || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('|');
    const label = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : line;
    const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : line;
    if (!value || seenValues.has(value)) {
      continue;
    }
    seenValues.add(value);
    options.push({
      label: label || value,
      value,
    });
  }
  return options;
}

async function loadTransferPresetSettings() {
  if (!authStore.token) {
    return;
  }
  try {
    const payload = await apiGet<TransferPresetSystemSettingsPayload>('/settings/system', authStore.token);
    const reviewOptions = parseTransferPresetText(payload.class_transfer_review_note_presets_text);
    const unreviewOptions = parseTransferPresetText(payload.class_transfer_unreview_reason_presets_text);
    transferReviewNotePresetOptions.value = reviewOptions.length
      ? reviewOptions
      : [...defaultTransferReviewNotePresetOptions];
    transferUnreviewReasonPresetOptions.value = unreviewOptions.length
      ? unreviewOptions
      : [...defaultTransferUnreviewReasonPresetOptions];
    if (!transferReviewNotePresetOptions.value.some((item) => item.value === selectedReviewNotePreset.value)) {
      selectedReviewNotePreset.value = '';
    }
    if (!transferUnreviewReasonPresetOptions.value.some((item) => item.value === selectedUnreviewReasonPreset.value)) {
      selectedUnreviewReasonPreset.value = '';
    }
  } catch {
    transferReviewNotePresetOptions.value = [...defaultTransferReviewNotePresetOptions];
    transferUnreviewReasonPresetOptions.value = [...defaultTransferUnreviewReasonPresetOptions];
    selectedReviewNotePreset.value = '';
    selectedUnreviewReasonPreset.value = '';
  }
}

function classTransferStatusLabel(statusValue: string) {
  if (statusValue === 'pending') {
    return '待审核';
  }
  if (statusValue === 'approved') {
    return '已通过';
  }
  if (statusValue === 'rejected') {
    return '已拒绝';
  }
  return statusValue;
}

function classTransferStatusType(statusValue: string) {
  if (statusValue === 'pending') {
    return 'warning';
  }
  if (statusValue === 'approved') {
    return 'success';
  }
  if (statusValue === 'rejected') {
    return 'danger';
  }
  return 'info';
}

function auditActorRoleLabel(roleValue: string) {
  if (roleValue === 'admin') {
    return '管理员';
  }
  if (roleValue === 'teacher') {
    return '教师';
  }
  if (roleValue === 'student') {
    return '学生';
  }
  return roleValue;
}

async function loadStudents() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教职工账号';
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const query = new URLSearchParams();
    if (filters.value.classId) {
      query.set('class_id', String(filters.value.classId));
    }
    if (filters.value.keyword.trim()) {
      query.set('keyword', filters.value.keyword.trim());
    }
    if (filters.value.includeInactive) {
      query.set('include_inactive', 'true');
    }
    const suffix = query.toString();
    const payload = await apiGet<StudentsPayload>(
      `/staff/students${suffix ? `?${suffix}` : ''}`,
      authStore.token
    );
    students.value = payload;
    filters.value.classId = payload.selected_class_id || undefined;
    if (transferFilters.value.classId === undefined && payload.selected_class_id) {
      transferFilters.value.classId = payload.selected_class_id;
    }
    if (auditFilters.value.classId === undefined && payload.selected_class_id) {
      auditFilters.value.classId = payload.selected_class_id;
    }
    if (!profileAuditClassOptions.value.length) {
      profileAuditClassOptions.value = payload.classes.map((item) => ({
        id: item.id,
        class_name: item.class_name,
        grade_no: item.grade_no,
        class_no: item.class_no,
      }));
    }
    selectedStudentIds.value = [];
    studentTableRef.value?.clearSelection?.();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载学生列表失败';
  } finally {
    isLoading.value = false;
  }
}

async function loadTransferRequests() {
  if (!authStore.token) {
    return;
  }
  isLoadingTransferRequests.value = true;
  try {
    const query = new URLSearchParams();
    if (transferFilters.value.classId) {
      query.set('class_id', String(transferFilters.value.classId));
    }
    if (transferFilters.value.status) {
      query.set('status_filter', transferFilters.value.status);
    }
    const suffix = query.toString();
    const payload = await apiGet<{ items: ClassTransferRequestItem[] }>(
      `/profiles/staff/class-transfer/requests${suffix ? `?${suffix}` : ''}`,
      authStore.token
    );
    transferRequests.value = payload.items;
    selectedTransferRows.value = [];
    transferTableRef.value?.clearSelection?.();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载转班申请失败');
  } finally {
    isLoadingTransferRequests.value = false;
  }
}

function isTransferRequestSelectable(row: ClassTransferRequestItem) {
  return Boolean(row.id);
}

function handleTransferSelectionChange(rows: ClassTransferRequestItem[]) {
  selectedTransferRows.value = [...rows];
}

function selectPendingTransferRequests() {
  if (!transferRequests.value.length) {
    return;
  }
  transferTableRef.value?.clearSelection?.();
  for (const requestItem of transferRequests.value) {
    if (requestItem.status === 'pending') {
      transferTableRef.value?.toggleRowSelection?.(requestItem, true);
    }
  }
}

function clearTransferSelection() {
  transferTableRef.value?.clearSelection?.();
  selectedTransferRows.value = [];
}

function quickFilterPendingForCurrentClass() {
  const classId = currentStudentClassId.value;
  if (!classId) {
    ElMessage.warning('请先在学生列表选择当前班级');
    return;
  }
  transferFilters.value.classId = classId;
  transferFilters.value.status = 'pending';
  void loadTransferRequests();
}

function resetTransferFiltersToAll() {
  transferFilters.value.classId = undefined;
  transferFilters.value.status = '';
  void loadTransferRequests();
}

function filterAuditByBatchToken(rawBatchToken: string | null | undefined) {
  const batchToken = rawBatchToken?.trim() || '';
  if (!batchToken) {
    ElMessage.warning('当前记录没有处理批次号');
    return;
  }
  auditFilters.value.classId = undefined;
  auditFilters.value.eventType = '';
  auditFilters.value.keyword = '';
  auditFilters.value.batchToken = batchToken;
  void loadProfileChangeAudits();
}

function clearAuditBatchFilter() {
  if (!activeAuditBatchToken.value) {
    return;
  }
  auditFilters.value.batchToken = '';
  void loadProfileChangeAudits();
}

async function batchReviewClassTransferRequests(decision: 'approve' | 'reject') {
  const pendingIds = [...selectedPendingTransferRequestIds.value];
  if (!authStore.token || !pendingIds.length) {
    ElMessage.warning('请先选择待审核申请');
    return;
  }
  const actionLabel = decision === 'approve' ? '通过' : '拒绝';
  try {
    const input = await ElMessageBox.prompt(
      `你将批量${actionLabel} ${pendingIds.length} 条转班申请，可填写统一审核备注（可选）`,
      `批量${actionLabel}转班申请`,
      {
        inputType: 'textarea',
        inputPlaceholder: '审核备注（可选，可使用上方常用语预设）',
        inputValue: selectedReviewNotePreset.value,
        confirmButtonText: `批量${actionLabel}`,
      }
    );

    isBatchReviewingTransfers.value = true;
    activeBatchReviewDecision.value = decision;
    const payload = await apiPost<ClassTransferBatchReviewPayload>(
      '/profiles/staff/class-transfer/requests/batch-review',
      {
        request_ids: pendingIds,
        decision,
        review_note: normalizeOptionalInput(input.value),
      },
      authStore.token
    );
    const result = payload.batch_result;
    const auditBatchSuffix = result.audit_batch_token ? `，审计批次 ${result.audit_batch_token}` : '';
    ElMessage.success(
      `批量${actionLabel}完成：生效 ${result.processed_count} 条，跳过 ${result.skipped_count} 条${auditBatchSuffix}`
    );
    await Promise.all([loadStudents(), loadTransferRequests(), loadProfileChangeAudits()]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `批量${actionLabel}失败`);
  } finally {
    isBatchReviewingTransfers.value = false;
    activeBatchReviewDecision.value = null;
  }
}

async function quickBatchReviewCurrentClass(decision: 'approve' | 'reject') {
  if (!authStore.token) {
    return;
  }
  const classId = transferFilters.value.classId;
  if (!classId) {
    ElMessage.warning('请先选择班级');
    return;
  }
  const actionLabel = decision === 'approve' ? '通过' : '拒绝';

  try {
    const query = new URLSearchParams();
    query.set('class_id', String(classId));
    query.set('status_filter', 'pending');
    const payload = await apiGet<{ items: ClassTransferRequestItem[] }>(
      `/profiles/staff/class-transfer/requests?${query.toString()}`,
      authStore.token
    );
    const requestIds = payload.items
      .filter((item) => item.status === 'pending')
      .map((item) => item.id);
    if (!requestIds.length) {
      ElMessage.info('当前班级暂无待审核转班申请');
      return;
    }

    const input = await ElMessageBox.prompt(
      `将对当前班级 ${requestIds.length} 条待审核转班申请执行一键${actionLabel}，可填写统一审核备注（可选）`,
      `当前班一键${actionLabel}`,
      {
        inputType: 'textarea',
        inputPlaceholder: '审核备注（可选，可使用上方常用语预设）',
        inputValue: selectedReviewNotePreset.value,
        confirmButtonText: `一键${actionLabel}`,
      }
    );

    isClassQuickReviewing.value = true;
    activeClassQuickReviewDecision.value = decision;
    const reviewResult = await apiPost<ClassTransferBatchReviewPayload>(
      '/profiles/staff/class-transfer/requests/batch-review',
      {
        request_ids: requestIds,
        decision,
        review_note: normalizeOptionalInput(input.value),
      },
      authStore.token
    );
    const result = reviewResult.batch_result;
    const auditBatchSuffix = result.audit_batch_token ? `，审计批次 ${result.audit_batch_token}` : '';
    ElMessage.success(
      `当前班一键${actionLabel}完成：生效 ${result.processed_count} 条，跳过 ${result.skipped_count} 条${auditBatchSuffix}`
    );
    await Promise.all([loadStudents(), loadTransferRequests(), loadProfileChangeAudits()]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `当前班一键${actionLabel}失败`);
  } finally {
    isClassQuickReviewing.value = false;
    activeClassQuickReviewDecision.value = null;
  }
}

async function batchUnreviewClassTransferRequests() {
  const reviewedIds = [...selectedReviewedTransferRequestIds.value];
  if (!authStore.token || !reviewedIds.length) {
    ElMessage.warning('请先选择已处理申请');
    return;
  }
  try {
    const input = await ElMessageBox.prompt(
      `你将批量撤销 ${reviewedIds.length} 条已处理申请，可填写统一撤销备注（可选）`,
      '批量撤销转班审核',
      {
        inputType: 'textarea',
        inputPlaceholder: '撤销备注（可选，可使用上方撤销原因模板）',
        inputValue: selectedUnreviewReasonPreset.value,
        confirmButtonText: '批量撤销',
      }
    );

    isBatchUnreviewingTransfers.value = true;
    const payload = await apiPost<ClassTransferBatchUnreviewPayload>(
      '/profiles/staff/class-transfer/requests/batch-unreview',
      {
        request_ids: reviewedIds,
        reason: normalizeOptionalInput(input.value),
      },
      authStore.token
    );
    const result = payload.batch_result;
    const auditBatchSuffix = result.audit_batch_token ? `，审计批次 ${result.audit_batch_token}` : '';
    ElMessage.success(`批量撤销完成：生效 ${result.processed_count} 条，跳过 ${result.skipped_count} 条${auditBatchSuffix}`);
    await Promise.all([loadStudents(), loadTransferRequests(), loadProfileChangeAudits()]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '批量撤销审核失败');
  } finally {
    isBatchUnreviewingTransfers.value = false;
  }
}

async function loadProfileChangeAudits() {
  if (!authStore.token) {
    return;
  }
  isLoadingProfileChangeAudits.value = true;
  try {
    const query = new URLSearchParams();
    if (auditFilters.value.classId) {
      query.set('class_id', String(auditFilters.value.classId));
    }
    if (auditFilters.value.eventType.trim()) {
      query.set('event_type', auditFilters.value.eventType.trim());
    }
    if (auditFilters.value.keyword.trim()) {
      query.set('keyword', auditFilters.value.keyword.trim());
    }
    if (activeAuditBatchToken.value) {
      query.set('batch_token', activeAuditBatchToken.value);
    }
    const suffix = query.toString();
    const payload = await apiGet<ProfileChangeAuditPayload>(
      `/profiles/staff/profile-change-audits${suffix ? `?${suffix}` : ''}`,
      authStore.token
    );
    profileChangeAudits.value = payload.items;
    profileChangeAuditTotalCount.value = payload.total_count || payload.items.length;
    profileAuditEventTypeOptions.value = payload.event_types || [];
    if (payload.classes?.length) {
      profileAuditClassOptions.value = payload.classes;
    } else if (students.value?.classes?.length) {
      profileAuditClassOptions.value = students.value.classes.map((item) => ({
        id: item.id,
        class_name: item.class_name,
        grade_no: item.grade_no,
        class_no: item.class_no,
      }));
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载资料变更审计失败');
  } finally {
    isLoadingProfileChangeAudits.value = false;
  }
}

async function exportProfileChangeAudits() {
  if (!authStore.token) {
    return;
  }
  try {
    const query = new URLSearchParams();
    if (auditFilters.value.classId) {
      query.set('class_id', String(auditFilters.value.classId));
    }
    if (auditFilters.value.eventType.trim()) {
      query.set('event_type', auditFilters.value.eventType.trim());
    }
    if (auditFilters.value.keyword.trim()) {
      query.set('keyword', auditFilters.value.keyword.trim());
    }
    if (activeAuditBatchToken.value) {
      query.set('batch_token', activeAuditBatchToken.value);
    }
    const response = await apiGetBlob(
      `/profiles/staff/profile-change-audits/export?${query.toString()}`,
      authStore.token
    );
    const blob = await response.blob();
    const fallback = 'profile-change-audits.csv';
    const filename = extractFilename(response.headers.get('content-disposition'), fallback);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出资料变更审计失败');
  }
}

async function reviewClassTransferRequest(
  requestItem: ClassTransferRequestItem,
  decision: 'approve' | 'reject'
) {
  if (!authStore.token) {
    return;
  }
  const actionLabel = decision === 'approve' ? '通过' : '拒绝';
  try {
    const input = await ElMessageBox.prompt(
      `你正在${actionLabel} ${requestItem.student.name} 的转班申请，可填写审核备注（可选）`,
      `${actionLabel}转班申请`,
      {
        inputType: 'textarea',
        inputPlaceholder: '审核备注（可选，可使用上方常用语预设）',
        inputValue: selectedReviewNotePreset.value,
        confirmButtonText: actionLabel,
      }
    );
    reviewingTransferId.value = requestItem.id;
    await apiPost(
      `/profiles/staff/class-transfer/requests/${requestItem.id}/review`,
      {
        decision,
        review_note: normalizeOptionalInput(input.value),
      },
      authStore.token
    );
    ElMessage.success(`已${actionLabel}转班申请`);
    await Promise.all([loadStudents(), loadTransferRequests(), loadProfileChangeAudits()]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `${actionLabel}转班申请失败`);
  } finally {
    reviewingTransferId.value = null;
  }
}

async function refreshAll() {
  await Promise.all([loadTransferPresetSettings(), loadStudents()]);
  await Promise.all([loadTransferRequests(), loadProfileChangeAudits()]);
}

function handleSelectionChange(rows: StudentItem[]) {
  selectedStudentIds.value = rows.map((item) => item.user_id);
}

function batchActionText(action: StudentBatchAction) {
  if (action === 'activate') return '恢复账号';
  if (action === 'deactivate') return '停用账号';
  if (action === 'ungroup') return '解除分组';
  return '重置密码';
}

async function runBatchAction(action: StudentBatchAction) {
  if (!authStore.token || !selectedStudentIds.value.length) {
    return;
  }
  try {
    let newPassword: string | null | undefined;
    if (action === 'reset_password') {
      const input = await ElMessageBox.prompt(
        '请输入批量重置的新密码（留空将回退为各自学号后 6 位）',
        '批量重置密码',
        { inputPlaceholder: '至少 6 位', inputType: 'password', confirmButtonText: '重置' }
      );
      newPassword = input.value?.trim() || null;
    } else {
      await ElMessageBox.confirm(
        `确认要对已选 ${selectedStudentIds.value.length} 名学生执行“${batchActionText(action)}”吗？`
      );
    }

    const payload = await apiPost<StudentBatchActionPayload>(
      '/staff/students/batch-action',
      {
        student_user_ids: [...selectedStudentIds.value],
        action,
        new_password: action === 'reset_password' ? newPassword : undefined,
      },
      authStore.token
    );
    const result = payload.batch_result;
    ElMessage.success(
      `批量${batchActionText(action)}完成：生效 ${result.affected_count} 人，跳过 ${result.skipped_count} 人`
    );
    await loadStudents();
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `批量${batchActionText(action)}失败`);
  }
}

async function downloadStudents() {
  if (!authStore.token) {
    return;
  }
  const query = new URLSearchParams();
  if (filters.value.classId) {
    query.set('class_id', String(filters.value.classId));
  }
  if (filters.value.keyword.trim()) {
    query.set('keyword', filters.value.keyword.trim());
  }
  if (filters.value.includeInactive) {
    query.set('include_inactive', 'true');
  }
  try {
    const response = await apiGetBlob(`/staff/students/export?${query.toString()}`, authStore.token);
    const blob = await response.blob();
    const fallback = 'students.csv';
    const filename = extractFilename(response.headers.get('content-disposition'), fallback);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出学生列表失败');
  }
}

async function openResetPassword(row: StudentItem) {
  if (!authStore.token) {
    return;
  }
  try {
    const input = await ElMessageBox.prompt(
      `请输入 ${row.display_name} 的新密码（留空将回退为学号后 6 位）`,
      '重置密码',
      { inputPlaceholder: '至少 6 位', inputType: 'password', confirmButtonText: '重置' }
    );
    const payload = await apiPost<{ new_password: string }>(
      `/staff/students/${row.user_id}/reset-password`,
      { new_password: input.value?.trim() || null },
      authStore.token
    );
    ElMessage.success(`已重置，临时密码：${payload.new_password}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '重置密码失败');
  }
}

async function toggleStudentStatus(row: StudentItem) {
  if (!authStore.token) {
    return;
  }
  const nextStatus = !row.is_active;
  const actionText = nextStatus ? '恢复账号' : '停用账号';
  try {
    await ElMessageBox.confirm(`确认要${actionText} ${row.display_name} 吗？`);
    await apiPost(
      `/staff/students/${row.user_id}/status`,
      { is_active: nextStatus },
      authStore.token
    );
    ElMessage.success(`${row.display_name} 已${nextStatus ? '恢复' : '停用'}`);
    await loadStudents();
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `${actionText}失败`);
  }
}

async function removeFromGroup(row: StudentItem) {
  if (!authStore.token || !row.current_group_id) {
    return;
  }
  try {
    await ElMessageBox.confirm(`确认将 ${row.display_name} 从当前小组移出吗？`);
    await apiPost(`/staff/students/${row.user_id}/ungroup`, {}, authStore.token);
    ElMessage.success('已解除分组');
    await loadStudents();
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '解除分组失败');
  }
}

async function openStudentSubmissions(row: StudentItem) {
  if (!authStore.token) {
    return;
  }
  submissionDrawerVisible.value = true;
  isLoadingStudentSubmissions.value = true;
  try {
    studentSubmissions.value = await apiGet<StudentSubmissionPayload>(
      `/staff/students/${row.user_id}/submissions`,
      authStore.token
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载学生作品记录失败');
    studentSubmissions.value = null;
  } finally {
    isLoadingStudentSubmissions.value = false;
  }
}

onMounted(() => {
  void refreshAll();
});
</script>

<style scoped>
.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 230px;
}

.preset-select {
  width: 260px;
}

.audit-copy-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
</style>
