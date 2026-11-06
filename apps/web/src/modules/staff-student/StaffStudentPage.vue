<template>
  <div class="page-stack">
    <StaffPageHead title="学生名单" :sub="pageSummary">
      <template #actions>
        <n-button :loading="isLoading || isLoadingTransferRequests" text @click="refreshAll">刷新</n-button>
        <n-button :disabled="!students?.selected_class_id" secondary @click="downloadStudents">
          导出学生表
        </n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="11" animated /></div>
    </div>

    <div v-else-if="students" class="page-stack">
      <div class="sf-tabs">
        <button
          type="button"
          :class="['sf-tabs__item', { 'is-active': activeTab === 'students' }]"
          @click="activeTab = 'students'"
        >
          本班学生
          <span class="sf-tabs__count">{{ students.items.length }}</span>
        </button>
        <button
          type="button"
          :class="['sf-tabs__item', { 'is-active': activeTab === 'transfers' }]"
          @click="activeTab = 'transfers'"
        >
          转班与审计
          <span v-if="pendingTransferCount" class="sf-tabs__count">{{ pendingTransferCount }}</span>
        </button>
        <button
          type="button"
          :class="['sf-tabs__item', { 'is-active': activeTab === 'groups' }]"
          @click="activeTab = 'groups'"
        >
          分组与协作
        </button>
        <button
          type="button"
          :class="['sf-tabs__item', { 'is-active': activeTab === 'group-progress' }]"
          @click="activeTab = 'group-progress'"
        >
          小组活动进度
        </button>
      </div>

      <section v-if="activeTab === 'students'" class="sf-panel">
        <div class="sf-toolbar">
          <n-select
            v-model:value="filters.classId"
            :options="classOptions"
            class="filter-select"
            placeholder="选择班级"
            @update:value="loadStudents"
          />
          <n-input
            v-model:value="filters.keyword"
            class="sf-toolbar__search"
            clearable
            placeholder="按学号 / 账号 / 姓名搜索"
            @clear="clearStudentKeyword"
            @keyup.enter="loadStudents"
          />
          <n-checkbox v-model:checked="filters.includeInactive" @update:checked="loadStudents">
            包含停用账号
          </n-checkbox>
          <div class="sf-toolbar__right">
            <span>{{ students.items.length }} 人</span>
            <n-button text :disabled="!students.selected_class_id" @click="openPermissionDialog">
              资料修改权限
            </n-button>
          </div>
        </div>

        <div v-if="hasSelectedStudents" class="batch-bar">
          <span class="batch-bar__count">已选 {{ selectedStudentIds.length }} 人</span>
          <div class="batch-bar__actions">
            <n-button size="small" secondary @click="runBatchAction('deactivate')">停用</n-button>
            <n-button size="small" secondary @click="runBatchAction('activate')">恢复</n-button>
            <n-button size="small" secondary @click="runBatchAction('ungroup')">解除分组</n-button>
            <n-button size="small" secondary @click="runBatchAction('reset_password')">重置密码</n-button>
            <n-button size="small" text @click="clearStudentSelection">取消选择</n-button>
          </div>
        </div>

        <p v-if="!students.items.length" class="sf-empty">
          当前筛选条件下没有学生。换个班级，或勾选「包含停用账号」再试。
        </p>

        <template v-else>
          <div class="sf-rows__head roster-cols">
            <span class="roster-check">
              <n-checkbox
                :checked="allVisibleSelected"
                :indeterminate="someVisibleSelected"
                aria-label="全选本页学生"
                @update:checked="toggleSelectAll"
              />
            </span>
            <span class="roster-col-name">学生</span>
            <span>签到</span>
            <span>提交 / 待评</span>
            <span>最近提交</span>
            <span>操作</span>
          </div>

          <div class="sf-rows">
            <article
              v-for="row in students.items"
              :key="row.user_id"
              :class="['sf-row', 'sf-row--cols', 'roster-cols', row.is_active ? '' : 'is-inactive']"
            >
              <span class="roster-check">
                <n-checkbox
                  :checked="isStudentChecked(row.user_id)"
                  :aria-label="`选择 ${row.display_name}`"
                  @update:checked="(checked) => toggleStudentCheck(row.user_id, checked)"
                />
              </span>

              <div class="sf-row__main">
                <p class="sf-row__title">
                  <span class="sf-row__title-text">{{ row.display_name }}</span>
                  <span v-if="row.current_role === 'leader'" class="sf-pill sf-pill--accent">组长</span>
                  <span v-if="!row.is_active" class="sf-pill sf-pill--neg">停用</span>
                </p>
                <p class="sf-row__meta">
                  <span class="roster-no">{{ row.student_no }}</span>
                  <span v-if="row.username !== row.student_no">账号 {{ row.username }}</span>
                  <span v-if="row.current_group_name">{{ row.current_group_name }}</span>
                  <span v-else class="roster-ungrouped">未分组</span>
                  <span v-if="row.seat_label">{{ row.seat_label }} · {{ row.room_name }}</span>
                </p>
              </div>

              <span class="roster-cell" data-label="签到">
                <span v-if="row.checked_in_today" class="roster-quiet">{{ formatTime(row.checked_in_at) }}</span>
                <span v-else class="roster-absent">未签到</span>
              </span>

              <span class="roster-cell roster-submit" data-label="提交">
                <span :class="['roster-num', row.submission_count ? '' : 'is-zero']">{{ row.submission_count }}</span>
                <small :class="row.pending_review_count ? 'is-warn' : 'is-zero'">
                  待评 {{ row.pending_review_count }}
                </small>
              </span>

              <span class="roster-cell roster-quiet" data-label="最近提交">
                {{ row.latest_submission_at ? formatRelative(row.latest_submission_at) : '—' }}
              </span>

              <div class="sf-row__action">
                <n-button size="small" text @click="openStudentPortrait(row)">画像</n-button>
                <n-dropdown
                  :options="rowActionOptions(row)"
                  trigger="click"
                  @select="(key) => handleRowAction(String(key), row)"
                >
                  <n-button size="small" text aria-label="更多操作">更多</n-button>
                </n-dropdown>
              </div>
            </article>
          </div>
        </template>
      </section>

      <template v-else-if="activeTab === 'transfers'">
      <SaPanel>
        <template #header>
          <div class="panel-toolbar">
            <div class="filter-row">
              <n-select
                :options="transferClassOptions"
                :value="transferFilters.classId ?? null"
                class="filter-select"
                clearable
                placeholder="按班级筛选申请"
                @update:value="onTransferClassFilterChange"
              />
              <n-select
                v-model:value="transferFilters.status"
                :options="transferStatusOptions"
                class="filter-select status-filter"
                @update:value="loadTransferRequests"
              />
              <n-button
                :disabled="!currentStudentClassId"
                secondary
                type="primary"
                @click="quickFilterPendingForCurrentClass"
              >
                {{ currentStudentClassName ? `仅看${currentStudentClassName}待审核` : '仅看当前班待审核' }}
              </n-button>
              <n-button :disabled="isTransferFilterResetDisabled" secondary @click="resetTransferFiltersToAll">
                恢复为全部状态
              </n-button>
              <n-button secondary @click="loadTransferRequests">刷新申请</n-button>
              <n-select
                :options="transferReviewNotePresetOptions"
                :value="selectedReviewNotePreset || null"
                class="preset-select"
                clearable
                placeholder="审核常用语预设"
                @update:value="onReviewNotePresetChange"
              />
              <n-select
                :options="transferUnreviewReasonPresetOptions"
                :value="selectedUnreviewReasonPreset || null"
                class="preset-select"
                clearable
                placeholder="撤销原因模板"
                @update:value="onUnreviewReasonPresetChange"
              />
            </div>
            <div class="chip-row">
              <n-tag round type="warning">待审核 {{ pendingTransferCount }} 条</n-tag>
              <n-tag round type="success">待审已选 {{ selectedPendingTransferRequestIds.length }} 条</n-tag>
              <n-tag round type="info">已处理已选 {{ selectedReviewedTransferRequestIds.length }} 条</n-tag>
              <n-tag round>当前 {{ transferRequests.length }} 条</n-tag>
              <n-button secondary @click="selectPendingTransferRequests">全选待审核</n-button>
              <n-button :disabled="!hasSelectedTransferRows" secondary @click="clearTransferSelection">
                清空选择
              </n-button>
              <n-button
                :disabled="!transferFilters.classId || isBatchReviewingTransfers || isBatchUnreviewingTransfers"
                :loading="isClassQuickReviewing && activeClassQuickReviewDecision === 'approve'"
                secondary
                type="success"
                @click="quickBatchReviewCurrentClass('approve')"
              >
                当前班待审一键通过
              </n-button>
              <n-button
                :disabled="!transferFilters.classId || isBatchReviewingTransfers || isBatchUnreviewingTransfers"
                :loading="isClassQuickReviewing && activeClassQuickReviewDecision === 'reject'"
                secondary
                type="error"
                @click="quickBatchReviewCurrentClass('reject')"
              >
                当前班待审一键拒绝
              </n-button>
              <n-button
                :disabled="!selectedPendingTransferRequestIds.length || isBatchUnreviewingTransfers"
                :loading="isBatchReviewingTransfers && activeBatchReviewDecision === 'approve'"
                secondary
                type="success"
                @click="batchReviewClassTransferRequests('approve')"
              >
                批量通过
              </n-button>
              <n-button
                :disabled="!selectedPendingTransferRequestIds.length || isBatchUnreviewingTransfers"
                :loading="isBatchReviewingTransfers && activeBatchReviewDecision === 'reject'"
                secondary
                type="error"
                @click="batchReviewClassTransferRequests('reject')"
              >
                批量拒绝
              </n-button>
              <n-button
                :disabled="!selectedReviewedTransferRequestIds.length || isBatchReviewingTransfers"
                :loading="isBatchUnreviewingTransfers"
                secondary
                type="warning"
                @click="batchUnreviewClassTransferRequests"
              >
                批量撤销审核
              </n-button>
            </div>
          </div>
        </template>

        <n-skeleton v-if="isLoadingTransferRequests" :rows="6" animated />
        <SaDataTable
          v-else
          v-model:checked-row-keys="transferCheckedKeys"
          :data="transferRequests"
          :scroll-x="1380"
          empty-text="暂无转班申请记录"
          row-key="id"
          stripe
        >
          <SaTableColumn :selectable="isTransferRequestSelectable" type="selection" width="48" />
          <SaTableColumn label="申请时间" min-width="160">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </SaTableColumn>
          <SaTableColumn label="学生" min-width="170">
            <template #default="{ row }">
              {{ row.student.name }}（{{ row.student.student_no }}）
            </template>
          </SaTableColumn>
          <SaTableColumn label="原班级" min-width="120">
            <template #default="{ row }">{{ row.current_class.class_name }}</template>
          </SaTableColumn>
          <SaTableColumn label="目标班级" min-width="120">
            <template #default="{ row }">{{ row.target_class.class_name }}</template>
          </SaTableColumn>
          <SaTableColumn label="申请说明" min-width="180">
            <template #default="{ row }">{{ row.reason || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="状态" min-width="100">
            <template #default="{ row }">
              <n-tag :type="classTransferStatusType(row.status)" round>
                {{ classTransferStatusLabel(row.status) }}
              </n-tag>
            </template>
          </SaTableColumn>
          <SaTableColumn label="审核备注" min-width="180">
            <template #default="{ row }">{{ row.review_note || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="审核人" min-width="120">
            <template #default="{ row }">{{ row.reviewed_by_name || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="操作" fixed="right" min-width="180">
            <template #default="{ row }">
              <div v-if="row.status === 'pending'" class="cell-actions">
                <n-button
                  :loading="reviewingTransferId === row.id"
                  text
                  type="success"
                  @click="reviewClassTransferRequest(row, 'approve')"
                >
                  通过
                </n-button>
                <n-button
                  :loading="reviewingTransferId === row.id"
                  text
                  type="error"
                  @click="reviewClassTransferRequest(row, 'reject')"
                >
                  拒绝
                </n-button>
              </div>
              <span v-else>已处理</span>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </SaPanel>

      <SaPanel>
        <template #header>
          <div class="panel-toolbar">
            <div class="filter-row">
              <n-select
                :options="auditClassOptions"
                :value="auditFilters.classId ?? null"
                class="filter-select"
                clearable
                placeholder="按班级筛选审计"
                @update:value="onAuditClassFilterChange"
              />
              <n-select
                :options="profileAuditEventTypeOptions"
                :value="auditFilters.eventType || null"
                class="filter-select"
                clearable
                placeholder="按事件筛选"
                @update:value="onAuditEventTypeChange"
              />
              <n-input
                v-model:value="auditFilters.keyword"
                class="filter-select"
                clearable
                placeholder="搜索学生/学号/操作说明"
                @clear="clearAuditKeyword"
                @keyup.enter="loadProfileChangeAudits"
              />
              <n-button secondary @click="loadProfileChangeAudits">查询</n-button>
              <n-button secondary @click="exportProfileChangeAudits">导出 CSV</n-button>
            </div>
            <div class="chip-row">
              <n-tag round type="info">资料变更审计</n-tag>
              <n-tag v-if="activeAuditBatchToken" closable round type="success" @close="clearAuditBatchFilter">
                同批记录：{{ activeAuditBatchToken }}
              </n-tag>
              <n-tag round>当前 {{ profileChangeAudits.length }} 条</n-tag>
              <n-tag round type="warning">总计 {{ profileChangeAuditTotalCount }} 条</n-tag>
            </div>
          </div>
        </template>

        <n-skeleton v-if="isLoadingProfileChangeAudits" :rows="6" animated />
        <SaDataTable
          v-else
          :data="profileChangeAudits"
          row-key="id"
          stripe
          empty-text="暂无资料变更审计记录"
        >
          <SaTableColumn label="时间" min-width="160">
            <template #default="{ row }">{{ formatDateTime(row.occurred_at) }}</template>
          </SaTableColumn>
          <SaTableColumn label="事件" min-width="150">
            <template #default="{ row }">{{ row.event_label || row.event_type }}</template>
          </SaTableColumn>
          <SaTableColumn label="班级" min-width="120">
            <template #default="{ row }">{{ row.class_name || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="目标班级" min-width="170">
            <template #default="{ row }">
              <div class="audit-copy-cell">
                <span>{{ row.target_class_name || '--' }}</span>
                <n-button
                  v-if="row.target_class_name"
                  text
                  type="primary"
                  @click="copyAuditField(row.target_class_name, '目标班级')"
                >
                  复制
                </n-button>
              </div>
            </template>
          </SaTableColumn>
          <SaTableColumn label="操作人" min-width="150">
            <template #default="{ row }">
              {{ row.actor_name || '--' }}
              <n-tag v-if="row.actor_role" round size="small" type="info">
                {{ auditActorRoleLabel(row.actor_role) }}
              </n-tag>
            </template>
          </SaTableColumn>
          <SaTableColumn label="操作者账号" min-width="170">
            <template #default="{ row }">
              <div class="audit-copy-cell">
                <span>{{ row.actor_username || '--' }}</span>
                <n-button
                  v-if="row.actor_username"
                  text
                  type="primary"
                  @click="copyAuditField(row.actor_username, '操作者账号')"
                >
                  复制
                </n-button>
              </div>
            </template>
          </SaTableColumn>
          <SaTableColumn label="学生" min-width="170">
            <template #default="{ row }">
              {{ row.target_student_name || '--' }}
              <span v-if="row.target_student_no">（{{ row.target_student_no }}）</span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="字段" min-width="120">
            <template #default="{ row }">{{ row.field_label || row.field_key || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="变更前" min-width="160">
            <template #default="{ row }">{{ row.before_value || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="变更后" min-width="160">
            <template #default="{ row }">{{ row.after_value || '--' }}</template>
          </SaTableColumn>
          <SaTableColumn label="处理批次号" min-width="220">
            <template #default="{ row }">
              <div class="audit-copy-cell">
                <span>{{ row.batch_token || '--' }}</span>
                <n-button
                  v-if="row.batch_token"
                  text
                  type="warning"
                  @click="filterAuditByBatchToken(row.batch_token)"
                >
                  同批记录
                </n-button>
                <n-button
                  v-if="row.batch_token"
                  text
                  type="primary"
                  @click="copyAuditField(row.batch_token, '处理批次号')"
                >
                  复制
                </n-button>
              </div>
            </template>
          </SaTableColumn>
          <SaTableColumn label="说明" min-width="260">
            <template #default="{ row }">{{ row.description || '--' }}</template>
          </SaTableColumn>
        </SaDataTable>
      </SaPanel>
      </template>

      <GroupCollabPanel v-else-if="activeTab === 'groups'" :class-id="students.selected_class_id ?? null" />

      <GroupTaskProgressPanel
        v-else-if="activeTab === 'group-progress'"
        :class-id="students.selected_class_id ?? null"
      />
    </div>

    <n-drawer v-model:show="submissionDrawerVisible" :width="720" display-directive="if" placement="right">
      <n-drawer-content :native-scrollbar="false" closable title="学生作品记录">
        <n-skeleton v-if="isLoadingStudentSubmissions" :rows="8" animated />
        <div v-else-if="studentSubmissions">
          <p class="section-note">
            {{ studentSubmissions.student.class_name }} ·
            {{ studentSubmissions.student.display_name }}（{{ studentSubmissions.student.student_no }}）
          </p>
          <SaDataTable
            :data="studentSubmissions.items"
            empty-text="暂无作品记录"
            row-key="submission_id"
            stripe
          >
            <SaTableColumn label="活动" min-width="200" prop="task_title" />
            <SaTableColumn label="学案" min-width="220" prop="plan_title" />
            <SaTableColumn label="状态" min-width="100">
              <template #default="{ row }">
                <n-tag :type="row.status === 'reviewed' ? 'success' : 'warning'" round>
                  {{ row.status === 'reviewed' ? '已评阅' : '已提交' }}
                </n-tag>
              </template>
            </SaTableColumn>
            <SaTableColumn label="分数" min-width="90">
              <template #default="{ row }">{{ row.score ?? '--' }}</template>
            </SaTableColumn>
            <SaTableColumn label="文件数" min-width="90" prop="file_count" />
            <SaTableColumn label="提交时间" min-width="160">
              <template #default="{ row }">{{ formatDateTime(row.submitted_at || row.updated_at) }}</template>
            </SaTableColumn>
          </SaDataTable>
        </div>
      </n-drawer-content>
    </n-drawer>

    <StudentPortraitDrawer v-model:show="portraitDrawerVisible" :student="portraitStudent" />
    <StudentProfileEditDialog
      v-model:show="profileEditVisible"
      :student="profileEditStudent"
      @saved="handleProfileSaved"
    />
    <ProfilePermissionDialog
      v-model:show="permissionDialogVisible"
      :class-id="filters.classId ?? null"
      :class-name="students?.selected_class?.class_name || ''"
      @saved="handleProfileSaved"
    />
  </div>
