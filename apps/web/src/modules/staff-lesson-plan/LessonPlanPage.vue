<template>
  <div class="page-stack lesson-plan-page">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">教师学案管理</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          这里支持教师按课程体系创建学案、配置任务并发布。发布完成后，可直接进入“上课中控”，
          把这份学案推送给班级，形成完整教学闭环。
        </p>
      </div>
      <el-space wrap>
        <el-button type="primary" @click="openCreateDialog">新建学案</el-button>
        <el-button plain @click="router.push('/staff/curriculum')">查看课程体系</el-button>
        <el-button plain @click="selectPlan(plans[0]?.id || null)">回到最新学案</el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="8" />
        </el-card>
      </template>

      <template #default>
        <div class="metric-grid">
          <article class="metric-tile">
            <p class="metric-label">学案总数</p>
            <p class="metric-value">{{ plans.length }}</p>
            <p class="metric-note">包含草稿、已发布和已开课学案</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">任务总数</p>
            <p class="metric-value">{{ totalTaskCount }}</p>
            <p class="metric-note">阅读、上传、编程任务合计</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">待完成进度</p>
            <p class="metric-value">{{ totalPendingCount }}</p>
            <p class="metric-note">只会在开课后产生</p>
          </article>
          <article class="metric-tile">
            <p class="metric-label">已完成进度</p>
            <p class="metric-value">{{ totalCompletedCount }}</p>
            <p class="metric-note">便于教师快速判断班级推进情况</p>
          </article>
        </div>

        <el-card class="soft-card">
          <template #header>学案列表</template>
          <el-empty v-if="!plans.length" description="暂无学案数据" />
          <el-table v-else :data="plans" stripe @row-click="handleRowClick">
            <el-table-column label="学案标题" min-width="240" prop="title" />
            <el-table-column label="状态" min-width="110">
              <template #default="{ row }">
                <el-tag round :type="planStatusType(row.status)">{{ planStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="绑定课次" min-width="190">
              <template #default="{ row }">
                {{ row.lesson.title }}
              </template>
            </el-table-column>
            <el-table-column label="所属单元" min-width="220">
              <template #default="{ row }">
                {{ row.lesson.unit_title }}
              </template>
            </el-table-column>
            <el-table-column label="发布时间" min-width="120" prop="assigned_date" />
            <el-table-column label="任务数" min-width="88" prop="task_count" />
            <el-table-column label="待完成" min-width="88">
              <template #default="{ row }">
                {{ row.progress.pending_count }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="220">
              <template #default="{ row }">
                <el-space wrap>
                  <el-button link type="primary" @click.stop="openEditDialog(row.id)">查看</el-button>
                  <el-button
                    link
                    type="warning"
                    :disabled="!canEditPlan(row)"
                    @click.stop="openEditDialog(row.id)"
                  >
                    定位编辑区
                  </el-button>
                  <el-button
                    v-if="row.status === 'draft'"
                    link
                    type="success"
                    @click.stop="publishPlan(row.id)"
                  >
                    发布
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    :disabled="!canEditPlan(row)"
                    :loading="deletingPlanId === row.id"
                    @click.stop="deletePlan(row.id)"
                  >
                    删除
                  </el-button>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="selectedPlanDetail" class="soft-card">
          <template #header>
            <div class="info-row">
              <span>当前选中学案</span>
              <el-tag round :type="planStatusType(selectedPlanDetail.status)">
                {{ planStatusLabel(selectedPlanDetail.status) }}
              </el-tag>
            </div>
          </template>

          <div class="stack-list">
            <div class="info-row">
              <strong>{{ selectedPlanDetail.title }}</strong>
              <el-space wrap>
                <el-button
                  plain
                  type="warning"
                  :disabled="!canEditPlan(selectedPlanDetail)"
                  @click="openEditDialog(selectedPlanDetail.id)"
                >
                  重置编辑区
                </el-button>
                <el-button
                  v-if="selectedPlanDetail.status === 'draft'"
                  :loading="publishingPlanId === selectedPlanDetail.id"
                  type="success"
                  @click="publishPlan(selectedPlanDetail.id)"
                >
                  发布学案
                </el-button>
                <el-button
                  plain
                  type="danger"
                  :disabled="!canEditPlan(selectedPlanDetail)"
                  :loading="deletingPlanId === selectedPlanDetail.id"
                  @click="deletePlan(selectedPlanDetail.id)"
                >
                  删除学案
                </el-button>
                <el-button
                  :disabled="selectedPlanDetail.status === 'draft'"
                  type="primary"
                  @click="goToClassroom(selectedPlanDetail.id)"
                >
                  去开课
                </el-button>
              </el-space>
            </div>

            <p class="section-note">
              {{ selectedPlanDetail.lesson.book_name }} / {{ selectedPlanDetail.lesson.unit_title }} /
              {{ selectedPlanDetail.lesson.title }}
            </p>

            <el-space wrap>
              <el-tag round>发布日期 {{ selectedPlanDetail.assigned_date }}</el-tag>
              <el-tag round type="success">任务 {{ selectedPlanDetail.tasks.length }}</el-tag>
              <el-tag round type="warning">待完成 {{ selectedPlanDetail.progress.pending_count }}</el-tag>
              <el-tag round type="info">已完成 {{ selectedPlanDetail.progress.completed_count }}</el-tag>
            </el-space>

            <el-alert
              :closable="false"
              description="选中学案后，正文与任务会自动同步到下方编辑区，可以直接修改并保存。"
              title="当前学案已进入页内编辑模式"
              type="info"
            />
          </div>
        </el-card>
      </template>
    </el-skeleton>

    <el-card v-if="editorVisible" id="plan-editor-card" class="soft-card plan-editor-card">
      <template #header>
        <div class="info-row">
          <div class="plan-editor-card__header">
            <strong>{{ editingPlanId ? '编辑学案' : '新建学案' }}</strong>
            <p class="section-note">
              {{
                editingPlanId
                  ? '可以直接在当前页面修改学案正文、任务与资源，保存后立即同步。'
                  : '先绑定课次，再补充正文与任务，保存后即可继续发布或开课。'
              }}
            </p>
          </div>
          <el-space wrap>
            <el-tag round type="info">{{ editingPlanId ? '编辑中' : '新建中' }}</el-tag>
            <el-tag v-if="editingPlanId && selectedPlanDetail" round>
              {{ selectedPlanDetail.lesson.title }}
            </el-tag>
            <el-tag v-if="hasUnsavedChanges" round type="warning">未保存</el-tag>
          </el-space>
        </div>
      </template>
      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :md="12" :sm="24">
            <el-form-item label="学案标题">
              <el-input v-model="planForm.title" maxlength="120" placeholder="例如：八下第一单元 第4课 智能感知体验" />
            </el-form-item>
          </el-col>
          <el-col :md="6" :sm="12">
            <el-form-item label="发布日期">
              <el-date-picker
                v-model="planForm.assigned_date"
                class="full-width"
                type="date"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :md="6" :sm="12">
            <el-form-item label="保存状态">
              <el-select v-model="planForm.status" class="full-width">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
                <el-option :disabled="!editingPlanId" label="上课中" value="active" />
                <el-option :disabled="!editingPlanId" label="已完成" value="completed" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="绑定课次">
          <el-select v-model="planForm.lesson_id" class="full-width" filterable placeholder="请选择课次">
            <el-option-group
              v-for="group in lessonOptions"
              :key="group.label"
              :label="group.label"
            >
              <el-option
                v-for="lesson in group.lessons"
                :key="lesson.id"
                :label="lesson.label"
                :value="lesson.id"
              />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-tabs v-model="editorActiveTab" class="editor-tabs">
          <el-tab-pane label="学案正文" name="content">
            <div class="dialog-task-head">
              <div>
                <h3>学案正文</h3>
                <p class="section-note">支持可视化富文本与 HTML 源码双模式编辑。</p>
              </div>
              <el-space wrap>
                <el-radio-group v-model="planForm.content_mode" size="small">
                  <el-radio-button label="visual">可视化</el-radio-button>
                  <el-radio-button label="source">HTML 源码</el-radio-button>
                </el-radio-group>
                <el-button :loading="generatingPlanHtml" plain @click="generatePlanHtmlDraft">AI 生成初稿</el-button>
              </el-space>
            </div>
            <div v-if="planForm.content_mode === 'visual'" class="content-mode-panel">
              <RichTextEditor
                v-model="planForm.content"
                :min-height="320"
                placeholder="填写学案导读、课堂流程、重点提示、参考链接等。"
              />
            </div>
            <div v-else class="content-mode-panel">
              <el-input
                v-model="planForm.content"
                :autosize="{ minRows: 14, maxRows: 24 }"
                type="textarea"
                placeholder="<h2>学案标题</h2><p>这里可以直接编辑 HTML 源码。</p>"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane label="任务配置" name="tasks">
            <div class="dialog-task-head">
              <div>
                <h3>任务配置</h3>
                <p class="section-note">支持网页任务、讨论任务、图文任务、数据提交任务等多类型编排。每个任务会作为独立 Tab 页面编辑。</p>
              </div>
              <el-space wrap>
                <el-button plain @click="addTaskRow">新增空白任务</el-button>
                <el-dropdown trigger="click" @command="handleTaskTemplateCommand">
                  <el-button type="primary">从模板新增</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="preset in taskTemplatePresetOptions"
                        :key="preset.id"
                        :command="{ kind: 'preset', id: preset.id }"
                      >
                        <div class="task-template-option">
                          <strong>{{ preset.label }}</strong>
                          <span>{{ preset.description }}</span>
                        </div>
                      </el-dropdown-item>
                      <el-dropdown-item v-if="customTaskTemplatesLoading" divided disabled>
                        <div class="task-template-option">
                          <strong>自定义模板</strong>
                          <span>正在加载教师自定义模板...</span>
                        </div>
                      </el-dropdown-item>
                      <template v-else-if="customTaskTemplates.length">
                        <el-dropdown-item disabled divided>
                          <div class="task-template-option">
                            <strong>自定义模板</strong>
                            <span>保存过的任务模板会出现在这里，可直接复用。</span>
                          </div>
                        </el-dropdown-item>
                        <template v-if="dropdownPinnedCustomTaskTemplates.length">
                          <el-dropdown-item disabled>
                            <div class="task-template-option task-template-option--group">
                              <strong>已置顶</strong>
                              <span>{{ dropdownPinnedCustomTaskTemplates.length }} 个模板</span>
                            </div>
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-for="templateItem in dropdownPinnedCustomTaskTemplates"
                            :key="`pinned-${templateItem.id}`"
                            :command="{ kind: 'custom', id: templateItem.id }"
                          >
                            <div class="task-template-option">
                              <strong>{{ templateItem.title }}</strong>
                              <span>
                                置顶 · {{ taskTypeLabel(templateItem.task_type) }} · {{ templateItem.task_title }}
                              </span>
                            </div>
                          </el-dropdown-item>
                        </template>
                        <template v-if="dropdownRecentCustomTaskTemplates.length">
                          <el-dropdown-item disabled>
                            <div class="task-template-option task-template-option--group">
                              <strong>最近使用</strong>
                              <span>优先显示最近 6 个常用模板</span>
                            </div>
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-for="templateItem in dropdownRecentCustomTaskTemplates"
                            :key="`recent-${templateItem.id}`"
                            :command="{ kind: 'custom', id: templateItem.id }"
                          >
                            <div class="task-template-option">
                              <strong>{{ templateItem.title }}</strong>
                              <span>
                                最近使用 · {{ taskTypeLabel(templateItem.task_type) }} · {{ templateItem.task_title }}
                              </span>
                            </div>
                          </el-dropdown-item>
                        </template>
                        <template v-for="group in customTaskTemplateDropdownGroups" :key="group.key || 'ungrouped'">
                          <el-dropdown-item disabled>
                            <div class="task-template-option task-template-option--group">
                              <strong>{{ group.label }}</strong>
                              <span>{{ group.items.length }} 个模板</span>
                            </div>
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-for="templateItem in group.items"
                            :key="templateItem.id"
                            :command="{ kind: 'custom', id: templateItem.id }"
                          >
                            <div class="task-template-option">
                              <strong>{{ templateItem.title }}</strong>
                              <span>
                                {{ taskTypeLabel(templateItem.task_type) }} · 预设任务名：{{ templateItem.task_title }}
                              </span>
                            </div>
                          </el-dropdown-item>
                        </template>
                      </template>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button plain @click="openTaskTemplateLibrary">模板库</el-button>
              </el-space>
            </div>

            <el-tabs v-model="activeTaskEditorKey" class="task-editor-tabs" type="card">
              <el-tab-pane
                v-for="(task, index) in planForm.tasks"
                :key="task.key"
                :name="task.key"
                lazy
              >
                <template #label>
                  <div
                    class="task-tab-label"
                    :class="{
                      'task-tab-label-dragging': draggingTaskKey === task.key,
                      'task-tab-label-target': dragOverTaskKey === task.key && draggingTaskKey !== task.key,
                    }"
                    draggable="true"
                    @dragstart="handleTaskTabDragStart(task.key, $event)"
                    @dragover="handleTaskTabDragOver(task.key, $event)"
                    @drop="handleTaskTabDrop(task.key, $event)"
                    @dragend="handleTaskTabDragEnd"
                  >
                    <div class="task-tab-label__meta">
                      <strong>{{ taskEditorTabTitle(task, index) }}</strong>
                      <span>{{ taskTypeLabel(task.task_type) }}</span>
                    </div>
                    <span
                      v-if="planForm.tasks.length > 1"
                      class="task-tab-close"
                      draggable="false"
                      role="button"
                      tabindex="0"
                      aria-label="关闭任务标签"
                      @click.stop="removeTaskRow(task.key)"
                      @keydown.enter.prevent.stop="removeTaskRow(task.key)"
                      @keydown.space.prevent.stop="removeTaskRow(task.key)"
                    >
                      ×
                    </span>
                  </div>
                </template>

                <article class="task-editor-card">
                  <div class="task-card-toolbar">
                    <el-space wrap>
                      <strong>任务 {{ index + 1 }}</strong>
                      <el-tag round type="info">{{ taskTypeLabel(task.task_type) }}</el-tag>
                      <el-tag round type="success">顺序 {{ index + 1 }} / {{ planForm.tasks.length }}</el-tag>
                    </el-space>
                    <el-space wrap>
                      <el-button plain size="small" :disabled="index === 0" @click="moveTaskRow(task.key, -1)">
                        前移
                      </el-button>
                      <el-button
                        plain
                        size="small"
                        :disabled="index === planForm.tasks.length - 1"
                        @click="moveTaskRow(task.key, 1)"
                      >
                        后移
                      </el-button>
                      <el-button plain size="small" @click="copyTaskRow(task.key)">
                        复制
                      </el-button>
                      <el-button plain size="small" @click="openSaveTaskTemplateDialog(task)">
                        {{ taskTemplateButtonLabel(task) }}
                      </el-button>
                      <el-button
                        :disabled="planForm.tasks.length === 1"
                        link
                        type="danger"
                        @click="removeTaskRow(task.key)"
                      >
                        删除
                      </el-button>
                    </el-space>
                  </div>

                  <el-row :gutter="16">
                    <el-col :md="10" :sm="24">
                      <el-form-item label="任务标题">
                        <el-input v-model="task.title" maxlength="120" placeholder="例如：活动一、信息检索与表达" />
                      </el-form-item>
                    </el-col>
                    <el-col :md="8" :sm="12">
                      <el-form-item label="任务类型">
                        <el-select v-model="task.task_type" class="full-width" @change="handleTaskTypeChange(task)">
                          <el-option label="阅读任务" value="reading" />
                          <el-option label="图文任务" value="rich_text" />
                          <el-option label="上传作品" value="upload_image" />
                          <el-option label="编程任务" value="programming" />
                          <el-option label="网页任务" value="web_page" />
                          <el-option label="讨论任务" value="discussion" />
                          <el-option label="数据提交任务" value="data_submit" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :md="6" :sm="12">
                      <el-form-item label="任务要求">
                        <el-switch v-model="task.is_required" active-text="必做" inactive-text="选做" />
                      </el-form-item>
                    </el-col>
                  </el-row>

                  <el-form-item label="提交方式">
                    <el-radio-group v-model="task.submission_scope" :disabled="isTaskScopeFixed(task.task_type)">
                      <el-radio-button label="individual">个人提交</el-radio-button>
                      <el-radio-button label="group">小组共同提交</el-radio-button>
                    </el-radio-group>
                    <p class="section-note">
                      {{ isTaskScopeFixed(task.task_type) ? '当前任务类型固定为个人提交，用于保证课堂流程和数据结构稳定。' : '可按需要切换为个人提交或小组共同提交。' }}
                    </p>
                  </el-form-item>

                  <section v-if="task.task_type === 'discussion'" class="task-type-panel">
                    <el-form-item label="讨论主题">
                      <el-input
                        v-model="task.config.topic"
                        maxlength="200"
                        placeholder="例如：你认为 AI 在课堂学习中的最大帮助是什么？"
                      />
                    </el-form-item>
                  </section>

                  <section v-if="task.task_type === 'web_page'" class="task-type-panel">
                    <TaskWebPageEditor
                      :task="task"
                      :can-upload="canUploadTaskAssets(task)"
                      :generation-loading="generatingTaskHtmlKey === taskAssetGenerationKey(task, 'web')"
                      :get-task-asset-entry-path="getTaskAssetEntryPath"
                      :set-task-asset-entry-path="setTaskAssetEntryPath"
                      :get-task-html-source="getTaskHtmlSource"
                      :set-task-html-source="setTaskHtmlSource"
                      :task-asset-input-id="taskAssetInputId"
                      :open-task-asset-picker="openTaskAssetPicker"
                      :handle-task-asset-change="handleTaskAssetChange"
                      :open-task-html-prompt-dialog="openTaskHtmlPromptDialog"
                      :upload-task-html-source="uploadTaskHtmlSource"
                      :task-preview-feedback="taskPreviewFeedback"
                      :task-preview-display-detail="taskPreviewDisplayDetail"
                      :task-preview-detail-toggle-label="taskPreviewDetailToggleLabel"
                      :has-task-inline-preview="hasTaskInlinePreview"
                      :task-inline-preview-srcdoc="taskInlinePreviewSrcdoc"
                      :task-asset-preview-url="taskAssetPreviewUrl"
                      :task-preview-frame-key="taskPreviewFrameKey"
                      :toggle-task-preview-detail="toggleTaskPreviewDetail"
                      :copy-task-preview-detail="copyTaskPreviewDetail"
                      :retry-task-preview="retryTaskPreview"
                      :handle-task-preview-load="handleTaskPreviewLoad"
                      :handle-task-preview-error="handleTaskPreviewError"
                    />
                  </section>

                  <section v-if="task.task_type === 'data_submit'" class="task-type-panel">
                    <TaskDataSubmitEditor
                      :task="task"
                      :can-upload="canUploadTaskAssets(task)"
                      :description-generating="generatingTaskHtmlKey === taskDescriptionGenerationKey(task)"
                      :submit-generation-loading="generatingTaskHtmlKey === taskAssetGenerationKey(task, 'data_submit_form')"
                      :visualization-generation-loading="generatingTaskHtmlKey === taskAssetGenerationKey(task, 'data_submit_visualization')"
                      :copy-task-data-submit-endpoint="copyTaskDataSubmitEndpoint"
                      :task-data-submit-prompt-api-path="taskDataSubmitPromptApiPath"
                      :task-data-submit-prompt-records-path="taskDataSubmitPromptRecordsPath"
                      :task-data-submit-endpoint-tag-type="taskDataSubmitEndpointTagType"
                      :task-data-submit-endpoint-status-label="taskDataSubmitEndpointStatusLabel"
                      :task-data-submit-alert-title="taskDataSubmitAlertTitle"
                      :task-data-submit-alert-description="taskDataSubmitAlertDescription"
                      :generate-task-description-draft="generateTaskDescriptionDraft"
                      :get-task-asset-entry-path="getTaskAssetEntryPath"
                      :set-task-asset-entry-path="setTaskAssetEntryPath"
                      :get-task-html-source="getTaskHtmlSource"
                      :set-task-html-source="setTaskHtmlSource"
                      :task-asset-input-id="taskAssetInputId"
                      :open-task-asset-picker="openTaskAssetPicker"
                      :handle-task-asset-change="handleTaskAssetChange"
                      :open-task-html-prompt-dialog="openTaskHtmlPromptDialog"
                      :upload-task-html-source="uploadTaskHtmlSource"
                      :task-preview-feedback="taskPreviewFeedback"
                      :task-preview-display-detail="taskPreviewDisplayDetail"
                      :task-preview-detail-toggle-label="taskPreviewDetailToggleLabel"
                      :has-task-inline-preview="hasTaskInlinePreview"
                      :task-inline-preview-srcdoc="taskInlinePreviewSrcdoc"
                      :task-asset-preview-url="taskAssetPreviewUrl"
                      :task-preview-frame-key="taskPreviewFrameKey"
                      :toggle-task-preview-detail="toggleTaskPreviewDetail"
                      :copy-task-preview-detail="copyTaskPreviewDetail"
                      :retry-task-preview="retryTaskPreview"
                      :handle-task-preview-load="handleTaskPreviewLoad"
                      :handle-task-preview-error="handleTaskPreviewError"
                    />
                  </section>

                  <TaskDescriptionEditor
                    v-if="task.task_type !== 'data_submit'"
                    :task="task"
                    :generating="generatingTaskHtmlKey === taskDescriptionGenerationKey(task)"
                    :generate-task-description-draft="generateTaskDescriptionDraft"
                  />
                </article>
              </el-tab-pane>
            </el-tabs>
          </el-tab-pane>
        </el-tabs>

      </el-form>

      <div class="plan-editor-actions">
        <el-space wrap>
          <el-button @click="cancelPlanEditing">
            {{ editingPlanId ? '重置修改' : '取消新建' }}
          </el-button>
          <el-button :loading="isSavingPlan" type="primary" @click="savePlan">
            {{ editingPlanId ? '保存修改' : '创建学案' }}
          </el-button>
        </el-space>
      </div>
    </el-card>

    <TaskHtmlPromptDialog
      v-model="taskHtmlPromptDialogVisible"
      v-model:dialog-state="taskHtmlPromptDialogState"
      :title="taskHtmlPromptDialogTitle"
      :task="taskHtmlPromptDialogTask"
      :current-templates="currentTaskHtmlPromptTemplates"
      :selected-template-description="selectedTaskHtmlPromptTemplateDescription"
      :preview-text="taskHtmlPromptPreview"
      :is-generating="generatingTaskHtmlKey === currentTaskHtmlPromptGenerationKey"
      :submit-api-path="taskHtmlPromptDialogSubmitApiPath"
      :records-api-path="taskHtmlPromptDialogRecordsApiPath"
      @submit="submitTaskHtmlPromptDialog"
    />

    <TaskTemplateSaveDialog
      v-model="taskTemplateDialogVisible"
      v-model:form="taskTemplateForm"
      :title="taskTemplateDialogTitle"
      :source-task="taskTemplateSourceTask"
      :custom-templates="customTaskTemplates"
      :group-options="taskTemplateGroupOptions"
      :saving="savingTaskTemplate"
      :save-button-label="taskTemplateSaveButtonLabel"
      :task-type-label="taskTypeLabel"
      @mode-change="handleTaskTemplateModeChange"
      @target-change="handleTaskTemplateTargetChange"
      @save="saveCurrentTaskAsTemplate"
    />

    <TaskTemplateLibraryDialog
      v-model="taskTemplateLibraryVisible"
      v-model:filter="taskTemplateLibraryFilter"
      v-model:batch-group-name="taskTemplateBatchGroupName"
      :loading="customTaskTemplatesLoading"
      :templates="customTaskTemplates"
      :filtered-templates="filteredCustomTaskTemplates"
      :pinned-templates="pinnedCustomTaskTemplates"
      :recent-templates="recentCustomTaskTemplates"
      :group-sections="filteredTaskTemplateGroupSections"
      :group-options="taskTemplateGroupOptions"
      :selected-ids="selectedCustomTaskTemplateIds"
      :selected-filtered-count="selectedFilteredCustomTaskTemplateCount"
      :all-filtered-selected="allFilteredCustomTaskTemplatesSelected"
      :batch-busy="taskTemplateBatchBusy"
      :batch-updating-groups="batchUpdatingTaskTemplateGroups"
      :batch-updating-pins="batchUpdatingTaskTemplatePins"
      :sorting-task-templates="sortingTaskTemplates"
      :deleting-task-template-id="deletingTaskTemplateId"
      :dragging-task-template-id="draggingTaskTemplateId"
      :drag-over-task-template-id="dragOverTaskTemplateId"
      :drag-over-task-template-group-key="dragOverTaskTemplateGroupKey"
      :task-template-group-drop-key="taskTemplateGroupDropKey"
      :task-template-id-list="taskTemplateIdList"
      :task-type-label="taskTypeLabel"
      :format-task-template-updated-at="formatTaskTemplateUpdatedAt"
      :rich-text-to-excerpt="richTextToExcerpt"
      :is-template-selected="isCustomTaskTemplateSelected"
      :set-template-selected="setCustomTaskTemplateSelected"
      :toggle-selection-for-list="toggleCustomTaskTemplateSelectionForList"
      :are-all-selected="areAllCustomTaskTemplatesSelected"
      :select-all-filtered="selectAllFilteredCustomTaskTemplates"
      :clear-selected="clearSelectedCustomTaskTemplates"
      :apply-batch-group="applyBatchTaskTemplateGroup"
      :clear-batch-group="clearBatchTaskTemplateGroup"
      :apply-batch-pinned="applyBatchTaskTemplatePinned"
      :handle-group-drag-over="handleTaskTemplateGroupDragOver"
      :handle-group-drop="handleTaskTemplateGroupDrop"
      :handle-drag-over="handleTaskTemplateDragOver"
      :handle-drop="handleTaskTemplateDrop"
      :handle-drag-start="handleTaskTemplateDragStart"
      :handle-drag-end="handleTaskTemplateDragEnd"
      :can-move="canMoveCustomTaskTemplate"
      :move-template="moveCustomTaskTemplate"
      :apply-template="applyCustomTaskTemplate"
      :edit-template="editCustomTaskTemplate"
      :toggle-pinned="toggleCustomTaskTemplatePinned"
      :delete-template="deleteCustomTaskTemplate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';
import { richTextToExcerpt } from '@/utils/richText';
import TaskDataSubmitEditor from './components/TaskDataSubmitEditor.vue';
import TaskDescriptionEditor from './components/TaskDescriptionEditor.vue';
import TaskHtmlPromptDialog from './components/TaskHtmlPromptDialog.vue';
import TaskTemplateLibraryDialog from './components/TaskTemplateLibraryDialog.vue';
import TaskTemplateSaveDialog from './components/TaskTemplateSaveDialog.vue';
import TaskWebPageEditor from './components/TaskWebPageEditor.vue';
import { taskHtmlPromptTemplateOptions, taskTemplatePresetOptions } from './lessonPlan.constants';
import { useLessonPlanEditorState } from './composables/useLessonPlanEditorState';
import { useLessonPlanTaskRows } from './composables/useLessonPlanTaskRows';
import { useTaskPreviewAssets } from './composables/useTaskPreviewAssets';
import { useTaskTemplateLibrary } from './composables/useTaskTemplateLibrary';
import {
  buildDataSubmitFormStarterHtml,
  buildDataSubmitVisualizationStarterHtml,
  buildSuggestedTaskTemplateName,
  buildSuggestedTaskTemplateSummary,
  buildTaskConfigPayload,
  buildTaskTemplateConfigPayload,
  buildWebTaskStarterHtml,
  createTaskFromCustomTemplate as createTaskFromCustomTemplatePreset,
  createTaskFromTemplate as createTaskFromTemplatePreset,
  defaultTaskHtmlPromptTemplateId,
  isTaskScopeFixed,
  normalizeHtmlValue,
  planStatusLabel,
  planStatusType,
  taskAssetGenerationKey,
  taskAssetSlotLabel,
  taskDescriptionGenerationKey,
  taskEditorTabTitle,
  taskTypeLabel,
} from './lessonPlanTask.utils';
import type {
  CustomTaskTemplate,
  CurriculumBook,
  LessonOptionGroup,
  PlanDetail,
  PlanFormTask,
  PlanSummary,
  TaskAssetSlot,
  TaskHtmlPromptBuildOptions,
  TaskHtmlPromptDialogState,
  TaskSlotEditorTab,
  TaskTemplatePresetId,
} from './lessonPlan.types';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function generateTaskEndpointToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildAbsoluteApiUrl(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  const apiRoot = new URL(apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`, window.location.origin);
  if (normalized.startsWith('/')) {
    return new URL(normalized, apiRoot.origin).toString();
  }
  return new URL(normalized.replace(/^\/+/, ''), apiRoot).toString();
}

const plans = ref<PlanSummary[]>([]);
const curriculumBooks = ref<CurriculumBook[]>([]);
const selectedPlanDetail = ref<PlanDetail | null>(null);
const isLoading = ref(true);
const isSavingPlan = ref(false);
const publishingPlanId = ref<number | null>(null);
const deletingPlanId = ref<number | null>(null);
const errorMessage = ref('');
const generatingPlanHtml = ref(false);
const generatingTaskHtmlKey = ref<string | null>(null);
const taskHtmlPromptDialogVisible = ref(false);
const taskHtmlPromptSelections = ref<Record<TaskAssetSlot, string>>({
  web: 'web_interactive_guide',
  data_submit_form: 'data_submit_form_basic',
  data_submit_visualization: 'data_submit_visualization_dashboard',
});
const taskHtmlPromptCustomizations = ref<Record<TaskAssetSlot, string>>({
  web: '',
  data_submit_form: '',
  data_submit_visualization: '',
});
const taskHtmlPromptDialogState = ref<TaskHtmlPromptDialogState>({
  task_key: '',
  slot: 'web',
  template_id: 'web_interactive_guide',
  custom_prompt: '',
});
const reservingTaskIdKeys = ref<string[]>([]);
const reservingTaskIdPromises = new Map<string, Promise<number | null>>();

type TaskIdReservationResponse = {
  task_ids: number[];
};

type AssistantHtmlDraftResponse = {
  reply?: {
    content?: string;
  };
};

const {
  editorVisible,
  editingPlanId,
  editorActiveTab,
  activeTaskEditorKey,
  planForm,
  currentEditorSnapshot,
  hasUnsavedChanges,
  normalizeTaskConfigState,
  createEmptyTask,
  duplicateTaskTitle,
  cloneTaskConfigState,
  clearLessonPlanDraft,
  persistCurrentEditorDraft,
  clearDraftAutoSaveTimer,
  scheduleDraftAutoSave,
  markEditorCommitted,
  resetPlanForm: resetPlanFormState,
  activateBlankPlanEditor: activateBlankPlanEditorState,
  activatePlanEditor: activatePlanEditorState,
  cancelPlanEditing: cancelPlanEditingState,
} = useLessonPlanEditorState({
  normalizeTaskSubmissionScope,
  generateTaskEndpointToken,
  ensureDataSubmitTaskConfig,
});

const {
  draggingTaskKey,
  dragOverTaskKey,
  appendTaskToEditor,
  addTaskRow,
  handleTaskTabDragStart,
  handleTaskTabDragOver,
  handleTaskTabDrop,
  handleTaskTabDragEnd,
  moveTaskRow,
  copyTaskRow,
  removeTaskRow,
} = useLessonPlanTaskRows({
  planForm,
  editorActiveTab,
  activeTaskEditorKey,
  createEmptyTask,
  cloneTaskConfigState,
  duplicateTaskTitle,
  ensureDataSubmitTaskConfig,
  ensureTaskIdReserved,
  seedTaskTypeStarterSources,
  onTaskCopyWithReset: () => {
    ElMessage.warning('已复制任务结构，但资源文件和接口地址不会自动复用，请按需重新上传或生成。');
  },
  onTaskCopied: () => {
    ElMessage.success('任务已复制');
  },
});

const {
  customTaskTemplates,
  customTaskTemplatesLoading,
  taskTemplateDialogVisible,
  taskTemplateLibraryVisible,
  savingTaskTemplate,
  deletingTaskTemplateId,
  sortingTaskTemplates,
  draggingTaskTemplateId,
  dragOverTaskTemplateId,
  dragOverTaskTemplateGroupKey,
  selectedCustomTaskTemplateIds,
  taskTemplateBatchGroupName,
  batchUpdatingTaskTemplateGroups,
  batchUpdatingTaskTemplatePins,
  taskTemplateLibraryFilter,
  taskTemplateForm,
  taskTemplateSourceTask,
  taskTemplateDialogTitle,
  taskTemplateSaveButtonLabel,
  taskTemplateGroupOptions,
  filteredCustomTaskTemplates,
  filteredTaskTemplateGroupSections,
  selectedFilteredCustomTaskTemplateCount,
  taskTemplateBatchBusy,
  allFilteredCustomTaskTemplatesSelected,
  pinnedCustomTaskTemplates,
  recentCustomTaskTemplates,
  dropdownPinnedCustomTaskTemplates,
  dropdownRecentCustomTaskTemplates,
  customTaskTemplateDropdownGroups,
  loadCustomTaskTemplates,
  taskTemplateGroupDropKey,
  taskTemplateIdList,
  isCustomTaskTemplateSelected,
  setCustomTaskTemplateSelected,
  toggleCustomTaskTemplateSelectionForList,
  areAllCustomTaskTemplatesSelected,
  selectAllFilteredCustomTaskTemplates,
  clearSelectedCustomTaskTemplates,
  canMoveCustomTaskTemplate,
  moveCustomTaskTemplate,
  handleTaskTemplateDragStart,
  handleTaskTemplateDragOver,
  handleTaskTemplateDrop,
  handleTaskTemplateGroupDragOver,
  handleTaskTemplateGroupDrop,
  handleTaskTemplateDragEnd,
  applyBatchTaskTemplateGroup,
  clearBatchTaskTemplateGroup,
  applyBatchTaskTemplatePinned,
  taskTemplateButtonLabel,
  formatTaskTemplateUpdatedAt,
  openTaskTemplateLibrary,
  openSaveTaskTemplateDialog,
  handleTaskTemplateModeChange,
  handleTaskTemplateTargetChange,
  saveCurrentTaskAsTemplate,
  applyCustomTaskTemplate,
  editCustomTaskTemplate,
  toggleCustomTaskTemplatePinned,
  deleteCustomTaskTemplate,
  handleTaskTemplateCommand,
} = useTaskTemplateLibrary({
  authToken: computed(() => authStore.token),
  errorMessage,
  planForm,
  createTaskFromTemplate,
  createTaskFromCustomTemplate,
  appendTaskToEditor,
  buildSuggestedTaskTemplateName,
  buildSuggestedTaskTemplateSummary,
  buildTaskTemplateConfigPayload,
  normalizeTaskSubmissionScope,
  normalizeHtmlValue,
  taskTypeLabel,
  isDialogCancelled,
});

const {
  taskAssetInputId,
  openTaskAssetPicker,
  taskPreviewFrameKey,
  taskAssetPreviewUrl,
  hasTaskInlinePreview,
  taskPreviewFeedback,
  taskPreviewDisplayDetail,
  taskPreviewDetailToggleLabel,
  toggleTaskPreviewDetail,
  copyTaskPreviewDetail,
  retryTaskPreview,
  handleTaskPreviewLoad,
  handleTaskPreviewError,
  taskInlinePreviewSrcdoc,
  handleTaskAssetChange,
  uploadTaskHtmlSource,
  generateTaskHtmlAndUpload,
} = useTaskPreviewAssets({
  authToken: computed(() => authStore.token),
  apiBaseUrl,
  errorMessage,
  generatingTaskHtmlKey,
  getTaskAssetEntryPath,
  setTaskAssetEntryPath,
  getTaskHtmlSource,
  setTaskHtmlSource,
  taskAssetGenerationKey,
  buildAbsoluteApiUrl,
  copyPlainText,
  requestHtmlDraft,
  buildTaskHtmlPrompt,
  taskDataSubmitApiPath,
  taskDataSubmitRecordsPath,
  canUploadTaskAssets,
  mergeTaskConfigFromServer,
  revealTaskPreview,
  isTaskPersisted,
});

const selectedPlanId = computed(() => {
  const routePlanId = Number(route.params.planId);
  if (Number.isFinite(routePlanId) && routePlanId > 0) {
    return routePlanId;
  }
  return plans.value[0]?.id || null;
});

const pageTitle = computed(() => selectedPlanDetail.value?.title || '教师学案管理');
const totalTaskCount = computed(() => plans.value.reduce((sum, item) => sum + item.task_count, 0));
const totalPendingCount = computed(() =>
  plans.value.reduce((sum, item) => sum + item.progress.pending_count, 0)
);
const totalCompletedCount = computed(() =>
  plans.value.reduce((sum, item) => sum + item.progress.completed_count, 0)
);
const lessonOptions = computed<LessonOptionGroup[]>(() =>
  curriculumBooks.value.flatMap((book) =>
    book.units.map((unit) => ({
      label: `${book.name} · ${unit.title}`,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        label: `第 ${lesson.lesson_no} 课次 · ${lesson.title}`,
      })),
    }))
  )
);
const taskHtmlPromptDialogTask = computed(
  () => planForm.value.tasks.find((task) => task.key === taskHtmlPromptDialogState.value.task_key) || null
);
const persistedTaskIdSet = computed(() => {
  if (!editingPlanId.value || selectedPlanDetail.value?.id !== editingPlanId.value) {
    return new Set<number>();
  }
  return new Set(selectedPlanDetail.value.tasks.map((task) => task.id));
});
const currentTaskHtmlPromptTemplates = computed(() =>
  taskHtmlPromptTemplateOptions.filter((option) => option.slot === taskHtmlPromptDialogState.value.slot)
);
const selectedTaskHtmlPromptTemplate = computed(
  () =>
    currentTaskHtmlPromptTemplates.value.find((option) => option.id === taskHtmlPromptDialogState.value.template_id) ||
    currentTaskHtmlPromptTemplates.value[0] ||
    null
);
const taskHtmlPromptDialogTitle = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task) {
    return 'AI 网页生成';
  }
  return `${task.title.trim() || taskTypeLabel(task.task_type)} · ${taskAssetSlotLabel(taskHtmlPromptDialogState.value.slot)} AI 生成`;
});
const currentTaskHtmlPromptGenerationKey = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task) {
    return '';
  }
  return taskAssetGenerationKey(task, taskHtmlPromptDialogState.value.slot);
});
const selectedTaskHtmlPromptTemplateDescription = computed(
  () => selectedTaskHtmlPromptTemplate.value?.description || ''
);
const taskHtmlPromptDialogSubmitApiPath = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task || task.task_type !== 'data_submit') {
    return '';
  }
  return taskDataSubmitPromptApiPath(task);
});
const taskHtmlPromptDialogRecordsApiPath = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task || task.task_type !== 'data_submit') {
    return '';
  }
  return taskDataSubmitPromptRecordsPath(task);
});
const taskHtmlPromptPreview = computed(() => {
  const task = taskHtmlPromptDialogTask.value;
  if (!task) {
    return '';
  }
  return buildTaskHtmlPrompt(task, taskHtmlPromptDialogState.value.slot, {
    template_prompt: selectedTaskHtmlPromptTemplate.value?.prompt,
    custom_prompt: taskHtmlPromptDialogState.value.custom_prompt,
  });
});

function nextTemplateSequence(taskType?: string) {
  if (!taskType) {
    return planForm.value.tasks.length + 1;
  }
  return planForm.value.tasks.filter((task) => task.task_type === taskType).length + 1;
}

function createTaskFromTemplate(templateId: TaskTemplatePresetId): PlanFormTask {
  return createTaskFromTemplatePreset(templateId, {
    createEmptyTask,
    nextTemplateSequence,
    normalizeTaskSubmissionScope,
    ensureDataSubmitTaskConfig,
  });
}

function createTaskFromCustomTemplate(
  template: CustomTaskTemplate,
  options?: {
    linkTemplate?: boolean;
  }
): PlanFormTask {
  return createTaskFromCustomTemplatePreset(
    template,
    {
      createEmptyTask,
      normalizeTaskSubmissionScope,
      normalizeTaskConfigState,
      ensureDataSubmitTaskConfig,
    },
    options
  );
}

async function focusPlanEditor() {
  await nextTick();
  const target = document.getElementById('plan-editor-card');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetPlanForm() {
  resetPlanFormState();
  handleTaskTabDragEnd();
}

function activateBlankPlanEditor(options?: { skipDraftRestore?: boolean }) {
  activateBlankPlanEditorState(options);
  handleTaskTabDragEnd();
}

function activatePlanEditor(plan: PlanDetail, options?: { skipDraftRestore?: boolean }) {
  activatePlanEditorState(plan, options);
  handleTaskTabDragEnd();
}

function cancelPlanEditing() {
  cancelPlanEditingState(selectedPlanDetail.value);
  handleTaskTabDragEnd();
}

function isTaskIdReservationPending(task: Pick<PlanFormTask, 'key'>) {
  return reservingTaskIdKeys.value.includes(task.key);
}

function isTaskPersisted(task: Pick<PlanFormTask, 'id'>) {
  return typeof task.id === 'number' && persistedTaskIdSet.value.has(task.id);
}

function canUploadTaskAssets(task: Pick<PlanFormTask, 'id'>) {
  return isTaskPersisted(task);
}

async function ensureTaskIdReserved(task: PlanFormTask) {
  if (task.task_type !== 'data_submit') {
    return task.id;
  }
  if (task.id) {
    ensureDataSubmitTaskConfig(task);
    return task.id;
  }
  if (!authStore.token) {
    return null;
  }

  const existingPromise = reservingTaskIdPromises.get(task.key);
  if (existingPromise) {
    return existingPromise;
  }

  const reservationPromise = (async () => {
    reservingTaskIdKeys.value = Array.from(new Set([...reservingTaskIdKeys.value, task.key]));
    const previousSubmitApiPath = taskDataSubmitApiPath(task);
    const previousRecordsApiPath = taskDataSubmitRecordsPath(task);
    try {
      const response = await apiPost<TaskIdReservationResponse>(
        '/lesson-plans/staff/task-ids/reserve',
        { count: 1 },
        authStore.token
      );
      const reservedId = response.task_ids[0] ?? null;
      if (reservedId) {
        task.id = reservedId;
        ensureDataSubmitTaskConfig(task);
        syncDataSubmitTaskHtmlSources(task, {
          previous_submit_api_path: previousSubmitApiPath,
          previous_records_api_path: previousRecordsApiPath,
          seed_if_empty: true,
        });
      }
      return reservedId;
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成任务接口失败';
      errorMessage.value = message;
      ElMessage.error(message);
      return null;
    } finally {
      reservingTaskIdKeys.value = reservingTaskIdKeys.value.filter((key) => key !== task.key);
      reservingTaskIdPromises.delete(task.key);
    }
  })();

  reservingTaskIdPromises.set(task.key, reservationPromise);
  return reservationPromise;
}

function taskDataSubmitPromptApiPath(task: PlanFormTask) {
  return taskDataSubmitApiPath(task);
}

function taskDataSubmitPromptRecordsPath(task: PlanFormTask) {
  return taskDataSubmitRecordsPath(task);
}

function taskDataSubmitEndpointStatusLabel(task: PlanFormTask) {
  if (isTaskIdReservationPending(task)) {
    return '生成中';
  }
  if (task.id) {
    return isTaskPersisted(task) ? '已启用' : '待保存';
  }
  return '未生成';
}

function taskDataSubmitEndpointTagType(task: PlanFormTask) {
  if (isTaskIdReservationPending(task)) {
    return 'info';
  }
  return task.id ? 'success' : 'warning';
}

function taskDataSubmitAlertTitle(task: PlanFormTask) {
  if (isTaskIdReservationPending(task)) {
    return '正在生成数据提交接口';
  }
  if (task.id && !isTaskPersisted(task)) {
    return '数据提交接口已预生成，保存学案后即可正式启用';
  }
  if (task.id) {
    return '数据提交接口已就绪，可直接生成网页并即时预览';
  }
  return '切换为数据提交任务后会自动生成正式接口地址';
}

function taskDataSubmitAlertDescription(task: PlanFormTask) {
  if (task.id && !isTaskPersisted(task)) {
    return '当前接口 ID 已预生成，可以先复制给 AI 生成学生提交页和可视化页；保存学案后学生即可正式访问。';
  }
  if (task.id) {
    return '接口已经可用，可直接复制给 AI 生成网页，或继续手动调整提交页与可视化页。';
  }
  return '切换到数据提交任务后，系统会自动生成提交接口与读取接口。';
}

function canEditPlan(plan: Pick<PlanSummary, 'status' | 'progress'>) {
  void plan;
  return true;
}

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

function normalizeTaskSubmissionScope(taskType: string, currentScope?: string) {
  if (isTaskScopeFixed(taskType)) {
    return 'individual';
  }
  return currentScope === 'group' ? 'group' : 'individual';
}

function rewriteDataSubmitApiUrls(htmlSource: string, submitApiPath: string, recordsApiPath: string) {
  if (!htmlSource.trim()) {
    return htmlSource;
  }

  let nextSource = htmlSource;
  if (recordsApiPath) {
    nextSource = nextSource.replace(
      /(?:https?:\/\/[^"'`\s<]+)?\/api\/v1\/tasks\/\d+\/data-submit\/[^"'`\s<]+\/records/g,
      recordsApiPath
    );
  }
  if (submitApiPath || recordsApiPath) {
    nextSource = nextSource.replace(
      /(?:https?:\/\/[^"'`\s<]+)?\/api\/v1\/tasks\/\d+\/data-submit\/[^"'`\s<]+/g,
      (matched) => {
        if (matched.endsWith('/records')) {
          return recordsApiPath || matched;
        }
        return submitApiPath || matched;
      }
    );
  }
  return nextSource;
}

function syncDataSubmitTaskHtmlSources(
  task: PlanFormTask,
  options?: {
    previous_submit_api_path?: string;
    previous_records_api_path?: string;
    seed_if_empty?: boolean;
  }
) {
  if (task.task_type !== 'data_submit' || !task.id) {
    return;
  }

  const title = task.title.trim() || taskTypeLabel(task.task_type) || '任务';
  const submitApiPath = taskDataSubmitApiPath(task);
  const recordsApiPath = taskDataSubmitRecordsPath(task);
  const replaceKnownPaths = (source: string) => {
    let nextSource = source;
    if (
      options?.previous_submit_api_path &&
      submitApiPath &&
      options.previous_submit_api_path !== submitApiPath
    ) {
      nextSource = nextSource.split(options.previous_submit_api_path).join(submitApiPath);
    }
    if (
      options?.previous_records_api_path &&
      recordsApiPath &&
      options.previous_records_api_path !== recordsApiPath
    ) {
      nextSource = nextSource.split(options.previous_records_api_path).join(recordsApiPath);
    }
    return rewriteDataSubmitApiUrls(nextSource, submitApiPath, recordsApiPath);
  };

  if (task.config.submit_html_source.trim()) {
    task.config.submit_html_source = replaceKnownPaths(task.config.submit_html_source);
  } else if (options?.seed_if_empty) {
    task.config.submit_html_source = buildDataSubmitFormStarterHtml(title, submitApiPath);
  }

  if (task.config.visualization_html_source.trim()) {
    task.config.visualization_html_source = replaceKnownPaths(task.config.visualization_html_source);
  } else if (options?.seed_if_empty) {
    task.config.visualization_html_source = buildDataSubmitVisualizationStarterHtml(title, recordsApiPath);
  }
}

function seedTaskTypeStarterSources(task: PlanFormTask) {
  const title = task.title.trim() || taskTypeLabel(task.task_type) || '任务';
  if (task.task_type === 'web_page' && !task.config.entry_html_source.trim()) {
    task.config.entry_html_source = buildWebTaskStarterHtml(title);
    task.config.entry_path = task.config.entry_path.trim() || 'index.html';
    return;
  }

  if (task.task_type === 'data_submit') {
    task.config.submit_entry_path = task.config.submit_entry_path.trim() || 'index.html';
    task.config.visualization_entry_path = task.config.visualization_entry_path.trim() || 'index.html';
    if (!task.id) {
      return;
    }
    if (!task.config.submit_html_source.trim()) {
      task.config.submit_html_source = buildDataSubmitFormStarterHtml(title, taskDataSubmitApiPath(task));
    }
    if (!task.config.visualization_html_source.trim()) {
      task.config.visualization_html_source = buildDataSubmitVisualizationStarterHtml(
        title,
        taskDataSubmitRecordsPath(task)
      );
    }
    syncDataSubmitTaskHtmlSources(task);
  }
}

async function handleTaskTypeChange(task: PlanFormTask) {
  task.submission_scope = normalizeTaskSubmissionScope(task.task_type, task.submission_scope);
  task.config = normalizeTaskConfigState(task.task_type, task.config);
  ensureDataSubmitTaskConfig(task);
  if (task.task_type === 'data_submit') {
    await ensureTaskIdReserved(task);
  }
  seedTaskTypeStarterSources(task);
}

function currentLessonLabel() {
  if (!planForm.value.lesson_id) {
    return '';
  }
  for (const book of curriculumBooks.value) {
    for (const unit of book.units) {
      for (const lesson of unit.lessons) {
        if (lesson.id === planForm.value.lesson_id) {
          return `${book.name} / ${unit.title} / 第 ${lesson.lesson_no} 课次 / ${lesson.title}`;
        }
      }
    }
  }
  return '';
}

function extractHtmlDraft(rawContent: string) {
  const trimmed = rawContent.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function copyTextWithFallback(value: string) {
  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  return copied;
}

async function copyPlainText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    ElMessage.warning(`${label}为空，暂时无法复制`);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalized);
    } else if (!copyTextWithFallback(normalized)) {
      throw new Error('clipboard fallback failed');
    }
    ElMessage.success(`${label}已复制`);
  } catch (error) {
    if (copyTextWithFallback(normalized)) {
      ElMessage.success(`${label}已复制`);
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : `${label}复制失败`);
  }
}



