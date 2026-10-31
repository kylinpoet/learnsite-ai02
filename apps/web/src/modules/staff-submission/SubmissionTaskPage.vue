<template>
  <div class="page-stack">
    <StaffPageHead
      :sub="taskMeta"
      :title="taskData?.task.title || `活动 ${route.params.taskId}`"
    >
      <template #actions>
        <n-button :loading="isLoading" text @click="loadTaskDetail()">刷新</n-button>
        <n-button secondary @click="router.push('/staff/submissions')">返回作品总览</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />
    <n-alert
      v-if="focusHintMessage"
      :closable="false"
      :title="focusHintMessage"
      :type="focusAlertType"
    />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="10" animated />
    </SaPanel>

    <div v-else-if="taskData" class="page-stack">
      <StaffStatStrip :items="statItems" />

      <div class="content-split">
        <SaPanel>
          <template #header>
            <div class="toolbar-row">
              <div class="info-row">
                <span>学生提交列表</span>
                <n-tag round type="info">
                  最近提交 {{ formatDateTime(taskData.summary.latest_submitted_at) }}
                </n-tag>
              </div>
              <div class="filter-row">
                <span class="filter-label">仅看未评阅作品</span>
                <n-switch v-model:value="onlyPendingSubmissions" />
                <n-select
                  v-model:value="selectedClassName"
                  :options="classOptions.map((option) => ({ label: option, value: option }))"
                  class="filter-select"
                  clearable
                  placeholder="筛选班级"
                />
                <n-button v-if="selectedClassName || !onlyPendingSubmissions" text @click="resetFilters">
                  恢复默认
                </n-button>
                <n-tag round type="success">
                  当前显示 {{ filteredItems.length }} / {{ taskData.items.length }}
                </n-tag>
              </div>
            </div>
          </template>

          <n-empty v-if="!taskData.items.length" description="这个活动还没有学生提交作品。" />

          <n-empty v-else-if="!filteredItems.length" description="当前筛选条件下没有作品。" />

          <template v-else>

            <SaDataTable
              v-model:checked-row-keys="selectedSubmissionIds"
              :data="filteredItems"
              :row-class-name="rowClassName"
              :scroll-x="768"
              row-key="submission_id"
              stripe
              @row-click="handleRowClick"
              @selection-change="handleSelectionChange"
            >
              <SaTableColumn type="selection" width="48" />
              <SaTableColumn label="学生" min-width="160">
                <template #default="{ row }">
                  <div>
                    <strong>{{ row.student_name }}</strong>
                    <p class="table-note">{{ row.student_no }} · {{ row.class_name }}</p>
                  </div>
                </template>
              </SaTableColumn>
              <SaTableColumn label="状态" min-width="110">
                <template #default="{ row }">
                  <n-space :wrap="true">
                    <n-tag :type="statusTagType(row.status)" round>{{ statusLabel(row.status) }}</n-tag>
                    <n-tag v-if="row.is_recommended" round type="success">推荐</n-tag>
                  </n-space>
                </template>
              </SaTableColumn>
              <SaTableColumn label="得分" min-width="90">
                <template #default="{ row }">
                  {{ formatScoreText(row.score) }}
                </template>
              </SaTableColumn>
              <SaTableColumn label="附件" min-width="90" prop="file_count" />
              <SaTableColumn label="最近提交" min-width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.updated_at) }}
                </template>
              </SaTableColumn>
              <SaTableColumn label="操作" fixed="right" min-width="100">
                <template #default="{ row }">
                  <n-button text type="primary" @click.stop="openGradingWorkspace(row.submission_id)">
                    进入评分
                  </n-button>
                </template>
              </SaTableColumn>
            </SaDataTable>

            <details class="batch-details">
              <summary class="batch-details__summary">
                批量评分与打包下载
                <span class="batch-details__hint">先勾选作品，再统一套用等级与评语</span>
              </summary>
            <section class="batch-panel">
              <div class="batch-header">
                <div>
                  <p class="batch-title">批量操作</p>
                  <p class="batch-note">
                    已选择 {{ selectedSubmissionCount }} 份作品。适合课堂统一批改，也支持将所选附件一次性打包为 ZIP 下载。
                  </p>
                </div>
                <n-space :wrap="true">
                  <n-button
                    :disabled="selectedSubmissionCount === 0"
                    :loading="isBatchDownloading"
                    secondary
                    type="success"
                    @click="downloadBatchFiles"
                  >
                    打包下载附件
                  </n-button>
                  <n-button :disabled="selectedSubmissionCount === 0" text @click="clearBatchSelection">
                    清空选择
                  </n-button>
                </n-space>
              </div>

              <n-spin :show="isTemplateLoading">
                <section class="template-panel">
                  <div class="template-panel-header">
                    <div>
                      <p class="template-panel-title">批量评分模板</p>
                      <p class="template-panel-note">
                        常用分数和评语会按教师账号云端同步，也支持按分组管理和手动排序。
                      </p>
                    </div>
                    <n-button text @click="openTemplateManager('batch')">管理模板</n-button>
                  </div>

                  <div class="template-toolbar">
                    <n-select
                      v-model:value="selectedBatchTemplateId"
                      :options="reviewTemplateSelectOptions"
                      class="template-select"
                      clearable
                      filterable
                      placeholder="选择批量评分模板"
                    />
                    <n-button
                      :disabled="!selectedBatchTemplateId"
                      secondary
                      type="primary"
                      @click="applySelectedTemplate('batch', 'replace')"
                    >
                      套用模板
                    </n-button>
                    <n-button
                      :disabled="!selectedBatchTemplateId"
                      secondary
                      @click="applySelectedTemplate('batch', 'insert')"
                    >
                      仅插入评语
                    </n-button>
                    <n-button secondary @click="saveCurrentAsTemplate('batch')">保存当前为模板</n-button>
                  </div>

                  <div v-if="quickTemplateGroups.length" class="template-group-stack">
                    <div
                      v-for="group in quickTemplateGroups"
                      :key="`batch-quick-${group.key || 'ungrouped'}`"
                      class="quick-comment-row"
                    >
                      <span class="filter-label">{{ group.label }}</span>
                      <n-button
                        v-for="template in group.templates"
                        :key="`batch-${template.id}`"
                        text
                        type="primary"
                        @click="applyTemplate(template.id, 'batch', 'insert')"
                      >
                        {{ template.title }}
                      </n-button>
                    </div>
                  </div>

                  <p v-else class="template-empty-note">
                    还没有评分模板，可先填写一次评分内容，再点“保存当前为模板”。
                  </p>
                </section>
              </n-spin>

              <n-form class="batch-form" label-placement="top">
                <div class="batch-form-grid">
                  <n-form-item label="统一等级评分">
                    <div class="grade-editor">
                      <div class="grade-chip-grid">
                        <n-button
                          v-for="option in scoreGradeOptions"
                          :key="`batch-grade-${option.grade}`"
                          :secondary="batchReviewScore !== option.score"
                          :type="batchReviewScore === option.score ? 'primary' : 'default'"
                          @click="setTargetScore('batch', option.score)"
                        >
                          {{ option.grade }} · {{ option.score }}
                        </n-button>
                      </div>
                      <div class="grade-editor-footer">
                        <n-tag round type="success">{{ formatScoreHelperText(batchReviewScore) }}</n-tag>
                        <n-button text @click="setTargetScore('batch', null)">清空分数</n-button>
                      </div>
                    </div>
                  </n-form-item>
                  <n-form-item label="统一评语">
                    <n-input
                      v-model:value="batchTeacherComment"
                      :autosize="{ minRows: 2, maxRows: 4 }"
                      :maxlength="1000"
                      placeholder="例如：整体完成度较高，再补充一个更贴近生活的应用案例。"
                      show-count
                      type="textarea"
                    />
                  </n-form-item>
                </div>
              </n-form>

              <div class="batch-actions">
                <n-button
                  :disabled="selectedSubmissionCount === 0"
                  :loading="isBatchSaving"
                  type="primary"
                  @click="saveBatchReview"
                >
                  批量保存评分
                </n-button>
              </div>
            </section>
            </details>
          </template>
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="template-panel-header">
              <span>单个评分面板</span>
              <n-button v-if="selectedSubmission" text @click="openGradingWorkspace()">
                大窗口评分
              </n-button>
            </div>
          </template>

          <n-empty v-if="!selectedSubmission" description="请选择一条学生作品。" />

          <div v-else class="page-stack">
            <div class="student-card">
              <div class="info-row">
                <strong>{{ selectedSubmission.student_name }}</strong>
                <n-space :wrap="true">
                  <n-tag :type="statusTagType(selectedSubmission.status)" round>
                    {{ statusLabel(selectedSubmission.status) }}
                  </n-tag>
                  <n-tag v-if="selectedSubmission.is_recommended" round type="success">推荐作品</n-tag>
                </n-space>
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
              <n-empty v-if="!selectedSubmission.files.length" description="暂无附件" />
              <div v-else class="stack-list">
                <article
                  v-for="file in selectedSubmission.files"
                  :key="file.id"
                  :class="['file-item', { 'file-item-active': gradingPreviewFileId === file.id }]"
                  @click="loadGradingPreview(file)"
                >
                  <div class="file-main">
                    <p class="file-name">{{ file.name }}</p>
                    <p class="file-meta">{{ file.ext.toUpperCase() }} · {{ file.size_kb }} KB</p>
                  </div>
                  <div class="file-actions">
                    <n-tag round type="info">{{ file.role }}</n-tag>
                    <n-button
                      v-if="isFilePreviewable(file)"
                      :loading="isGradingPreviewLoading && gradingPreviewFileId === file.id"
                      text
                      type="primary"
                      @click.stop="loadGradingPreview(file)"
                    >
                      面板预览
                    </n-button>
                    <n-button
                      :loading="downloadLoadingFileId === file.id"
                      text
                      type="success"
                      @click.stop="downloadFile(file)"
                    >
                      下载
                    </n-button>
                  </div>
                </article>
              </div>
              <n-spin v-if="selectedSubmission.files.length" :show="isGradingPreviewLoading">
                <div class="grading-preview-stage single-grading-preview-stage">
                  <iframe
                    v-if="!isGradingPreviewLoading && gradingPreviewKind === 'pdf' && gradingPreviewUrl"
                    :src="gradingPreviewUrl"
                    class="preview-frame"
                    title="单个评分面板附件预览"
                  />
                  <img
                    v-else-if="!isGradingPreviewLoading && gradingPreviewKind === 'image' && gradingPreviewUrl"
                    :src="gradingPreviewUrl"
                    alt="单个评分面板附件预览"
                    class="preview-image"
                  />
                  <pre
                    v-else-if="!isGradingPreviewLoading && gradingPreviewKind === 'text'"
                    class="preview-text"
                  >{{ gradingPreviewText }}</pre>
                  <div v-else-if="gradingPreviewFile" class="grading-preview-fallback">
                    <p>当前附件暂不支持直接展示，请直接下载查看。</p>
                    <n-button type="success" @click="downloadFile(gradingPreviewFile)">
                      下载当前附件
                    </n-button>
                  </div>
                  <n-empty
                    v-else-if="!isGradingPreviewLoading"
                    description="请选择一个附件进行查看"
                  />
                </div>
              </n-spin>
            </div>

            <n-spin :show="isTemplateLoading">
              <section class="template-panel">
                <div class="template-panel-header">
                  <div>
                    <p class="template-panel-title">单份评分模板</p>
                    <p class="template-panel-note">
                      模板会按分组显示；套用模板会同步带入推荐等级分和评语，快捷插入只会追加评语内容。
                    </p>
                  </div>
                  <n-button text @click="openTemplateManager('single')">管理模板</n-button>
                </div>

                <div class="template-toolbar">
                  <n-select
                    v-model:value="selectedSingleTemplateId"
                    :options="reviewTemplateSelectOptions"
                    class="template-select"
                    clearable
                    filterable
                    placeholder="选择单份评分模板"
                  />
                  <n-button
                    :disabled="!selectedSingleTemplateId"
                    secondary
                    type="primary"
                    @click="applySelectedTemplate('single', 'replace')"
                  >
                    套用模板
                  </n-button>
                  <n-button
                    :disabled="!selectedSingleTemplateId"
                    secondary
                    @click="applySelectedTemplate('single', 'insert')"
                  >
                    仅插入评语
                  </n-button>
                  <n-button secondary @click="saveCurrentAsTemplate('single')">保存当前为模板</n-button>
                </div>

                <div v-if="quickTemplateGroups.length" class="template-group-stack">
                  <div
                    v-for="group in quickTemplateGroups"
                    :key="`single-quick-${group.key || 'ungrouped'}`"
                    class="quick-comment-row"
                  >
                    <span class="filter-label">{{ group.label }}</span>
                    <n-button
                      v-for="template in group.templates"
                      :key="`single-${template.id}`"
                      text
                      type="primary"
                      @click="applyTemplate(template.id, 'single', 'insert')"
                    >
                      {{ template.title }}
                    </n-button>
                  </div>
                </div>

                <p v-else class="template-empty-note">
                  还没有评分模板，可先填写一次评分内容，再点“保存当前为模板”。
                </p>
              </section>
            </n-spin>

            <n-form label-placement="top">
              <n-form-item label="教师等级评分">
                <div class="grade-editor">
                  <div class="grade-chip-grid">
                    <n-button
                      v-for="option in scoreGradeOptions"
                      :key="`single-grade-${option.grade}`"
                      :disabled="isSaving"
                      :secondary="reviewScore !== option.score"
                      :type="reviewScore === option.score ? 'primary' : 'default'"
                      @click="handleSingleScoreSelect(option.score)"
                    >
                      {{ option.grade }} · {{ option.score }}
                    </n-button>
                  </div>
                  <div class="grade-editor-footer">
                    <n-tag round type="success">{{ formatScoreHelperText(reviewScore) }}</n-tag>
                    <n-button :disabled="isSaving" text @click="setTargetScore('single', null)">
                      清空分数
                    </n-button>
                  </div>
                </div>
              </n-form-item>
              <n-form-item label="教师评语">
                <n-input
                  v-model:value="teacherComment"
                  :autosize="{ minRows: 4, maxRows: 8 }"
                  :maxlength="1000"
                  placeholder="写下本次作品的优点、修改建议或课堂反馈。"
                  show-count
                  type="textarea"
                />
              </n-form-item>
            </n-form>

            <p class="section-note">点击上方等级会立即保存并自动切换到下一位学生；只修改评语时请使用下方保存按钮。</p>

            <n-button
              :loading="isSaving"
              block
              class="save-button"
              type="primary"
              @click="saveReview"
            >
              {{ reviewSubmitButtonText }}
            </n-button>
          </div>
        </SaPanel>
      </div>

      <RecommendedWorksShowcase
        :items="taskData.recommended_showcase.items"
        :token="authStore.token || ''"
        description="本活动下被评为 G 级的作品会自动进入这里，教师也可以直接查看推荐展示效果。"
        empty-description="当前活动还没有推荐作品"
        title="教师端推荐作品展示"
      />
    </div>

    <n-modal
      v-model:show="gradingDialogVisible"
      preset="card"
      style="width: 96vw; max-width: 1480px"
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
          <n-space :wrap="true">
            <n-tag v-if="selectedSubmissionProgressText" round type="info">
              当前进度 {{ selectedSubmissionProgressText }}
            </n-tag>
            <n-button :disabled="!hasPreviousSubmission" secondary @click="moveToRelativeSubmission('previous')">
              上一份
            </n-button>
            <n-button :disabled="!hasNextSubmission" secondary @click="moveToRelativeSubmission('next')">
              下一份
            </n-button>
          </n-space>
        </div>
      </template>

      <div v-if="selectedSubmission" class="grading-shell">
        <section class="grading-preview-panel">
          <div class="student-card">
            <div class="info-row">
              <strong>{{ selectedSubmission.student_name }}</strong>
              <n-space :wrap="true">
                <n-tag :type="statusTagType(selectedSubmission.status)" round>
                  {{ statusLabel(selectedSubmission.status) }}
                </n-tag>
                <n-tag v-if="selectedSubmission.is_recommended" round type="success">推荐作品</n-tag>
              </n-space>
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
              <n-tag round type="success">
                共 {{ selectedSubmission.files.length }} 个附件
              </n-tag>
            </div>

            <n-empty v-if="!selectedSubmission.files.length" description="暂无附件" />

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

              <n-spin :show="isGradingPreviewLoading">
                <div class="grading-preview-stage">
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
                    <n-button type="success" @click="downloadFile(gradingPreviewFile)">
                      下载当前附件
                    </n-button>
                  </div>
                  <n-empty
                    v-else-if="!isGradingPreviewLoading"
                    description="请选择一个附件进行查看"
                  />
                </div>
              </n-spin>
            </template>
          </div>
        </section>

        <aside class="grading-sidebar">
          <n-spin :show="isTemplateLoading">
            <section class="template-panel">
              <div class="template-panel-header">
                <div>
                  <p class="template-panel-title">单份评分模板</p>
                  <p class="template-panel-note">
                    套用模板会同步带入推荐等级和评语，快捷插入只会追加评语内容。
                  </p>
                </div>
                <n-button text @click="openTemplateManager('single')">管理模板</n-button>
              </div>

              <div class="template-toolbar">
                <n-select
                  v-model:value="selectedSingleTemplateId"
                  :options="reviewTemplateSelectOptions"
                  class="template-select"
                  clearable
                  filterable
                  placeholder="选择单份评分模板"
                />
                <n-button
                  :disabled="!selectedSingleTemplateId"
                  secondary
                  type="primary"
                  @click="applySelectedTemplate('single', 'replace')"
                >
                  套用模板
                </n-button>
                <n-button
                  :disabled="!selectedSingleTemplateId"
                  secondary
                  @click="applySelectedTemplate('single', 'insert')"
                >
                  仅插入评语
                </n-button>
              </div>
            </section>
          </n-spin>

          <n-form label-placement="top">
            <n-form-item label="教师等级评分">
              <div class="grade-editor">
                <div class="grade-chip-grid">
                  <n-button
                    v-for="option in scoreGradeOptions"
                    :key="`dialog-grade-${option.grade}`"
                    :disabled="isSaving"
                    :secondary="reviewScore !== option.score"
                    :type="reviewScore === option.score ? 'primary' : 'default'"
                    @click="handleSingleScoreSelect(option.score)"
                  >
                    {{ option.grade }} · {{ option.score }}
                  </n-button>
                </div>
                <div class="grade-editor-footer">
                  <n-tag round type="success">{{ formatScoreHelperText(reviewScore) }}</n-tag>
                  <n-button :disabled="isSaving" text @click="setTargetScore('single', null)">
                    清空分数
                  </n-button>
                </div>
              </div>
            </n-form-item>
            <n-form-item label="教师评语">
              <n-input
                v-model:value="teacherComment"
                :autosize="{ minRows: 10, maxRows: 16 }"
                :maxlength="1000"
                placeholder="写下本次作品的优点、修改建议或课堂反馈。"
                show-count
                type="textarea"
              />
            </n-form-item>
          </n-form>

          <p class="section-note">点击上方等级会立即保存并自动切换到下一位学生；只修改评语时请使用下方保存按钮。</p>

          <div class="grading-sidebar-actions">
            <n-button :disabled="!hasPreviousSubmission" secondary @click="moveToRelativeSubmission('previous')">
              上一份
            </n-button>
            <n-button
              :loading="isSaving"
              type="primary"
              @click="saveReview"
            >
              {{ reviewSubmitButtonText }}
            </n-button>
          </div>
        </aside>
      </div>
    </n-modal>

    <n-modal
      v-model:show="templateDialogVisible"
      preset="card"
      style="width: min(980px, 94vw)"
      title="评分模板管理"
    >
      <n-spin :show="isTemplateLoading">
        <div class="template-manager-shell">
          <section class="template-manager-list">
            <div class="template-manager-header">
              <div>
                <p class="template-manager-title">我的评分模板</p>
                <p class="template-manager-note">
                  模板按教师账号云端同步。你可以按分组整理，并在组内调整显示顺序。
                </p>
              </div>
              <n-space :wrap="true">
                <n-button secondary @click="startCreateTemplate('blank')">新建空白模板</n-button>
                <n-button secondary type="primary" @click="startCreateTemplate(templateDialogTarget)">
                  从当前评分生成
                </n-button>
              </n-space>
            </div>

            <n-empty
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
                        <n-tag round type="info">{{ group.label }}</n-tag>
                        <n-tag round type="success">排序 {{ template.sort_order }}</n-tag>
                        <p class="template-card-score">
                          {{ template.score === null ? '仅评语模板' : `建议等级：${formatScoreText(template.score)}` }}
                        </p>
                      </div>
                    </div>
                    <n-space :wrap="true">
                      <n-button
                        :disabled="!canMoveTemplate(template.id, 'up') || isTemplateSaving"
                        :loading="movingTemplateId === template.id && isTemplateSaving"
                        text
                        @click="moveTemplate(template.id, 'up')"
                      >
                        上移
                      </n-button>
                      <n-button
                        :disabled="!canMoveTemplate(template.id, 'down') || isTemplateSaving"
                        :loading="movingTemplateId === template.id && isTemplateSaving"
                        text
                        @click="moveTemplate(template.id, 'down')"
                      >
                        下移
                      </n-button>
                      <n-button text type="primary" @click="applyTemplate(template.id, 'single', 'replace')">
                        套用到单份
                      </n-button>
                      <n-button text type="success" @click="applyTemplate(template.id, 'batch', 'replace')">
                        套用到批量
                      </n-button>
                      <n-button text @click="startEditTemplate(template.id)">编辑</n-button>
                      <n-button text type="error" @click="deleteTemplate(template.id)">删除</n-button>
                    </n-space>
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
              <n-button
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
              </n-button>
            </div>

            <n-form label-placement="top">
              <n-form-item label="模板名称">
                <n-input
                  v-model:value="templateForm.title"
                  :maxlength="30"
                  placeholder="例如：课堂展示完成度高"
                  show-count
                />
              </n-form-item>
              <n-form-item label="模板分组">
                <n-select
                  v-model:value="templateForm.group_name"
                  :options="groupNameOptions.map((groupName) => ({ label: groupName, value: groupName }))"
                  clearable
                  filterable
                  placeholder="例如：课堂表现 / 改进建议"
                  style="width: 100%"
                  tag
                />
              </n-form-item>
              <n-form-item label="排序值">
                <n-input-number
                  v-model:value="templateForm.sort_order"
                  :max="9999"
                  :min="0"
                  button-placement="right"
                  placeholder="留空则自动排到组内末尾"
                  style="width: 100%"
                />
              </n-form-item>
              <n-form-item label="推荐等级分">
                <div class="grade-editor">
                  <div class="grade-chip-grid">
                    <n-button
                      v-for="option in scoreGradeOptions"
                      :key="`template-grade-${option.grade}`"
                      :secondary="templateForm.score !== option.score"
                      :type="templateForm.score === option.score ? 'primary' : 'default'"
                      @click="templateForm.score = option.score"
                    >
                      {{ option.grade }} · {{ option.score }}
                    </n-button>
                  </div>
                  <div class="grade-editor-footer">
                    <n-tag round type="success">{{ formatScoreHelperText(templateForm.score) }}</n-tag>
                    <n-button text @click="templateForm.score = null">清空分数</n-button>
                  </div>
                  <n-input-number
                    v-model:value="templateForm.score"
                    :max="maxReviewScore"
                    :min="0"
                    button-placement="right"
                    placeholder="可留空，支持 0-120"
                    style="width: 100%"
                  />
                </div>
              </n-form-item>
              <n-form-item label="模板评语">
                <n-input
                  v-model:value="templateForm.comment"
                  :autosize="{ minRows: 6, maxRows: 10 }"
                  :maxlength="1000"
                  placeholder="写入可复用的教师评语，支持一键套用或快捷插入。"
                  show-count
                  type="textarea"
                />
              </n-form-item>
            </n-form>

            <div class="template-editor-actions">
              <n-button secondary @click="resetTemplateEditor">重置</n-button>
              <n-button :loading="isTemplateSaving" type="primary" @click="saveTemplate">
                {{ editingTemplateId ? '保存模板修改' : '保存为新模板' }}
              </n-button>
            </div>
          </section>
        </div>
      </n-spin>
    </n-modal>

  </div>