</template>

<script setup lang="ts">
import type { DropdownOption } from 'naive-ui';
import {
  NAlert,
  NButton,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NInput,
  NSelect,
  NSkeleton,
  NTag,
} from 'naive-ui';
import { computed, onMounted, ref } from 'vue';

import { apiGet, apiGetBlob, apiPost } from '@/api/http';
import GroupCollabPanel from './components/GroupCollabPanel.vue';
import GroupTaskProgressPanel from './components/GroupTaskProgressPanel.vue';
import ProfilePermissionDialog from './components/ProfilePermissionDialog.vue';
import StudentPortraitDrawer, { type PortraitStudentRef } from './components/StudentPortraitDrawer.vue';
import StudentProfileEditDialog, { type EditableStudent } from './components/StudentProfileEditDialog.vue';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { formatDateTime as formatDateTimeValue } from '@/utils/datetime';

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
const activeTab = ref('students');
const selectedStudentKeys = ref<Array<string | number>>([]);
const selectedStudentIds = computed(() => selectedStudentKeys.value.map((key) => Number(key)));
const classOptions = computed(() =>
  (students.value?.classes || []).map((item) => ({
    label: `${item.class_name} · 活跃 ${item.active_count}/${item.student_count}`,
    value: item.id,
  })),
);
const filters = ref({
  classId: undefined as number | undefined,
  keyword: '',
  includeInactive: false,
});
const submissionDrawerVisible = ref(false);
const isLoadingStudentSubmissions = ref(false);
const studentSubmissions = ref<StudentSubmissionPayload | null>(null);
const portraitDrawerVisible = ref(false);
const portraitStudent = ref<PortraitStudentRef | null>(null);
const profileEditVisible = ref(false);
const profileEditStudent = ref<EditableStudent | null>(null);
const permissionDialogVisible = ref(false);
const hasSelectedStudents = computed(() => selectedStudentIds.value.length > 0);

