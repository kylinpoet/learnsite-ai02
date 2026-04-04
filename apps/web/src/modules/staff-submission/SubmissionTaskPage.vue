<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">任务评分</p>
        <h2>{{ taskData?.task.title || `任务 ${route.params.taskId}` }}</h2>
        <p class="hero-copy">
          {{ taskData?.task.course.title || '正在加载课程信息' }}
          <span v-if="taskData">
            · {{ taskData.task.course.unit_title }} · {{ taskData.task.course.lesson_title }}
          </span>
        </p>
      </div>
      <el-space wrap>
        <el-button plain @click="router.push('/staff/submissions')">返回作品总览</el-button>
        <el-button :loading="isLoading" type="primary" @click="loadTaskDetail">刷新</el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <el-alert
      v-if="focusHintMessage"
      :closable="false"
      :title="focusHintMessage"
      :type="focusAlertType"
    />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="10" />
        </el-card>
      </template>

      <template #default>
        <div v-if="taskData" class="page-stack">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">提交总数</p>
              <p class="metric-value">{{ taskData.summary.submission_count }}</p>
              <p class="metric-note">本任务已收到的学生作品数量。</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已评阅</p>
              <p class="metric-value">{{ taskData.summary.reviewed_count }}</p>
              <p class="metric-note">已经填写分数或教师评语的作品数量。</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">待评阅</p>
              <p class="metric-value">{{ taskData.summary.pending_count }}</p>
              <p class="metric-note">教师未评阅前，学生仍可重新提交修改。</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">平均分</p>
              <p class="metric-value">{{ taskData.summary.average_score ?? '--' }}</p>
              <p class="metric-note">仅统计已录入分数的作品。</p>
            </article>
          </div>

          <RecommendedWorksShowcase
            :items="taskData.recommended_showcase.items"
            :token="authStore.token || ''"
            description="本任务下被评为 G 级的作品会自动进入这里，教师也可以直接查看推荐展示效果。"
            empty-description="当前任务还没有推荐作品"
            title="教师端推荐作品展示"
          />

          <el-row :gutter="16">
            <el-col :lg="15" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="toolbar-row">
                    <div class="info-row">
                      <span>学生提交列表</span>
                      <el-tag round type="info">
                        最近提交 {{ formatDateTime(taskData.summary.latest_submitted_at) }}
                      </el-tag>
                    </div>
                    <div class="filter-row">
                      <span class="filter-label">仅看未评阅作品</span>
                      <el-switch v-model="onlyPendingSubmissions" />
                      <el-select
                        v-model="selectedClassName"
                        class="filter-select"
                        clearable
                        placeholder="筛选班级"
                      >
                        <el-option
                          v-for="option in classOptions"
                          :key="option"
                          :label="option"
                          :value="option"
                        />
                      </el-select>
                      <el-button
                        v-if="selectedClassName || !onlyPendingSubmissions"
                        text
                        @click="resetFilters"
                      >
                        恢复默认
                      </el-button>
                      <el-tag round type="success">
                        当前显示 {{ filteredItems.length }} / {{ taskData.items.length }}
                      </el-tag>
                    </div>
                  </div>
                </template>

                <el-empty
                  v-if="!taskData.items.length"
                  description="这个任务还没有学生提交作品。"
                />

                <template v-else>
                  <el-empty
                    v-if="!filteredItems.length"
                    description="当前筛选条件下没有作品。"
                  />

                  <template v-else>
                    <section class="batch-panel">
                      <div class="batch-header">
                        <div>
                          <p class="batch-title">批量操作</p>
                          <p class="batch-note">
                            已选择 {{ selectedSubmissionCount }} 份作品。适合课堂统一批改，也支持将所选附件一次性打包为 ZIP 下载。
                          </p>
                        </div>
                        <el-space wrap>
                          <el-button
                            :disabled="selectedSubmissionCount === 0"
                            :loading="isBatchDownloading"
                            plain
                            type="success"
                            @click="downloadBatchFiles"
                          >
                            打包下载附件
                          </el-button>
                          <el-button :disabled="selectedSubmissionCount === 0" text @click="clearBatchSelection">
                            清空选择
                          </el-button>
                        </el-space>
                      </div>

                      <section v-loading="isTemplateLoading" class="template-panel">
                        <div class="template-panel-header">
                          <div>
                            <p class="template-panel-title">批量评分模板</p>
                            <p class="template-panel-note">
                              常用分数和评语会按教师账号云端同步，也支持按分组管理和手动排序。
                            </p>
                          </div>
                          <el-button text @click="openTemplateManager('batch')">管理模板</el-button>
                        </div>

                        <div class="template-toolbar">
                          <el-select
                            v-model="selectedBatchTemplateId"
                            class="template-select"
                            clearable
                            filterable
                            placeholder="选择批量评分模板"
                          >
                            <el-option-group
                              v-for="group in groupedReviewTemplates"
                              :key="`batch-group-${group.key || 'ungrouped'}`"
                              :label="group.label"
                            >
                              <el-option
                                v-for="template in group.templates"
                                :key="template.id"
                                :label="template.title"
                                :value="template.id"
                              >
                                <div class="template-option">
                                  <span>{{ template.title }}</span>
                                  <span class="template-option-score">
                                    #{{ template.sort_order }}
                                    {{ template.score === null ? ' · 仅评语' : ` · 建议等级 ${formatScoreText(template.score)}` }}
                                  </span>
                                </div>
                              </el-option>
                            </el-option-group>
                          </el-select>
                          <el-button :disabled="!selectedBatchTemplateId" type="primary" plain @click="applySelectedTemplate('batch', 'replace')">
                            套用模板
                          </el-button>
                          <el-button :disabled="!selectedBatchTemplateId" plain @click="applySelectedTemplate('batch', 'insert')">
                            仅插入评语
                          </el-button>
                          <el-button plain @click="saveCurrentAsTemplate('batch')">保存当前为模板</el-button>
                        </div>

                        <div v-if="quickTemplateGroups.length" class="template-group-stack">
                          <div
                            v-for="group in quickTemplateGroups"
                            :key="`batch-quick-${group.key || 'ungrouped'}`"
                            class="quick-comment-row"
                          >
                            <span class="filter-label">{{ group.label }}</span>
                            <el-button
                              v-for="template in group.templates"
                              :key="`batch-${template.id}`"
                              link
                              type="primary"
                              @click="applyTemplate(template.id, 'batch', 'insert')"
                            >
                              {{ template.title }}
                            </el-button>
                          </div>
                        </div>

                        <p v-else class="template-empty-note">
                          还没有评分模板，可先填写一次评分内容，再点“保存当前为模板”。
                        </p>
                      </section>

                      <el-form class="batch-form" label-position="top">
                        <el-row :gutter="12">
                          <el-col :md="8" :sm="24">
                            <el-form-item label="统一等级评分">
                              <div class="grade-editor">
                                <div class="grade-chip-grid">
                                  <el-button
                                    v-for="option in scoreGradeOptions"
                                    :key="`batch-grade-${option.grade}`"
                                    :plain="batchReviewScore !== option.score"
                                    :type="batchReviewScore === option.score ? 'primary' : undefined"
                                    @click="setTargetScore('batch', option.score)"
                                  >
                                    {{ option.grade }} · {{ option.score }}
                                  </el-button>
                                </div>
                                <div class="grade-editor-footer">
                                  <el-tag round type="success">{{ formatScoreHelperText(batchReviewScore) }}</el-tag>
                                  <el-button text @click="setTargetScore('batch', null)">清空分数</el-button>
                                </div>
                              </div>
                            </el-form-item>
                          </el-col>
                          <el-col :md="16" :sm="24">
                            <el-form-item label="统一评语">
                              <el-input
                                v-model="batchTeacherComment"
                                :autosize="{ minRows: 2, maxRows: 4 }"
                                maxlength="1000"
                                placeholder="例如：整体完成度较高，再补充一个更贴近生活的应用案例。"
                                show-word-limit
                                type="textarea"
                              />
                            </el-form-item>
                          </el-col>
                        </el-row>
                      </el-form>

                      <div class="batch-actions">
                        <el-button
                          :disabled="selectedSubmissionCount === 0"
                          :loading="isBatchSaving"
                          type="primary"
                          @click="saveBatchReview"
                        >
                          批量保存评分
                        </el-button>
                      </div>
                    </section>

                    <el-table
                      ref="tableRef"
                      :data="filteredItems"
                      :row-class-name="rowClassName"
                      highlight-current-row
                      row-key="submission_id"
                      stripe
                      @current-change="handleCurrentChange"
                      @row-click="handleRowClick"
                      @selection-change="handleSelectionChange"
                    >
                      <el-table-column type="selection" width="48" />
                      <el-table-column label="学生" min-width="160">
                        <template #default="{ row }">
                          <div>
                            <strong>{{ row.student_name }}</strong>
                            <p class="table-note">{{ row.student_no }} · {{ row.class_name }}</p>
                          </div>
                        </template>
                      </el-table-column>
                      <el-table-column label="状态" min-width="110">
                        <template #default="{ row }">
                          <el-space wrap>
                            <el-tag :type="statusTagType(row.status)" round>{{ statusLabel(row.status) }}</el-tag>
                            <el-tag v-if="row.is_recommended" round type="success">鎺ㄨ崘</el-tag>
                          </el-space>
                        </template>
                      </el-table-column>
                      <el-table-column label="得分" min-width="90">
                        <template #default="{ row }">
                          {{ formatScoreText(row.score) }}
                        </template>
                      </el-table-column>
                      <el-table-column label="附件" min-width="90" prop="file_count" />
                      <el-table-column label="最近提交" min-width="170">
                        <template #default="{ row }">
                          {{ formatDateTime(row.updated_at) }}
                        </template>
                      </el-table-column>
                      <el-table-column label="操作" fixed="right" min-width="100">
                        <template #default="{ row }">
                          <el-button link type="primary" @click.stop="openGradingWorkspace(row.submission_id)">
                            进入评分
                          </el-button>
                        </template>
                      </el-table-column>
                    </el-table>
                  </template>
                </template>
              </el-card>
            </el-col>

            <el-col :lg="9" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="template-panel-header">
                    <span>单个评分面板</span>
                    <el-button v-if="selectedSubmission" text @click="openGradingWorkspace()">
                      大窗口评分
                    </el-button>
                  </div>
                </template>

                <el-empty v-if="!selectedSubmission" description="请选择一条学生作品。" />

                <div v-else class="page-stack">
                  <div class="student-card">
                    <div class="info-row">
                      <strong>{{ selectedSubmission.student_name }}</strong>
                      <el-space wrap>
                        <el-tag :type="statusTagType(selectedSubmission.status)" round>
                          {{ statusLabel(selectedSubmission.status) }}
                        </el-tag>
                        <el-tag v-if="selectedSubmission.is_recommended" round type="success">鎺ㄨ崘浣滃搧</el-tag>
                      </el-space>
                    </div>
                    <p class="section-note">
                      {{ selectedSubmission.student_no }} · {{ selectedSubmission.class_name }}
                    </p>
                    <p class="section-note">
                      提交时间：{{ formatDateTime(selectedSubmission.submitted_at) }}
                    </p>
                  </div>

                  <div class="content-block">
                    <h3>作品说明</h3>
                    <RichTextContent
                      :html="selectedSubmission.submission_note"
                      empty-text="学生没有填写作品说明。"
                    />
                  </div>

                  <div class="content-block">
                    <h3>附件清单</h3>
                    <el-empty v-if="!selectedSubmission.files.length" description="暂无附件" />
                    <div v-else class="stack-list">
                      <article
                        v-for="file in selectedSubmission.files"
                        :key="file.id"
                        class="file-item"
                      >
                        <div class="file-main">
                          <p class="file-name">{{ file.name }}</p>
                          <p class="file-meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB</p>
                        </div>
                        <div class="file-actions">
                          <el-tag round type="info">{{ file.role }}</el-tag>
                          <el-button
                            v-if="file.previewable"
                            :loading="previewLoadingFileId === file.id"
                            link
                            type="primary"
                            @click="previewFile(file)"
                          >
                            预览
                          </el-button>
                          <el-button
                            :loading="downloadLoadingFileId === file.id"
                            link
                            type="success"
                            @click="downloadFile(file)"
                          >
                            下载
                          </el-button>
                        </div>
                      </article>
                    </div>
                  </div>

                  <section v-loading="isTemplateLoading" class="template-panel">
                    <div class="template-panel-header">
                      <div>
                        <p class="template-panel-title">单份评分模板</p>
                        <p class="template-panel-note">
                          模板会按分组显示；套用模板会同步带入推荐等级分和评语，快捷插入只会追加评语内容。
                        </p>
                      </div>
                      <el-button text @click="openTemplateManager('single')">管理模板</el-button>
                    </div>

                    <div class="template-toolbar">
                      <el-select
                        v-model="selectedSingleTemplateId"
                        class="template-select"
                        clearable
                        filterable
                        placeholder="选择单份评分模板"
                      >
                        <el-option-group
                          v-for="group in groupedReviewTemplates"
                          :key="`single-group-${group.key || 'ungrouped'}`"
                          :label="group.label"
                        >
                          <el-option
                            v-for="template in group.templates"
                            :key="template.id"
                            :label="template.title"
                            :value="template.id"
                          >
                            <div class="template-option">
                              <span>{{ template.title }}</span>
                              <span class="template-option-score">
                                #{{ template.sort_order }}
                                {{ template.score === null ? ' · 仅评语' : ` · 建议等级 ${formatScoreText(template.score)}` }}
                              </span>
                            </div>
                          </el-option>
                        </el-option-group>
                      </el-select>
                      <el-button :disabled="!selectedSingleTemplateId" type="primary" plain @click="applySelectedTemplate('single', 'replace')">
                        套用模板
                      </el-button>
                      <el-button :disabled="!selectedSingleTemplateId" plain @click="applySelectedTemplate('single', 'insert')">
                        仅插入评语
                      </el-button>
                      <el-button plain @click="saveCurrentAsTemplate('single')">保存当前为模板</el-button>
                    </div>

                    <div v-if="quickTemplateGroups.length" class="template-group-stack">
                      <div
                        v-for="group in quickTemplateGroups"
                        :key="`single-quick-${group.key || 'ungrouped'}`"
                        class="quick-comment-row"
                      >
                        <span class="filter-label">{{ group.label }}</span>
                        <el-button
                          v-for="template in group.templates"
                          :key="`single-${template.id}`"
                          link
                          type="primary"
                          @click="applyTemplate(template.id, 'single', 'insert')"
                        >
                          {{ template.title }}
                        </el-button>
                      </div>
                    </div>

                    <p v-else class="template-empty-note">
                      还没有评分模板，可先填写一次评分内容，再点“保存当前为模板”。
                    </p>
                  </section>

                  <el-form label-position="top">
                    <el-form-item label="教师等级评分">
                      <div class="grade-editor">
                        <div class="grade-chip-grid">
                          <el-button
                            v-for="option in scoreGradeOptions"
                            :key="`single-grade-${option.grade}`"
                            :disabled="isSaving"
                            :plain="reviewScore !== option.score"
                            :type="reviewScore === option.score ? 'primary' : undefined"
                            @click="handleSingleScoreSelect(option.score)"
                          >
                            {{ option.grade }} · {{ option.score }}
                          </el-button>
                        </div>
                        <div class="grade-editor-footer">
                          <el-tag round type="success">{{ formatScoreHelperText(reviewScore) }}</el-tag>
                          <el-button :disabled="isSaving" text @click="setTargetScore('single', null)">清空分数</el-button>
                        </div>
                      </div>
                    </el-form-item>
                    <el-form-item label="教师评语">
                      <el-input
                        v-model="teacherComment"
                        :autosize="{ minRows: 4, maxRows: 8 }"
                        maxlength="1000"
                        placeholder="写下本次作品的优点、修改建议或课堂反馈。"
                        show-word-limit
                        type="textarea"
                      />
                    </el-form-item>
                  </el-form>

                  <p class="section-note">点击上方等级会立即保存并自动切换到下一位学生；只修改评语时请使用下方保存按钮。</p>

                  <el-button
                    :loading="isSaving"
                    class="save-button"
                    type="primary"
                    @click="saveReview"
                  >
                    {{ reviewSubmitButtonText }}
                  </el-button>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </template>
    </el-skeleton>

    <el-dialog
      v-model="gradingDialogVisible"
      destroy-on-close
      fullscreen
      @closed="resetGradingPreviewState"
    >
      <template #header>
        <div class="grading-dialog-header">
          <div>
            <p class="template-manager-title">评分工作台</p>
            <p class="template-manager-note">
              {{
                selectedSubmission
                  ? `${selectedSubmission.student_name} · ${selectedSubmission.student_no} · ${selectedSubmission.class_name}`
                  : '请选择一条学生作品'
              }}
            </p>
          </div>
          <el-space wrap>
            <el-tag v-if="selectedSubmissionProgressText" round type="info">
              当前进度 {{ selectedSubmissionProgressText }}
            </el-tag>
            <el-button :disabled="!hasPreviousSubmission" plain @click="moveToRelativeSubmission('previous')">
              上一份
            </el-button>
            <el-button :disabled="!hasNextSubmission" plain @click="moveToRelativeSubmission('next')">
              下一份
            </el-button>
          </el-space>
        </div>
      </template>

      <div v-if="selectedSubmission" class="grading-shell">
        <section class="grading-preview-panel">
          <div class="student-card">
            <div class="info-row">
              <strong>{{ selectedSubmission.student_name }}</strong>
              <el-space wrap>
                <el-tag :type="statusTagType(selectedSubmission.status)" round>
                  {{ statusLabel(selectedSubmission.status) }}
                </el-tag>
                <el-tag v-if="selectedSubmission.is_recommended" round type="success">鎺ㄨ崘浣滃搧</el-tag>
              </el-space>
            </div>
            <p class="section-note">
              {{ selectedSubmission.student_no }} · {{ selectedSubmission.class_name }}
            </p>
            <p class="section-note">
              提交时间：{{ formatDateTime(selectedSubmission.submitted_at) }}
            </p>
            <p class="section-note">当前分数：{{ formatScoreText(reviewScore) }}</p>
          </div>

          <div class="content-block">
            <h3>作品说明</h3>
            <RichTextContent
              :html="selectedSubmission.submission_note"
              empty-text="学生没有填写作品说明。"
            />
          </div>

          <div class="content-block">
            <div class="template-panel-header">
              <h3>附件内容</h3>
              <el-tag round type="success">
                共 {{ selectedSubmission.files.length }} 个附件
              </el-tag>
            </div>

            <el-empty v-if="!selectedSubmission.files.length" description="暂无附件" />

            <template v-else>
              <div class="grading-file-list">
                <button
                  v-for="file in selectedSubmission.files"
                  :key="file.id"
                  :class="[
                    'grading-file-card',
                    { 'grading-file-card-active': gradingPreviewFileId === file.id },
                  ]"
                  type="button"
                  @click="loadGradingPreview(file)"
                >
                  <span class="grading-file-name">{{ file.name }}</span>
                  <span class="grading-file-meta">
                    {{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB
                    {{ isFilePreviewable(file) ? ' · 可直接展示' : ' · 仅下载' }}
                  </span>
                </button>
              </div>

              <div v-loading="isGradingPreviewLoading" class="grading-preview-stage">
                <iframe
                  v-if="!isGradingPreviewLoading && gradingPreviewKind === 'pdf' && gradingPreviewUrl"
                  :src="gradingPreviewUrl"
                  class="preview-frame"
                  title="评分工作台附件预览"
                />
                <img
                  v-else-if="!isGradingPreviewLoading && gradingPreviewKind === 'image' && gradingPreviewUrl"
                  :src="gradingPreviewUrl"
                  alt="评分工作台附件预览"
                  class="preview-image"
                />
                <pre
                  v-else-if="!isGradingPreviewLoading && gradingPreviewKind === 'text'"
                  class="preview-text"
                >{{ gradingPreviewText }}</pre>
                <div v-else-if="gradingPreviewFile" class="grading-preview-fallback">
                  <p>当前附件暂不支持直接展示，请直接下载查看。</p>
                  <el-button type="success" @click="downloadFile(gradingPreviewFile)">
                    下载当前附件
                  </el-button>
                </div>
                <el-empty
                  v-else-if="!isGradingPreviewLoading"
                  description="请选择一个附件进行查看"
                />
              </div>
            </template>
          </div>
        </section>

        <aside class="grading-sidebar">
          <section v-loading="isTemplateLoading" class="template-panel">
            <div class="template-panel-header">
              <div>
                <p class="template-panel-title">单份评分模板</p>
                <p class="template-panel-note">
                  套用模板会同步带入推荐等级和评语，快捷插入只会追加评语内容。
                </p>
              </div>
              <el-button text @click="openTemplateManager('single')">管理模板</el-button>
            </div>

            <div class="template-toolbar">
              <el-select
                v-model="selectedSingleTemplateId"
                class="template-select"
                clearable
                filterable
                placeholder="选择单份评分模板"
              >
                <el-option-group
                  v-for="group in groupedReviewTemplates"
                  :key="`dialog-single-group-${group.key || 'ungrouped'}`"
                  :label="group.label"
                >
                  <el-option
                    v-for="template in group.templates"
                    :key="template.id"
                    :label="template.title"
                    :value="template.id"
                  >
                    <div class="template-option">
                      <span>{{ template.title }}</span>
                      <span class="template-option-score">
                        #{{ template.sort_order }}
                        {{ template.score === null ? ' · 仅评语' : ` · 建议等级 ${formatScoreText(template.score)}` }}
                      </span>
                    </div>
                  </el-option>
                </el-option-group>
              </el-select>
              <el-button :disabled="!selectedSingleTemplateId" type="primary" plain @click="applySelectedTemplate('single', 'replace')">
                套用模板
              </el-button>
              <el-button :disabled="!selectedSingleTemplateId" plain @click="applySelectedTemplate('single', 'insert')">
                仅插入评语
              </el-button>
            </div>
          </section>

          <el-form label-position="top">
            <el-form-item label="教师等级评分">
              <div class="grade-editor">
                <div class="grade-chip-grid">
                  <el-button
                    v-for="option in scoreGradeOptions"
                    :key="`dialog-grade-${option.grade}`"
                    :disabled="isSaving"
                    :plain="reviewScore !== option.score"
                    :type="reviewScore === option.score ? 'primary' : undefined"
                    @click="handleSingleScoreSelect(option.score)"
                  >
                    {{ option.grade }} · {{ option.score }}
                  </el-button>
                </div>
                <div class="grade-editor-footer">
                  <el-tag round type="success">{{ formatScoreHelperText(reviewScore) }}</el-tag>
                  <el-button :disabled="isSaving" text @click="setTargetScore('single', null)">清空分数</el-button>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="教师评语">
              <el-input
                v-model="teacherComment"
                :autosize="{ minRows: 10, maxRows: 16 }"
                maxlength="1000"
                placeholder="写下本次作品的优点、修改建议或课堂反馈。"
                show-word-limit
                type="textarea"
              />
            </el-form-item>
          </el-form>

          <p class="section-note">点击上方等级会立即保存并自动切换到下一位学生；只修改评语时请使用下方保存按钮。</p>

          <div class="grading-sidebar-actions">
            <el-button :disabled="!hasPreviousSubmission" plain @click="moveToRelativeSubmission('previous')">
              上一份
            </el-button>
            <el-button
              :loading="isSaving"
              type="primary"
              @click="saveReview"
            >
              {{ reviewSubmitButtonText }}
            </el-button>
          </div>
        </aside>
      </div>
    </el-dialog>

    <el-dialog
      v-model="templateDialogVisible"
      title="评分模板管理"
      destroy-on-close
      width="min(980px, 94vw)"
    >
      <div v-loading="isTemplateLoading" class="template-manager-shell">
        <section class="template-manager-list">
          <div class="template-manager-header">
            <div>
              <p class="template-manager-title">我的评分模板</p>
              <p class="template-manager-note">
                模板按教师账号云端同步。你可以按分组整理，并在组内调整显示顺序。
              </p>
            </div>
            <el-space wrap>
              <el-button plain @click="startCreateTemplate('blank')">新建空白模板</el-button>
              <el-button type="primary" plain @click="startCreateTemplate(templateDialogTarget)">
                从当前评分生成
              </el-button>
            </el-space>
          </div>

          <el-empty
            v-if="!reviewTemplates.length"
            description="还没有评分模板，可从当前评分内容生成第一条模板。"
          />

          <div v-else class="template-card-list">
            <section
              v-for="group in groupedReviewTemplates"
              :key="`manager-group-${group.key || 'ungrouped'}`"
              class="template-group-section"
            >
              <div class="template-group-header">
                <div>
                  <p class="template-group-title">{{ group.label }}</p>
                  <p class="template-group-note">共 {{ group.templates.length }} 个模板</p>
                </div>
              </div>

              <article
                v-for="template in group.templates"
                :key="template.id"
                :class="['template-card', { 'template-card-active': editingTemplateId === template.id }]"
              >
                <div class="template-card-header">
                  <div>
                    <p class="template-card-title">{{ template.title }}</p>
                    <div class="template-meta-row">
                      <el-tag round type="info">{{ group.label }}</el-tag>
                      <el-tag round type="success">排序 {{ template.sort_order }}</el-tag>
                      <p class="template-card-score">
                        {{ template.score === null ? '仅评语模板' : `建议等级：${formatScoreText(template.score)}` }}
                      </p>
                    </div>
                  </div>
                  <el-space wrap>
                    <el-button
                      :disabled="!canMoveTemplate(template.id, 'up') || isTemplateSaving"
                      :loading="movingTemplateId === template.id && isTemplateSaving"
                      link
                      @click="moveTemplate(template.id, 'up')"
                    >
                      上移
                    </el-button>
                    <el-button
                      :disabled="!canMoveTemplate(template.id, 'down') || isTemplateSaving"
                      :loading="movingTemplateId === template.id && isTemplateSaving"
                      link
                      @click="moveTemplate(template.id, 'down')"
                    >
                      下移
                    </el-button>
                    <el-button link type="primary" @click="applyTemplate(template.id, 'single', 'replace')">
                      套用到单份
                    </el-button>
                    <el-button link type="success" @click="applyTemplate(template.id, 'batch', 'replace')">
                      套用到批量
                    </el-button>
                    <el-button link @click="startEditTemplate(template.id)">编辑</el-button>
                    <el-button link type="danger" @click="deleteTemplate(template.id)">删除</el-button>
                  </el-space>
                </div>
                <p class="template-card-comment">{{ template.comment || '该模板只设置推荐等级分。' }}</p>
              </article>
            </section>
          </div>
        </section>

        <section class="template-editor-panel">
          <div class="template-panel-header">
            <div>
              <p class="template-panel-title">{{ editingTemplateId ? '编辑模板' : '新建模板' }}</p>
              <p class="template-panel-note">{{ templateEditorHint }}</p>
            </div>
            <el-button
              v-if="
                editingTemplateId ||
                templateForm.title ||
                templateForm.group_name ||
                templateForm.comment ||
                templateForm.score !== null ||
                templateForm.sort_order !== null
              "
              text
              @click="resetTemplateEditor"
            >
              清空
            </el-button>
          </div>

          <el-form label-position="top">
            <el-form-item label="模板名称">
              <el-input
                v-model="templateForm.title"
                maxlength="30"
                placeholder="例如：课堂展示完成度高"
                show-word-limit
              />
            </el-form-item>
            <el-form-item label="模板分组">
              <el-select
                v-model="templateForm.group_name"
                allow-create
                clearable
                default-first-option
                filterable
                placeholder="例如：课堂表现 / 改进建议"
                style="width: 100%"
              >
                <el-option
                  v-for="groupName in groupNameOptions"
                  :key="groupName"
                  :label="groupName"
                  :value="groupName"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="排序值">
              <el-input-number
                v-model="templateForm.sort_order"
                :max="9999"
                :min="0"
                controls-position="right"
                placeholder="留空则自动排到组内末尾"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="推荐等级分">
              <div class="grade-editor">
                <div class="grade-chip-grid">
                  <el-button
                    v-for="option in scoreGradeOptions"
                    :key="`template-grade-${option.grade}`"
                    :plain="templateForm.score !== option.score"
                    :type="templateForm.score === option.score ? 'primary' : undefined"
                    @click="templateForm.score = option.score"
                  >
                    {{ option.grade }} · {{ option.score }}
                  </el-button>
                </div>
                <div class="grade-editor-footer">
                  <el-tag round type="success">{{ formatScoreHelperText(templateForm.score) }}</el-tag>
                  <el-button text @click="templateForm.score = null">清空分数</el-button>
                </div>
                <el-input-number
                  v-model="templateForm.score"
                  :max="maxReviewScore"
                  :min="0"
                  controls-position="right"
                  placeholder="可留空，支持 0-120"
                  style="width: 100%"
                />
              </div>
            </el-form-item>
            <el-form-item label="模板评语">
              <el-input
                v-model="templateForm.comment"
                :autosize="{ minRows: 6, maxRows: 10 }"
                maxlength="1000"
                placeholder="写入可复用的教师评语，支持一键套用或快捷插入。"
                show-word-limit
                type="textarea"
              />
            </el-form-item>
          </el-form>

          <div class="template-editor-actions">
            <el-button plain @click="resetTemplateEditor">重置</el-button>
            <el-button :loading="isTemplateSaving" type="primary" @click="saveTemplate">
              {{ editingTemplateId ? '保存模板修改' : '保存为新模板' }}
            </el-button>
          </div>
        </section>
      </div>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      :title="previewTitle"
      destroy-on-close
      width="min(960px, 92vw)"
      @closed="resetPreviewState"
    >
      <div v-loading="isPreviewLoading" class="preview-shell">
        <iframe
          v-if="!isPreviewLoading && previewKind === 'pdf' && previewUrl"
          :src="previewUrl"
          class="preview-frame"
          title="附件预览"
        />
        <img
          v-else-if="!isPreviewLoading && previewKind === 'image' && previewUrl"
          :src="previewUrl"
          alt="附件预览"
          class="preview-image"
        />
        <pre v-else-if="!isPreviewLoading && previewKind === 'text'" class="preview-text">{{ previewText }}</pre>
        <el-empty
          v-else-if="!isPreviewLoading"
          description="当前文件暂不支持在线预览，请直接下载查看。"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPostBlob, apiPut } from '@/api/http';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import RichTextContent from '@/components/RichTextContent.vue';
import { useAuthStore } from '@/stores/auth';

type TaskSubmissionFile = {
  id: number;
  name: string;
  ext: string;
  size_kb: number;
  role: string;
  mime_type?: string;
  previewable?: boolean;
};

type TaskSubmissionItem = {
  submission_id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  status: 'submitted' | 'reviewed';
  score: number | null;
  peer_review_score: number | null;
  is_recommended: boolean;
  submitted_at: string | null;
  updated_at: string | null;
  submission_note: string | null;
  teacher_comment: string | null;
  file_count: number;
  files: TaskSubmissionFile[];
};

type RecommendedSubmissionItem = {
  submission_id: number;
  student_id: number;
  student_name: string;
  student_no: string;
  class_name: string;
  score: number | null;
  submission_note: string | null;
  teacher_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  files: TaskSubmissionFile[];
};

type TaskDetailPayload = {
  task: {
    id: number;
    title: string;
    task_type: string;
    description: string | null;
    course: {
      id: number;
      title: string;
      assigned_date: string;
      lesson_title: string;
      unit_title: string;
    };
  };
  summary: {
    submission_count: number;
    reviewed_count: number;
    pending_count: number;
    recommended_count: number;
    average_score: number | null;
    latest_submitted_at: string | null;
  };
  recommended_showcase: {
    count: number;
    items: RecommendedSubmissionItem[];
  };
  items: TaskSubmissionItem[];
};

type BatchScoreResponse = {
  updated_count: number;
  submission_ids: number[];
  task_ids: number[];
};

type TableRef = {
  clearSelection: () => void;
};

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';
type ReviewTarget = 'single' | 'batch';
type TemplateApplyMode = 'replace' | 'insert';
type TemplateCreateSource = ReviewTarget | 'blank';
type ReviewSequenceDirection = 'previous' | 'next';
type ScoreGradeCode = 'G' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

type ScoreGradeOption = {
  grade: ScoreGradeCode;
  label: string;
  score: number;
};

type ReviewTemplate = {
  id: string;
  title: string;
  group_name: string;
  sort_order: number;
  score: number | null;
  comment: string;
  updated_at?: string | null;
};

type ReviewTemplateForm = {
  title: string;
  group_name: string;
  sort_order: number | null;
  score: number | null;
  comment: string;
};

type TemplateGroup = {
  key: string;
  label: string;
  templates: ReviewTemplate[];
};

type ReviewTemplateListPayload = {
  items: ReviewTemplate[];
};

type ReviewTemplateMutationPayload = {
  template: ReviewTemplate;
};

type ReviewTemplateDeletePayload = {
  deleted_id: string;
};

const maxReviewScore = 120;
const previewableExtensions = new Set(['gif', 'jpeg', 'jpg', 'md', 'pdf', 'png', 'svg', 'txt', 'webp']);
const quickTemplateCount = 4;
const scoreGradeOptions: ScoreGradeOption[] = [
  { grade: 'G', label: 'G（推荐）', score: 120 },
  { grade: 'A', label: 'A', score: 100 },
  { grade: 'B', label: 'B', score: 80 },
  { grade: 'C', label: 'C', score: 60 },
  { grade: 'D', label: 'D', score: 40 },
  { grade: 'E', label: 'E', score: 20 },
  { grade: 'F', label: 'F', score: 0 },
];

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const tableRef = ref<TableRef | null>(null);
const taskData = ref<TaskDetailPayload | null>(null);
const selectedSubmissionId = ref<number | null>(null);
const selectedSubmissionIds = ref<number[]>([]);
const reviewScore = ref<number | null>(null);
const teacherComment = ref('');
const batchReviewScore = ref<number | null>(null);
const batchTeacherComment = ref('');
const onlyPendingSubmissions = ref(true);
const selectedClassName = ref('');
const focusHintMessage = ref('');
const isLoading = ref(true);
const isSaving = ref(false);
const isBatchSaving = ref(false);
const isBatchDownloading = ref(false);
const errorMessage = ref('');
const gradingDialogVisible = ref(false);

const previewDialogVisible = ref(false);
const previewTitle = ref('');
const previewKind = ref<PreviewKind>('unsupported');
const previewUrl = ref('');
const previewText = ref('');
const isPreviewLoading = ref(false);
const previewLoadingFileId = ref<number | null>(null);
const downloadLoadingFileId = ref<number | null>(null);
const gradingPreviewFileId = ref<number | null>(null);
const gradingPreviewKind = ref<PreviewKind>('unsupported');
const gradingPreviewUrl = ref('');
const gradingPreviewText = ref('');
const isGradingPreviewLoading = ref(false);
const reviewTemplates = ref<ReviewTemplate[]>([]);
const selectedSingleTemplateId = ref('');
const selectedBatchTemplateId = ref('');
const isTemplateLoading = ref(false);
const isTemplateSaving = ref(false);
const movingTemplateId = ref('');
const templateDialogVisible = ref(false);
const templateDialogTarget = ref<ReviewTarget>('single');
const editingTemplateId = ref<string | null>(null);
const templateForm = ref<ReviewTemplateForm>(createEmptyTemplateForm());

const taskItems = computed(() => taskData.value?.items || []);
const legacyTemplateStorageKey = computed(() => {
  const teacherKey = authStore.user?.id || authStore.user?.username || 'staff';
  return `learnsite-review-templates:${teacherKey}`;
});

const classOptions = computed(() => {
  const options = new Set<string>();
  for (const item of taskItems.value) {
    options.add(item.class_name);
  }
  return Array.from(options);
});
const focusAlertType = computed(() =>
  String(route.query.focus || '') === 'pending_submit' ? 'warning' : 'info'
);

const selectedSubmission = computed(() => {
  if (selectedSubmissionId.value === null) {
    return null;
  }
  return filteredItems.value.find((item) => item.submission_id === selectedSubmissionId.value) || null;
});

const filteredItems = computed(() => {
  return taskItems.value.filter((item) => {
    if (onlyPendingSubmissions.value && item.status === 'reviewed') {
      return false;
    }
    if (selectedClassName.value && item.class_name !== selectedClassName.value) {
      return false;
    }
    return true;
  });
});

const selectedSubmissionCount = computed(() => selectedSubmissionIds.value.length);
const selectedSubmissionIndex = computed(() =>
  filteredItems.value.findIndex((item) => item.submission_id === selectedSubmissionId.value)
);
const hasPreviousSubmission = computed(() => selectedSubmissionIndex.value > 0);
const hasNextSubmission = computed(
  () =>
    selectedSubmissionIndex.value >= 0 &&
    selectedSubmissionIndex.value < filteredItems.value.length - 1
);
const selectedSubmissionProgressText = computed(() => {
  if (selectedSubmissionIndex.value < 0) {
    return '';
  }
  return `${selectedSubmissionIndex.value + 1} / ${filteredItems.value.length}`;
});
const gradingPreviewFile = computed(() => {
  if (!selectedSubmission.value || gradingPreviewFileId.value === null) {
    return null;
  }
  return selectedSubmission.value.files.find((file) => file.id === gradingPreviewFileId.value) || null;
});
const reviewSubmitButtonText = computed(() =>
  hasNextSubmission.value ? '保存评语并进入下一份' : '保存当前修改'
);
const groupNameOptions = computed(() => {
  const names = new Set<string>();
  for (const template of reviewTemplates.value) {
    if (template.group_name) {
      names.add(template.group_name);
    }
  }
  return Array.from(names).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
});
const groupedReviewTemplates = computed<TemplateGroup[]>(() => {
  const sortedTemplates = [...reviewTemplates.value].sort(compareReviewTemplates);
  const groups = new Map<string, TemplateGroup>();

  for (const template of sortedTemplates) {
    const key = template.group_name;
    const existing = groups.get(key);
    if (existing) {
      existing.templates.push(template);
      continue;
    }

    groups.set(key, {
      key,
      label: getTemplateGroupLabel(key),
      templates: [template],
    });
  }

  return Array.from(groups.values());
});
const quickTemplateGroups = computed(() =>
  groupedReviewTemplates.value
    .map((group) => ({
      ...group,
      templates: group.templates.slice(0, quickTemplateCount),
    }))
    .filter((group) => group.templates.length > 0)
);
const templateEditorHint = computed(() => {
  if (editingTemplateId.value) {
    return '修改模板后，单份评分和批量评分入口都会立即使用最新内容。';
  }
  if (templateDialogTarget.value === 'batch') {
    return '已按当前批量评分内容预填，可补充模板名称后保存。';
  }
  return '已按当前单份评分内容预填，可补充模板名称后保存。';
});

function statusLabel(status: TaskSubmissionItem['status']) {
  return status === 'reviewed' ? '已评阅' : '待评阅';
}

function statusTagType(status: TaskSubmissionItem['status']) {
  return status === 'reviewed' ? 'success' : 'warning';
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无记录';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function getScoreGradeOption(score: number | null) {
  if (score === null) {
    return null;
  }
  return scoreGradeOptions.find((option) => option.score === score) || null;
}

function formatScoreText(score: number | null) {
  if (score === null) {
    return '--';
  }
  const option = getScoreGradeOption(score);
  return option ? `${option.grade} · ${score}` : `${score}`;
}

function formatScoreHelperText(score: number | null) {
  if (score === null) {
    return '未设置分数';
  }
  const option = getScoreGradeOption(score);
  return option ? `${option.label}，对应 ${score} 分` : `${score} 分`;
}

function rowClassName({ row }: { row: TaskSubmissionItem }) {
  return row.submission_id === selectedSubmissionId.value ? 'current-row' : '';
}

function hasReviewContent(score: number | null, comment: string) {
  return score !== null || Boolean(comment.trim());
}

function createEmptyTemplateForm(): ReviewTemplateForm {
  return {
    title: '',
    group_name: '',
    sort_order: null,
    score: null,
    comment: '',
  };
}

function createTemplateId() {
  return `template-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function sanitizeTemplateScore(score: unknown) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }
  return Math.min(maxReviewScore, Math.max(0, Math.round(score)));
}

function sanitizeTemplateSortOrder(sortOrder: unknown) {
  if (typeof sortOrder !== 'number' || Number.isNaN(sortOrder)) {
    return 1000;
  }
  return Math.min(9999, Math.max(0, Math.round(sortOrder)));
}

function normalizeTemplateGroupName(groupName: string | null | undefined) {
  return groupName?.trim() || '';
}

function getTemplateGroupLabel(groupName: string) {
  return groupName || '未分组';
}

function compareTemplateGroupName(left: string, right: string) {
  if (!left && right) {
    return -1;
  }
  if (left && !right) {
    return 1;
  }
  return left.localeCompare(right, 'zh-Hans-CN');
}

function compareReviewTemplates(left: ReviewTemplate, right: ReviewTemplate) {
  const groupComparison = compareTemplateGroupName(left.group_name, right.group_name);
  if (groupComparison !== 0) {
    return groupComparison;
  }

  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  if ((left.updated_at || '') !== (right.updated_at || '')) {
    return (right.updated_at || '').localeCompare(left.updated_at || '');
  }

  return left.id.localeCompare(right.id);
}

function normalizeTemplate(input: unknown): ReviewTemplate | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<ReviewTemplate>;
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  const group_name = normalizeTemplateGroupName(candidate.group_name);
  const sort_order = sanitizeTemplateSortOrder(candidate.sort_order);
  const comment = typeof candidate.comment === 'string' ? candidate.comment.trim() : '';
  const score = sanitizeTemplateScore(candidate.score);
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createTemplateId();

  if (!title || (!comment && score === null)) {
    return null;
  }

  return {
    id,
    title,
    group_name,
    sort_order,
    score,
    comment,
    updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
  };
}

function readLegacyTemplates() {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(legacyTemplateStorageKey.value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeTemplate(item))
      .filter((item): item is ReviewTemplate => item !== null);
  } catch {
    return [];
  }
}

function clearLegacyTemplates() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(legacyTemplateStorageKey.value);
}

function templateSignature(template: Pick<ReviewTemplate, 'title' | 'score' | 'comment'>) {
  return [template.title.trim(), template.score ?? 'null', template.comment.trim()].join('::');
}

async function mergeLegacyTemplates(remoteTemplates: ReviewTemplate[]) {
  if (!authStore.token) {
    return remoteTemplates;
  }

  const legacyTemplates = readLegacyTemplates();
  if (!legacyTemplates.length) {
    return remoteTemplates;
  }

  const remoteSignatures = new Set(remoteTemplates.map((template) => templateSignature(template)));
  const templatesToUpload = legacyTemplates.filter(
    (template) => !remoteSignatures.has(templateSignature(template))
  );

  if (!templatesToUpload.length) {
    clearLegacyTemplates();
    return remoteTemplates;
  }

  for (const template of templatesToUpload) {
    await apiPost<ReviewTemplateMutationPayload>(
      '/submissions/review-templates',
      {
        title: template.title,
        group_name: template.group_name,
        sort_order: template.sort_order,
        score: template.score,
        comment: template.comment,
      },
      authStore.token
    );
  }

  clearLegacyTemplates();
  const payload = await apiGet<ReviewTemplateListPayload>('/submissions/review-templates', authStore.token);
  return payload.items;
}

async function loadReviewTemplates() {
  if (!authStore.token || !authStore.user?.id) {
    reviewTemplates.value = [];
    return;
  }

  isTemplateLoading.value = true;

  try {
    const payload = await apiGet<ReviewTemplateListPayload>('/submissions/review-templates', authStore.token);
    reviewTemplates.value = await mergeLegacyTemplates(payload.items);
  } catch (error) {
    const legacyTemplates = readLegacyTemplates();
    if (legacyTemplates.length) {
      reviewTemplates.value = legacyTemplates;
      ElMessage.warning('评分模板云端同步失败，已临时回退到本地模板');
      return;
    }

    reviewTemplates.value = [];
    ElMessage.error(error instanceof Error ? error.message : '加载评分模板失败');
  } finally {
    isTemplateLoading.value = false;
  }
}

function getTargetScore(target: ReviewTarget) {
  return target === 'single' ? reviewScore.value : batchReviewScore.value;
}

function getTargetComment(target: ReviewTarget) {
  return target === 'single' ? teacherComment.value : batchTeacherComment.value;
}

function setTargetScore(target: ReviewTarget, score: number | null) {
  if (target === 'single') {
    reviewScore.value = score;
    return;
  }
  batchReviewScore.value = score;
}

function setTargetComment(target: ReviewTarget, comment: string) {
  if (target === 'single') {
    teacherComment.value = comment;
    return;
  }
  batchTeacherComment.value = comment;
}

async function handleSingleScoreSelect(score: number) {
  if (isSaving.value) {
    return;
  }

  setTargetScore('single', score);
  await saveReview();
}

function buildTemplateFormFromTarget(source: TemplateCreateSource): ReviewTemplateForm {
  if (source === 'blank') {
    return createEmptyTemplateForm();
  }

  return {
    title: '',
    group_name: '',
    sort_order: null,
    score: getTargetScore(source),
    comment: getTargetComment(source),
  };
}

function joinComment(currentComment: string, nextComment: string) {
  const current = currentComment.trim();
  const next = nextComment.trim();

  if (!next) {
    return currentComment;
  }
  if (!current) {
    return next;
  }
  return `${current}\n${next}`;
}

function getTemplateById(templateId: string) {
  return reviewTemplates.value.find((template) => template.id === templateId) || null;
}

function applyTemplate(templateId: string, target: ReviewTarget, mode: TemplateApplyMode) {
  const template = getTemplateById(templateId);
  if (!template) {
    ElMessage.warning('未找到对应的评分模板');
    return;
  }

  if (target === 'single') {
    selectedSingleTemplateId.value = templateId;
  } else {
    selectedBatchTemplateId.value = templateId;
  }

  if (mode === 'replace') {
    if (template.score !== null) {
      setTargetScore(target, template.score);
    }
    if (template.comment) {
      setTargetComment(target, template.comment);
    }
    return;
  }

  if (template.comment) {
    setTargetComment(target, joinComment(getTargetComment(target), template.comment));
  }
}

function applySelectedTemplate(target: ReviewTarget, mode: TemplateApplyMode) {
  const templateId = target === 'single' ? selectedSingleTemplateId.value : selectedBatchTemplateId.value;
  if (!templateId) {
    ElMessage.warning('请先选择一个评分模板');
    return;
  }
  applyTemplate(templateId, target, mode);
}

function openTemplateManager(target: ReviewTarget) {
  templateDialogTarget.value = target;
  templateDialogVisible.value = true;

  if (
    !editingTemplateId.value &&
    !templateForm.value.title &&
    !templateForm.value.group_name &&
    !templateForm.value.comment &&
    templateForm.value.score === null &&
    templateForm.value.sort_order === null
  ) {
    templateForm.value = buildTemplateFormFromTarget(target);
  }
}

function resetTemplateEditor() {
  editingTemplateId.value = null;
  templateForm.value = createEmptyTemplateForm();
}

function startCreateTemplate(source: TemplateCreateSource) {
  if (source !== 'blank') {
    templateDialogTarget.value = source;
  }
  editingTemplateId.value = null;
  templateForm.value = buildTemplateFormFromTarget(source);
}

function saveCurrentAsTemplate(target: ReviewTarget) {
  if (!hasReviewContent(getTargetScore(target), getTargetComment(target))) {
    ElMessage.warning('请先填写分数或评语，再保存为模板');
    return;
  }

  templateDialogTarget.value = target;
  templateDialogVisible.value = true;
  editingTemplateId.value = null;
  templateForm.value = buildTemplateFormFromTarget(target);
}

function startEditTemplate(templateId: string) {
  const template = getTemplateById(templateId);
  if (!template) {
    ElMessage.warning('未找到对应的评分模板');
    return;
  }

  templateDialogVisible.value = true;
  editingTemplateId.value = template.id;
  templateForm.value = {
    title: template.title,
    group_name: template.group_name,
    sort_order: template.sort_order,
    score: template.score,
    comment: template.comment,
  };
}

async function saveTemplate() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }

  const title = templateForm.value.title.trim();
  const group_name = normalizeTemplateGroupName(templateForm.value.group_name);
  const sort_order = templateForm.value.sort_order;
  const comment = templateForm.value.comment.trim();
  const score = templateForm.value.score;

  if (!title) {
    ElMessage.warning('请先填写模板名称');
    return;
  }

  if (!hasReviewContent(score, comment)) {
    ElMessage.warning('模板至少需要包含推荐分数或模板评语');
    return;
  }

  isTemplateSaving.value = true;

  try {
    const response = editingTemplateId.value
      ? await apiPut<ReviewTemplateMutationPayload>(
          `/submissions/review-templates/${editingTemplateId.value}`,
          { title, group_name, sort_order, score, comment },
          authStore.token
        )
      : await apiPost<ReviewTemplateMutationPayload>(
          '/submissions/review-templates',
          { title, group_name, sort_order, score, comment },
          authStore.token
        );

    const payload = response.template;
    if (editingTemplateId.value) {
      reviewTemplates.value = reviewTemplates.value.map((template) =>
        template.id === payload.id ? payload : template
      );
      ElMessage.success('评分模板已更新');
    } else {
      reviewTemplates.value = [payload, ...reviewTemplates.value];
      ElMessage.success('评分模板已保存');
    }

    selectedSingleTemplateId.value = payload.id;
    selectedBatchTemplateId.value = payload.id;
    editingTemplateId.value = payload.id;
    templateForm.value = {
      title: payload.title,
      group_name: payload.group_name,
      sort_order: payload.sort_order,
      score: payload.score,
      comment: payload.comment,
    };
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存评分模板失败');
  } finally {
    isTemplateSaving.value = false;
  }
}

async function deleteTemplate(templateId: string) {
  const template = getTemplateById(templateId);
  if (!template || !authStore.token) {
    return;
  }

  try {
    await ElMessageBox.confirm(`确定删除模板“${template.title}”吗？`, '删除评分模板', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  try {
    await apiDelete<ReviewTemplateDeletePayload>(`/submissions/review-templates/${templateId}`, authStore.token);
    reviewTemplates.value = reviewTemplates.value.filter((item) => item.id !== templateId);

    if (selectedSingleTemplateId.value === templateId) {
      selectedSingleTemplateId.value = '';
    }
    if (selectedBatchTemplateId.value === templateId) {
      selectedBatchTemplateId.value = '';
    }
    if (editingTemplateId.value === templateId) {
      resetTemplateEditor();
    }

    ElMessage.success('评分模板已删除');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除评分模板失败');
  }
}

function getTemplateGroup(groupName: string) {
  return groupedReviewTemplates.value.find((group) => group.key === groupName) || null;
}

function canMoveTemplate(templateId: string, direction: 'up' | 'down') {
  const template = getTemplateById(templateId);
  if (!template) {
    return false;
  }

  const group = getTemplateGroup(template.group_name);
  if (!group) {
    return false;
  }

  const index = group.templates.findIndex((item) => item.id === templateId);
  if (index === -1) {
    return false;
  }

  return direction === 'up' ? index > 0 : index < group.templates.length - 1;
}

async function moveTemplate(templateId: string, direction: 'up' | 'down') {
  if (!authStore.token || !canMoveTemplate(templateId, direction)) {
    return;
  }

  const template = getTemplateById(templateId);
  if (!template) {
    return;
  }

  const group = getTemplateGroup(template.group_name);
  if (!group) {
    return;
  }

  const currentIndex = group.templates.findIndex((item) => item.id === templateId);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  const reorderedTemplates = [...group.templates];
  [reorderedTemplates[currentIndex], reorderedTemplates[targetIndex]] = [
    reorderedTemplates[targetIndex],
    reorderedTemplates[currentIndex],
    ];

  movingTemplateId.value = templateId;
  isTemplateSaving.value = true;

  try {
    await Promise.all(
      reorderedTemplates.map((item, index) =>
        apiPut<ReviewTemplateMutationPayload>(
          `/submissions/review-templates/${item.id}`,
          {
            title: item.title,
            group_name: item.group_name,
            sort_order: (index + 1) * 10,
            score: item.score,
            comment: item.comment,
          },
          authStore.token
        )
      )
    );
    await loadReviewTemplates();
    ElMessage.success(direction === 'up' ? '模板已上移' : '模板已下移');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '调整模板顺序失败');
  } finally {
    movingTemplateId.value = '';
    isTemplateSaving.value = false;
  }
}

function isFilePreviewable(file: TaskSubmissionFile) {
  if (typeof file.previewable === 'boolean') {
    return file.previewable;
  }
  return previewableExtensions.has(file.ext.toLowerCase());
}

function hydrateEditor(submission: TaskSubmissionItem | null) {
  reviewScore.value = submission?.score ?? null;
  teacherComment.value = submission?.teacher_comment || '';
}

function resetBatchEditor() {
  batchReviewScore.value = null;
  batchTeacherComment.value = '';
}

function applyFocusFromRoute() {
  const focus = String(route.query.focus || '');
  if (focus === 'pending_review') {
    onlyPendingSubmissions.value = true;
    focusHintMessage.value = '已切换到“待评”快捷视图：当前仅显示待评作品。';
    return;
  }
  if (focus === 'pending_submit') {
    onlyPendingSubmissions.value = false;
    focusHintMessage.value = '已切换到“未交”快捷视图：当前页展示已提交作品，可结合课堂任务卡继续追踪未交进度。';
    return;
  }
  focusHintMessage.value = '';
}

function resetFilters() {
  onlyPendingSubmissions.value = true;
  selectedClassName.value = '';
  focusHintMessage.value = '';
}

function clearBatchSelection() {
  selectedSubmissionIds.value = [];
  resetBatchEditor();
  tableRef.value?.clearSelection();
}

function revokePreviewUrl() {
  if (!previewUrl.value) {
    return;
  }
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

function resetPreviewState() {
  revokePreviewUrl();
  previewKind.value = 'unsupported';
  previewText.value = '';
  previewTitle.value = '';
  isPreviewLoading.value = false;
  previewLoadingFileId.value = null;
}

function revokeGradingPreviewUrl() {
  if (!gradingPreviewUrl.value) {
    return;
  }
  URL.revokeObjectURL(gradingPreviewUrl.value);
  gradingPreviewUrl.value = '';
}

function resetGradingPreviewState() {
  revokeGradingPreviewUrl();
  gradingPreviewFileId.value = null;
  gradingPreviewKind.value = 'unsupported';
  gradingPreviewText.value = '';
  isGradingPreviewLoading.value = false;
}

function pickDefaultPreviewFile(submission: TaskSubmissionItem | null) {
  if (!submission?.files.length) {
    return null;
  }
  return submission.files.find((file) => isFilePreviewable(file)) || submission.files[0];
}

function pickSubmission(preferredId: number | null) {
  const items = filteredItems.value;
  if (!items.length) {
    return null;
  }
  if (preferredId !== null) {
    const matched = items.find((item) => item.submission_id === preferredId);
    if (matched) {
      return matched;
    }
  }
  return items[0];
}

function syncSelectedSubmission(preferredId: number | null = selectedSubmissionId.value) {
  const nextSelected = pickSubmission(preferredId);
  selectedSubmissionId.value = nextSelected?.submission_id || null;
  hydrateEditor(nextSelected);
}

function selectSubmission(submissionId: number) {
  selectedSubmissionId.value = submissionId;
  hydrateEditor(
    taskData.value?.items.find((item) => item.submission_id === submissionId) || null
  );
}

function findRelativeSubmissionId(direction: ReviewSequenceDirection) {
  if (selectedSubmissionIndex.value < 0) {
    return null;
  }
  const nextIndex =
    direction === 'previous' ? selectedSubmissionIndex.value - 1 : selectedSubmissionIndex.value + 1;
  return filteredItems.value[nextIndex]?.submission_id || null;
}

function pickSubmissionIdAfterSave(currentSubmissionId: number) {
  const index = filteredItems.value.findIndex((item) => item.submission_id === currentSubmissionId);
  if (index === -1) {
    return null;
  }

  for (let nextIndex = index + 1; nextIndex < filteredItems.value.length; nextIndex += 1) {
    if (filteredItems.value[nextIndex]?.status !== 'reviewed') {
      return filteredItems.value[nextIndex].submission_id;
    }
  }

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    if (filteredItems.value[previousIndex]?.status !== 'reviewed') {
      return filteredItems.value[previousIndex].submission_id;
    }
  }

  return (
    filteredItems.value[index + 1]?.submission_id ||
    filteredItems.value[index - 1]?.submission_id ||
    null
  );
}

function moveToRelativeSubmission(direction: ReviewSequenceDirection) {
  const nextSubmissionId = findRelativeSubmissionId(direction);
  if (nextSubmissionId !== null) {
    selectSubmission(nextSubmissionId);
  }
}

function openGradingWorkspace(submissionId: number | null = selectedSubmissionId.value) {
  if (submissionId !== null) {
    selectSubmission(submissionId);
  }
  if (!selectedSubmission.value) {
    ElMessage.warning('请先选择一条学生作品');
    return;
  }
  gradingDialogVisible.value = true;
}

function handleCurrentChange(row: TaskSubmissionItem | undefined) {
  if (row) {
    selectSubmission(row.submission_id);
  }
}

function handleRowClick(row: TaskSubmissionItem) {
  selectSubmission(row.submission_id);
}

function handleSelectionChange(rows: TaskSubmissionItem[]) {
  selectedSubmissionIds.value = rows.map((row) => row.submission_id);
}

function getDownloadFileName(contentDisposition: string | null, fallbackName: string) {
  if (!contentDisposition) {
    return fallbackName;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallbackName;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

function detectPreviewKind(file: TaskSubmissionFile, blob: Blob): PreviewKind {
  const ext = file.ext.toLowerCase();
  const mediaType = blob.type || file.mime_type || '';

  if (ext === 'pdf' || mediaType.includes('pdf')) {
    return 'pdf';
  }
  if (mediaType.startsWith('image/') || ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(ext)) {
    return 'image';
  }
  if (mediaType.startsWith('text/') || ['md', 'txt'].includes(ext)) {
    return 'text';
  }
  return 'unsupported';
}

async function loadGradingPreview(file: TaskSubmissionFile | null) {
  if (!file) {
    resetGradingPreviewState();
    return;
  }

  gradingPreviewFileId.value = file.id;
  gradingPreviewKind.value = 'unsupported';
  gradingPreviewText.value = '';
  revokeGradingPreviewUrl();

  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    return;
  }

  if (!isFilePreviewable(file)) {
    return;
  }

  isGradingPreviewLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, authStore.token);
    const blob = await response.blob();
    const nextKind = detectPreviewKind(file, blob);
    gradingPreviewKind.value = nextKind;

    if (nextKind === 'text') {
      gradingPreviewText.value = await blob.text();
      return;
    }

    gradingPreviewUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载评分预览失败';
  } finally {
    isGradingPreviewLoading.value = false;
  }
}

async function syncGradingPreview() {
  const submission = selectedSubmission.value;
  const preferredFile =
    submission?.files.find((file) => file.id === gradingPreviewFileId.value) ||
    pickDefaultPreviewFile(submission);
  await loadGradingPreview(preferredFile || null);
}

async function loadTaskDetail(preferredSelectedId: number | null = selectedSubmissionId.value) {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    taskData.value = await apiGet<TaskDetailPayload>(
      `/submissions/teacher/task/${route.params.taskId}`,
      authStore.token
    );
    syncSelectedSubmission(preferredSelectedId);

    await nextTick();
    clearBatchSelection();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载任务评分页失败';
  } finally {
    isLoading.value = false;
  }
}

async function saveReview() {
  if (!selectedSubmission.value || !authStore.token) {
    return;
  }

  if (!hasReviewContent(reviewScore.value, teacherComment.value)) {
    errorMessage.value = '请填写评分或教师评语后再保存';
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';
  const currentSubmissionId = selectedSubmission.value.submission_id;
  const nextSubmissionId = pickSubmissionIdAfterSave(currentSubmissionId);
  const shouldKeepCurrentSubmissionVisible =
    onlyPendingSubmissions.value && nextSubmissionId === null;

  try {
    await apiPost(
      `/submissions/${currentSubmissionId}/score`,
      {
        score: reviewScore.value,
        teacher_comment: teacherComment.value.trim() || null,
      },
      authStore.token
    );
    if (shouldKeepCurrentSubmissionVisible) {
      onlyPendingSubmissions.value = false;
    }

    ElMessage.success(
      shouldKeepCurrentSubmissionVisible
        ? '评分已保存，已切换为全部作品'
        : '评分已保存'
    );
    await loadTaskDetail(
      shouldKeepCurrentSubmissionVisible ? currentSubmissionId : nextSubmissionId ?? currentSubmissionId
    );

    if (gradingDialogVisible.value) {
      if (selectedSubmission.value) {
        await syncGradingPreview();
      } else {
        gradingDialogVisible.value = false;
        ElMessage.success('当前筛选列表已经全部评分完成');
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存评分失败';
  } finally {
    isSaving.value = false;
  }
}

async function saveBatchReview() {
  if (!authStore.token || selectedSubmissionCount.value === 0) {
    return;
  }

  if (!hasReviewContent(batchReviewScore.value, batchTeacherComment.value)) {
    errorMessage.value = '请填写统一分数或统一评语后再批量保存';
    return;
  }

  isBatchSaving.value = true;
  errorMessage.value = '';
  const targetCount = selectedSubmissionCount.value;

  try {
    const payload = await apiPost<BatchScoreResponse>(
      '/submissions/batch-score',
      {
        submission_ids: selectedSubmissionIds.value,
        score: batchReviewScore.value,
        teacher_comment: batchTeacherComment.value.trim() || null,
      },
      authStore.token
    );
    ElMessage.success(`已完成 ${payload.updated_count || targetCount} 份作品评分`);
    await loadTaskDetail();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '批量评分失败';
  } finally {
    isBatchSaving.value = false;
  }
}

async function downloadBatchFiles() {
  if (!authStore.token || selectedSubmissionCount.value === 0) {
    return;
  }

  isBatchDownloading.value = true;
  errorMessage.value = '';
  const targetCount = selectedSubmissionCount.value;

  try {
    const response = await apiPostBlob(
      '/submissions/files/batch-download',
      {
        submission_ids: selectedSubmissionIds.value,
      },
      authStore.token
    );
    const blob = await response.blob();
    triggerBrowserDownload(
      blob,
      getDownloadFileName(response.headers.get('content-disposition'), `selected-submissions-${targetCount}.zip`)
    );
    ElMessage.success(`已开始下载 ${targetCount} 份作品的附件压缩包`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '批量下载附件失败';
  } finally {
    isBatchDownloading.value = false;
  }
}

async function previewFile(file: TaskSubmissionFile) {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    return;
  }

  previewDialogVisible.value = true;
  previewTitle.value = file.name;
  previewKind.value = 'unsupported';
  previewText.value = '';
  revokePreviewUrl();
  isPreviewLoading.value = true;
  previewLoadingFileId.value = file.id;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=inline`, authStore.token);
    const blob = await response.blob();
    const nextKind = detectPreviewKind(file, blob);
    previewKind.value = nextKind;

    if (nextKind === 'text') {
      previewText.value = await blob.text();
      return;
    }

    previewUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    previewDialogVisible.value = false;
    errorMessage.value = error instanceof Error ? error.message : '附件预览失败';
  } finally {
    isPreviewLoading.value = false;
    previewLoadingFileId.value = null;
  }
}

