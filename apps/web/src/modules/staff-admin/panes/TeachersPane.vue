<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>教师</h2>
        <p class="st-head__sub">共 {{ teachers.length }} 位教师账号。管理员可维护班级与 AI 设置。</p>
      </div>
      <div class="st-head__actions">
        <n-button type="primary" @click="openTeacherDialog()">新增教师</n-button>
      </div>
    </header>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          教师列表
          <span class="sf-panel__count">{{ teachers.length }} 位</span>
        </h3>
      </header>
      <div class="sf-panel__body sf-panel__body--flush">
        <p v-if="!teachers.length" class="sf-empty">还没有教师账号。</p>
        <SaDataTable v-else :data="teachers" :scroll-x="830" row-key="id">
          <SaTableColumn label="账号" min-width="110" prop="username" />
          <SaTableColumn label="姓名" min-width="120" prop="display_name" />
          <SaTableColumn label="职务" min-width="130">
            <template #default="{ row }">{{ row.title || '—' }}</template>
          </SaTableColumn>
          <SaTableColumn label="管理员" min-width="86">
            <template #default="{ row }">
              <span v-if="row.is_admin" class="sf-pill sf-pill--accent">管理员</span>
              <span v-else class="sf-quiet">—</span>
            </template>
          </SaTableColumn>
          <SaTableColumn label="关联班级" min-width="240">
            <template #default="{ row }">{{ teacherClassNames(row.class_ids).join('、') || '未关联' }}</template>
          </SaTableColumn>
          <SaTableColumn label="操作" min-width="140">
            <template #default="{ row }">
              <div class="table-action-buttons">
                <n-button text type="primary" @click="openTeacherDialog(row)">编辑</n-button>
                <n-button text type="error" @click="deleteTeacher(row.id)">删除</n-button>
              </div>
            </template>
          </SaTableColumn>
        </SaDataTable>
      </div>
      <footer class="sf-panel__foot st-table-hint">表格可左右滑动查看完整列</footer>
    </section>

    <n-modal v-model:show="teacherDialogVisible" :title="editingTeacherId ? '编辑教师' : '新增教师'" preset="card" style="width: 560px">
      <n-form label-placement="top">
        <n-form-item label="账号"><n-input v-model:value="teacherForm.username" /></n-form-item>
        <n-form-item label="姓名"><n-input v-model:value="teacherForm.display_name" /></n-form-item>
        <n-form-item label="职务"><n-input v-model:value="teacherForm.title" /></n-form-item>
        <n-form-item :label="editingTeacherId ? '重置密码（留空不修改）' : '初始密码'">
          <n-input
            v-model:value="teacherForm.password"
            placeholder="不少于 6 位，留空表示不修改"
            show-password-on="click"
            type="password"
          />
        </n-form-item>
        <n-form-item label="管理员权限"><n-switch v-model:value="teacherForm.is_admin" /></n-form-item>
        <n-form-item label="关联班级">
          <n-select v-model:value="teacherForm.class_ids" :options="classOptions" class="full-width" filterable multiple />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="teacherDialogVisible = false">取消</n-button>
          <n-button type="primary" @click="saveTeacher">保存</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, NModal, NSelect, NSwitch } from 'naive-ui';
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { useRouter } from 'vue-router';

import { apiDelete, apiPost, apiPut } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useAuthStore } from '@/stores/auth';
import type { BootstrapPayload, TeacherEditorForm } from '../adminTypes';
import { useAdminBootstrap } from '../composables/useAdminBootstrap';

const authStore = useAuthStore();
const router = useRouter();
const { bootstrap, classOptions } = useAdminBootstrap();

const teachers = computed(() => bootstrap.value?.teachers ?? []);

const teacherDialogVisible = ref(false);
const editingTeacherId = ref<number | null>(null);
const teacherForm = ref<TeacherEditorForm>({ username: '', display_name: '', title: '', password: '', is_admin: false, class_ids: [] });

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

function teacherClassNames(classIds: number[]) {
  return classIds.map((id) => bootstrap.value?.classes.find((item) => item.id === id)?.class_name || '').filter(Boolean);
}

function buildTeacherFormFromItem(item?: BootstrapPayload['teachers'][number]): TeacherEditorForm {
  if (!item) {
    return { username: '', display_name: '', title: '', password: '', is_admin: false, class_ids: [] };
  }
  return {
    username: item.username,
    display_name: item.display_name,
    title: item.title || '',
    password: '',
    is_admin: item.is_admin,
    class_ids: [...item.class_ids],
  };
}

function openTeacherDialog(item?: BootstrapPayload['teachers'][number]) {
  editingTeacherId.value = item?.id ?? null;
  teacherForm.value = buildTeacherFormFromItem(item);
  teacherDialogVisible.value = true;
}

async function saveTeacher() {
  if (!authStore.token) return;
  const path = editingTeacherId.value ? `/settings/admin/teachers/${editingTeacherId.value}` : '/settings/admin/teachers';
  const method = editingTeacherId.value ? apiPut : apiPost;
  const payload = {
    username: teacherForm.value.username.trim(),
    display_name: teacherForm.value.display_name.trim(),
    title: teacherForm.value.title.trim() || null,
    password: teacherForm.value.password.trim() || null,
    is_admin: teacherForm.value.is_admin,
    class_ids: [...teacherForm.value.class_ids],
  };

  try {
    bootstrap.value = await method<BootstrapPayload>(path, payload, authStore.token);
    teacherDialogVisible.value = false;

    if (editingTeacherId.value && Number(authStore.user?.id) === editingTeacherId.value) {
      await authStore.syncSessionUser(true);
      if (!authStore.isAdmin) {
        await router.replace('/staff');
      }
    }

    ElMessage.success(editingTeacherId.value ? '教师已更新' : '教师已创建');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存教师失败');
  }
}

async function deleteTeacher(teacherId: number) {
  if (!authStore.token) return;
  try {
    await ElMessageBox.confirm('确认删除这个教师账号吗？');
    bootstrap.value = await apiDelete<BootstrapPayload>(`/settings/admin/teachers/${teacherId}`, authStore.token);
    ElMessage.success('教师已删除');
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除教师失败');
  }
}
</script>