async function openTaskHtmlPromptDialog(task: PlanFormTask, slot: TaskAssetSlot) {
  if (task.task_type === 'data_submit') {
    await ensureTaskIdReserved(task);
    if (!task.id) {
      ElMessage.warning('接口地址生成失败，请稍后重试。');
      return;
    }
    seedTaskTypeStarterSources(task);
  }

  const templateId =
    taskHtmlPromptSelections.value[slot] ||
    taskHtmlPromptTemplateOptions.find((option) => option.slot === slot)?.id ||
    defaultTaskHtmlPromptTemplateId(slot);

  taskHtmlPromptDialogState.value = {
    task_key: task.key,
    slot,
    template_id: templateId,
    custom_prompt: taskHtmlPromptCustomizations.value[slot] || '',
  };
  taskHtmlPromptDialogVisible.value = true;
}

async function copyTaskDataSubmitEndpoint(task: PlanFormTask, type: 'submit' | 'records') {
  await ensureTaskIdReserved(task);
  const value = type === 'submit' ? taskDataSubmitPromptApiPath(task) : taskDataSubmitPromptRecordsPath(task);
  await copyPlainText(value, type === 'submit' ? '提交接口地址' : '读取接口地址');
}

function getTaskAssetEntryPath(task: PlanFormTask, slot: TaskAssetSlot) {
  if (slot === 'web') {
    return task.config.entry_path.trim() || 'index.html';
  }
  if (slot === 'data_submit_form') {
    return task.config.submit_entry_path.trim() || 'index.html';
  }
  return task.config.visualization_entry_path.trim() || 'index.html';
}