async function downloadFile(file: TaskSubmissionFile) {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    return;
  }

  downloadLoadingFileId.value = file.id;
  errorMessage.value = '';

  try {
    const response = await apiGetBlob(`/submissions/files/${file.id}?disposition=attachment`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '附件下载失败';
  } finally {
    downloadLoadingFileId.value = null;
  }
}

watch(
  () => route.params.taskId,
  () => {
    applyFocusFromRoute();
    void loadTaskDetail();
  }
);

watch(
  () => route.query.focus,
  () => {
    applyFocusFromRoute();
  }
);

watch(classOptions, (options) => {
  if (selectedClassName.value && !options.includes(selectedClassName.value)) {
    selectedClassName.value = '';
  }
});

watch(
  () => authStore.user?.id,
  () => {
    void loadReviewTemplates();
  },
  { immediate: true }
);

watch(
  reviewTemplates,
  (templates) => {
    const templateIds = new Set(templates.map((template) => template.id));
    if (selectedSingleTemplateId.value && !templateIds.has(selectedSingleTemplateId.value)) {
      selectedSingleTemplateId.value = '';
    }
    if (selectedBatchTemplateId.value && !templateIds.has(selectedBatchTemplateId.value)) {
      selectedBatchTemplateId.value = '';
    }
    if (editingTemplateId.value && !templateIds.has(editingTemplateId.value)) {
      resetTemplateEditor();
    }
  },
  { deep: true }
);