</template>

<script setup lang="ts">
import type { SelectOption } from 'naive-ui';
import {
  NAlert,
  NButton,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSkeleton,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPostBlob, apiPut } from '@/api/http';
import RecommendedWorksShowcase from '@/components/RecommendedWorksShowcase.vue';
import RichTextContent from '@/components/RichTextContent.vue';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { formatDateTime } from '@/utils/datetime';
import { triggerBrowserDownload } from '@/utils/download';
import { detectPreviewKind, type PreviewKind } from '@/utils/filePreview';
import type { TaskSubmissionFile, RecommendedSubmissionItem } from '@/types/submission';

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

const taskMeta = computed(() => {
  if (!taskData.value) {
    return '正在加载课程信息';
  }
  const course = taskData.value.task.course;
  return `${course.title} · ${course.unit_title} · ${course.lesson_title}`;
});

const statItems = computed<StaffStatItem[]>(() => {
  const summary = taskData.value?.summary;
  return [
    { label: '待评阅', value: summary?.pending_count ?? 0, unit: '份', note: '未填写分数或评语的作品' },
    { label: '已评阅', value: summary?.reviewed_count ?? 0, unit: ` / ${summary?.submission_count ?? 0}`, note: '学生仍可在批改前重新提交' },
    { label: '提交', value: summary?.submission_count ?? 0, unit: '份', note: `最近提交 ${formatDateTime(summary?.latest_submitted_at ?? null)}` },
    { label: '平均分', value: summary?.average_score ?? '--', note: '仅统计已打分作品' },
  ];
});

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
const reviewTemplateSelectOptions = computed<SelectOption[]>(() =>
  groupedReviewTemplates.value.map((group) => ({
    type: 'group' as const,
    key: group.key || 'ungrouped',
    label: group.label,
    children: group.templates.map((template) => ({
      label: `${template.title} · #${template.sort_order}${
        template.score === null ? ' · 仅评语' : ` · 建议等级 ${formatScoreText(template.score)}`
      }`,
      value: template.id,
    })),
  }))
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

function rowClassName(row: TaskSubmissionItem) {
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
    focusHintMessage.value = '已切换到“未交”快捷视图：当前页展示已提交作品，可结合课堂活动卡继续追踪未交进度。';
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
    errorMessage.value = error instanceof Error ? error.message : '加载活动评分页失败';
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
      return;
    }
    await nextTick();
    await syncGradingPreview();
  }
);