function setTaskAssetEntryPath(task: PlanFormTask, slot: TaskAssetSlot, value: string) {
  if (slot === 'web') {
    task.config.entry_path = value;
    return;
  }
  if (slot === 'data_submit_form') {
    task.config.submit_entry_path = value;
    return;
  }
  task.config.visualization_entry_path = value;
}

function getTaskHtmlSource(task: PlanFormTask, slot: TaskAssetSlot) {
  if (slot === 'web') {
    return task.config.entry_html_source;
  }
  if (slot === 'data_submit_form') {
    return task.config.submit_html_source;
  }
  return task.config.visualization_html_source;
}

function getTaskSlotEditorTab(task: PlanFormTask, slot: TaskAssetSlot): TaskSlotEditorTab {
  if (slot === 'web') {
    return task.config.entry_editor_tab;
  }
  if (slot === 'data_submit_form') {
    return task.config.submit_editor_tab;
  }
  if (slot === 'data_submit_visualization') {
    return task.config.visualization_editor_tab;
  }
  return 'source';
}

function setTaskSlotEditorTab(task: PlanFormTask, slot: TaskAssetSlot, value: TaskSlotEditorTab) {
  if (slot === 'web') {
    task.config.entry_editor_tab = value;
    return;
  }
  if (slot === 'data_submit_form') {
    task.config.submit_editor_tab = value;
    return;
  }
  if (slot === 'data_submit_visualization') {
    task.config.visualization_editor_tab = value;
  }
}