watch([onlyPendingSubmissions, selectedClassName], async () => {
  syncSelectedSubmission();
  await nextTick();
  clearBatchSelection();
});

watch(
  () => gradingDialogVisible.value,
  async (visible) => {
    if (!visible) {
      resetGradingPreviewState();
      return;
    }
    await nextTick();
    await syncGradingPreview();
  }
);

watch(
  () => selectedSubmission.value?.submission_id,
  async () => {
    if (!gradingDialogVisible.value) {
      return;
    }
    await nextTick();
    await syncGradingPreview();
  }
);

onMounted(() => {
  applyFocusFromRoute();
  void loadTaskDetail();
});
onBeforeUnmount(() => {
  resetPreviewState();
  resetGradingPreviewState();
});
</script>

<style scoped>
.toolbar-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-select {
  width: 180px;
}

.filter-label {
  color: var(--ls-muted);
  font-size: 13px;
}

.table-note {
  margin: 4px 0 0;
  color: var(--ls-muted);
  font-size: 12px;
}

.batch-panel {
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid rgba(67, 109, 185, 0.12);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.08), rgba(111, 179, 149, 0.1)),
    rgba(255, 255, 255, 0.9);
}

.batch-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 8px;
}

.batch-title,
.batch-note,
.file-name,
.file-meta {
  margin: 0;
}