const pageSummary = computed(() => {
  const payload = students.value;
  if (!payload?.selected_class) {
    return '按班级查看学生、维护账号与分组；转班申请与资料审计在第二个页签。';
  }
  const summary = payload.summary;
  const facts = [
    `${payload.selected_class.class_name} · ${summary.student_count} 人`,
    `今日签到 ${summary.checked_in_today} / ${summary.student_count}`,
    `已分组 ${summary.grouped_count}`,
  ];
  if (summary.inactive_count) {
    facts.push(`停用 ${summary.inactive_count}`);
  }
  return facts.join(' · ');
});

const visibleStudents = computed(() => students.value?.items || []);

const isStudentChecked = (userId: number) =>
  selectedStudentKeys.value.some((key) => Number(key) === userId);

const allVisibleSelected = computed(
  () => visibleStudents.value.length > 0 && visibleStudents.value.every((item) => isStudentChecked(item.user_id)),
);

const someVisibleSelected = computed(
  () => !allVisibleSelected.value && visibleStudents.value.some((item) => isStudentChecked(item.user_id)),
);

function toggleStudentCheck(userId: number, checked: boolean) {
  const keys = new Set(selectedStudentKeys.value.map((key) => Number(key)));
  if (checked) {
    keys.add(userId);
  } else {
    keys.delete(userId);
  }
  selectedStudentKeys.value = Array.from(keys);
}

