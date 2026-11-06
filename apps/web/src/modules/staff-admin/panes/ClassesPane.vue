<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>班级</h2>
        <p class="st-head__sub">共 {{ classListTotal }} 个班。资料修改权限按班级单独设置，学生端即时生效。</p>
      </div>
      <div class="st-head__actions">
        <n-button secondary @click="openClassBatchDialog">批量添加</n-button>
        <n-button type="primary" @click="openClassDialog()">新增班级</n-button>
      </div>
    </header>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          班级列表
          <span class="sf-panel__count">{{ classListTotal }} 个班</span>
        </h3>
      </header>
      <div class="sf-panel__body sf-panel__body--flush">
        <SaDataTable
          :data="pagedClasses"
          :pagination="{ page: classListPage, pageSize: classListPageSize, itemCount: classListTotal, pageSizes: [10, 20, 50] }"
          :scroll-x="900"
          row-key="id"
          @update:page="classListPage = $event"
          @update:pageSize="classListPageSize = $event"
        >
          <SaTableColumn label="班级" min-width="140" prop="class_label" />
          <SaTableColumn label="入学年份" min-width="90" prop="entry_year" />
          <SaTableColumn label="年级" min-width="76" prop="grade_no" />
          <SaTableColumn label="班主任" min-width="110">
            <template #default="{ row }">{{ row.head_teacher_name || '—' }}</template>
          </SaTableColumn>
          <SaTableColumn label="默认机房" min-width="140">
            <template #default="{ row }">{{ roomName(row.default_room_id) }}</template>
          </SaTableColumn>
          <SaTableColumn label="学生" min-width="76" prop="student_count" />
          <SaTableColumn label="学生可自行修改" min-width="200">
            <template #default="{ row }">
              <span class="st-perm">{{ profilePermissionSummary(row) }}</span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="操作" min-width="176">
            <template #default="{ row }">
              <div class="table-action-buttons">
                <n-button text type="primary" @click="openClassProfilePermissionDialog(row)">权限设置</n-button>
                <n-button text @click="openClassDialog(row)">编辑</n-button>
                <n-button text type="error" @click="deleteClass(row.id)">删除</n-button>
              </div>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </div>
      <footer class="sf-panel__foot st-table-hint">表格可左右滑动查看完整列</footer>
    </section>

    <n-modal v-model:show="classDialogVisible" :title="editingClassId ? '编辑班级' : '新增班级'" preset="card" style="width: 520px">
      <n-form label-placement="top">
        <n-form-item label="入学年份（级）">
          <n-input-number v-model:value="classForm.entry_year" :max="2100" :min="2000" />
          <template #feedback>
            该入学级学生的入学年份，例如 2026 级填 2026。班级跟入学级走，升班时不变。
          </template>
        </n-form-item>
        <n-form-item label="年级">
          <n-tag round type="info">{{ derivedGradeLabel }}</n-tag>
          <template #feedback>由「当前学年 − 入学年份 + 7」推导，升班时更新。</template>
        </n-form-item>
        <n-form-item label="班号"><n-input-number v-model:value="classForm.class_no" :max="99" :min="1" /></n-form-item>
        <n-form-item label="班主任"><n-input v-model:value="classForm.head_teacher_name" /></n-form-item>
        <n-form-item label="默认机房">
          <n-select v-model:value="classForm.default_room_id" :options="roomOptions" class="full-width" clearable />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="classDialogVisible = false">取消</n-button>
          <n-button type="primary" @click="saveClass">保存</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="classProfilePermissionDialogVisible" preset="card" style="width: 520px" title="班级资料修改权限">
      <n-form label-placement="top">
        <n-form-item label="当前班级">
          <n-tag round type="info">{{ editingClassProfilePermissionName || '--' }}</n-tag>
        </n-form-item>
        <n-form-item label="姓名修改权限">
          <n-switch v-model:value="classProfilePermissionForm.can_edit_name">
            <template #checked>允许学生修改</template>
            <template #unchecked>禁止学生修改</template>
          </n-switch>
        </n-form-item>
        <n-form-item label="性别修改权限">
          <n-switch v-model:value="classProfilePermissionForm.can_edit_gender">
            <template #checked>允许学生修改</template>
            <template #unchecked>禁止学生修改</template>
          </n-switch>
        </n-form-item>
        <n-form-item label="相片修改权限">
          <n-switch v-model:value="classProfilePermissionForm.can_edit_photo">
            <template #checked>允许学生修改</template>
            <template #unchecked>禁止学生修改</template>
          </n-switch>
        </n-form-item>
        <n-form-item label="班级修改权限">
          <n-switch v-model:value="classProfilePermissionForm.can_edit_class">
            <template #checked>允许提交转班申请</template>
            <template #unchecked>禁止提交转班申请</template>
          </n-switch>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="classProfilePermissionDialogVisible = false">取消</n-button>
          <n-button :loading="isSavingClassProfilePermission" type="primary" @click="saveClassProfilePermissions">
            保存权限
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="classBatchDialogVisible" preset="card" style="width: 620px" title="批量添加班级">
      <n-form label-placement="top">
        <n-form-item label="批量输入（每行一个班级）">
          <n-input
            v-model:value="classBatchForm.lines"
            :rows="10"
            placeholder="格式：入学年份,班号,班主任(可选),默认机房ID(可选)&#10;示例：2026,4,教师4,1"
            type="textarea"
          />
        </n-form-item>
        <n-form-item label="覆盖该入学级该班号已存在的班级">
          <n-switch v-model:value="classBatchForm.overwrite_existing" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="classBatchDialogVisible = false">取消</n-button>
          <n-button :loading="isSavingClassBatch" type="primary" @click="saveClassBatch">开始批量添加</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSwitch, NTag } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';