.batch-title {
  font-size: 16px;
  font-weight: 700;
}

.batch-note {
  margin-top: 6px;
  color: var(--ls-muted);
  line-height: 1.6;
}

.batch-form {
  margin-top: 14px;
}

.batch-actions {
  display: flex;
  justify-content: flex-end;
}

.template-panel {
  margin: 14px 0 18px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(67, 109, 185, 0.12);
}

.template-panel-header,
.template-manager-header,
.template-card-header,
.template-manager-shell {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.template-panel-header,
.template-manager-header,
.template-card-header {
  align-items: flex-start;
}

.template-panel-title,
.template-panel-note,
.template-manager-title,
.template-manager-note,
.template-card-title,
.template-card-score,
.template-card-comment,
.template-empty-note,
.template-option-score {
  margin: 0;
}

.template-panel-title,
.template-manager-title,
.template-card-title {
  font-size: 15px;
  font-weight: 700;
}

.template-panel-note,
.template-manager-note,
.template-card-score,
.template-empty-note,
.template-option-score {
  margin-top: 4px;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.6;
}

.template-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 14px;
}

.template-select {
  width: 260px;
}

.template-option {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.template-group-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.grade-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grade-chip-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.grade-editor-footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.quick-comment-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.template-manager-shell {
  align-items: flex-start;
}

.template-manager-list,
.template-editor-panel {
  flex: 1;
  min-width: 0;
}

.template-manager-list {
  flex: 1.15;
}

.template-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
  max-height: 60vh;
  overflow: auto;
}

