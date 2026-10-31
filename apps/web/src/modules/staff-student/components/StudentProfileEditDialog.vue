<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 520px; max-width: 94vw"
    :title="student ? `编辑 ${student.display_name} 的资料` : '编辑学生资料'"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div class="profile-edit">
      <n-alert type="info" :closable="false">
        修改会记录到资料变更审计。学号保持只读，班级调整请走转班审批流程。
      </n-alert>

      <n-form-item label="姓名">
        <n-input v-model:value="form.name" maxlength="50" placeholder="学生姓名" />
      </n-form-item>

      <n-form-item label="性别">
        <n-radio-group v-model:value="form.gender">
          <n-radio-button value="男">男</n-radio-button>
          <n-radio-button value="女">女</n-radio-button>
          <n-radio-button value="未知">未知</n-radio-button>
        </n-radio-group>
      </n-form-item>

      <n-form-item label="相片">
        <div class="profile-edit__photo">
          <n-button secondary :loading="photoUploading" @click="pickPhoto">上传相片</n-button>
          <n-button v-if="hasPhoto" text type="error" @click="removePhoto">删除相片</n-button>
          <span class="profile-edit__hint">支持 JPG / PNG / WEBP / GIF，不超过 2MB</span>
          <input ref="photoInput" accept="image/*" class="profile-edit__file" type="file" @change="handlePhotoChange" />
        </div>
      </n-form-item>

      <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    </div>

    <template #footer>
      <div class="profile-edit__footer">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :loading="saving" @click="saveProfile">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { NAlert, NButton, NFormItem, NInput, NModal, NRadioButton, NRadioGroup } from 'naive-ui';
import { ref, watch } from 'vue';

import { apiDelete, apiPut, apiUpload } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { notify } from '@/ui/feedback';

export type EditableStudent = {
  user_id: number;
  display_name: string;
  gender: string;
  has_photo?: boolean;
};

const props = defineProps<{
  show: boolean;
  student: EditableStudent | null;
}>();

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void;
  (event: 'saved'): void;
}>();

const authStore = useAuthStore();

const form = ref({ name: '', gender: '未知' });
const saving = ref(false);
const photoUploading = ref(false);
const errorMessage = ref('');
const hasPhoto = ref(false);
const photoInput = ref<HTMLInputElement | null>(null);

watch(
  () => [props.show, props.student?.user_id] as const,
  ([show]) => {
    if (!show || !props.student) {
      return;
    }
    form.value = { name: props.student.display_name, gender: props.student.gender || '未知' };
    hasPhoto.value = Boolean(props.student.has_photo);
    errorMessage.value = '';
  }
);

function pickPhoto() {
  photoInput.value?.click();
}

async function handlePhotoChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !props.student || !authStore.token) {
    return;
  }
  photoUploading.value = true;
  errorMessage.value = '';
  try {
    const formData = new FormData();
    formData.append('file', file);
    await apiUpload(`/staff/students/${props.student.user_id}/profile/photo`, formData, authStore.token);
    hasPhoto.value = true;
    notify.success('相片已更新');
    emit('saved');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '上传相片失败';
  } finally {
    photoUploading.value = false;
  }
}

async function removePhoto() {
  if (!props.student || !authStore.token) {
    return;
  }
  photoUploading.value = true;
  errorMessage.value = '';
  try {
    await apiDelete(`/staff/students/${props.student.user_id}/profile/photo`, authStore.token);
    hasPhoto.value = false;
    notify.success('相片已删除');
    emit('saved');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除相片失败';
  } finally {
    photoUploading.value = false;
  }
}

async function saveProfile() {
  if (!props.student || !authStore.token) {
    return;
  }
  if (!form.value.name.trim()) {
    errorMessage.value = '请填写姓名';
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    await apiPut(`/staff/students/${props.student.user_id}/profile/name`, { name: form.value.name.trim() }, authStore.token);
    await apiPut(
      `/staff/students/${props.student.user_id}/profile/gender`,
      { gender: form.value.gender },
      authStore.token
    );
    notify.success('学生资料已更新');
    emit('saved');
    emit('update:show', false);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存学生资料失败';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.profile-edit {
  display: grid;
  gap: 14px;
}

.profile-edit__photo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.profile-edit__hint {
  color: var(--ls-muted);
  font-size: 12px;
}

.profile-edit__file {
  display: none;
}

.profile-edit__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