import { apiDelete, apiPost, apiPut } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useAuthStore } from '@/stores/auth';
import { formatGrade, resolveGradeNo } from '@/utils/grade';
import type { BootstrapPayload, ClassProfileEditPermissions } from '../adminTypes';
import { currentSchoolYearFallback, useAdminBootstrap } from '../composables/useAdminBootstrap';
import { escapeHtml } from '../composables/useAdminStudents';

const authStore = useAuthStore();
const { bootstrap, roomOptions } = useAdminBootstrap();

const defaultClassProfileEditPermissions: ClassProfileEditPermissions = {
  can_edit_name: true,
  can_edit_gender: true,
  can_edit_photo: true,
  can_edit_class: true,
};
const profilePermissionFields: Array<[keyof ClassProfileEditPermissions, string]> = [
  ['can_edit_name', '姓名'],
  ['can_edit_gender', '性别'],
  ['can_edit_photo', '相片'],
  ['can_edit_class', '转班'],
];

const classListPage = ref(1);
const classListPageSize = ref(10);
const classDialogVisible = ref(false);
const classProfilePermissionDialogVisible = ref(false);
const classBatchDialogVisible = ref(false);
const isSavingClassBatch = ref(false);
const isSavingClassProfilePermission = ref(false);
const editingClassId = ref<number | null>(null);
const editingClassProfilePermissionId = ref<number | null>(null);
// 年级不是独立输入：它由「入学年份 + 当前学年」推导，避免填出「2026 级的九年级」。
const classForm = ref({
  entry_year: currentSchoolYearFallback(),
  class_no: 1,
  head_teacher_name: '',
  default_room_id: null as number | null,
});
const classProfilePermissionForm = ref<ClassProfileEditPermissions>({ ...defaultClassProfileEditPermissions });
const classBatchForm = ref({ lines: '', overwrite_existing: false });

const classListTotal = computed(() => bootstrap.value?.classes.length ?? 0);
const pagedClasses = computed(() => {
  const items = bootstrap.value?.classes ?? [];
  const start = (classListPage.value - 1) * classListPageSize.value;
  return items.slice(start, start + classListPageSize.value);
});
const editingClassProfilePermissionName = computed(() => {
  const classId = editingClassProfilePermissionId.value;
  if (!classId) {
    return '';
  }
  return bootstrap.value?.classes.find((item) => item.id === classId)?.class_label || '';
});

/** 表单里展示推导出的年级：班级跟入学级走时年级 = 当前学年 − 入学年份 + 7。 */
const derivedGradeLabel = computed(() => formatGrade(resolveGradeNo(classForm.value.entry_year)));

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

watch([() => bootstrap.value?.classes, classListPageSize], () => {
  const maxPage = Math.max(1, Math.ceil(classListTotal.value / classListPageSize.value));
  if (classListPage.value > maxPage) {
    classListPage.value = maxPage;
  }
});

function roomName(roomId: number | null) {
  return bootstrap.value?.rooms.find((item) => item.id === roomId)?.name || '未绑定';
}

function classProfileEditPermissions(item: BootstrapPayload['classes'][number]): ClassProfileEditPermissions {
  return {
    ...defaultClassProfileEditPermissions,
    ...(item.profile_edit_permissions || {}),
  };
}

function profilePermissionSummary(item: BootstrapPayload['classes'][number]) {
  const permissions = classProfileEditPermissions(item);
  const allowed = profilePermissionFields.filter(([key]) => permissions[key]).map(([, label]) => label);
  if (!allowed.length) {
    return '全部禁止';
  }
  if (allowed.length === profilePermissionFields.length) {
    return '全部开放';
  }
  return allowed.join('、');
}

function openClassDialog(item?: BootstrapPayload['classes'][number]) {
  editingClassId.value = item?.id ?? null;
  classForm.value = item
    ? {
        entry_year: item.entry_year,
        class_no: item.class_no,
        head_teacher_name: item.head_teacher_name || '',
        default_room_id: item.default_room_id,
      }
    : {
        entry_year: currentSchoolYearFallback(),
        class_no: 1,
        head_teacher_name: '',
        default_room_id: null,
      };
  classDialogVisible.value = true;
}

function openClassProfilePermissionDialog(item: BootstrapPayload['classes'][number]) {
  editingClassProfilePermissionId.value = item.id;
  classProfilePermissionForm.value = classProfileEditPermissions(item);
  classProfilePermissionDialogVisible.value = true;
}