watch(
  () => selectedSubmission.value?.submission_id,
  async () => {
    await nextTick();
    await syncGradingPreview();
  }
);

onMounted(() => {
  applyFocusFromRoute();
  void loadTaskDetail();
});
onBeforeUnmount(() => {
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
  width: 100%;
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

.content-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  gap: var(--sf-section-gap, 20px);
  align-items: start;
}

.batch-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(0, 16fr);
  gap: 12px;
}

.sa-table :deep(tr.current-row) > td {
  background: rgba(67, 109, 185, 0.08);
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

.batch-details {
  border-top: 1px solid var(--sf-line-soft, rgba(30, 60, 45, 0.1));
}

.batch-details__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 12px 16px;
  color: var(--sf-ink, var(--ls-ink));
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  list-style: none;
}

.batch-details__summary::-webkit-details-marker {
  display: none;
}

.batch-details__summary::before {
  content: '＋';
  color: var(--sf-muted, var(--ls-muted));
  font-weight: 400;
}

.batch-details[open] .batch-details__summary::before {
  content: '－';
}

.batch-details__summary:hover {
  background: var(--sf-surface-2, rgba(30, 60, 45, 0.03));
}

.batch-details__hint {
  color: var(--sf-muted, var(--ls-muted));
  font-size: 12px;
  font-weight: 400;
}