.template-group-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-group-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.template-group-title,
.template-group-note {
  margin: 0;
}

.template-group-title {
  font-size: 14px;
  font-weight: 700;
}

.template-group-note {
  margin-top: 4px;
  color: var(--ls-muted);
  font-size: 12px;
}

.template-card {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(67, 109, 185, 0.12);
  background: rgba(255, 255, 255, 0.88);
}

.template-card-active {
  border-color: rgba(67, 109, 185, 0.32);
  box-shadow: 0 10px 30px rgba(67, 109, 185, 0.08);
}

.template-card-comment {
  margin-top: 10px;
  color: #1f2a44;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.template-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.template-editor-panel {
  padding: 18px;
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.08), rgba(111, 179, 149, 0.1)),
    rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(67, 109, 185, 0.12);
}

.template-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.grading-dialog-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  width: 100%;
}

.grading-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
  gap: 18px;
  min-height: calc(100vh - 120px);
}

.grading-preview-panel,
.grading-sidebar {
  min-width: 0;
}

.grading-preview-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.grading-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.grading-file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0;
}

.grading-file-card {
  width: calc(50% - 5px);
  padding: 12px 14px;
  border: 1px solid rgba(67, 109, 185, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.grading-file-card:hover {
  border-color: rgba(67, 109, 185, 0.28);
  box-shadow: 0 10px 24px rgba(67, 109, 185, 0.08);
  transform: translateY(-1px);
}

.grading-file-card-active {
  border-color: rgba(67, 109, 185, 0.42);
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.08), rgba(111, 179, 149, 0.08)),
    rgba(255, 255, 255, 0.98);
}