function openClassBatchDialog() {
  classBatchForm.value = { lines: '', overwrite_existing: false };
  classBatchDialogVisible.value = true;
}

function parseClassBatchLines(lines: string) {
  const parsedItems: Array<{
    entry_year: number;
    class_no: number;
    head_teacher_name: string;
    default_room_id: number | null;
  }> = [];
  const rawLines = lines.split(/\r?\n/);
  rawLines.forEach((rawLine, index) => {
    const text = rawLine.trim();
    if (!text || text.startsWith('#')) {
      return;
    }
    const parts = text.split(/[,\t，]+/).map((item) => item.trim());
    if (parts.length < 2) {
      throw new Error(`第 ${index + 1} 行格式不正确，至少需要“入学年份,班号”`);
    }
    const entryYear = Number(parts[0]);
    const classNo = Number(parts[1]);
    if (!Number.isInteger(entryYear) || entryYear < 2000 || entryYear > 2100) {
      throw new Error(`第 ${index + 1} 行的入学年份必须是 2000-2100 的整数`);
    }
    if (!Number.isInteger(classNo) || classNo < 1 || classNo > 99) {
      throw new Error(`第 ${index + 1} 行的班号必须是 1-99 的整数`);
    }
    let defaultRoomId: number | null = null;
    if (parts[3]) {
      const parsedRoomId = Number(parts[3]);
      if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        throw new Error(`第 ${index + 1} 行的默认机房 ID 必须是正整数`);
      }
      defaultRoomId = parsedRoomId;
    }
    // 年级不在这里输入：后端按「当前学年 − 入学年份 + 7」推导。
    parsedItems.push({
      entry_year: entryYear,
      class_no: classNo,
      head_teacher_name: parts[2] || '',
      default_room_id: defaultRoomId,
    });
  });
  return parsedItems;
}

async function saveClass() {
  if (!authStore.token) return;
  const path = editingClassId.value ? `/settings/admin/classes/${editingClassId.value}` : '/settings/admin/classes';
  const method = editingClassId.value ? apiPut : apiPost;
  const payload = await method<BootstrapPayload>(path, classForm.value, authStore.token);
  bootstrap.value = payload;
  classDialogVisible.value = false;
  ElMessage.success(editingClassId.value ? '班级已更新' : '班级已创建');
}

async function saveClassProfilePermissions() {
  if (!authStore.token || !editingClassProfilePermissionId.value) return;
  isSavingClassProfilePermission.value = true;
  try {
    const payload = await apiPut<BootstrapPayload>(
      `/settings/admin/classes/${editingClassProfilePermissionId.value}/profile-edit-permissions`,
      classProfilePermissionForm.value,
      authStore.token
    );
    bootstrap.value = payload;
    classProfilePermissionDialogVisible.value = false;
    ElMessage.success('班级资料修改权限已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存班级资料修改权限失败');
  } finally {
    isSavingClassProfilePermission.value = false;
  }
}

async function saveClassBatch() {
  if (!authStore.token) return;
  let items: Array<{
    entry_year: number;
    class_no: number;
    head_teacher_name: string;
    default_room_id: number | null;
  }> = [];
  try {
    items = parseClassBatchLines(classBatchForm.value.lines);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量班级格式错误');
    return;
  }
  if (!items.length) {
    ElMessage.warning('请先输入至少一条班级数据');
    return;
  }

  isSavingClassBatch.value = true;
  try {
    const payload = await apiPost<
      BootstrapPayload & {
        batch_result?: { created_count: number; updated_count: number; skipped_count: number };
      }
    >(
      '/settings/admin/classes/batch',
      {
        items,
        overwrite_existing: classBatchForm.value.overwrite_existing,
      },
      authStore.token
    );
    bootstrap.value = payload;
    classBatchDialogVisible.value = false;
    const result = payload.batch_result;
    if (result) {
      ElMessage.success(`批量完成：新增 ${result.created_count}，更新 ${result.updated_count}，跳过 ${result.skipped_count}`);
    } else {
      ElMessage.success('批量班级操作已完成');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量添加班级失败');
  } finally {
    isSavingClassBatch.value = false;
  }
}

async function deleteClass(classId: number) {
  if (!authStore.token) return;
  try {
    await ElMessageBox.confirm('确认删除这个班级吗？');
    bootstrap.value = await apiDelete<BootstrapPayload>(`/settings/admin/classes/${classId}`, authStore.token);
    ElMessage.success('班级已删除');
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    const message = error instanceof Error ? error.message : '删除班级失败';
    // 「不能直接删除」的说明是多步骤指引，toast 放不下，改用对话框完整呈现。
    if (message.includes('不能直接删除')) {
      await ElMessageBox.alert(escapeHtml(message).replace(/\n/g, '<br/>'), '这个班级暂时不能删除', {
        confirmButtonText: '知道了',
        dangerouslyUseHTMLString: true,
        customClass: 'admin-batch-skip-dialog',
        type: 'warning',
      });
      return;
    }
    ElMessage.error(message);
  }
}
</script>
