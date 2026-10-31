<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>基础参数</h2>
        <p class="st-head__sub">学校名称、界面主题与功能开关，保存后统一应用到教师端与学生端。</p>
      </div>
      <div class="st-head__actions">
        <n-button :loading="isSavingSystem" type="primary" @click="saveSystemSettings">保存参数</n-button>
      </div>
    </header>

    <div class="st-blocks">
      <section class="st-block is-wide">
        <header class="st-block__head">
          <h3 class="st-block__title">学校信息</h3>
          <p class="st-block__note">平台名称为系统固定项，不在此处修改</p>
        </header>
        <div class="st-block__body">
          <div class="st-fields">
            <n-form-item label="平台名称" :show-feedback="false">
              <n-input v-model:value="systemForm.platform_name" disabled />
            </n-form-item>
            <n-form-item label="学校名称" :show-feedback="false">
              <n-input v-model:value="systemForm.school_name" />
            </n-form-item>
            <n-form-item label="系统主题">
              <n-select v-model:value="systemForm.theme_code" :options="themeOptions" />
              <template #feedback>教师端与学生端使用同一套主题。</template>
            </n-form-item>
            <n-form-item label="开放年级">
              <n-select v-model:value="systemForm.active_grade_nos" :options="gradeOptions" multiple />
              <template #feedback>只有勾选的年级对外开放注册。</template>
            </n-form-item>
          </div>
        </div>
      </section>

      <section class="st-block">
        <header class="st-block__head">
          <h3 class="st-block__title">功能开关</h3>
        </header>
        <div class="st-block__body st-block__body--tight">
          <div class="st-switch-row">
            <div class="st-switch-row__main">
              <p class="st-switch-row__title">允许学生注册</p>
              <p class="st-switch-row__desc">关闭后学生只能由管理员批量导入。</p>
            </div>
            <n-switch v-model:value="systemForm.student_register_enabled" />
          </div>
          <div class="st-switch-row">
            <div class="st-switch-row__main">
              <p class="st-switch-row__title">启用智能体助手</p>
              <p class="st-switch-row__desc">关闭后教师端与学生端都不显示 AI 学伴入口。</p>
            </div>
            <n-switch v-model:value="systemForm.assistant_enabled" />
          </div>
          <div class="st-switch-row">
            <div class="st-switch-row__main">
              <p class="st-switch-row__title">登录自动签到</p>
              <p class="st-switch-row__desc">学生进入课堂后按座位 IP 自动记一次签到。</p>
            </div>
            <n-switch v-model:value="systemForm.auto_attendance_on_login" />
          </div>
        </div>
      </section>

      <section class="st-block">
        <header class="st-block__head">
          <h3 class="st-block__title">小组网盘</h3>
          <p class="st-block__note">教师端小组任务共用一份配额</p>
        </header>
        <div class="st-block__body">
          <div class="st-fields">
            <n-form-item label="文件数量上限" :show-feedback="false">
              <n-input-number v-model:value="systemForm.group_drive_file_max_count" :max="500" :min="1" />
            </n-form-item>
            <n-form-item label="单文件大小上限（MB）" :show-feedback="false">
              <n-input-number v-model:value="systemForm.group_drive_single_file_max_mb" :max="1024" :min="1" />
            </n-form-item>
            <n-form-item class="is-wide" label="允许的扩展名">
              <n-input
                v-model:value="systemForm.group_drive_allowed_extensions"
                placeholder="例如：txt,md,pdf,docx,png,py"
              />
              <template #feedback>留空表示不限制类型；用逗号分隔。</template>
            </n-form-item>
          </div>
        </div>
      </section>

      <section class="st-block is-wide">
        <header class="st-block__head">
          <h3 class="st-block__title">转班用语预设</h3>
          <p class="st-block__note">每行一条，可用「标题|内容」格式；不填标题时直接写内容</p>
        </header>
        <div class="st-block__body">
          <div class="st-fields">
            <n-form-item label="审核通过 / 拒绝常用语">
              <n-input
                v-model:value="systemForm.class_transfer_review_note_presets_text"
                :rows="5"
                type="textarea"
              />
              <template #feedback>教师端转班审核面板读取为可选模板。</template>
            </n-form-item>
            <n-form-item label="撤销原因模板">
              <n-input
                v-model:value="systemForm.class_transfer_unreview_reason_presets_text"
                :rows="5"
                type="textarea"
              />
              <template #feedback>教师撤销审核时可直接选用。</template>
            </n-form-item>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { NButton, NFormItem, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui';

import { useAdminBootstrap } from '../composables/useAdminBootstrap';

const { systemForm, themeOptions, isSavingSystem, saveSystemSettings } = useAdminBootstrap();

const gradeOptions = [7, 8, 9].map((grade) => ({ label: `${grade} 年级`, value: grade }));
</script>
