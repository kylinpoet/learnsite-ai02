<template>
  <section class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">课堂规则</p>
        <h2>课堂守则</h2>
        <p class="hero-copy">
          请在进入课程与任务前阅读课堂守则，保持专注、有序、友善的学习氛围。
        </p>
      </div>
      <RouterLink to="/login/student">
        <el-button type="primary">返回学生登录</el-button>
      </RouterLink>
    </section>

    <el-card class="soft-card">
      <ol class="rule-list">
        <li>按时签到，进入课堂后先查看本节课任务。</li>
        <li>完成阅读与说明后再进入作品提交或代码任务。</li>
        <li>互评时要友善、真实、有依据。</li>
        <li>使用 AI 助手时只作为学习辅助，不直接代替作业。</li>
      </ol>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>