.batch-panel {
  padding: 4px 16px 16px;
  border: 0;
  border-radius: 0;
  background: none;
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
  background: var(--ls-panel-soft);
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

.template-panel-header {
  width: 100%;
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
  background: var(--ls-card);
}

.template-card-active {
  border-color: rgba(67, 109, 185, 0.32);
  box-shadow: 0 10px 30px rgba(67, 109, 185, 0.08);
}

.template-card-comment {
  margin-top: 10px;
  color: var(--ls-text);
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
    var(--ls-card);
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
  background: var(--ls-card);
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
    var(--ls-card);
}

.grading-file-name,
.grading-file-meta {
  display: block;
}

.grading-file-name {
  font-weight: 700;
  color: var(--ls-ink);
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
    var(--ls-card);
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
  background: var(--ls-primary-soft);
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
  padding: 14px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  border-bottom: 1px dashed var(--ls-border);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.file-item:hover {
  border-color: rgba(67, 109, 185, 0.22);
  background: var(--ls-nav-hover-bg);
}

.file-item-active {
  border-color: rgba(67, 109, 185, 0.35);
  background:
    linear-gradient(135deg, rgba(67, 109, 185, 0.08), rgba(111, 179, 149, 0.08)),
    var(--ls-card);
  box-shadow: 0 8px 22px rgba(67, 109, 185, 0.08);
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

.single-grading-preview-stage {
  margin-top: 12px;
  min-height: 320px;
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
  background: var(--ls-panel-soft);
  color: var(--ls-text);
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

  .content-split,
  .batch-form-grid {
    grid-template-columns: 1fr;
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

  .batch-actions :deep(.n-button) {
    width: 100%;
  }

  .template-editor-actions :deep(.n-button) {
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