function revealTaskPreview(task: PlanFormTask, slot: TaskAssetSlot) {
  setTaskSlotEditorTab(task, slot, 'preview');
}

function setTaskHtmlSource(task: PlanFormTask, slot: TaskAssetSlot, value: string) {
  if (slot === 'web') {
    task.config.entry_html_source = value;
    return;
  }
  if (slot === 'data_submit_form') {
    task.config.submit_html_source = value;
    return;
  }
  task.config.visualization_html_source = value;
}


function taskDataSubmitApiPath(task: PlanFormTask) {
  if (task.config.submit_api_path) {
    return buildAbsoluteApiUrl(task.config.submit_api_path);
  }
  if (!task.id || !task.config.endpoint_token.trim()) {
    return '';
  }
  return buildAbsoluteApiUrl(`tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}`);
}

function taskDataSubmitRecordsPath(task: PlanFormTask) {
  if (task.config.records_api_path) {
    return buildAbsoluteApiUrl(task.config.records_api_path);
  }
  if (!task.id || !task.config.endpoint_token.trim()) {
    return '';
  }
  return buildAbsoluteApiUrl(`tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}/records`);
}

function ensureDataSubmitTaskConfig(task: PlanFormTask) {
  if (task.task_type !== 'data_submit') {
    return;
  }
  if (!task.config.endpoint_token.trim()) {
    task.config.endpoint_token = generateTaskEndpointToken();
  }
  task.config.data_submit_active_tab =
    task.config.data_submit_active_tab === 'visualization' ? 'visualization' : 'submit';
  if (!task.id) {
    task.config.submit_api_path = '';
    task.config.records_api_path = '';
    return;
  }
  task.config.submit_api_path = buildAbsoluteApiUrl(
    `tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}`
  );
  task.config.records_api_path = buildAbsoluteApiUrl(
    `tasks/${task.id}/data-submit/${task.config.endpoint_token.trim()}/records`
  );
}

