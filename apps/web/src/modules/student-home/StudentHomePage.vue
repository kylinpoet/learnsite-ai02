<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">学习中心首页</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这一页已经接入真实 SQLite 数据源，对应旧站 `student/myinfo.aspx` 的首批真实能力。
        </p>
      </div>
      <el-button :disabled="!firstPendingCourseId" type="primary" @click="goToFirstPendingCourse">
        进入当前推荐课程
      </el-button>
    </section>

    <el-alert
      v-if="errorMessage"
      :closable="false"
      :title="errorMessage"
      type="error"
    />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="6" />
        </el-card>
      </template>

      <template #default>
        <el-row :gutter="16">
          <el-col :lg="8" :sm="24">
            <el-card class="soft-card">
              <template #header>学生信息</template>
              <p>姓名：{{ homeData?.profile.name }}</p>
              <p>学号：{{ homeData?.profile.student_no }}</p>
              <p>班级：{{ homeData?.profile.class_name }}</p>
              <p>年级：{{ homeData?.profile.grade_no }}</p>
            </el-card>
          </el-col>
          <el-col :lg="16" :sm="24">
            <el-card class="soft-card">
              <template #header>今天签到的同学</template>
              <el-empty v-if="!homeData?.attendance_today.length" description="今天暂无签到记录" />
              <el-space v-else wrap>
                <el-tag
                  v-for="item in homeData?.attendance_today"
                  :key="`${item.name}-${item.checked_in_at}`"
                  round
                  type="success"
                >
                  {{ item.name }} {{ item.checked_in_at }}
                </el-tag>
              </el-space>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :lg="12" :sm="24">
            <el-card class="soft-card">
              <template #header>未学学案</template>
              <el-empty v-if="!homeData?.pending_courses.length" description="当前没有未学学案" />
              <el-timeline v-else>
                <el-timeline-item
                  v-for="item in homeData?.pending_courses"
                  :key="item.id"
                  :timestamp="item.date"
                >
                  <RouterLink :to="`/student/courses/${item.id}`">{{ item.title }}</RouterLink>
                </el-timeline-item>
              </el-timeline>
            </el-card>
          </el-col>
          <el-col :lg="12" :sm="24">
            <el-card class="soft-card">
              <template #header>已学学案</template>
              <el-empty v-if="!homeData?.completed_courses.length" description="当前没有已学学案" />
              <el-timeline v-else>
                <el-timeline-item
                  v-for="item in homeData?.completed_courses"
                  :key="item.id"
                  :timestamp="item.date"
                >
                  <RouterLink :to="`/student/courses/${item.id}`">{{ item.title }}</RouterLink>
                </el-timeline-item>
              </el-timeline>
            </el-card>
          </el-col>
        </el-row>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { apiGet } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

type HomePayload = {
  pending_courses: Array<{ id: number; title: string; date: string }>;
  completed_courses: Array<{ id: number; title: string; date: string }>;
  attendance_today: Array<{ name: string; checked_in_at: string }>;
  profile: {
    student_no: string;
    name: string;
    class_name: string;
    grade_no: number;
  };
};

const router = useRouter();
const authStore = useAuthStore();
const homeData = ref<HomePayload | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

const pageTitle = computed(() =>
  homeData.value ? `${homeData.value.profile.name} 的学习中心` : '学生工作台'
);
const firstPendingCourseId = computed(() => homeData.value?.pending_courses[0]?.id || null);

async function loadHome() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  try {
    homeData.value = await apiGet<HomePayload>('/lesson-plans/student/home', authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载学习中心失败';
  } finally {
    isLoading.value = false;
  }
}

async function goToFirstPendingCourse() {
  if (!firstPendingCourseId.value) {
    return;
  }
  await router.push(`/student/courses/${firstPendingCourseId.value}`);
}

onMounted(loadHome);
</script>
