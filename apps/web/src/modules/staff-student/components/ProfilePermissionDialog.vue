<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 460px; max-width: 94vw"
    :title="className ? `${className} · 资料修改权限` : '资料修改权限'"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div class="permission-dialog">
      <n-alert type="info" :closable="false">
        决定本班学生能否在「我的档案」里自行修改对应信息。关闭后学生端会隐藏或禁用对应入口。
      </n-alert>

      <div class="permission-dialog__list">
        <div v-for="item in permissionItems" :key="item.key" class="permission-dialog__row">
          <div>
            <strong>{{ item.label }}</strong>
            <p>{{ item.description }}</p>
          </div>
          <n-switch v-model:value="permissions[item.key]" :loading="loading" />
        </div>
      </div>

      <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    </div>

    <template #footer>
      <div class="permission-dialog__footer">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :loading="saving" @click="savePermissions">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

import { apiGet, apiPut } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { notify } from '@/ui/feedback';

type PermissionKey = 'can_edit_name' | 'can_edit_gender' | 'can_edit_photo' | 'can_edit_class';

const props = defineProps<{
  show: boolean;
  classId: number | null;
  className: string;
}>();

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void;
  (event: 'saved'): void;
}>();

const authStore = useAuthStore();

const permissionItems: Array<{ key: PermissionKey; label: string; description: string }> = [
  { key: 'can_edit_name', label: '允许修改姓名', description: '学生可以自行提交姓名修改。' },
  { key: 'can_edit_gender', label: '允许修改性别', description: '学生可以自行修改性别。' },
  { key: 'can_edit_photo', label: '允许修改相片', description: '学生可以自行上传或删除个人相片。' },
  { key: 'can_edit_class', label: '允许提交转班申请', description: '学生可以发起转班审批，由教师审核。' },
];

const permissions = ref<Record<PermissionKey, boolean>>({
  can_edit_name: true,
  can_edit_gender: true,
  can_edit_photo: true,
  can_edit_class: true,
});
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');

async function loadPermissions() {
  if (!authStore.token || !props.classId) {
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiGet<{ permissions: Record<PermissionKey, boolean> }>(
      `/staff/classes/${props.classId}/profile-edit-permissions`,
      authStore.token
    );
    permissions.value = { ...permissions.value, ...response.permissions };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载权限失败';
  } finally {
    loading.value = false;
  }
}

async function savePermissions() {
  if (!authStore.token || !props.classId) {
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    await apiPut(`/staff/classes/${props.classId}/profile-edit-permissions`, permissions.value, authStore.token);
    notify.success('资料修改权限已更新');
    emit('saved');
    emit('update:show', false);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存权限失败';
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.show, props.classId] as const,
  ([show]) => {
    if (show) {
      void loadPermissions();
    }
  }
);
</script>

<style scoped>
.permission-dialog {
  display: grid;
  gap: 14px;
}

.permission-dialog__list {
  display: grid;
  gap: 10px;
}

.permission-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--ls-border);
  border-radius: 10px;
}

.permission-dialog__row p {
  margin: 2px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
}

.permission-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