function toggleSelectAll(checked: boolean) {
  selectedStudentKeys.value = checked ? visibleStudents.value.map((item) => item.user_id) : [];
}

function clearStudentSelection() {
  selectedStudentKeys.value = [];
}

function openPermissionDialog() {
  if (!filters.value.classId) {
    ElMessage.warning('请先选择班级');
    return;
  }
  permissionDialogVisible.value = true;
}

/** 每行只留一个「画像」入口，其余收进一个下拉，避免一行六个文字按钮 */
function rowActionOptions(row: StudentItem): DropdownOption[] {
  return [
    { label: '编辑资料', key: 'edit' },
    { label: '重置密码', key: 'password' },
    { label: '作品记录', key: 'submissions' },
    { label: '解除分组', key: 'ungroup', disabled: !row.current_group_id },
    { type: 'divider', key: 'divider' },
    { label: row.is_active ? '停用账号' : '恢复账号', key: 'toggle' },
  ];
}

function handleRowAction(key: string, row: StudentItem) {
  if (key === 'edit') {
    openProfileEdit(row);
    return;
  }
  if (key === 'password') {
    void openResetPassword(row);
    return;
  }
  if (key === 'submissions') {
    void openStudentSubmissions(row);
    return;
  }
  if (key === 'ungroup') {
    void removeFromGroup(row);
    return;
  }
  if (key === 'toggle') {
    void toggleStudentStatus(row);
  }
}

