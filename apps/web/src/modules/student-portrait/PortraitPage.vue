<template>
  <div class="sw-portrait">
    <StudentPageHead title="我的画像" :sub="headerSub" />

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="8" animated />
      </div>
    </div>

    <PortraitSheet v-else-if="portrait" :portrait="portrait" />

    <StudentEmpty
      v-else
      title="还没有画像数据"
      description="完成学案活动、提交作品或参加测验后，这里会汇总你的学习表现。"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import PortraitSheet, { type PortraitPayload } from '@/components/PortraitSheet.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const isLoading = ref(true);
const errorMessage = ref('');
const portrait = ref<PortraitPayload | null>(null);

const headerSub = computed(() => {
  if (!portrait.value) {
    return '汇总活动完成、作品质量、测验与出勤等学习表现';
  }
  const score = portrait.value.overall_score;
  return score === null ? '暂无可计算的综合分' : `综合分 ${score}，共 ${portrait.value.dimensions.filter((item) => item.enabled).length} 个维度`;
});

async function loadPortrait() {
  if (!authStore.token) {
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiGet<{ portrait: PortraitPayload }>('/portraits/student/me', authStore.token);
    portrait.value = response.portrait;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载画像失败';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadPortrait();
});
</script>

<style scoped>
.sw-portrait {
  display: grid;
  gap: 16px;
}
</style>