function mergeTaskConfigFromServer(task: PlanFormTask, serverConfig: Record<string, unknown> | null | undefined) {
  task.config = normalizeTaskConfigState(task.task_type, {
    ...task.config,
    ...(serverConfig || {}),
  });
  ensureDataSubmitTaskConfig(task);
}

async function requestHtmlDraft(prompt: string) {
  if (!authStore.token) {
    throw new Error('请先登录后再使用 AI 生成功能');
  }

  const response = await apiPost<AssistantHtmlDraftResponse>(
    '/assistants/companion/respond',
    {
      scope: 'general',
      message: `${prompt}\n\n请直接返回 HTML 内容，不要附带解释、Markdown 代码块或额外说明。如需外部资源，请使用稳定 CDN。`,
      provider_id: null,
      conversation: [],
    },
    authStore.token
  );

  const html = extractHtmlDraft(response.reply?.content || '');
  if (!html) {
    throw new Error('AI 未返回可用的 HTML 内容');
  }
  return html;
}

function buildPlanHtmlPrompt() {
  const lessonLabel = currentLessonLabel() || '未选择课次';
  const title = planForm.value.title.trim() || '未命名学案';
  return [
    `请生成一份教师学案正文 HTML，标题为：${title}。`,
    `绑定课次：${lessonLabel}。`,
    '内容用于教师后台学案正文区域，适合课堂导入、步骤说明、重点提示和资源链接。',
    '请直接返回可渲染的完整片段或 HTML 正文，不要添加代码围栏或额外解释。',
  ].join('\n');
}

