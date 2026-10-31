<template>
  <section class="st-pane">
    <header class="st-head">
      <div class="st-head__main">
        <h2>升班与归档</h2>
        <p class="st-head__sub">按班级批量升到下一年级；开启归档后，原班级成为历史记录，学生数据整体迁移。</p>
      </div>
    </header>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          升班执行
          <span class="sf-panel__count">先预览影响范围，再执行</span>
        </h3>
        <div class="sf-panel__actions">
          <n-button :loading="isPreviewingPromotion" secondary @click="previewPromotions">预览结果</n-button>
          <n-button :loading="isExecutingPromotion" type="primary" @click="executePromotions">执行升班</n-button>
        </div>
      </header>
      <div class="sf-panel__body">
        <div class="st-fields st-fields--3">
          <n-form-item class="is-wide" label="待升班级">
            <n-select
              v-model:value="promotionForm.source_class_ids"
              :options="classOptionsWithSpacedCount"
              multiple
              placeholder="选择需要升班的班级"
            />
          </n-form-item>
          <n-form-item label="升班年级增量">
            <n-input-number v-model:value="promotionForm.grade_increment" :max="3" :min="1" />
            <template #feedback>1 表示升一个年级。</template>
          </n-form-item>
        </div>

        <div class="st-switch-row">
          <div class="st-switch-row__main">
            <p class="st-switch-row__title">同步教师与班级关联</p>
            <p class="st-switch-row__desc">新班级沿用原班级的教师分配。</p>
          </div>
          <n-switch v-model:value="promotionForm.copy_teacher_assignments" />
        </div>
        <div class="st-switch-row">
          <div class="st-switch-row__main">
            <p class="st-switch-row__title">将原班级归档</p>
            <p class="st-switch-row__desc">原班级标记为历史，不再出现在班级下拉里。</p>
          </div>
          <n-switch v-model:value="promotionForm.archive_source_classes" />
        </div>
      </div>

      <p v-if="!promotionPreview" class="sf-empty">点击「预览结果」查看升班影响范围。</p>
      <template v-else>
        <div class="sf-panel__body">
          <p class="st-summary">
            {{ promotionPreview.summary.source_class_count }} 个班级 ·
            可执行 <strong>{{ promotionPreview.summary.ready_count }}</strong> 个 ·
            阻塞 <strong>{{ promotionPreview.summary.blocked_count }}</strong> 个 ·
            涉及 <strong>{{ promotionPreview.summary.student_count }}</strong> 名学生
          </p>
        </div>
        <div class="sf-panel__body sf-panel__body--flush">
          <SaDataTable :data="promotionPreview.items" :scroll-x="680" row-key="source_class_id">
            <SaTableColumn label="来源班级" min-width="140" prop="source_class_name" />
            <SaTableColumn label="目标班级" min-width="140" prop="target_class_name" />
            <SaTableColumn label="学生" min-width="80" prop="student_count" />
            <SaTableColumn label="状态" min-width="100">
              <template #default="{ row }">
                <span :class="['sf-pill', row.status === 'ready' ? 'sf-pill--pos' : 'sf-pill--warn']">
                  {{ row.status === 'ready' ? '可执行' : '阻塞' }}
                </span>
              </template>
            </SaTableColumn>
            <SaTableColumn label="说明" min-width="220" prop="reason" />
          </SaDataTable>
        </div>
      </template>
    </section>

    <section class="sf-panel">
      <header class="sf-panel__head">
        <h3 class="sf-panel__title">
          历史归档班级
          <span class="sf-panel__count">{{ archivedClasses.length }} 条</span>
        </h3>
      </header>
      <div class="sf-panel__body sf-panel__body--flush">
        <p v-if="!archivedClasses.length" class="sf-empty">还没有归档记录。</p>
        <SaDataTable v-else :data="archivedClasses" :scroll-x="700" row-key="id">
          <SaTableColumn label="原班级" min-width="130" prop="original_class_name" />
          <SaTableColumn label="归档名称" min-width="180" prop="class_name" />
          <SaTableColumn label="升入班级" min-width="130" prop="promoted_to_class_name" />
          <SaTableColumn label="迁移人数" min-width="90" prop="moved_student_count" />
          <SaTableColumn label="归档时间" min-width="170" prop="archived_at" />
        </SaDataTable>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { NButton, NFormItem, NInputNumber, NSelect, NSwitch } from 'naive-ui';
import { computed } from 'vue';

import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useAdminBootstrap } from '../composables/useAdminBootstrap';

const {
  bootstrap,
  promotionForm,
  promotionPreview,
  classOptionsWithSpacedCount,
  isPreviewingPromotion,
  isExecutingPromotion,
  previewPromotions,
  executePromotions,
} = useAdminBootstrap();

const archivedClasses = computed(() => bootstrap.value?.archived_classes ?? []);
</script>