.grading-file-name,
.grading-file-meta {
  display: block;
}

.grading-file-name {
  font-weight: 700;
  color: #1f2a44;
  word-break: break-word;
}

.grading-file-meta {
  margin-top: 4px;
  color: var(--ls-muted);
  font-size: 12px;
  line-height: 1.5;
}

.grading-preview-stage {
  min-height: 55vh;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(67, 109, 185, 0.14);
  background:
    radial-gradient(circle at top left, rgba(67, 109, 185, 0.08), transparent 45%),
    rgba(255, 255, 255, 0.96);
}

.grading-preview-fallback {
  min-height: 40vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  text-align: center;
  color: var(--ls-muted);
}

.grading-sidebar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
}

.student-card {
  padding: 16px;
  border-radius: 18px;
  background: rgba(67, 109, 185, 0.08);
}

.content-block h3 {
  margin: 0 0 10px;
}

.content-block :deep(.rich-text-content),
.content-block p {
  color: var(--ls-muted);
}

.file-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px dashed var(--ls-border);
}

.file-item:last-child {
  border-bottom: none;
}

.file-main {
  min-width: 0;
  flex: 1;
}

.file-name {
  font-weight: 600;
  word-break: break-all;
}

.file-meta {
  margin-top: 4px;
  color: var(--ls-muted);
  font-size: 12px;
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.preview-shell {
  min-height: 360px;
}

.preview-frame {
  width: 100%;
  min-height: 70vh;
  border: none;
  border-radius: 16px;
  background: #fff;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  border-radius: 16px;
}

.preview-text {
  margin: 0;
  max-height: 70vh;
  overflow: auto;
  padding: 16px;
  border-radius: 16px;
  background: rgba(67, 109, 185, 0.08);
  color: #1f2a44;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.save-button {
  width: 100%;
}

@media (max-width: 900px) {
  .batch-header,
  .toolbar-row,
  .template-panel-header,
  .template-manager-header,
  .template-card-header,
  .template-group-header,
  .template-manager-shell,
  .grade-editor-footer,
  .grading-dialog-header,
  .grading-sidebar-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-select,
  .template-select {
    width: 100%;
  }

  .grade-chip-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .grading-shell {
    grid-template-columns: 1fr;
  }

  .grading-file-card {
    width: 100%;
  }

  .batch-actions {
    justify-content: stretch;
  }

  .template-editor-actions {
    justify-content: stretch;
  }

  .batch-actions :deep(.el-button) {
    width: 100%;
  }

  .template-editor-actions :deep(.el-button) {
    width: 100%;
  }

  .file-item {
    flex-direction: column;
    align-items: stretch;
  }

  .file-actions {
    justify-content: flex-start;
  }
}
</style>