function buildTaskDescriptionPrompt(task: PlanFormTask) {
  const displayTitle = task.title.trim() || `任务 ${task.key}`;
  return [
    `请为任务“${displayTitle}”生成一段简洁的 HTML 任务说明。`,
    `任务类型：${taskTypeLabel(task.task_type)}。`,
    '内容要适合直接展示给学生，包含任务目标、步骤提示和提交要求。',
    '请直接返回可渲染的 HTML 片段。',
  ].join('\n');
}

function buildTaskHtmlPrompt(task: PlanFormTask, slot: TaskAssetSlot, options?: TaskHtmlPromptBuildOptions) {
  const title = task.title.trim() || taskTypeLabel(task.task_type);
  const submitApiPath = taskDataSubmitPromptApiPath(task);
  const recordsApiPath = taskDataSubmitPromptRecordsPath(task);
  const runtimeHint =
    '生成页面时请只使用浏览器原生能力；如需请求数据，请使用原生 fetch 并处理失败情况。';
  const previewHint = '生成结果会直接写入当前任务的 HTML 源码区域，页面应能在 iframe 中独立运行。';
  const templatePrompt = options?.template_prompt?.trim();
  const customPrompt = options?.custom_prompt?.trim();

  if (slot === 'web') {
    const promptLines = [
      `请生成一个 HTML 网页，用于完成“${title}”这项网页任务。`,
      '优先使用浏览器原生能力；如需第三方资源，仅可使用稳定 CDN，并确保页面可直接运行。',
      runtimeHint,
      '请直接返回 HTML。',
    ];
    if (templatePrompt) {
      promptLines.splice(2, 0, `模板要求：${templatePrompt}`);
    }
    if (customPrompt) {
      promptLines.splice(promptLines.length - 1, 0, `补充要求：${customPrompt}`);
    }
    return promptLines.join('\n');
  }

  if (slot === 'data_submit_form') {
    const promptLines = [
      `请生成一个 HTML 提交页，用于完成“${title}”这项数据提交任务。`,
      `提交接口：${submitApiPath}` ,
      '页面需要把表单内容整理成 JSON，并通过 POST 提交到上述接口。',
      '请提供清晰的表单、提交反馈和必要说明，适合学生直接填写提交。',
      previewHint,
      '请直接返回 HTML。',
    ];
    if (templatePrompt) {
      promptLines.splice(3, 0, `模板要求：${templatePrompt}`);
    }
    if (customPrompt) {
      promptLines.splice(promptLines.length - 1, 0, `补充要求：${customPrompt}`);
    }
    return promptLines.join('\n');
  }

  const promptLines = [
    `请生成一个 HTML 可视化页，用于展示“${title}”这项数据提交任务的结果。`,
    `读取接口：${recordsApiPath}` ,
    '页面需要读取接口返回的 JSON 数据。',
    '请将结果做成清晰的统计展示，可使用表格、卡片、图表等形式，但不要依赖重量级框架。',
    '页面需要兼顾课堂投屏和教师后台预览场景。',
    previewHint,
    '请直接返回 HTML。',
  ];
  if (templatePrompt) {
    promptLines.splice(3, 0, `模板要求：${templatePrompt}`);
  }
  if (customPrompt) {
    promptLines.splice(promptLines.length - 1, 0, `补充要求：${customPrompt}`);
  }
  return promptLines.join('\n');
}