function formatTime(value: string | null) {
  if (!value) {
    return '--';
  }
  return value.replace('T', ' ').slice(11, 16);
}

function formatRelative(value: string | null) {
  if (!value) {
    return '—';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value.replace('T', ' ').slice(0, 16);
  }
  const diffMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} 天前`;
  }
  return value.replace('T', ' ').slice(0, 10);
}

const transferFilters = ref({
  classId: undefined as number | undefined,
  status: 'pending' as '' | 'pending' | 'approved' | 'rejected',
});
const transferRequests = ref<ClassTransferRequestItem[]>([]);
const isLoadingTransferRequests = ref(false);
const reviewingTransferId = ref<number | null>(null);
const transferCheckedKeys = ref<Array<string | number>>([]);
const selectedTransferRows = computed(() => {
  const checkedKeys = new Set(transferCheckedKeys.value.map((key) => Number(key)));
  return transferRequests.value.filter((item) => checkedKeys.has(item.id));
});
const transferClassOptions = computed(() =>
  (students.value?.classes || []).map((item) => ({ label: item.class_name, value: item.id })),
);
const transferStatusOptions = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '全部状态', value: '' },
];
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
const auditClassOptions = computed(() =>
  profileAuditClassOptions.value.map((item) => ({ label: item.class_name, value: item.id })),
);
const activeAuditBatchToken = computed(() => auditFilters.value.batchToken.trim());

function formatDateTime(value: string | null) {
  return formatDateTimeValue(value, { fallback: '--', sliceStart: 0, sliceEnd: 16 });
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
    return 'error';
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

function clearStudentKeyword() {
  filters.value.keyword = '';
  void loadStudents();
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
    // 换班/搜索后旧的选择会指向不在列表里的学生，统一清空
    selectedStudentKeys.value = [];
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
    selectedStudentKeys.value = [];
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
    transferCheckedKeys.value = [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载转班申请失败');
  } finally {
    isLoadingTransferRequests.value = false;
  }
}

function isTransferRequestSelectable(row: ClassTransferRequestItem) {
  return Boolean(row.id);
}

function selectPendingTransferRequests() {
  if (!transferRequests.value.length) {
    return;
  }
  transferCheckedKeys.value = transferRequests.value
    .filter((requestItem) => requestItem.status === 'pending')
    .map((requestItem) => requestItem.id);
}

function clearTransferSelection() {
  transferCheckedKeys.value = [];
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

function onTransferClassFilterChange(value: number | null) {
  transferFilters.value.classId = value ?? undefined;
  void loadTransferRequests();
}

function onReviewNotePresetChange(value: string | null) {
  selectedReviewNotePreset.value = value ?? '';
}

function onUnreviewReasonPresetChange(value: string | null) {
  selectedUnreviewReasonPreset.value = value ?? '';
}

function onAuditClassFilterChange(value: number | null) {
  auditFilters.value.classId = value ?? undefined;
  void loadProfileChangeAudits();
}

function onAuditEventTypeChange(value: string | null) {
  auditFilters.value.eventType = value ?? '';
  void loadProfileChangeAudits();
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

function clearAuditKeyword() {
  auditFilters.value.keyword = '';
  void loadProfileChangeAudits();
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
        { inputPlaceholder: '不限位数', inputType: 'password', confirmButtonText: '重置' }
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
      { inputPlaceholder: '不限位数', inputType: 'password', confirmButtonText: '重置' }
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

function openStudentPortrait(row: StudentItem) {
  portraitStudent.value = {
    user_id: row.user_id,
    display_name: row.display_name,
    student_no: row.student_no,
    class_id: filters.value.classId ?? null,
  };
  portraitDrawerVisible.value = true;
}

function openProfileEdit(row: StudentItem) {
  profileEditStudent.value = {
    user_id: row.user_id,
    display_name: row.display_name,
    gender: row.gender,
  };
  profileEditVisible.value = true;
}

async function handleProfileSaved() {
  await loadStudents();
}

onMounted(() => {
  void refreshAll();
});
</script>

<style scoped>
/* 名单是这一页的答案：一列身份 + 三个数值列 + 一个动作列 */
.roster-cols {
  grid-template-columns: 28px minmax(0, 1fr) 88px 108px 96px 96px;
}

/* 第 1 列是勾选框，第 2 列「学生」必须跟着姓名左对齐，否则会贴在姓名列最右边 */
.sf-rows__head.roster-cols > span:nth-child(2) {
  text-align: left;
}

.roster-cols > span:nth-child(n + 3) {
  text-align: right;
}

.sf-row.roster-cols {
  align-items: center;
  /* 名单是逐行扫描的，行高比默认松一档更能一屏多看清几个人 */
  padding-top: 9px;
  padding-bottom: 9px;
}

.sf-row.roster-cols .sf-row__meta {
  margin-top: 2px;
}

.roster-check {
  display: flex;
  align-items: center;
}

.roster-cell {
  color: var(--sf-muted);
  font-size: 13px;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* 次行只留事实：学号/账号/分组/座位，全部一档灰 */
.roster-no {
  color: var(--sf-text);
  font-variant-numeric: tabular-nums;
}

.roster-ungrouped {
  color: var(--sf-faint);
}

.roster-quiet {
  color: var(--sf-muted);
}

/* 签到这里只是事实：没签到的用警示色文字，不再加底色——48 行都挂药丸会把名字淹没 */
.roster-absent {
  color: var(--sf-warn);
}

/* 提交 / 待评：零值退成灰点，待评不为零才用警示色 */
.roster-submit {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
}

.roster-num {
  color: var(--sf-ink);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.roster-submit small {
  font-size: 12px;
}

.roster-num.is-zero,
.roster-submit small.is-zero {
  color: var(--sf-faint);
  font-size: 12px;
}

.roster-submit small.is-warn {
  color: var(--sf-warn);
  font-weight: 500;
}

/* 停用账号整行降一档，但内容仍然可读 */
.sf-row.is-inactive .sf-row__title-text {
  color: var(--sf-muted);
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 16px;
  border-bottom: 1px solid var(--sf-line-soft);
  background: var(--sf-surface-2);
}

.batch-bar__count {
  color: var(--sf-ink);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.batch-bar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 220px;
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

.panel-toolbar {
  display: grid;
  gap: 10px;
  width: 100%;
}

@media (max-width: 860px) {
  /* 窄屏：身份占一行，签到/提交/最近提交作为带标签的次级行，动作贴右 */
  .sf-row.roster-cols {
    flex-wrap: wrap;
    gap: 4px 12px;
  }

  .sf-row.roster-cols .sf-row__main {
    flex: 1 1 auto;
    min-width: 0;
  }

  .roster-cell {
    flex: none;
    font-size: 12px;
    text-align: left;
  }

  /* 窄屏表头收起，数值列自带标签 */
  .roster-cell[data-label]::before {
    content: attr(data-label);
    margin-right: 4px;
    color: var(--sf-faint);
  }

  .sf-row.roster-cols .sf-row__action {
    margin-left: auto;
  }
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cell-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
