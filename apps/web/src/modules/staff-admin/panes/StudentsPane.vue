<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>学生</h2>
        <p class="st-head__sub">共 {{ studentTotal }} 名学生。可批量导入、重置密码、停用或删除账号。</p>
      </div>
      <div class="st-head__actions">
        <input ref="studentImportInputRef" class="file-input" :accept="studentImportAccept" type="file" @change="handleStudentImportChange" />
        <n-button secondary @click="downloadStudentImportTemplateFile">下载模板</n-button>
        <n-button type="primary" @click="openStudentImportDialog">批量导入</n-button>
      </div>
    </header>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          学生名单
          <span class="sf-panel__count">{{ filteredAdminStudents.length }} 人</span>
        </h3>
        <div class="sf-panel__actions">
          <n-select
            v-model:value="adminStudentFilterClassId"
            :options="classOptionsWithCount"
            class="st-filter"
            clearable
            placeholder="全部班级"
          />
          <n-input
            v-model:value="adminStudentKeyword"
            class="st-filter"
            clearable
            placeholder="学号 / 账号 / 姓名"
          />
        </div>
      </header>

      <div v-if="hasSelectedAdminStudents" class="st-batchbar">
        <span class="st-batchbar__count">已选 {{ selectedAdminStudentIds.length }} 人</span>
        <div class="st-batchbar__actions">
          <n-input
            v-model:value="adminStudentBatchPassword"
            class="st-batchbar__pwd"
            placeholder="批量重置的新密码（不限位数）"
            show-password-on="click"
            type="password"
          />
          <n-button secondary type="primary" @click="runAdminStudentBatchAction('reset_password')">重置密码</n-button>
          <n-button secondary @click="runAdminStudentBatchAction('deactivate')">停用</n-button>
          <n-button secondary @click="runAdminStudentBatchAction('activate')">恢复</n-button>
          <n-button secondary @click="runAdminStudentBatchAction('delete')">删除</n-button>
          <n-button secondary type="error" @click="runAdminStudentBatchAction('force_delete')">强制删除</n-button>
        </div>
      </div>

      <div class="sf-panel__body sf-panel__body--flush">
        <SaDataTable
          :checked-row-keys="selectedAdminStudentIds"
          :data="pagedAdminStudents"
          :pagination="filteredAdminStudents.length ? { page: studentListPage, pageSize: studentListPageSize, itemCount: filteredAdminStudents.length, pageSizes: [10, 20, 50, 100] } : null"
          :scroll-x="820"
          empty-text="没有符合条件的学生"
          row-key="id"
          @update:checked-row-keys="handleAdminStudentSelectionChange"
          @update:page="studentListPage = $event"
          @update:pageSize="studentListPageSize = $event"
        >
          <SaTableColumn type="selection" width="48" />
          <SaTableColumn label="学号" min-width="110" prop="student_no" />
          <SaTableColumn label="账号" min-width="110" prop="username" />
          <SaTableColumn label="姓名" min-width="120" prop="display_name" />
          <SaTableColumn label="班级" min-width="160" prop="class_label" />
          <SaTableColumn label="状态" min-width="90">
            <template #default="{ row }">
              <span :class="['sf-pill', row.is_active ? 'sf-pill--pos' : 'sf-pill--warn']">
                {{ row.is_active ? '启用' : '停用' }}
              </span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="操作" min-width="220">
            <template #default="{ row }">
              <div class="table-action-buttons">
                <n-button
                  text
                  :type="row.is_active ? 'warning' : 'success'"
                  @click="toggleAdminStudentStatus(row)"
                >
                  {{ row.is_active ? '停用' : '恢复' }}
                </n-button>
                <n-button text type="error" @click="deleteStudent(row.id)">删除</n-button>
                <n-button text type="error" @click="forceDeleteStudent(row.id)">强制删除</n-button>
              </div>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </div>

      <footer class="sf-panel__foot st-panel-note">
        普通删除会跳过有学习记录的学生；「强制删除」会清空相关学习数据并永久删除账号。<span class="st-inline-hint">表格可左右滑动查看完整列</span>
      </footer>
    </section>

    <n-modal v-model:show="studentImportDialogVisible" preset="card" style="width: 540px" title="批量导入学生">
      <n-form label-placement="top">
        <n-form-item label="导入文件">
          <div class="chip-row">
            <n-button secondary @click="downloadStudentImportTemplateFile">下载 Excel 模板</n-button>
            <n-button secondary @click="openStudentImportPicker">选择文件</n-button>
            <span class="section-note">{{ selectedStudentImportFileName || '未选择文件' }}</span>
          </div>
          <p class="section-note">
            支持 .csv / .txt / .tsv / .xlsx；表头需包含姓名 + 学号或账号 + 班级。
            「班级」列填班号（如 01）；「入学年份」决定学生属于哪一级，留空按当前学年处理。
            该入学级该班号还不存在时会自动建班。
          </p>
        </n-form-item>
        <n-form-item label="默认初始密码">
          <n-input v-model:value="studentImportForm.default_password" placeholder="不限位数" />
        </n-form-item>
        <n-form-item label="遇到同学号或账号时">
          <div class="switch-field">
            <n-switch v-model:value="studentImportForm.update_existing" />
            <span>更新已存在学生</span>
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="studentImportDialogVisible = false">取消</n-button>
          <n-button :loading="isImportingStudents" type="primary" @click="submitStudentImportFromInput">
            开始导入
          </n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, NModal, NSelect, NSwitch } from 'naive-ui';
import { computed, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { studentImportAccept as importAccept, useAdminStudents } from '../composables/useAdminStudents';
import { useAdminBootstrap } from '../composables/useAdminBootstrap';

const { bootstrap, classOptionsWithCount } = useAdminBootstrap();

const {
  adminStudentFilterClassId,
  adminStudentKeyword,
  adminStudentBatchPassword,
  selectedAdminStudentIds,
  studentListPage,
  studentListPageSize,
  isImportingStudents,
  filteredAdminStudents,
  pagedAdminStudents,
  hasSelectedAdminStudents,
  downloadStudentImportTemplateFile,
  submitStudentImport,
  handleAdminStudentSelectionChange,
  runAdminStudentBatchAction,
  toggleAdminStudentStatus,
  deleteStudent,
  forceDeleteStudent,
} = useAdminStudents(bootstrap);

const studentImportAccept = importAccept;
const studentTotal = computed(() => bootstrap.value?.stats.student_count ?? 0);

const studentImportDialogVisible = ref(false);
const studentImportInputRef = ref<HTMLInputElement | null>(null);
const selectedStudentImportFileName = ref('');
const studentImportForm = ref({ update_existing: false, default_password: '123456' });

function openStudentImportDialog() {
  studentImportForm.value = { update_existing: false, default_password: '123456' };
  selectedStudentImportFileName.value = '';
  if (studentImportInputRef.value) {
    studentImportInputRef.value.value = '';
  }
  studentImportDialogVisible.value = true;
}

function openStudentImportPicker() {
  studentImportInputRef.value?.click();
}

function handleStudentImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  selectedStudentImportFileName.value = input?.files?.[0]?.name || '';
}

async function submitStudentImportFromInput() {
  const file = studentImportInputRef.value?.files?.[0];
  if (!file) {
    ElMessage.warning('请先选择要导入的学生文件');
    return;
  }
  const ok = await submitStudentImport(file, studentImportForm.value);
  if (ok) {
    studentImportDialogVisible.value = false;
    if (studentImportInputRef.value) {
      studentImportInputRef.value.value = '';
    }
    selectedStudentImportFileName.value = '';
  }
}
</script>