async function generatePlanHtmlDraft() {
  generatingPlanHtml.value = true;
  try {
    const html = await requestHtmlDraft(buildPlanHtmlPrompt());
    planForm.value.content = html;
    planForm.value.content_mode = 'source';
    ElMessage.success('学案正文初稿已生成');
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成学案正文失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    generatingPlanHtml.value = false;
  }
}

async function generateTaskDescriptionDraft(task: PlanFormTask) {
  const loadingKey = taskDescriptionGenerationKey(task);
  generatingTaskHtmlKey.value = loadingKey;
  try {
    const html = await requestHtmlDraft(buildTaskDescriptionPrompt(task));
    task.description = html;
    task.description_mode = 'source';
    ElMessage.success('任务说明初稿已生成');
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成任务说明失败';
    errorMessage.value = message;
    ElMessage.error(message);
  } finally {
    if (generatingTaskHtmlKey.value === loadingKey) {
      generatingTaskHtmlKey.value = null;
    }
  }
}


async function submitTaskHtmlPromptDialog() {
  const task = taskHtmlPromptDialogTask.value;
  const template = selectedTaskHtmlPromptTemplate.value;
  if (!task) {
    taskHtmlPromptDialogVisible.value = false;
    return;
  }
  const { slot, template_id, custom_prompt } = taskHtmlPromptDialogState.value;
  taskHtmlPromptSelections.value[slot] = template_id;
  taskHtmlPromptCustomizations.value[slot] = custom_prompt;
  const succeeded = await generateTaskHtmlAndUpload(task, slot, {
    template_prompt: template?.prompt,
    custom_prompt,
  });
  if (succeeded) {
    taskHtmlPromptDialogVisible.value = false;
  }
}


async function loadPlans() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    isLoading.value = false;
    return;
  }

  const [planPayload, curriculumPayload] = await Promise.all([
    apiGet<{ plans: PlanSummary[] }>('/lesson-plans/staff/list', authStore.token),
    apiGet<{ books: CurriculumBook[] }>('/curriculum/tree', authStore.token),
  ]);

  plans.value = planPayload.plans;
  curriculumBooks.value = curriculumPayload.books;

  if (!selectedPlanId.value && planPayload.plans[0]) {
    await router.replace(`/staff/lesson-plans/${planPayload.plans[0].id}`);
  }
}

async function loadPlanDetail(planId: number | null) {
  if (!planId || !authStore.token) {
    selectedPlanDetail.value = null;
    editingPlanId.value = null;
    editorVisible.value = false;
    markEditorCommitted('');
    return;
  }

  const payload = await apiGet<{ plan: PlanDetail }>(`/lesson-plans/staff/${planId}`, authStore.token);
  selectedPlanDetail.value = payload.plan;
  activatePlanEditor(payload.plan);
}

async function loadPage() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    await Promise.all([loadPlans(), loadCustomTaskTemplates()]);
    await loadPlanDetail(selectedPlanId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载学案数据失败';
  } finally {
    isLoading.value = false;
  }
}

async function confirmRouteLeaveWithUnsavedChanges() {
  if (!hasUnsavedChanges.value) {
    return true;
  }
  persistCurrentEditorDraft();
  try {
    await ElMessageBox.confirm(
      '当前学案修改还没有保存到服务器，本地草稿已自动保留。确认现在离开吗？',
      '未保存提醒',
      {
        type: 'warning',
        confirmButtonText: '离开',
        cancelButtonText: '继续编辑',
      }
    );
    return true;
  } catch (error) {
    if (isDialogCancelled(error)) {
      return false;
    }
    throw error;
  }
}

function handleWindowBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) {
    return;
  }
  persistCurrentEditorDraft();
  event.preventDefault();
  event.returnValue = '';
}

async function selectPlan(planId: number | null) {
  if (!planId) {
    return;
  }
  await router.push(`/staff/lesson-plans/${planId}`);
}

function handleRowClick(row: PlanSummary) {
  void openEditDialog(row.id);
}

function openCreateDialog() {
  persistCurrentEditorDraft();
  activateBlankPlanEditor();
  void focusPlanEditor();
}


async function openEditDialog(planId: number) {
  try {
    let targetPlan = planId === selectedPlanDetail.value?.id ? selectedPlanDetail.value : null;
    if (!targetPlan) {
      await selectPlan(planId);
      await loadPlanDetail(planId);
      targetPlan = selectedPlanDetail.value;
    }

    if (!targetPlan) {
      errorMessage.value = '加载学案详情失败';
      return;
    }

    activatePlanEditor(targetPlan);
    await focusPlanEditor();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打开编辑区失败';
  }
}

function buildPayload() {
  if (!planForm.value.lesson_id) {
    throw new Error('请先选择绑定课次');
  }
  if (!planForm.value.title.trim()) {
    throw new Error('请先填写学案标题');
  }

  const tasks = planForm.value.tasks.map((task, index) => {
    if (!task.title.trim()) {
      throw new Error(`请填写任务 ${index + 1} 的标题`);
    }
    return {
      id: task.id,
      title: task.title.trim(),
      task_type: task.task_type,
      submission_scope: normalizeTaskSubmissionScope(task.task_type, task.submission_scope),
      description: normalizeHtmlValue(task.description, task.description_mode),
      config: buildTaskConfigPayload(task),
      sort_order: index + 1,
      is_required: task.is_required,
    };
  });

  return {
    lesson_id: planForm.value.lesson_id,
    title: planForm.value.title.trim(),
    content: normalizeHtmlValue(planForm.value.content, planForm.value.content_mode),
    assigned_date: planForm.value.assigned_date,
    status: planForm.value.status,
    tasks,
  };
}

async function savePlan() {
  if (!authStore.token) {
    return;
  }

  const draftPlanId = editingPlanId.value;
  isSavingPlan.value = true;
  errorMessage.value = '';

  try {
    await Promise.all(
      planForm.value.tasks
        .filter((task) => task.task_type === 'data_submit' && !task.id)
        .map((task) => ensureTaskIdReserved(task))
    );
    const payload = buildPayload();
    const response = editingPlanId.value
      ? await apiPut<{ plan: PlanDetail }>(
          `/lesson-plans/staff/${editingPlanId.value}`,
          payload,
          authStore.token
        )
      : await apiPost<{ plan: PlanDetail }>(
          '/lesson-plans/staff',
          payload,
          authStore.token
        );

    ElMessage.success(editingPlanId.value ? '学案已更新' : '学案已创建');
    clearLessonPlanDraft(draftPlanId);
    clearLessonPlanDraft(response.plan.id);
    markEditorCommitted(currentEditorSnapshot.value);
    await loadPlans();
    await selectPlan(response.plan.id);
    await loadPlanDetail(response.plan.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存学案失败';
  } finally {
    isSavingPlan.value = false;
  }
}

async function publishPlan(planId: number) {
  if (!authStore.token) {
    return;
  }

  publishingPlanId.value = planId;
  errorMessage.value = '';

  try {
    const response = await apiPost<{ plan: PlanDetail }>(
      `/lesson-plans/staff/${planId}/publish`,
      {},
      authStore.token
    );
    ElMessage.success('学案已发布，可以去开课了');
    await loadPlans();
    await selectPlan(response.plan.id);
    await loadPlanDetail(response.plan.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发布学案失败';
  } finally {
    publishingPlanId.value = null;
  }
}

async function deletePlan(planId: number) {
  if (!authStore.token) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      '确认删除这个学案吗？删除后不可恢复，且会一并清理相关学习进度和开课记录。',
      '删除学案',
      { type: 'warning' }
    );
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : '删除学案失败';
    return;
  }

  deletingPlanId.value = planId;
  errorMessage.value = '';
  try {
    await apiDelete<{ deleted_id: number }>(`/lesson-plans/staff/${planId}`, authStore.token);
    clearLessonPlanDraft(planId);
    ElMessage.success('学案已删除');
    const deletingCurrent =
      selectedPlanDetail.value?.id === planId ||
      Number(route.params.planId) === planId;

    await loadPlans();
    if (deletingCurrent) {
      const nextPlanId = plans.value[0]?.id ?? null;
      if (nextPlanId) {
        await router.replace(`/staff/lesson-plans/${nextPlanId}`);
        await loadPlanDetail(nextPlanId);
      } else {
        selectedPlanDetail.value = null;
        editingPlanId.value = null;
        editorVisible.value = false;
        await router.replace('/staff/lesson-plans');
      }
      return;
    }
    await loadPlanDetail(selectedPlanId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除学案失败';
  } finally {
    deletingPlanId.value = null;
  }
}

async function goToClassroom(planId: number) {
  await router.push({ path: '/staff/classroom', query: { planId: String(planId) } });
}

onBeforeRouteUpdate((_to, _from) => {
  persistCurrentEditorDraft();
  return true;
});

onBeforeRouteLeave(async () => {
  return await confirmRouteLeaveWithUnsavedChanges();
});

watch(
  () => route.params.planId,
  () => {
    if (selectedPlanId.value === selectedPlanDetail.value?.id) {
      return;
    }
    void loadPlanDetail(selectedPlanId.value);
  }
);

watch(currentEditorSnapshot, () => {
  if (!editorVisible.value) {
    clearDraftAutoSaveTimer();
    return;
  }
  if (!hasUnsavedChanges.value) {
    clearDraftAutoSaveTimer();
    clearLessonPlanDraft(editingPlanId.value);
    return;
  }
  scheduleDraftAutoSave();
});

onMounted(() => {
  window.addEventListener('beforeunload', handleWindowBeforeUnload);
  resetPlanForm();
  markEditorCommitted();
  void loadPage();
});

onBeforeUnmount(() => {
  clearDraftAutoSaveTimer();
  window.removeEventListener('beforeunload', handleWindowBeforeUnload);
});
</script>

<style scoped>
.lesson-plan-page {
  width: min(1680px, 100%);
  margin: 0 auto;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.stack-list {
  display: grid;
  gap: 16px;
}

.task-editor-list {
  display: grid;
  gap: 14px;
}

.task-preview-card,
.task-editor-card {
  padding: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
}

.task-card-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.content-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--ls-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.8);
}

.editor-tabs {
  margin-top: 8px;
}

.task-editor-tabs {
  margin-top: 8px;
}

.task-editor-tabs :deep(.el-tabs__header) {
  margin-bottom: 18px;
}

.task-editor-tabs :deep(.el-tabs__item) {
  height: auto;
  padding-top: 10px;
  padding-bottom: 10px;
}

.task-tab-label {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  line-height: 1.25;
  user-select: none;
  cursor: grab;
  border-radius: 10px;
  padding: 2px 0;
  transition: background-color 0.18s ease, opacity 0.18s ease, transform 0.18s ease;
}

.task-tab-label:active {
  cursor: grabbing;
}

.task-tab-label__meta {
  display: grid;
  gap: 2px;
}

.task-tab-label strong {
  font-size: 13px;
  font-weight: 700;
}

.task-tab-label__meta span {
  font-size: 12px;
  color: var(--ls-muted);
}

.task-tab-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  color: var(--ls-muted);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.task-tab-close:hover,
.task-tab-close:focus-visible {
  background: rgba(215, 74, 74, 0.12);
  color: #c0392b;
  outline: none;
}

.task-tab-label-dragging {
  opacity: 0.55;
}

.task-tab-label-target {
  background: rgba(66, 97, 162, 0.12);
  transform: translateY(-1px);
}

.content-mode-panel,
.task-type-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(66, 97, 162, 0.12);
  border-radius: 20px;
  background: rgba(248, 251, 255, 0.9);
}

.dialog-task-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin: 8px 0 12px;
}

.dialog-task-head h3,
.section-note {
  margin: 0;
}

.section-note {
  color: var(--ls-muted);
  line-height: 1.7;
}

.task-template-option {
  display: grid;
  gap: 2px;
  min-width: 260px;
}

.task-template-option strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--ls-text);
}

.task-template-option span {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ls-muted);
}

.task-template-option--group {
  opacity: 0.82;
}

.plan-editor-card {
  display: grid;
  gap: 18px;
}

.plan-editor-card__header {
  display: grid;
  gap: 4px;
}

.plan-editor-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.full-width {
  width: 100%;
}

@media (max-width: 1024px) {
  .lesson-plan-page {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .dialog-task-head,
  .info-row,
  .task-card-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-editor-tabs :deep(.el-tabs__nav) {
    flex-wrap: wrap;
  }
}
</style>
