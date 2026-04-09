<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">系统设置</p>
        <h2>管理员后台</h2>
        <p class="hero-copy">统一维护学校参数、班级与教师关系、机房座位、以及教材目录。</p>
      </div>
      <el-button :loading="isLoading" type="primary" @click="loadPage">刷新数据</el-button>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <div class="soft-card"><el-skeleton :rows="12" /></div>
      </template>

      <template #default>
        <template v-if="bootstrap">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="基础参数" name="system">
              <div class="admin-grid">
                <section class="soft-card panel">
                  <div class="panel-head"><h3>系统参数</h3></div>
                  <el-form label-position="top">
                    <el-form-item label="平台名称">
                      <el-input
                        v-model="systemForm.platform_name"
                        disabled
                        placeholder="例如：瓯海区外国语学校信息科技OW³教学评AI平台 / 信息科技OW³教学评AI平台"
                      />
                      <p class="section-note">平台名称为系统固定项，暂不支持在此页面修改。</p>
                    </el-form-item>
                    <el-form-item label="学校名称">
                      <el-input v-model="systemForm.school_name" />
                    </el-form-item>
                    <el-form-item label="系统主题">
                      <el-select v-model="systemForm.theme_code" class="full-width">
                        <el-option
                          v-for="theme in bootstrap.theme_presets"
                          :key="theme.code"
                          :label="theme.name"
                          :value="theme.code"
                        />
                      </el-select>
                      <p class="section-note">保存后将统一应用到教师端与学生端。</p>
                    </el-form-item>
                    <el-form-item label="开放年级">
                      <el-select v-model="systemForm.active_grade_nos" class="full-width" multiple>
                        <el-option v-for="grade in [7, 8, 9]" :key="grade" :label="`${grade} 年级`" :value="grade" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="功能开关">
                      <div class="switch-stack">
                        <el-switch v-model="systemForm.student_register_enabled" active-text="允许学生注册" />
                        <el-switch v-model="systemForm.assistant_enabled" active-text="启用智能体助手" />
                        <el-switch v-model="systemForm.auto_attendance_on_login" active-text="登录自动签到" />
                      </div>
                    </el-form-item>
                    <el-form-item label="远程请求代理地址（可选）">
                      <el-input
                        v-model="systemForm.remote_proxy_url"
                        placeholder="例如：http://127.0.0.1:7890（留空默认直连 no_proxy）"
                      />
                    </el-form-item>
                    <el-form-item label="小组网盘文件上限">
                      <el-input-number v-model="systemForm.group_drive_file_max_count" :min="1" :max="500" />
                    </el-form-item>
                    <el-form-item label="小组网盘单文件大小上限（MB）">
                      <el-input-number v-model="systemForm.group_drive_single_file_max_mb" :min="1" :max="1024" />
                    </el-form-item>
                    <el-form-item label="小组网盘允许扩展名">
                      <el-input
                        v-model="systemForm.group_drive_allowed_extensions"
                        placeholder="例如：txt,md,pdf,docx,png,py；留空表示不限制类型"
                      />
                    </el-form-item>
                    <el-form-item label="转班审核常用语预设">
                      <el-input
                        v-model="systemForm.class_transfer_review_note_presets_text"
                        type="textarea"
                        :rows="4"
                        placeholder="每行一条，可用“标题|内容”格式；不填标题时可直接写内容"
                      />
                      <p class="section-note">示例：通过 · 班额协调完成|同意调班，班额与教学安排已协调。</p>
                    </el-form-item>
                    <el-form-item label="转班撤销原因模板">
                      <el-input
                        v-model="systemForm.class_transfer_unreview_reason_presets_text"
                        type="textarea"
                        :rows="3"
                        placeholder="每行一条，可用“标题|内容”格式；不填标题时可直接写内容"
                      />
                      <p class="section-note">教师端转班审核面板会自动读取并作为可选模板。</p>
                    </el-form-item>
                    <el-button :loading="isSavingSystem" type="primary" @click="saveSystemSettings">保存系统参数</el-button>
                  </el-form>
                </section>

                <section class="soft-card panel">
                  <div class="panel-head"><h3>当前统计</h3></div>
                  <div class="metric-grid">
                    <article class="metric-tile">
                      <p class="metric-label">班级数</p>
                      <p class="metric-value">{{ bootstrap.stats.class_count }}</p>
                    </article>
                    <article class="metric-tile">
                      <p class="metric-label">归档班级</p>
                      <p class="metric-value">{{ bootstrap.stats.archived_class_count }}</p>
                    </article>
                    <article class="metric-tile">
                      <p class="metric-label">教师数</p>
                      <p class="metric-value">{{ bootstrap.stats.teacher_count }}</p>
                    </article>
                    <article class="metric-tile">
                      <p class="metric-label">学生数</p>
                      <p class="metric-value">{{ bootstrap.stats.student_count }}</p>
                    </article>
                    <article class="metric-tile">
                      <p class="metric-label">机房数</p>
                      <p class="metric-value">{{ bootstrap.stats.room_count }}</p>
                    </article>
                  </div>
                </section>
              </div>
            </el-tab-pane>

            <el-tab-pane label="班级与教师" name="accounts">
              <div class="admin-grid">
                <section class="soft-card panel">
                  <div class="panel-head">
                    <h3>班级列表</h3>
                    <div class="chip-row">
                      <el-button plain @click="openClassBatchDialog">批量添加班级</el-button>
                      <el-button type="primary" @click="openClassDialog()">新增班级</el-button>
                    </div>
                  </div>
                  <el-table :data="bootstrap.classes" stripe>
                    <el-table-column label="班级" min-width="120" prop="class_name" />
                    <el-table-column label="年级" min-width="90" prop="grade_no" />
                    <el-table-column label="班主任" min-width="120" prop="head_teacher_name" />
                    <el-table-column label="机房" min-width="140">
                      <template #default="{ row }">{{ roomName(row.default_room_id) }}</template>
                    </el-table-column>
                    <el-table-column label="学生数" min-width="90" prop="student_count" />
                    <el-table-column label="资料修改权限" min-width="240">
                      <template #default="{ row }">
                        <el-space wrap>
                          <el-tag size="small" :type="classProfileEditPermissions(row).can_edit_name ? 'success' : 'info'" round>
                            姓名
                          </el-tag>
                          <el-tag size="small" :type="classProfileEditPermissions(row).can_edit_gender ? 'success' : 'info'" round>
                            性别
                          </el-tag>
                          <el-tag size="small" :type="classProfileEditPermissions(row).can_edit_photo ? 'success' : 'info'" round>
                            相片
                          </el-tag>
                          <el-tag size="small" :type="classProfileEditPermissions(row).can_edit_class ? 'success' : 'info'" round>
                            班级
                          </el-tag>
                        </el-space>
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" min-width="220">
                      <template #default="{ row }">
                        <el-button link type="primary" @click="openClassProfilePermissionDialog(row)">权限设置</el-button>
                        <el-button link type="primary" @click="openClassDialog(row)">编辑</el-button>
                        <el-button link type="danger" @click="deleteClass(row.id)">删除</el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                  <div class="panel-stack-gap" style="margin-top: 12px;">
                    <el-divider content-position="left">按班级保存资料修改权限</el-divider>
                    <div class="admin-grid two-col">
                      <div>
                        <p class="section-note">选择班级</p>
                        <el-select
                          v-model="inlineClassProfilePermissionClassId"
                          class="full-width"
                          placeholder="请选择要设置权限的班级"
                          @change="syncInlineClassProfilePermissionForm"
                        >
                          <el-option
                            v-for="item in bootstrap.classes"
                            :key="item.id"
                            :label="item.class_name"
                            :value="item.id"
                          />
                        </el-select>
                      </div>
                      <div>
                        <p class="section-note">权限说明</p>
                        <p class="section-note">切换开关后点击“保存当前班级权限”立即生效。</p>
                      </div>
                    </div>
                    <el-space wrap>
                      <el-switch
                        v-model="inlineClassProfilePermissionForm.can_edit_name"
                        active-text="允许修改姓名"
                        inactive-text="禁止修改姓名"
                      />
                      <el-switch
                        v-model="inlineClassProfilePermissionForm.can_edit_gender"
                        active-text="允许修改性别"
                        inactive-text="禁止修改性别"
                      />
                      <el-switch
                        v-model="inlineClassProfilePermissionForm.can_edit_photo"
                        active-text="允许修改相片"
                        inactive-text="禁止修改相片"
                      />
                      <el-switch
                        v-model="inlineClassProfilePermissionForm.can_edit_class"
                        active-text="允许提交转班申请"
                        inactive-text="禁止提交转班申请"
                      />
                    </el-space>
                    <div class="chip-row" style="margin-top: 10px;">
                      <el-button
                        type="primary"
                        :disabled="!inlineClassProfilePermissionClassId"
                        :loading="isSavingInlineClassProfilePermission"
                        @click="saveInlineClassProfilePermissions"
                      >
                        保存当前班级权限
                      </el-button>
                    </div>
                  </div>
                </section>

                <section class="soft-card panel">
                  <div class="panel-head">
                    <h3>教师列表</h3>
                    <div class="chip-row">
                      <input
                        ref="studentImportInputRef"
                        class="file-input"
                        :accept="studentImportAccept"
                        type="file"
                        @change="handleStudentImportChange"
                      />
                      <el-button plain @click="openStudentImportDialog">批量导入学生</el-button>
                      <el-button type="primary" @click="openTeacherDialog()">新增教师</el-button>
                    </div>
                  </div>
                  <el-table :data="bootstrap.teachers" stripe>
                    <el-table-column label="账号" min-width="110" prop="username" />
                    <el-table-column label="姓名" min-width="120" prop="display_name" />
                    <el-table-column label="职务" min-width="130" prop="title" />
                    <el-table-column label="管理员" min-width="90">
                      <template #default="{ row }">
                        <el-tag :type="row.is_admin ? 'warning' : 'info'" round>{{ row.is_admin ? '是' : '否' }}</el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="关联班级" min-width="220">
                      <template #default="{ row }">{{ teacherClassNames(row.class_ids).join('、') || '未关联' }}</template>
                    </el-table-column>
                    <el-table-column label="操作" min-width="160">
                      <template #default="{ row }">
                        <el-button link type="primary" @click="openTeacherEditor(row)">页面编辑</el-button>
                        <el-button link type="primary" @click="openTeacherDialog(row)">编辑</el-button>
                        <el-button link type="danger" @click="deleteTeacher(row.id)">删除</el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                  <div ref="teacherEditorSectionRef" class="panel-stack-gap" style="margin-top: 12px;">
                    <el-divider content-position="left">编辑教师信息</el-divider>
                    <div class="admin-grid two-col">
                      <div>
                        <p class="section-note">选择教师</p>
                        <el-select
                          v-model="teacherEditorTeacherId"
                          class="full-width"
                          filterable
                          placeholder="请选择需要编辑的教师"
                          @change="syncTeacherEditorForm"
                        >
                          <el-option
                            v-for="item in bootstrap.teachers"
                            :key="item.id"
                            :label="`${item.display_name}（${item.username}）`"
                            :value="item.id"
                          />
                        </el-select>
                      </div>
                      <div>
                        <p class="section-note">提示</p>
                        <p class="section-note">修改后点击“保存教师信息”立即生效；密码留空表示不重置。</p>
                      </div>
                    </div>
                    <el-form label-position="top">
                      <div class="admin-grid two-col">
                        <el-form-item label="账号">
                          <el-input v-model="teacherEditorForm.username" :disabled="!teacherEditorTeacherId" />
                        </el-form-item>
                        <el-form-item label="姓名">
                          <el-input v-model="teacherEditorForm.display_name" :disabled="!teacherEditorTeacherId" />
                        </el-form-item>
                      </div>
                      <div class="admin-grid two-col">
                        <el-form-item label="职务">
                          <el-input v-model="teacherEditorForm.title" :disabled="!teacherEditorTeacherId" />
                        </el-form-item>
                        <el-form-item label="管理员权限">
                          <el-switch v-model="teacherEditorForm.is_admin" :disabled="!teacherEditorTeacherId" />
                        </el-form-item>
                      </div>
                      <el-form-item label="关联班级">
                        <el-select
                          v-model="teacherEditorForm.class_ids"
                          class="full-width"
                          filterable
                          multiple
                          :disabled="!teacherEditorTeacherId"
                        >
                          <el-option
                            v-for="item in bootstrap.classes"
                            :key="item.id"
                            :label="item.class_name"
                            :value="item.id"
                          />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="重置密码（留空不修改）">
                        <el-input
                          v-model="teacherEditorForm.password"
                          show-password
                          :disabled="!teacherEditorTeacherId"
                          placeholder="不少于 6 位，留空表示不修改"
                        />
                      </el-form-item>
                      <div class="chip-row" style="margin-top: 6px;">
                        <el-button :disabled="!teacherEditorTeacherId" @click="syncTeacherEditorForm()">重置为当前值</el-button>
                        <el-button
                          type="primary"
                          :disabled="!teacherEditorTeacherId"
                          :loading="isSavingTeacherEditor"
                          @click="saveTeacherEditor"
                        >
                          保存教师信息
                        </el-button>
                      </div>
                    </el-form>
                  </div>
                </section>
              </div>
            </el-tab-pane>

            <el-tab-pane label="升班与归档" name="promotions">
              <div class="admin-grid">
                <section class="soft-card panel">
                  <div class="panel-head">
                    <div>
                      <h3>升班执行</h3>
                      <p class="section-note">按班级批量升到下一年级，并将原班级归档为历史记录。</p>
                    </div>
                    <div class="chip-row">
                      <el-button :loading="isPreviewingPromotion" plain @click="previewPromotions">预览结果</el-button>
                      <el-button :loading="isExecutingPromotion" type="primary" @click="executePromotions">执行升班</el-button>
                    </div>
                  </div>

                  <el-form label-position="top">
                    <el-form-item label="选择待升班级">
                      <el-select v-model="promotionForm.source_class_ids" class="full-width" multiple>
                        <el-option
                          v-for="item in bootstrap.classes"
                          :key="item.id"
                          :label="`${item.class_name}（${item.student_count} 人）`"
                          :value="item.id"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="升班年级增量">
                      <el-input-number v-model="promotionForm.grade_increment" :min="1" :max="3" />
                    </el-form-item>
                    <el-form-item label="执行策略">
                      <div class="switch-stack">
                        <el-switch v-model="promotionForm.copy_teacher_assignments" active-text="同步教师与班级关联" />
                        <el-switch v-model="promotionForm.archive_source_classes" active-text="将原班级归档" />
                      </div>
                    </el-form-item>
                  </el-form>

                  <el-empty v-if="!promotionPreview" description="点击“预览结果”查看升班影响范围" />
                  <template v-else>
                    <p class="section-note">
                      预览：共 {{ promotionPreview.summary.source_class_count }} 个班级，
                      可执行 {{ promotionPreview.summary.ready_count }} 个，
                      阻塞 {{ promotionPreview.summary.blocked_count }} 个，
                      涉及 {{ promotionPreview.summary.student_count }} 名学生。
                    </p>
                    <el-table :data="promotionPreview.items" stripe>
                      <el-table-column label="来源班级" min-width="140" prop="source_class_name" />
                      <el-table-column label="目标班级" min-width="140" prop="target_class_name" />
                      <el-table-column label="学生数" min-width="90" prop="student_count" />
                      <el-table-column label="状态" min-width="110">
                        <template #default="{ row }">
                          <el-tag :type="row.status === 'ready' ? 'success' : 'warning'" round>
                            {{ row.status === 'ready' ? '可执行' : '阻塞' }}
                          </el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="说明" min-width="220" prop="reason" />
                    </el-table>
                  </template>
                </section>

                <section class="soft-card panel">
                  <div class="panel-head">
                    <h3>历史归档班级</h3>
                    <el-tag type="info" round>{{ bootstrap.archived_classes.length }} 条</el-tag>
                  </div>
                  <el-empty v-if="!bootstrap.archived_classes.length" description="暂无归档记录" />
                  <el-table v-else :data="bootstrap.archived_classes" stripe>
                    <el-table-column label="原班级" min-width="130" prop="original_class_name" />
                    <el-table-column label="归档名称" min-width="180" prop="class_name" />
                    <el-table-column label="升入班级" min-width="130" prop="promoted_to_class_name" />
                    <el-table-column label="迁移人数" min-width="90" prop="moved_student_count" />
                    <el-table-column label="归档时间" min-width="170" prop="archived_at" />
                  </el-table>
                </section>
              </div>
            </el-tab-pane>

            <el-tab-pane label="机房与座位" name="rooms">
              <div class="admin-grid">
                <section class="soft-card panel">
                  <div class="panel-head">
                    <h3>机房管理</h3>
                    <div class="chip-row">
                      <el-button type="primary" @click="openRoomDialog()">新增机房</el-button>
                      <el-button :disabled="!selectedRoom" plain @click="selectedRoom && openRoomDialog(selectedRoom)">编辑机房</el-button>
                      <el-button :disabled="!selectedRoom" plain type="danger" @click="deleteRoom(selectedRoom!.id)">删除机房</el-button>
                    </div>
                  </div>
                  <el-radio-group v-model="selectedRoomId" class="room-radio-group">
                    <el-radio-button v-for="room in bootstrap.rooms" :key="room.id" :label="room.id">
                      {{ room.name }}
                    </el-radio-button>
                  </el-radio-group>
                  <p v-if="selectedRoom" class="section-note">{{ selectedRoom.description || '未填写机房说明' }}</p>
                </section>

                <section class="soft-card panel">
                  <div class="panel-head">
                    <div>
                      <h3>拖拽布局与 IP 绑定</h3>
                      <p class="section-note">先设置机房行列，再把座位块拖到对应位置；学生登录后按 IP 自动定位座位号。</p>
                    </div>
                    <div class="chip-row">
                      <el-button :disabled="!selectedRoom" plain @click="downloadSeatTemplate">下载模板</el-button>
                      <el-button :disabled="!selectedRoom" :loading="isImportingSeats" plain @click="openSeatImportPicker">导入表格</el-button>
                      <el-button :disabled="!selectedRoom" plain @click="addSeatDraft">新增座位</el-button>
                      <el-button :disabled="!selectedRoom" type="primary" @click="saveSeatDraft">保存座位表</el-button>
                    </div>
                  </div>

                  <template v-if="selectedRoom">
                    <input ref="seatImportInputRef" class="file-input" :accept="seatImportAccept" type="file" @change="handleSeatImportChange" />
                    <div class="room-grid-toolbar">
                      <div class="chip-row">
                        <span>行数</span>
                        <input v-model.number="roomGridRows" class="grid-number-input" type="number" min="1" :max="ROOM_GRID_MAX" @change="handleRoomGridRowsChange" />
                      </div>
                      <div class="chip-row">
                        <span>列数</span>
                        <input v-model.number="roomGridCols" class="grid-number-input" type="number" min="1" :max="ROOM_GRID_MAX" @change="handleRoomGridColsChange" />
                      </div>
                    </div>
                    <p class="section-note">导入文件支持 `.csv`、`.txt`、`.tsv`、`.xlsx`，表头可使用：行号、列号、座位号、IP 地址、主机名、是否启用。</p>

                    <div class="room-layout-board" :style="roomLayoutStyle">
                      <div
                        v-for="cell in roomLayoutCells"
                        :key="`${cell.row}-${cell.col}`"
                        class="room-layout-cell"
                        :class="{ 'is-drop-target': dragOverCellKey === `${cell.row}-${cell.col}` }"
                        @dragover.prevent="handleSeatDragOver($event, cell.row, cell.col)"
                        @drop.prevent="handleSeatDrop($event, cell.row, cell.col)"
                      >
                        <span class="room-layout-axis">{{ cell.row }}-{{ cell.col }}</span>
                        <div
                          v-if="cell.seat && cell.seatIndex !== null"
                          class="drag-seat-card"
                          :class="{ 'is-dragging': draggingSeat === cell.seat }"
                          draggable="true"
                          @dragstart="handleSeatDragStart($event, cell.seat)"
                          @dragend="handleSeatDragEnd"
                        >
                          <strong>{{ cell.seat.seat_label }}</strong>
                          <span>{{ cell.seat.ip_address || '待填 IP' }}</span>
                        </div>
                        <div v-else class="drag-seat-empty">空位</div>
                      </div>
                    </div>

                    <el-table :data="roomSeatDraft" stripe>
                      <el-table-column label="位置" min-width="100">
                        <template #default="{ row }">{{ row.row_no }} - {{ row.col_no }}</template>
                      </el-table-column>
                    <el-table-column label="座位名" min-width="120">
                      <template #default="{ row }"><el-input v-model="row.seat_label" /></template>
                    </el-table-column>
                    <el-table-column label="IP" min-width="150">
                      <template #default="{ row }"><el-input v-model="row.ip_address" /></template>
                    </el-table-column>
                    <el-table-column label="主机名" min-width="150">
                      <template #default="{ row }"><el-input v-model="row.hostname" /></template>
                    </el-table-column>
                    <el-table-column label="启用" min-width="90">
                      <template #default="{ row }"><el-switch v-model="row.is_enabled" /></template>
                    </el-table-column>
                    <el-table-column label="操作" min-width="90">
                      <template #default="{ $index }"><el-button link type="danger" @click="removeSeatDraft($index)">删除</el-button></template>
                    </el-table-column>
                    </el-table>
                  </template>
                  <el-empty v-else description="请先选择机房" />
                </section>
              </div>
            </el-tab-pane>

            <el-tab-pane label="教材目录" name="curriculum">
              <section class="soft-card panel panel-stack-gap">
                <div class="panel-head">
                  <h3>教材树</h3>
                  <div class="chip-row">
                    <input
                      ref="curriculumImportInputRef"
                      class="file-input"
                      :accept="curriculumImportAccept"
                      type="file"
                      @change="handleCurriculumImportChange"
                    />
                    <el-button type="primary" @click="openBookDialog()">新增教材</el-button>
                    <el-button plain @click="downloadCurriculumImportTemplateFile">下载导入模板</el-button>
                    <el-button plain @click="openCurriculumImportPicker">选择导入文件</el-button>
                    <el-button
                      plain
                      type="success"
                      :disabled="!selectedCurriculumImportFileName"
                      :loading="isImportingCurriculum"
                      @click="submitCurriculumImport"
                    >
                      导入 CSV/XLSX
                    </el-button>
                    <el-button plain @click="loadCurriculum">刷新教材树</el-button>
                  </div>
                </div>
                <p class="section-note">
                  当前文件：{{ selectedCurriculumImportFileName || '未选择' }}。模板已含示例与填写规范提示（以 `#` 开头的示例行导入时会自动忽略）。
                  请保留表头，按“每行一个课次”填写：教材名称、学科、版本、适用范围、学期、单元序号、单元标题、课次序号、课次标题、课次摘要（可空）。
                </p>

                <el-empty v-if="!curriculumBooks.length" description="暂无教材数据" />
                <div v-else class="list-stack">
                  <article v-for="book in curriculumBooks" :key="book.id" class="list-card">
                    <div class="panel-head">
                      <div>
                        <h3>{{ book.name }}</h3>
                        <p class="section-note">{{ book.subject }} · {{ book.edition }} · {{ book.grade_scope }}</p>
                      </div>
                      <div class="chip-row">
                        <el-button link type="primary" @click="openUnitDialog(book.id)">新增单元</el-button>
                        <el-button link type="primary" @click="openBookDialog(book)">编辑</el-button>
                        <el-button link type="danger" @click="deleteBook(book.id)">删除</el-button>
                      </div>
                    </div>

                    <div v-for="unit in book.units" :key="unit.id" class="curriculum-block">
                      <div class="panel-head">
                        <strong>{{ unit.title }}</strong>
                        <div class="chip-row">
                          <el-button link type="primary" @click="openLessonDialog(unit.id)">新增课次</el-button>
                          <el-button link type="primary" @click="openUnitDialog(book.id, unit)">编辑</el-button>
                          <el-button link type="danger" @click="deleteUnit(unit.id)">删除</el-button>
                        </div>
                      </div>
                      <div class="chip-row">
                        <el-tag v-for="lesson in unit.lessons" :key="lesson.id" round>
                          {{ lesson.title }}
                          <el-button link type="primary" @click="openLessonDialog(unit.id, lesson)">编辑</el-button>
                          <el-button link type="danger" @click="deleteLesson(lesson.id)">删</el-button>
                        </el-tag>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </el-tab-pane>
            <el-tab-pane label="AI 模型服务" name="ai-providers">
              <section class="soft-card panel">
                <div class="panel-head">
                  <div>
                    <h3>远程请求代理</h3>
                    <p class="section-note">用于模型列表获取与 AI 学伴访问外部模型服务。</p>
                  </div>
                  <el-button :loading="isSavingSystem" type="primary" @click="saveSystemSettings">保存代理配置</el-button>
                </div>
                <el-form label-position="top">
                  <el-form-item label="远程请求代理地址（可选）">
                    <el-input
                      v-model="systemForm.remote_proxy_url"
                      placeholder="例如：http://127.0.0.1:7890（留空默认直连 no_proxy）"
                    />
                    <p class="section-note">留空即为 no_proxy 直连，不使用环境变量代理。</p>
                  </el-form-item>
                </el-form>
              </section>

              <section class="soft-card panel">
                <div class="panel-head">
                  <div>
                    <h3>AI 学伴提示词</h3>
                    <p class="section-note">分别设置通用学伴与当前课程学案学伴的系统提示词。</p>
                  </div>
                  <el-button :loading="isSavingAssistantPrompts" type="primary" @click="saveAssistantPrompts">
                    保存提示词
                  </el-button>
                </div>
                <el-form label-position="top">
                  <el-form-item label="通用 AI 学伴提示词">
                    <el-input v-model="assistantPromptForm.general_prompt" :rows="7" type="textarea" />
                  </el-form-item>
                  <el-form-item label="当前课程学案 AI 学伴提示词">
                    <el-input v-model="assistantPromptForm.lesson_prompt" :rows="9" type="textarea" />
                  </el-form-item>
                </el-form>
              </section>

              <section class="soft-card panel">
                <div class="panel-head">
                  <div>
                    <h3>AI 学伴运行参数</h3>
                    <p class="section-note">基础参数用于稳定性与输出方式；高级参数默认留空即可，只有精调时再修改。</p>
                  </div>
                  <el-button :loading="isSavingAssistantRuntimeSettings" type="primary" @click="saveAssistantRuntimeSettings">
                    保存运行参数
                  </el-button>
                </div>
                <el-form label-position="top">
                  <div class="admin-grid two-col">
                    <el-form-item label="温度系数">
                      <el-input-number
                        v-model="assistantRuntimeForm.temperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        :precision="1"
                      />
                      <p class="section-note">数值越低越稳定，数值越高越发散，推荐范围 0.2 - 0.8。</p>
                    </el-form-item>
                    <el-form-item label="流式输出">
                      <el-switch v-model="assistantRuntimeForm.streaming_enabled" active-text="启用" inactive-text="关闭" />
                      <p class="section-note">关闭后，AI 学伴将统一使用标准输出，不再逐段返回内容。</p>
                    </el-form-item>
                    <el-form-item label="Thinking 模式">
                      <el-switch v-model="assistantRuntimeForm.thinking_enabled" active-text="启用" inactive-text="关闭" />
                      <p class="section-note">仅对支持 thinking 参数的模型生效；关闭时不附带 thinking 参数。</p>
                    </el-form-item>
                  </div>
                  <el-divider content-position="left">高级参数（OpenAI Compatible）</el-divider>
                  <p class="section-note">以下参数默认留空时，会交由模型服务使用默认策略。</p>
                  <div class="admin-grid two-col">
                    <el-form-item label="Top P（可选）">
                      <el-input-number
                        v-model="assistantRuntimeForm.top_p"
                        :min="0"
                        :max="1"
                        :step="0.05"
                        :precision="2"
                        :value-on-clear="null"
                      />
                      <p class="section-note">用于控制采样范围，通常与温度系数二选一调节。</p>
                    </el-form-item>
                    <el-form-item label="Max Tokens（可选）">
                      <el-input-number
                        v-model="assistantRuntimeForm.max_tokens"
                        :min="1"
                        :max="8192"
                        :step="64"
                        :value-on-clear="null"
                      />
                      <p class="section-note">限制单次回复最大输出长度；留空表示不额外限制。</p>
                    </el-form-item>
                    <el-form-item label="Presence Penalty（可选）">
                      <el-input-number
                        v-model="assistantRuntimeForm.presence_penalty"
                        :min="-2"
                        :max="2"
                        :step="0.1"
                        :precision="1"
                        :value-on-clear="null"
                      />
                      <p class="section-note">提高后更倾向引入新话题，降低重复主题。</p>
                    </el-form-item>
                    <el-form-item label="Frequency Penalty（可选）">
                      <el-input-number
                        v-model="assistantRuntimeForm.frequency_penalty"
                        :min="-2"
                        :max="2"
                        :step="0.1"
                        :precision="1"
                        :value-on-clear="null"
                      />
                      <p class="section-note">提高后会抑制词语重复，适合减少啰嗦回复。</p>
                    </el-form-item>
                  </div>
                </el-form>
              </section>

              <section class="soft-card panel">
                <div class="panel-head">
                  <div>
                    <h3>AI 模型服务</h3>
                    <p class="section-note">统一维护智能体使用的模型接入地址、默认模型和启用状态。</p>
                  </div>
                  <div class="chip-row">
                    <el-button plain @click="loadAIProviders">刷新服务列表</el-button>
                    <el-button type="primary" @click="openProviderDialog()">新增服务</el-button>
                  </div>
                </div>

                <el-empty v-if="!aiProviders.length" description="暂无 AI 模型服务配置" />
                <div v-else class="list-stack">
                  <article v-for="provider in aiProviders" :key="provider.id" class="list-card provider-card">
                    <div class="panel-head">
                      <div>
                        <h3>{{ provider.name }}</h3>
                        <p class="section-note">{{ provider.base_url }}</p>
                      </div>
                      <div class="chip-row">
                        <el-tag :type="provider.is_default ? 'warning' : 'info'" round>
                          {{ provider.is_default ? '默认' : '候选' }}
                        </el-tag>
                        <el-tag :type="provider.is_enabled ? 'success' : 'info'" round>
                          {{ provider.is_enabled ? '已启用' : '已停用' }}
                        </el-tag>
                      </div>
                    </div>

                    <div class="chip-row provider-meta">
                      <span>类型：{{ provider.provider_type }}</span>
                      <span>模型：{{ provider.model_name }}</span>
                      <span>密钥：{{ provider.has_api_key ? provider.masked_api_key : '未配置' }}</span>
                    </div>

                    <div class="chip-row provider-actions">
                      <el-button link type="primary" @click="openProviderDialog(provider)">编辑</el-button>
                      <el-button link type="danger" @click="deleteProvider(provider.id)">删除</el-button>
                    </div>
                  </article>
                </div>
              </section>
            </el-tab-pane>
          </el-tabs>
        </template>
      </template>
    </el-skeleton>

    <el-dialog v-model="classDialogVisible" :title="editingClassId ? '编辑班级' : '新增班级'" width="520px">
      <el-form label-position="top">
        <el-form-item label="年级"><el-input-number v-model="classForm.grade_no" :min="1" :max="12" /></el-form-item>
        <el-form-item label="班号"><el-input-number v-model="classForm.class_no" :min="1" :max="99" /></el-form-item>
        <el-form-item label="班主任"><el-input v-model="classForm.head_teacher_name" /></el-form-item>
        <el-form-item label="默认机房">
          <el-select v-model="classForm.default_room_id" class="full-width" clearable>
            <el-option v-for="room in bootstrap?.rooms || []" :key="room.id" :label="room.name" :value="room.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="classDialogVisible = false">取消</el-button><el-button type="primary" @click="saveClass">保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="classProfilePermissionDialogVisible" title="班级资料修改权限" width="520px">
      <el-form label-position="top">
        <el-form-item label="当前班级">
          <el-tag round type="info">{{ editingClassProfilePermissionName || '--' }}</el-tag>
        </el-form-item>
        <el-form-item label="姓名修改权限">
          <el-switch
            v-model="classProfilePermissionForm.can_edit_name"
            active-text="允许学生修改"
            inactive-text="禁止学生修改"
          />
        </el-form-item>
        <el-form-item label="性别修改权限">
          <el-switch
            v-model="classProfilePermissionForm.can_edit_gender"
            active-text="允许学生修改"
            inactive-text="禁止学生修改"
          />
        </el-form-item>
        <el-form-item label="相片修改权限">
          <el-switch
            v-model="classProfilePermissionForm.can_edit_photo"
            active-text="允许学生修改"
            inactive-text="禁止学生修改"
          />
        </el-form-item>
        <el-form-item label="班级修改权限">
          <el-switch
            v-model="classProfilePermissionForm.can_edit_class"
            active-text="允许提交转班申请"
            inactive-text="禁止提交转班申请"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="classProfilePermissionDialogVisible = false">取消</el-button>
        <el-button :loading="isSavingClassProfilePermission" type="primary" @click="saveClassProfilePermissions">
          保存权限
        </el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="classBatchDialogVisible" title="批量添加班级" width="620px">
      <el-form label-position="top">
        <el-form-item label="批量输入（每行一个班级）">
          <el-input
            v-model="classBatchForm.lines"
            :rows="10"
            placeholder="格式：年级,班号,班主任(可选),默认机房ID(可选)&#10;示例：7,4,教师4,1"
            type="textarea"
          />
        </el-form-item>
        <el-form-item label="覆盖同名班级">
          <el-switch v-model="classBatchForm.overwrite_existing" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="classBatchDialogVisible = false">取消</el-button>
        <el-button :loading="isSavingClassBatch" type="primary" @click="saveClassBatch">开始批量添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="studentImportDialogVisible" title="批量导入学生" width="540px">
      <el-form label-position="top">
        <el-form-item label="导入文件">
          <div class="chip-row">
            <el-button plain @click="openStudentImportPicker">选择文件</el-button>
            <span class="section-note">{{ selectedStudentImportFileName || '未选择文件' }}</span>
          </div>
          <p class="section-note">支持 .csv / .txt / .tsv / .xlsx；表头需包含姓名 + 学号或账号 + 班级（或年级与班号）。</p>
        </el-form-item>
        <el-form-item label="默认初始密码">
          <el-input v-model="studentImportForm.default_password" placeholder="不少于 6 位" />
        </el-form-item>
        <el-form-item label="遇到同学号或账号时">
          <el-switch v-model="studentImportForm.update_existing" active-text="更新已存在学生" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="studentImportDialogVisible = false">取消</el-button>
        <el-button :loading="isImportingStudents" type="primary" @click="submitStudentImport">
          开始导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="teacherDialogVisible" :title="editingTeacherId ? '编辑教师' : '新增教师'" width="560px">
      <el-form label-position="top">
        <el-form-item label="账号"><el-input v-model="teacherForm.username" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="teacherForm.display_name" /></el-form-item>
        <el-form-item label="职务"><el-input v-model="teacherForm.title" /></el-form-item>
        <el-form-item :label="editingTeacherId ? '重置密码（留空不修改）' : '初始密码'"><el-input v-model="teacherForm.password" show-password /></el-form-item>
        <el-form-item label="管理员权限"><el-switch v-model="teacherForm.is_admin" /></el-form-item>
        <el-form-item label="关联班级">
          <el-select v-model="teacherForm.class_ids" class="full-width" filterable multiple>
            <el-option v-for="item in bootstrap?.classes || []" :key="item.id" :label="item.class_name" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="teacherDialogVisible = false">取消</el-button><el-button type="primary" @click="saveTeacher">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="roomDialogVisible" :title="editingRoomId ? '编辑机房' : '新增机房'" width="560px">
      <el-form label-position="top">
        <el-form-item label="机房名称"><el-input v-model="roomForm.name" /></el-form-item>
        <div class="admin-grid two-col">
          <el-form-item label="行数"><el-input-number v-model="roomForm.row_count" :min="1" :max="ROOM_GRID_MAX" /></el-form-item>
          <el-form-item label="列数"><el-input-number v-model="roomForm.col_count" :min="1" :max="ROOM_GRID_MAX" /></el-form-item>
        </div>
        <el-form-item label="IP 前缀"><el-input v-model="roomForm.ip_prefix" placeholder="例如 10.7.1." /></el-form-item>
        <el-form-item label="IP 起始序号"><el-input-number v-model="roomForm.ip_start" :min="1" :max="250" /></el-form-item>
        <el-form-item label="机房说明"><el-input v-model="roomForm.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="roomDialogVisible = false">取消</el-button><el-button type="primary" @click="saveRoom">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="bookDialogVisible" :title="editingBookId ? '编辑教材' : '新增教材'" width="560px">
      <el-form label-position="top">
        <el-form-item label="教材名称"><el-input v-model="bookForm.name" /></el-form-item>
        <el-form-item label="学科"><el-input v-model="bookForm.subject" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="bookForm.edition" /></el-form-item>
        <el-form-item label="适用范围">
          <el-select
            v-model="bookForm.grade_scope"
            allow-create
            clearable
            filterable
            default-first-option
            class="full-width"
            placeholder="可手动输入或选择年级范围"
          >
            <el-option
              v-for="scope in curriculumGradeScopeOptions"
              :key="scope"
              :label="scope"
              :value="scope"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="bookDialogVisible = false">取消</el-button><el-button type="primary" @click="saveBook">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="unitDialogVisible" :title="editingUnitId ? '编辑单元' : '新增单元'" width="560px">
      <el-form label-position="top">
        <el-form-item label="学期序号"><el-input-number v-model="unitForm.term_no" :min="1" :max="4" /></el-form-item>
        <el-form-item label="单元序号"><el-input-number v-model="unitForm.unit_no" :min="1" :max="99" /></el-form-item>
        <el-form-item label="单元标题"><el-input v-model="unitForm.title" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="unitDialogVisible = false">取消</el-button><el-button type="primary" @click="saveUnit">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="lessonDialogVisible" :title="editingLessonId ? '编辑课次' : '新增课次'" width="560px">
      <el-form label-position="top">
        <el-form-item label="课次序号"><el-input-number v-model="lessonForm.lesson_no" :min="1" :max="99" /></el-form-item>
        <el-form-item label="课次标题"><el-input v-model="lessonForm.title" /></el-form-item>
        <el-form-item label="课次摘要"><el-input v-model="lessonForm.summary" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="lessonDialogVisible = false">取消</el-button><el-button type="primary" @click="saveLesson">保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="providerDialogVisible" :title="editingProviderId ? '编辑 AI 模型服务' : '新增 AI 模型服务'" width="620px">
      <el-form label-position="top">
        <el-form-item label="服务名称"><el-input v-model="providerForm.name" /></el-form-item>
        <div class="admin-grid two-col">
          <el-form-item label="服务类型">
            <el-select v-model="providerForm.provider_type" class="full-width">
              <el-option v-for="item in providerTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="默认模型" class="provider-model-field">
            <el-select
              v-model="providerForm.model_name"
              allow-create
              clearable
              default-first-option
              filterable
              class="full-width"
              placeholder="可自动获取，也可直接手动输入"
            >
              <el-option v-for="item in providerModelOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <div class="provider-model-actions">
              <el-button :loading="isFetchingProviderModels" link type="primary" @click="discoverProviderModels">
                自动获取模型
              </el-button>
              <span class="section-note">
                {{ providerModelResolvedUrl ? `已从 ${providerModelResolvedUrl} 读取模型列表` : '如果暂时取不到模型列表，也可以直接手动填写模型名' }}
              </span>
            </div>
            <el-alert
              v-if="providerModelFetchError"
              class="provider-model-alert"
              :closable="false"
              show-icon
              title="自动获取失败"
              type="warning"
            >
              <template #default>
                <p class="provider-model-alert-text">{{ providerModelFetchError }}</p>
              </template>
            </el-alert>
          </el-form-item>
        </div>
        <el-form-item label="Base URL"><el-input v-model="providerForm.base_url" placeholder="https://api.openai.com/v1" /></el-form-item>
        <el-form-item :label="editingProviderId ? 'API Key（留空不更新）' : 'API Key'">
          <el-input v-model="providerForm.api_key" show-password type="password" />
        </el-form-item>
        <div class="admin-grid two-col">
          <el-form-item label="设为默认"><el-switch v-model="providerForm.is_default" /></el-form-item>
          <el-form-item label="启用"><el-switch v-model="providerForm.is_enabled" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="providerDialogVisible = false">取消</el-button>
        <el-button :loading="isSavingProvider" type="primary" @click="saveProvider">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';

import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from '@/api/http';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

type ClassProfileEditPermissions = {
  can_edit_name: boolean;
  can_edit_gender: boolean;
  can_edit_photo: boolean;
  can_edit_class: boolean;
};

type BootstrapPayload = {
  system: {
    platform_name: string;
    school_name: string;
    active_grade_nos: number[];
    theme_code: string;
    student_register_enabled: boolean;
    assistant_enabled: boolean;
    remote_proxy_url: string;
    auto_attendance_on_login: boolean;
    group_drive_file_max_count: number;
    group_drive_single_file_max_mb: number;
    group_drive_allowed_extensions: string;
    class_transfer_review_note_presets_text: string;
    class_transfer_unreview_reason_presets_text: string;
  };
  theme_presets: Array<{ code: string; name: string; description: string }>;
  assistant_prompts: { general_prompt: string; lesson_prompt: string };
  assistant_runtime: {
    temperature: number;
    top_p: number | null;
    max_tokens: number | null;
    presence_penalty: number | null;
    frequency_penalty: number | null;
    streaming_enabled: boolean;
    thinking_enabled: boolean;
  };
  classes: Array<{
    id: number;
    grade_no: number;
    class_no: number;
    class_name: string;
    head_teacher_name: string | null;
    default_room_id: number | null;
    student_count: number;
    profile_edit_permissions: ClassProfileEditPermissions;
  }>;
  archived_classes: Array<{
    id: number;
    class_name: string;
    original_class_name: string;
    promoted_to_class_name: string;
    moved_student_count: number;
    archived_at: string | null;
  }>;
  teachers: Array<{ id: number; username: string; display_name: string; title: string | null; is_admin: boolean; class_ids: number[] }>;
  rooms: Array<{ id: number; name: string; row_count: number; col_count: number; description: string | null; seats: Array<{ id?: number; row_no: number; col_no: number; seat_label: string; ip_address: string; hostname: string | null; is_enabled: boolean }> }>;
  stats: { class_count: number; teacher_count: number; student_count: number; room_count: number; archived_class_count: number };
};
type CurriculumBook = { id: number; name: string; subject: string; edition: string; grade_scope: string; units: Array<{ id: number; title: string; term_no: number; unit_no: number; lessons: Array<{ id: number; title: string; lesson_no: number; summary: string | null }> }> };
type CurriculumImportResult = {
  processed_row_count: number;
  created_book_count: number;
  created_unit_count: number;
  updated_unit_count: number;
  created_lesson_count: number;
  updated_lesson_count: number;
};
type AssistantPromptSettings = { general_prompt: string; lesson_prompt: string };
type AssistantRuntimeSettings = {
  temperature: number;
  top_p: number | null;
  max_tokens: number | null;
  presence_penalty: number | null;
  frequency_penalty: number | null;
  streaming_enabled: boolean;
  thinking_enabled: boolean;
};
type PromotionPreviewPayload = {
  grade_increment: number;
  items: Array<{
    source_class_id: number;
    source_class_name: string;
    student_count: number;
    target_class_name: string;
    status: 'ready' | 'blocked';
    reason: string;
  }>;
  summary: {
    source_class_count: number;
    blocked_count: number;
    ready_count: number;
    student_count: number;
  };
};
type AIProviderRecord = {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  model_name: string;
  is_default: boolean;
  is_enabled: boolean;
  has_api_key: boolean;
  masked_api_key: string;
  updated_at: string | null;
};
type AIProviderModelDiscoveryResult = {
  items: string[];
  resolved_url: string;
};
type TeacherEditorForm = {
  username: string;
  display_name: string;
  title: string;
  password: string;
  is_admin: boolean;
  class_ids: number[];
};
type RoomSeat = BootstrapPayload['rooms'][number]['seats'][number];
type RoomSeatDraftPayload = { row_count: number; col_count: number; seats: RoomSeat[] };
type AdminTab = 'system' | 'accounts' | 'promotions' | 'rooms' | 'curriculum' | 'ai-providers';

const ROOM_GRID_MAX = 50;
const AI_PROVIDER_CONFIG_UPDATED_EVENT = 'learnsite:ai-provider-config-updated';
const ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT = 'learnsite:assistant-runtime-config-updated';
const seatImportAccept = '.csv,.txt,.tsv,.xlsx';
const studentImportAccept = '.csv,.txt,.tsv,.xlsx';
const curriculumImportAccept = '.csv,.txt,.tsv,.xlsx';
const providerTypeOptions = [
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
];
const defaultClassProfileEditPermissions: ClassProfileEditPermissions = {
  can_edit_name: true,
  can_edit_gender: true,
  can_edit_photo: true,
  can_edit_class: true,
};
const adminQueryTabs: AdminTab[] = ['system', 'accounts', 'promotions', 'rooms', 'curriculum'];
const curriculumGradeScopeOptions = [
  '一年级上册',
  '一年级下册',
  '二年级上册',
  '二年级下册',
  '三年级上册',
  '三年级下册',
  '七年级上册',
  '七年级下册',
  '八年级上册',
  '八年级下册',
  '九年级上册',
  '九年级下册',
];

const authStore = useAuthStore();
const appStore = useAppStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref<AdminTab>('system');
const bootstrap = ref<BootstrapPayload | null>(null);
const curriculumBooks = ref<CurriculumBook[]>([]);
const aiProviders = ref<AIProviderRecord[]>([]);
const selectedRoomId = ref<number | null>(null);
const roomSeatDraft = ref<RoomSeat[]>([]);
const roomGridRows = ref(1);
const roomGridCols = ref(1);
const draggingSeat = ref<RoomSeat | null>(null);
const dragOverCellKey = ref('');
const seatImportInputRef = ref<HTMLInputElement | null>(null);
const studentImportInputRef = ref<HTMLInputElement | null>(null);
const curriculumImportInputRef = ref<HTMLInputElement | null>(null);
const teacherEditorSectionRef = ref<HTMLElement | null>(null);
const isLoading = ref(true);
const isSavingSystem = ref(false);
const isImportingSeats = ref(false);
const isImportingStudents = ref(false);
const isImportingCurriculum = ref(false);
const isPreviewingPromotion = ref(false);
const isExecutingPromotion = ref(false);
const errorMessage = ref('');

const systemForm = ref({
  platform_name: 'OW³教学评AI平台',
  school_name: '',
  active_grade_nos: [] as number[],
  theme_code: 'mango-splash',
  student_register_enabled: false,
  assistant_enabled: false,
  remote_proxy_url: '',
  auto_attendance_on_login: true,
  group_drive_file_max_count: 50,
  group_drive_single_file_max_mb: 20,
  group_drive_allowed_extensions: '',
  class_transfer_review_note_presets_text: '',
  class_transfer_unreview_reason_presets_text: '',
});
const promotionForm = ref({
  source_class_ids: [] as number[],
  grade_increment: 1,
  copy_teacher_assignments: true,
  archive_source_classes: true,
});
const promotionPreview = ref<PromotionPreviewPayload | null>(null);
const assistantPromptForm = ref<AssistantPromptSettings>({ general_prompt: '', lesson_prompt: '' });
const assistantRuntimeForm = ref<AssistantRuntimeSettings>({
  temperature: 0.4,
  top_p: null,
  max_tokens: null,
  presence_penalty: null,
  frequency_penalty: null,
  streaming_enabled: true,
  thinking_enabled: false,
});
const classDialogVisible = ref(false);
const classProfilePermissionDialogVisible = ref(false);
const classBatchDialogVisible = ref(false);
const studentImportDialogVisible = ref(false);
const teacherDialogVisible = ref(false);
const roomDialogVisible = ref(false);
const bookDialogVisible = ref(false);
const unitDialogVisible = ref(false);
const lessonDialogVisible = ref(false);
const providerDialogVisible = ref(false);
const isSavingProvider = ref(false);
const isFetchingProviderModels = ref(false);
const isSavingAssistantPrompts = ref(false);
const isSavingAssistantRuntimeSettings = ref(false);
const isSavingClassBatch = ref(false);
const isSavingClassProfilePermission = ref(false);
const isSavingInlineClassProfilePermission = ref(false);
const isSavingTeacherEditor = ref(false);

const editingClassId = ref<number | null>(null);
const editingClassProfilePermissionId = ref<number | null>(null);
const editingTeacherId = ref<number | null>(null);
const editingRoomId = ref<number | null>(null);
const editingBookId = ref<number | null>(null);
const editingUnitId = ref<number | null>(null);
const editingLessonId = ref<number | null>(null);
const editingProviderId = ref<number | null>(null);
const editingBookParentId = ref<number | null>(null);
const editingUnitParentId = ref<number | null>(null);

const classForm = ref({ grade_no: 7, class_no: 1, head_teacher_name: '', default_room_id: null as number | null });
const classProfilePermissionForm = ref<ClassProfileEditPermissions>({ ...defaultClassProfileEditPermissions });
const inlineClassProfilePermissionClassId = ref<number | null>(null);
const inlineClassProfilePermissionForm = ref<ClassProfileEditPermissions>({ ...defaultClassProfileEditPermissions });
const classBatchForm = ref({ lines: '', overwrite_existing: false });
const studentImportForm = ref({ update_existing: false, default_password: '123456' });
const teacherForm = ref({ username: '', display_name: '', title: '', password: '', is_admin: false, class_ids: [] as number[] });
const teacherEditorTeacherId = ref<number | null>(null);
const teacherEditorForm = ref<TeacherEditorForm>({
  username: '',
  display_name: '',
  title: '',
  password: '',
  is_admin: false,
  class_ids: [],
});
const roomForm = ref({ name: '', row_count: 2, col_count: 6, description: '', ip_prefix: '', ip_start: 11 });
const bookForm = ref({ name: '', subject: '信息科技', edition: '浙教版', grade_scope: '' });
const unitForm = ref({ book_id: 0, term_no: 1, unit_no: 1, title: '' });
const lessonForm = ref({ unit_id: 0, lesson_no: 1, title: '', summary: '' });
const providerForm = ref({ name: '', provider_type: 'openai-compatible', base_url: '', api_key: '', model_name: '', is_default: false, is_enabled: true });
const providerModelOptions = ref<string[]>([]);
const providerModelResolvedUrl = ref('');
const providerModelFetchError = ref('');

const selectedRoom = computed(() => bootstrap.value?.rooms.find((item) => item.id === selectedRoomId.value) ?? null);
const editingClassProfilePermissionName = computed(() => {
  const classId = editingClassProfilePermissionId.value;
  if (!classId) {
    return '';
  }
  return bootstrap.value?.classes.find((item) => item.id === classId)?.class_name || '';
});
const selectedStudentImportFileName = ref('');
const selectedCurriculumImportFileName = ref('');
const maxSeatRow = computed(() => roomSeatDraft.value.reduce((max, seat) => Math.max(max, seat.row_no), 1));
const maxSeatCol = computed(() => roomSeatDraft.value.reduce((max, seat) => Math.max(max, seat.col_no), 1));
const roomLayoutStyle = computed(() => ({ gridTemplateColumns: `repeat(${Math.max(roomGridCols.value, 1)}, minmax(0, 1fr))` }));
const roomLayoutCells = computed(() => {
  const cells: Array<{ row: number; col: number; seat: RoomSeat | null; seatIndex: number | null }> = [];
  for (let row = 1; row <= roomGridRows.value; row += 1) {
    for (let col = 1; col <= roomGridCols.value; col += 1) {
      const seatIndex = roomSeatDraft.value.findIndex((item) => item.row_no === row && item.col_no === col);
      cells.push({
        row,
        col,
        seat: seatIndex >= 0 ? roomSeatDraft.value[seatIndex] : null,
        seatIndex: seatIndex >= 0 ? seatIndex : null,
      });
    }
  }
  return cells;
});

function cloneSeats(seats: RoomSeat[]) {
  return JSON.parse(JSON.stringify(seats)) as RoomSeat[];
}

function sortRoomSeatDraft() {
  roomSeatDraft.value.sort((left, right) => (
    left.row_no - right.row_no
    || left.col_no - right.col_no
    || (left.id ?? 0) - (right.id ?? 0)
  ));
}

function setRoomDraft(payload: RoomSeatDraftPayload) {
  roomSeatDraft.value = cloneSeats(payload.seats);
  sortRoomSeatDraft();
  roomGridRows.value = Math.max(1, Math.min(ROOM_GRID_MAX, payload.row_count));
  roomGridCols.value = Math.max(1, Math.min(ROOM_GRID_MAX, payload.col_count));
  draggingSeat.value = null;
  dragOverCellKey.value = '';
}

function resetProviderModelDiscovery() {
  providerModelOptions.value = [];
  providerModelResolvedUrl.value = '';
  providerModelFetchError.value = '';
}

function formatProviderModelFetchError(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim() || String(error);
  }
  return String(error ?? '');
}

function resetProviderForm() {
  resetProviderModelDiscovery();
  providerForm.value = {
    name: '',
    provider_type: 'openai-compatible',
    base_url: '',
    api_key: '',
    model_name: '',
    is_default: false,
    is_enabled: true,
  };
}

function notifyAIProviderConfigUpdated() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(AI_PROVIDER_CONFIG_UPDATED_EVENT));
}

function notifyAssistantRuntimeConfigUpdated() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(ASSISTANT_RUNTIME_CONFIG_UPDATED_EVENT));
}

function roomName(roomId: number | null) {
  return bootstrap.value?.rooms.find((item) => item.id === roomId)?.name || '未绑定';
}

function teacherClassNames(classIds: number[]) {
  return classIds.map((id) => bootstrap.value?.classes.find((item) => item.id === id)?.class_name || '').filter(Boolean);
}

function buildTeacherFormFromItem(item?: BootstrapPayload['teachers'][number]): TeacherEditorForm {
  if (!item) {
    return { username: '', display_name: '', title: '', password: '', is_admin: false, class_ids: [] };
  }
  return {
    username: item.username,
    display_name: item.display_name,
    title: item.title || '',
    password: '',
    is_admin: item.is_admin,
    class_ids: [...item.class_ids],
  };
}

function syncTeacherEditorForm(teacherIdValue?: number | null) {
  const teacherId = typeof teacherIdValue === 'number'
    ? teacherIdValue
    : teacherEditorTeacherId.value;
  if (!teacherId) {
    teacherEditorForm.value = buildTeacherFormFromItem();
    return;
  }
  const teacherItem = bootstrap.value?.teachers.find((item) => item.id === teacherId);
  teacherEditorForm.value = buildTeacherFormFromItem(teacherItem);
}

function ensureTeacherEditorTeacherId(preferredTeacherId?: number | null) {
  const teacherItems = bootstrap.value?.teachers ?? [];
  if (!teacherItems.length) {
    teacherEditorTeacherId.value = null;
    teacherEditorForm.value = buildTeacherFormFromItem();
    return;
  }
  const candidateTeacherId = preferredTeacherId ?? teacherEditorTeacherId.value;
  const resolvedTeacherId = (
    candidateTeacherId !== null
    && candidateTeacherId !== undefined
    && teacherItems.some((item) => item.id === candidateTeacherId)
  )
    ? candidateTeacherId
    : teacherItems[0].id;
  teacherEditorTeacherId.value = resolvedTeacherId;
  syncTeacherEditorForm(resolvedTeacherId);
}

function openTeacherEditor(item: BootstrapPayload['teachers'][number]) {
  ensureTeacherEditorTeacherId(item.id);
  void nextTick(() => {
    teacherEditorSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function classProfileEditPermissions(item: BootstrapPayload['classes'][number]): ClassProfileEditPermissions {
  return {
    ...defaultClassProfileEditPermissions,
    ...(item.profile_edit_permissions || {}),
  };
}

function syncInlineClassProfilePermissionForm(classIdValue?: number | null) {
  const classId = classIdValue ?? inlineClassProfilePermissionClassId.value;
  if (!classId) {
    inlineClassProfilePermissionForm.value = { ...defaultClassProfileEditPermissions };
    return;
  }
  const classItem = bootstrap.value?.classes.find((item) => item.id === classId);
  inlineClassProfilePermissionForm.value = classItem
    ? classProfileEditPermissions(classItem)
    : { ...defaultClassProfileEditPermissions };
}

function ensureInlineClassProfilePermissionClassId(preferredClassId?: number | null) {
  const classItems = bootstrap.value?.classes ?? [];
  if (!classItems.length) {
    inlineClassProfilePermissionClassId.value = null;
    inlineClassProfilePermissionForm.value = { ...defaultClassProfileEditPermissions };
    return;
  }
  const candidateClassId = preferredClassId ?? inlineClassProfilePermissionClassId.value;
  const resolvedClassId = (
    candidateClassId !== null
    && candidateClassId !== undefined
    && classItems.some((item) => item.id === candidateClassId)
  )
    ? candidateClassId
    : classItems[0].id;
  inlineClassProfilePermissionClassId.value = resolvedClassId;
  syncInlineClassProfilePermissionForm(resolvedClassId);
}

function isDialogCancelled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

function resolveTabFromRoute(): AdminTab {
  if (route.path.endsWith('/admin/ai-providers')) {
    return 'ai-providers';
  }

  const tab = route.query.tab;
  if (typeof tab === 'string' && adminQueryTabs.includes(tab as AdminTab)) {
    return tab as AdminTab;
  }

  return 'system';
}

async function loadBootstrap() {
  bootstrap.value = await apiGet<BootstrapPayload>('/settings/admin/bootstrap', authStore.token);
  systemForm.value = { ...bootstrap.value.system, active_grade_nos: [...bootstrap.value.system.active_grade_nos] };
  assistantPromptForm.value = { ...bootstrap.value.assistant_prompts };
  assistantRuntimeForm.value = { ...bootstrap.value.assistant_runtime };
  const allClassIds = new Set(bootstrap.value.classes.map((item) => item.id));
  const sourceClassIds = promotionForm.value.source_class_ids.filter((item) => allClassIds.has(item));
  promotionForm.value.source_class_ids = sourceClassIds.length
    ? sourceClassIds
    : bootstrap.value.classes.filter((item) => item.student_count > 0).map((item) => item.id);
  if (!promotionForm.value.source_class_ids.length) {
    promotionPreview.value = null;
  }
  ensureInlineClassProfilePermissionClassId();
  ensureTeacherEditorTeacherId();
  selectedRoomId.value = selectedRoomId.value && bootstrap.value.rooms.some((room) => room.id === selectedRoomId.value) ? selectedRoomId.value : bootstrap.value.rooms[0]?.id ?? null;
}

async function loadCurriculum() {
  const payload = await apiGet<{ books: CurriculumBook[] }>('/curriculum/tree', authStore.token);
  curriculumBooks.value = payload.books;
}

function downloadCurriculumImportTemplateFile() {
  const templatePath = `${import.meta.env.BASE_URL}templates/curriculum-import-template.csv`;
  const anchor = document.createElement('a');
  anchor.href = templatePath;
  anchor.download = '教材树导入模板.csv';
  anchor.click();
}

function openCurriculumImportPicker() {
  curriculumImportInputRef.value?.click();
}

function handleCurriculumImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  selectedCurriculumImportFileName.value = input?.files?.[0]?.name || '';
}

async function submitCurriculumImport() {
  if (!authStore.token) {
    return;
  }

  const file = curriculumImportInputRef.value?.files?.[0];
  if (!file) {
    ElMessage.warning('请先选择要导入的教材文件');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  isImportingCurriculum.value = true;

  try {
    const payload = await apiUpload<{ books: CurriculumBook[]; import_result?: CurriculumImportResult }>(
      '/curriculum/import',
      formData,
      authStore.token
    );
    curriculumBooks.value = payload.books;
    if (curriculumImportInputRef.value) {
      curriculumImportInputRef.value.value = '';
    }
    selectedCurriculumImportFileName.value = '';

    if (payload.import_result) {
      ElMessage.success(
        `教材导入完成：处理 ${payload.import_result.processed_row_count} 行，新增教材 ${payload.import_result.created_book_count} 本，新增单元 ${payload.import_result.created_unit_count} 个，新增课次 ${payload.import_result.created_lesson_count} 个`
      );
      return;
    }
    ElMessage.success('教材导入完成');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '教材导入失败');
  } finally {
    isImportingCurriculum.value = false;
  }
}

async function loadAIProviders() {
  const payload = await apiGet<{ items: AIProviderRecord[] }>('/settings/ai-providers', authStore.token);
  aiProviders.value = payload.items;
}

async function loadPage() {
  if (!authStore.token) {
    errorMessage.value = '请先使用管理员账号登录';
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    await Promise.all([loadBootstrap(), loadCurriculum(), loadAIProviders()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载管理员后台失败';
  } finally {
    isLoading.value = false;
  }
}

watch(selectedRoom, (room) => {
  if (room) {
    setRoomDraft({ row_count: room.row_count, col_count: room.col_count, seats: room.seats });
    return;
  }
  roomSeatDraft.value = [];
  roomGridRows.value = 1;
  roomGridCols.value = 1;
  draggingSeat.value = null;
  dragOverCellKey.value = '';
}, { immediate: true });

watch(() => [route.path, route.query.tab], () => {
  const nextTab = resolveTabFromRoute();
  if (activeTab.value !== nextTab) {
    activeTab.value = nextTab;
  }
}, { immediate: true });

watch(
  () => bootstrap.value?.classes,
  () => {
    ensureInlineClassProfilePermissionClassId();
  }
);

watch(
  () => bootstrap.value?.teachers,
  () => {
    ensureTeacherEditorTeacherId();
  }
);

watch(activeTab, (tab) => {
  if (tab === resolveTabFromRoute()) {
    return;
  }

  if (tab === 'ai-providers') {
    void router.replace({ path: '/staff/admin/ai-providers' });
    return;
  }

  if (tab === 'system') {
    void router.replace({ path: '/staff/admin/system' });
    return;
  }

  void router.replace({
    path: '/staff/admin/system',
    query: { tab },
  });
});

function findFirstEmptyCell() {
  for (let row = 1; row <= roomGridRows.value; row += 1) {
    for (let col = 1; col <= roomGridCols.value; col += 1) {
      const occupied = roomSeatDraft.value.some((seat) => seat.row_no === row && seat.col_no === col);
      if (!occupied) {
        return { row, col };
      }
    }
  }
  return null;
}

function buildCellKey(row: number, col: number) {
  return `${row}-${col}`;
}

function handleSeatDragStart(event: DragEvent, seat: RoomSeat | null) {
  if (!seat) {
    return;
  }
  draggingSeat.value = seat;
  dragOverCellKey.value = buildCellKey(seat.row_no, seat.col_no);

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.setData('text/plain', seat.id ? String(seat.id) : buildCellKey(seat.row_no, seat.col_no));
  }
}

function handleSeatDragOver(event: DragEvent, row: number, col: number) {
  if (!draggingSeat.value) {
    return;
  }
  dragOverCellKey.value = buildCellKey(row, col);

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleSeatDragEnd() {
  draggingSeat.value = null;
  dragOverCellKey.value = '';
}

function handleSeatDrop(event: DragEvent, row: number, col: number) {
  event.preventDefault();

  const sourceSeat = draggingSeat.value;
  if (!sourceSeat) {
    return;
  }

  const targetSeat = roomSeatDraft.value.find(
    (seat) => seat !== sourceSeat && seat.row_no === row && seat.col_no === col
  );

  const originalRow = sourceSeat.row_no;
  const originalCol = sourceSeat.col_no;
  sourceSeat.row_no = row;
  sourceSeat.col_no = col;

  if (targetSeat) {
    targetSeat.row_no = originalRow;
    targetSeat.col_no = originalCol;
  }

  sortRoomSeatDraft();
  draggingSeat.value = null;
  dragOverCellKey.value = '';
}

function normalizeGridValue(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(ROOM_GRID_MAX, Math.trunc(value)));
}

function handleRoomGridRowsChange() {
  const nextValue = normalizeGridValue(roomGridRows.value, maxSeatRow.value);
  if (nextValue < maxSeatRow.value) {
    roomGridRows.value = maxSeatRow.value;
    ElMessage.warning(`当前第 ${maxSeatRow.value} 行仍有座位，请先移动或删除这些座位后再缩小行数`);
    return;
  }
  roomGridRows.value = nextValue;
}

function handleRoomGridColsChange() {
  const nextValue = normalizeGridValue(roomGridCols.value, maxSeatCol.value);
  if (nextValue < maxSeatCol.value) {
    roomGridCols.value = maxSeatCol.value;
    ElMessage.warning(`当前第 ${maxSeatCol.value} 列仍有座位，请先移动或删除这些座位后再缩小列数`);
    return;
  }
  roomGridCols.value = nextValue;
}

function csvEscapeCell(value: string | number | boolean | null | undefined) {
  const text = `${value ?? ''}`;
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildTemplateSeats() {
  if (roomSeatDraft.value.length) {
    return [...roomSeatDraft.value].sort((left, right) => (
      left.row_no - right.row_no
      || left.col_no - right.col_no
      || (left.id ?? 0) - (right.id ?? 0)
    ));
  }

  const generatedSeats: RoomSeat[] = [];
  for (let row = 1; row <= roomGridRows.value; row += 1) {
    for (let col = 1; col <= roomGridCols.value; col += 1) {
      generatedSeats.push({
        row_no: row,
        col_no: col,
        seat_label: `${row}-${col}`,
        ip_address: '',
        hostname: null,
        is_enabled: true,
      });
    }
  }
  return generatedSeats;
}

function downloadSeatTemplate() {
  if (!selectedRoom.value) {
    return;
  }

  const csvRows = [
    ['行号', '列号', '座位号', 'IP地址', '主机名', '是否启用'],
    ...buildTemplateSeats().map((seat) => [
      seat.row_no,
      seat.col_no,
      seat.seat_label,
      seat.ip_address,
      seat.hostname ?? '',
      seat.is_enabled ? '是' : '否',
    ]),
  ];
  const csvContent = `\uFEFF${csvRows.map((row) => row.map((cell) => csvEscapeCell(cell)).join(',')).join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `${selectedRoom.value.name}-座位导入模板.csv`;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

function openSeatImportPicker() {
  seatImportInputRef.value?.click();
}

async function handleSeatImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!input) {
    return;
  }
  if (!file || !authStore.token || !selectedRoomId.value) {
    input.value = '';
    return;
  }

  isImportingSeats.value = true;
  const formData = new FormData();
  formData.append('file', file);

  try {
    const payload = await apiUpload<RoomSeatDraftPayload>(
      `/settings/admin/rooms/${selectedRoomId.value}/seats/import`,
      formData,
      authStore.token
    );
    setRoomDraft(payload);
    ElMessage.success(`已导入 ${payload.seats.length} 个座位，请检查后再保存`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入座位表失败');
  } finally {
    isImportingSeats.value = false;
    input.value = '';
  }
}

async function saveSystemSettings() {
  if (!authStore.token) return;
  isSavingSystem.value = true;
  try {
    const {
      platform_name: _platformName,
      ...systemSettingsPayload
    } = systemForm.value;
    void _platformName;
    const payload = await apiPut<BootstrapPayload['system']>('/settings/system', systemSettingsPayload, authStore.token);
    systemForm.value = { ...payload, active_grade_nos: [...payload.active_grade_nos] };
    appStore.applySystemTheme(payload.theme_code);
    appStore.applyPlatformTitle(payload.platform_name);
    ElMessage.success('系统参数已更新');
    await loadBootstrap();
  } finally {
    isSavingSystem.value = false;
  }
}

async function saveAssistantPrompts() {
  if (!authStore.token) return;
  isSavingAssistantPrompts.value = true;
  try {
    const payload = await apiPut<AssistantPromptSettings>(
      '/settings/assistant-prompts',
      assistantPromptForm.value,
      authStore.token
    );
    assistantPromptForm.value = { ...payload };
    if (bootstrap.value) {
      bootstrap.value.assistant_prompts = { ...payload };
    }
    ElMessage.success('AI 学伴提示词已更新');
  } finally {
    isSavingAssistantPrompts.value = false;
  }
}

async function saveAssistantRuntimeSettings() {
  if (!authStore.token) return;
  isSavingAssistantRuntimeSettings.value = true;
  try {
    const payload = await apiPut<AssistantRuntimeSettings>(
      '/settings/assistant-runtime',
      assistantRuntimeForm.value,
      authStore.token
    );
    assistantRuntimeForm.value = { ...payload };
    if (bootstrap.value) {
      bootstrap.value.assistant_runtime = { ...payload };
    }
    notifyAssistantRuntimeConfigUpdated();
    ElMessage.success('AI 学伴运行参数已更新');
  } finally {
    isSavingAssistantRuntimeSettings.value = false;
  }
}

async function previewPromotions() {
  if (!authStore.token) return;
  if (!promotionForm.value.source_class_ids.length) {
    ElMessage.warning('请先选择至少一个待升班级');
    return;
  }

  isPreviewingPromotion.value = true;
  try {
    const payload = await apiPost<PromotionPreviewPayload>(
      '/settings/admin/promotions/preview',
      {
        source_class_ids: [...promotionForm.value.source_class_ids],
        grade_increment: promotionForm.value.grade_increment,
      },
      authStore.token
    );
    promotionPreview.value = payload;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '升班预览失败');
  } finally {
    isPreviewingPromotion.value = false;
  }
}

async function executePromotions() {
  if (!authStore.token) return;
  if (!promotionForm.value.source_class_ids.length) {
    ElMessage.warning('请先选择至少一个待升班级');
    return;
  }

  await ElMessageBox.confirm('确认执行升班吗？该操作会迁移学生并可能归档原班级。');
  isExecutingPromotion.value = true;
  try {
    const payload = await apiPost<
      BootstrapPayload & {
        promotion_preview?: PromotionPreviewPayload;
        promotion_result?: {
          moved_student_count: number;
          created_target_count: number;
          reused_target_count: number;
          archived_count: number;
          blocked_count: number;
        };
      }
    >(
      '/settings/admin/promotions/execute',
      {
        source_class_ids: [...promotionForm.value.source_class_ids],
        grade_increment: promotionForm.value.grade_increment,
        copy_teacher_assignments: promotionForm.value.copy_teacher_assignments,
        archive_source_classes: promotionForm.value.archive_source_classes,
      },
      authStore.token
    );
    bootstrap.value = payload;
    systemForm.value = { ...payload.system, active_grade_nos: [...payload.system.active_grade_nos] };
    promotionPreview.value = payload.promotion_preview || null;
    const result = payload.promotion_result;
    if (result) {
      ElMessage.success(
        `升班完成：迁移 ${result.moved_student_count} 人，新建 ${result.created_target_count} 班，归档 ${result.archived_count} 班`
      );
    } else {
      ElMessage.success('升班任务已完成');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '执行升班失败');
  } finally {
    isExecutingPromotion.value = false;
  }
}

function openClassDialog(item?: BootstrapPayload['classes'][number]) {
  editingClassId.value = item?.id ?? null;
  classForm.value = item ? { grade_no: item.grade_no, class_no: item.class_no, head_teacher_name: item.head_teacher_name || '', default_room_id: item.default_room_id } : { grade_no: 7, class_no: 1, head_teacher_name: '', default_room_id: null };
  classDialogVisible.value = true;
}

function openClassProfilePermissionDialog(item: BootstrapPayload['classes'][number]) {
  editingClassProfilePermissionId.value = item.id;
  classProfilePermissionForm.value = classProfileEditPermissions(item);
  classProfilePermissionDialogVisible.value = true;
}

function openClassBatchDialog() {
  classBatchForm.value = { lines: '', overwrite_existing: false };
  classBatchDialogVisible.value = true;
}

function parseClassBatchLines(lines: string) {
  const parsedItems: Array<{ grade_no: number; class_no: number; head_teacher_name: string; default_room_id: number | null }> = [];
  const rawLines = lines.split(/\r?\n/);
  rawLines.forEach((rawLine, index) => {
    const text = rawLine.trim();
    if (!text || text.startsWith('#')) {
      return;
    }
    const parts = text.split(/[,\t，]+/).map((item) => item.trim());
    if (parts.length < 2) {
      throw new Error(`第 ${index + 1} 行格式不正确，至少需要“年级,班号”`);
    }
    const gradeNo = Number(parts[0]);
    const classNo = Number(parts[1]);
    if (!Number.isInteger(gradeNo) || gradeNo < 1 || gradeNo > 12) {
      throw new Error(`第 ${index + 1} 行的年级必须是 1-12 的整数`);
    }
    if (!Number.isInteger(classNo) || classNo < 1 || classNo > 99) {
      throw new Error(`第 ${index + 1} 行的班号必须是 1-99 的整数`);
    }
    let defaultRoomId: number | null = null;
    if (parts[3]) {
      const parsedRoomId = Number(parts[3]);
      if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        throw new Error(`第 ${index + 1} 行的默认机房 ID 必须是正整数`);
      }
      defaultRoomId = parsedRoomId;
    }
    parsedItems.push({
      grade_no: gradeNo,
      class_no: classNo,
      head_teacher_name: parts[2] || '',
      default_room_id: defaultRoomId,
    });
  });
  return parsedItems;
}

async function saveClass() {
  if (!authStore.token) return;
  const path = editingClassId.value ? `/settings/admin/classes/${editingClassId.value}` : '/settings/admin/classes';
  const method = editingClassId.value ? apiPut : apiPost;
  const payload = await method<BootstrapPayload>(path, classForm.value, authStore.token);
  bootstrap.value = payload;
  classDialogVisible.value = false;
  ElMessage.success(editingClassId.value ? '班级已更新' : '班级已创建');
}

async function saveClassProfilePermissions() {
  if (!authStore.token || !editingClassProfilePermissionId.value) return;
  isSavingClassProfilePermission.value = true;
  try {
    const payload = await apiPut<BootstrapPayload>(
      `/settings/admin/classes/${editingClassProfilePermissionId.value}/profile-edit-permissions`,
      classProfilePermissionForm.value,
      authStore.token
    );
    bootstrap.value = payload;
    ensureInlineClassProfilePermissionClassId(editingClassProfilePermissionId.value);
    classProfilePermissionDialogVisible.value = false;
    ElMessage.success('班级资料修改权限已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存班级资料修改权限失败');
  } finally {
    isSavingClassProfilePermission.value = false;
  }
}

async function saveInlineClassProfilePermissions() {
  if (!authStore.token) return;
  const classId = inlineClassProfilePermissionClassId.value;
  if (!classId) {
    ElMessage.warning('请先选择班级');
    return;
  }
  isSavingInlineClassProfilePermission.value = true;
  try {
    const payload = await apiPut<BootstrapPayload>(
      `/settings/admin/classes/${classId}/profile-edit-permissions`,
      inlineClassProfilePermissionForm.value,
      authStore.token
    );
    bootstrap.value = payload;
    ensureInlineClassProfilePermissionClassId(classId);
    ElMessage.success('当前班级资料修改权限已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存班级资料修改权限失败');
  } finally {
    isSavingInlineClassProfilePermission.value = false;
  }
}

async function saveClassBatch() {
  if (!authStore.token) return;
  let items: Array<{ grade_no: number; class_no: number; head_teacher_name: string; default_room_id: number | null }> = [];
  try {
    items = parseClassBatchLines(classBatchForm.value.lines);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量班级格式错误');
    return;
  }
  if (!items.length) {
    ElMessage.warning('请先输入至少一条班级数据');
    return;
  }

  isSavingClassBatch.value = true;
  try {
    const payload = await apiPost<
      BootstrapPayload & {
        batch_result?: { created_count: number; updated_count: number; skipped_count: number };
      }
    >(
      '/settings/admin/classes/batch',
      {
        items,
        overwrite_existing: classBatchForm.value.overwrite_existing,
      },
      authStore.token
    );
    bootstrap.value = payload;
    classBatchDialogVisible.value = false;
    const result = payload.batch_result;
    if (result) {
      ElMessage.success(`批量完成：新增 ${result.created_count}，更新 ${result.updated_count}，跳过 ${result.skipped_count}`);
    } else {
      ElMessage.success('批量班级操作已完成');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量添加班级失败');
  } finally {
    isSavingClassBatch.value = false;
  }
}

async function deleteClass(classId: number) {
  if (!authStore.token) return;
  await ElMessageBox.confirm('确认删除这个班级吗？');
  bootstrap.value = await apiDelete<BootstrapPayload>(`/settings/admin/classes/${classId}`, authStore.token);
  ElMessage.success('班级已删除');
}

function openStudentImportDialog() {
  studentImportForm.value = { update_existing: false, default_password: '123456' };
  selectedStudentImportFileName.value = '';
  if (studentImportInputRef.value) {
    studentImportInputRef.value.value = '';
  }
  studentImportDialogVisible.value = true;
}

function openStudentImportPicker() {
  studentImportInputRef.value?.click();
}

function handleStudentImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  selectedStudentImportFileName.value = input?.files?.[0]?.name || '';
}

async function submitStudentImport() {
  if (!authStore.token) return;
  const file = studentImportInputRef.value?.files?.[0];
  if (!file) {
    ElMessage.warning('请先选择要导入的学生文件');
    return;
  }
  const password = studentImportForm.value.default_password.trim();
  if (password.length < 6) {
    ElMessage.warning('默认初始密码不能少于 6 位');
    return;
  }

  isImportingStudents.value = true;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('update_existing', studentImportForm.value.update_existing ? 'true' : 'false');
  formData.append('default_password', password);
  try {
    const payload = await apiUpload<
      BootstrapPayload & {
        import_result?: { created_count: number; updated_count: number; skipped_count: number };
      }
    >('/settings/admin/students/import', formData, authStore.token);
    bootstrap.value = payload;
    studentImportDialogVisible.value = false;
    if (studentImportInputRef.value) {
      studentImportInputRef.value.value = '';
    }
    selectedStudentImportFileName.value = '';
    const result = payload.import_result;
    if (result) {
      ElMessage.success(`导入完成：新增 ${result.created_count}，更新 ${result.updated_count}，跳过 ${result.skipped_count}`);
    } else {
      ElMessage.success('学生导入完成');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量导入学生失败');
  } finally {
    isImportingStudents.value = false;
  }
}

function openTeacherDialog(item?: BootstrapPayload['teachers'][number]) {
  editingTeacherId.value = item?.id ?? null;
  teacherForm.value = buildTeacherFormFromItem(item);
  teacherDialogVisible.value = true;
}

async function saveTeacher() {
  if (!authStore.token) return;
  const path = editingTeacherId.value ? `/settings/admin/teachers/${editingTeacherId.value}` : '/settings/admin/teachers';
  const method = editingTeacherId.value ? apiPut : apiPost;
  const payload = {
    username: teacherForm.value.username.trim(),
    display_name: teacherForm.value.display_name.trim(),
    title: teacherForm.value.title.trim() || null,
    password: teacherForm.value.password.trim() || null,
    is_admin: teacherForm.value.is_admin,
    class_ids: [...teacherForm.value.class_ids],
  };

  try {
    bootstrap.value = await method<BootstrapPayload>(path, payload, authStore.token);
    ensureTeacherEditorTeacherId(editingTeacherId.value);
    teacherDialogVisible.value = false;

    if (editingTeacherId.value && Number(authStore.user?.id) === editingTeacherId.value) {
      await authStore.syncSessionUser(true);
      if (!authStore.isAdmin) {
        await router.replace('/staff/dashboard');
      }
    }

    ElMessage.success(editingTeacherId.value ? '教师已更新' : '教师已创建');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存教师失败');
  }
}

async function saveTeacherEditor() {
  if (!authStore.token) return;
  const teacherId = teacherEditorTeacherId.value;
  if (!teacherId) {
    ElMessage.warning('请先选择需要编辑的教师');
    return;
  }
  const payload = {
    username: teacherEditorForm.value.username.trim(),
    display_name: teacherEditorForm.value.display_name.trim(),
    title: teacherEditorForm.value.title.trim() || null,
    password: teacherEditorForm.value.password.trim() || null,
    is_admin: teacherEditorForm.value.is_admin,
    class_ids: [...teacherEditorForm.value.class_ids],
  };

  if (!payload.username || !payload.display_name) {
    ElMessage.warning('账号和姓名不能为空');
    return;
  }

  isSavingTeacherEditor.value = true;
  try {
    bootstrap.value = await apiPut<BootstrapPayload>(
      `/settings/admin/teachers/${teacherId}`,
      payload,
      authStore.token
    );
    ensureTeacherEditorTeacherId(teacherId);
    teacherEditorForm.value.password = '';

    if (Number(authStore.user?.id) === teacherId) {
      await authStore.syncSessionUser(true);
      if (!authStore.isAdmin) {
        await router.replace('/staff/dashboard');
      }
    }

    ElMessage.success('教师信息已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存教师信息失败');
  } finally {
    isSavingTeacherEditor.value = false;
  }
}

async function deleteTeacher(teacherId: number) {
  if (!authStore.token) return;
  await ElMessageBox.confirm('确认删除这个教师账号吗？');
  bootstrap.value = await apiDelete<BootstrapPayload>(`/settings/admin/teachers/${teacherId}`, authStore.token);
  ensureTeacherEditorTeacherId();
  ElMessage.success('教师已删除');
}

function openRoomDialog(item?: BootstrapPayload['rooms'][number]) {
  editingRoomId.value = item?.id ?? null;
  roomForm.value = item ? { name: item.name, row_count: item.row_count, col_count: item.col_count, description: item.description || '', ip_prefix: '', ip_start: 11 } : { name: '', row_count: 2, col_count: 6, description: '', ip_prefix: '', ip_start: 11 };
  roomDialogVisible.value = true;
}

async function saveRoom() {
  if (!authStore.token) return;
  const path = editingRoomId.value ? `/settings/admin/rooms/${editingRoomId.value}` : '/settings/admin/rooms';
  const method = editingRoomId.value ? apiPut : apiPost;
  bootstrap.value = await method<BootstrapPayload>(path, roomForm.value, authStore.token);
  roomDialogVisible.value = false;
  selectedRoomId.value = editingRoomId.value ?? bootstrap.value.rooms[bootstrap.value.rooms.length - 1]?.id ?? null;
  ElMessage.success(editingRoomId.value ? '机房已更新' : '机房已创建');
}

async function deleteRoom(roomId: number) {
  if (!authStore.token) return;
  await ElMessageBox.confirm('确认删除这个机房吗？');
  bootstrap.value = await apiDelete<BootstrapPayload>(`/settings/admin/rooms/${roomId}`, authStore.token);
  selectedRoomId.value = bootstrap.value.rooms[0]?.id ?? null;
  ElMessage.success('机房已删除');
}

function addSeatDraft() {
  let target = findFirstEmptyCell();
  if (!target) {
    if (roomGridRows.value >= ROOM_GRID_MAX) {
      ElMessage.warning(`机房行数最多支持 ${ROOM_GRID_MAX} 行，请先调整布局或删除空座位`);
      return;
    }
    roomGridRows.value += 1;
    target = { row: roomGridRows.value, col: 1 };
  }
  roomSeatDraft.value.push({
    row_no: target.row,
    col_no: target.col,
    seat_label: `新座位${roomSeatDraft.value.length + 1}`,
    ip_address: '',
    hostname: '',
    is_enabled: true,
  });
  sortRoomSeatDraft();
}

function removeSeatDraft(index: number) {
  roomSeatDraft.value.splice(index, 1);
  sortRoomSeatDraft();
}

async function saveSeatDraft() {
  if (!authStore.token || !selectedRoomId.value) return;
  if (roomGridRows.value < maxSeatRow.value) {
    ElMessage.warning(`当前第 ${maxSeatRow.value} 行仍有座位，请先调整后再保存`);
    roomGridRows.value = maxSeatRow.value;
    return;
  }
  if (roomGridCols.value < maxSeatCol.value) {
    ElMessage.warning(`当前第 ${maxSeatCol.value} 列仍有座位，请先调整后再保存`);
    roomGridCols.value = maxSeatCol.value;
    return;
  }
  bootstrap.value = await apiPut<BootstrapPayload>(
    `/settings/admin/rooms/${selectedRoomId.value}/seats`,
    {
      row_count: roomGridRows.value,
      col_count: roomGridCols.value,
      seats: roomSeatDraft.value.map((seat) => ({
        id: seat.id,
        row_no: seat.row_no,
        col_no: seat.col_no,
        seat_label: seat.seat_label,
        ip_address: seat.ip_address,
        hostname: seat.hostname,
        is_enabled: seat.is_enabled,
      })),
    },
    authStore.token
  );
  ElMessage.success('机房座位已更新');
}

function openBookDialog(book?: CurriculumBook) {
  editingBookId.value = book?.id ?? null;
  bookForm.value = book ? { name: book.name, subject: book.subject, edition: book.edition, grade_scope: book.grade_scope } : { name: '', subject: '信息科技', edition: '浙教版', grade_scope: '' };
  bookDialogVisible.value = true;
}

async function saveBook() {
  if (!authStore.token) return;
  const path = editingBookId.value ? `/curriculum/books/${editingBookId.value}` : '/curriculum/books';
  const method = editingBookId.value ? apiPut : apiPost;
  await method(path, bookForm.value, authStore.token);
  bookDialogVisible.value = false;
  await loadCurriculum();
  ElMessage.success(editingBookId.value ? '教材已更新' : '教材已创建');
}

async function deleteBook(bookId: number) {
  if (!authStore.token) return;
  try {
    await ElMessageBox.confirm('确认删除这本教材吗？');
    await apiDelete(`/curriculum/books/${bookId}`, authStore.token);
    await loadCurriculum();
    ElMessage.success('教材已删除');
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除教材失败');
  }
}

function openUnitDialog(bookId: number, unit?: CurriculumBook['units'][number]) {
  editingUnitId.value = unit?.id ?? null;
  editingBookParentId.value = bookId;
  unitForm.value = unit ? { book_id: bookId, term_no: unit.term_no, unit_no: unit.unit_no, title: unit.title } : { book_id: bookId, term_no: 1, unit_no: 1, title: '' };
  unitDialogVisible.value = true;
}

async function saveUnit() {
  if (!authStore.token) return;
  const path = editingUnitId.value ? `/curriculum/units/${editingUnitId.value}` : '/curriculum/units';
  const method = editingUnitId.value ? apiPut : apiPost;
  await method(path, unitForm.value, authStore.token);
  unitDialogVisible.value = false;
  await loadCurriculum();
  ElMessage.success(editingUnitId.value ? '单元已更新' : '单元已创建');
}

async function deleteUnit(unitId: number) {
  if (!authStore.token) return;
  try {
    await ElMessageBox.confirm('确认删除这个单元吗？');
    await apiDelete(`/curriculum/units/${unitId}`, authStore.token);
    await loadCurriculum();
    ElMessage.success('单元已删除');
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除单元失败');
  }
}

function openLessonDialog(unitId: number, lesson?: CurriculumBook['units'][number]['lessons'][number]) {
  editingLessonId.value = lesson?.id ?? null;
  editingUnitParentId.value = unitId;
  lessonForm.value = lesson ? { unit_id: unitId, lesson_no: lesson.lesson_no, title: lesson.title, summary: lesson.summary || '' } : { unit_id: unitId, lesson_no: 1, title: '', summary: '' };
  lessonDialogVisible.value = true;
}

async function saveLesson() {
  if (!authStore.token) return;
  const path = editingLessonId.value ? `/curriculum/lessons/${editingLessonId.value}` : '/curriculum/lessons';
  const method = editingLessonId.value ? apiPut : apiPost;
  await method(path, lessonForm.value, authStore.token);
  lessonDialogVisible.value = false;
  await loadCurriculum();
  ElMessage.success(editingLessonId.value ? '课次已更新' : '课次已创建');
}

async function deleteLesson(lessonId: number) {
  if (!authStore.token) return;
  try {
    await ElMessageBox.confirm('确认删除这个课次吗？');
    await apiDelete(`/curriculum/lessons/${lessonId}`, authStore.token);
    await loadCurriculum();
    ElMessage.success('课次已删除');
  } catch (error) {
    if (isDialogCancelled(error)) {
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除课次失败');
  }
}

function openProviderDialog(provider?: AIProviderRecord) {
  editingProviderId.value = provider?.id ?? null;
  resetProviderModelDiscovery();
  if (provider) {
    providerForm.value = {
      name: provider.name,
      provider_type: provider.provider_type,
      base_url: provider.base_url,
      api_key: '',
      model_name: provider.model_name,
      is_default: provider.is_default,
      is_enabled: provider.is_enabled,
    };
    providerModelOptions.value = provider.model_name ? [provider.model_name] : [];
  } else {
    resetProviderForm();
  }
  providerDialogVisible.value = true;
}

async function discoverProviderModels() {
  if (!authStore.token) return;

  const payload = {
    provider_type: providerForm.value.provider_type.trim(),
    base_url: providerForm.value.base_url.trim(),
    api_key: providerForm.value.api_key.trim() || undefined,
    provider_id: editingProviderId.value ?? undefined,
  };

  if (!payload.base_url) {
    ElMessage.warning('请先填写 Base URL，再自动获取模型，例如 https://your-host/v1');
    return;
  }

  isFetchingProviderModels.value = true;
  providerModelFetchError.value = '';
  providerModelResolvedUrl.value = '';

  try {
    const response = await apiPost<AIProviderModelDiscoveryResult>(
      '/settings/ai-providers/discover-models',
      payload,
      authStore.token
    );
    providerModelOptions.value = [...response.items];
    providerModelResolvedUrl.value = response.resolved_url;
    if (!providerForm.value.model_name.trim() && response.items.length) {
      providerForm.value.model_name = response.items[0];
    }
    ElMessage.success(`已获取 ${response.items.length} 个可用模型`);
  } catch (error) {
    providerModelOptions.value = [];
    providerModelResolvedUrl.value = '';
    providerModelFetchError.value = formatProviderModelFetchError(error);
    ElMessage.warning('自动获取失败，请根据下方提示检查配置');
  } finally {
    isFetchingProviderModels.value = false;
  }
}

async function saveProvider() {
  if (!authStore.token) return;

  const payload = {
    ...providerForm.value,
    name: providerForm.value.name.trim(),
    provider_type: providerForm.value.provider_type.trim(),
    base_url: providerForm.value.base_url.trim(),
    api_key: providerForm.value.api_key.trim(),
    model_name: providerForm.value.model_name.trim(),
  };

  if (!payload.name || !payload.base_url || !payload.model_name) {
    ElMessage.warning('请填写完整的服务名称、Base URL 和模型名称');
    return;
  }
  if (!editingProviderId.value && !payload.api_key) {
    ElMessage.warning('新建服务时必须提供 API Key');
    return;
  }

  isSavingProvider.value = true;
  try {
    const path = editingProviderId.value ? `/settings/ai-providers/${editingProviderId.value}` : '/settings/ai-providers';
    const method = editingProviderId.value ? apiPut : apiPost;
    const response = await method<{ items: AIProviderRecord[] }>(path, payload, authStore.token);
    aiProviders.value = response.items;
    notifyAIProviderConfigUpdated();
    providerDialogVisible.value = false;
    ElMessage.success(editingProviderId.value ? 'AI 模型服务已更新' : 'AI 模型服务已创建');
  } finally {
    isSavingProvider.value = false;
  }
}

async function deleteProvider(providerId: number) {
  if (!authStore.token) return;
  await ElMessageBox.confirm('确认删除这个 AI 模型服务吗？');
  const response = await apiDelete<{ items: AIProviderRecord[] }>(`/settings/ai-providers/${providerId}`, authStore.token);
  aiProviders.value = response.items;
  notifyAIProviderConfigUpdated();
  ElMessage.success('AI 模型服务已删除');
}

watch(
  () => [providerForm.value.provider_type, providerForm.value.base_url, providerForm.value.api_key],
  (nextValues, previousValues) => {
    if (!providerDialogVisible.value || !previousValues) {
      return;
    }
    const changed = nextValues.some((value, index) => value !== previousValues[index]);
    if (!changed) {
      return;
    }
    resetProviderModelDiscovery();
    if (providerForm.value.model_name.trim()) {
      providerModelOptions.value = [providerForm.value.model_name.trim()];
    }
  }
);

onMounted(() => {
  void loadPage();
});
</script>

<style scoped>
.panel{padding:22px}
.admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.two-col{grid-template-columns:repeat(2,minmax(0,1fr))}
.panel-head,.chip-row,.switch-stack,.room-grid-toolbar{display:flex;justify-content:space-between;gap:12px}
.panel-head{align-items:flex-start}
.chip-row,.switch-stack,.room-grid-toolbar{flex-wrap:wrap}
.switch-stack{flex-direction:column}
.grid-number-input{width:96px;padding:8px 10px;border:1px solid var(--ls-border);border-radius:10px;background:#fff;color:var(--ls-text)}
.full-width,.room-radio-group{width:100%}
.curriculum-block{padding:14px 0;border-top:1px dashed var(--ls-border)}
.list-stack{display:flex;flex-direction:column;gap:14px}
.list-card{padding:16px;border:1px solid var(--ls-border);border-radius:18px;background:rgba(255,255,255,.84)}
.file-input{display:none}
.room-layout-board{display:grid;gap:10px;margin-bottom:16px}
.room-layout-cell{position:relative;min-height:92px;padding:22px 10px 10px;border:1px dashed var(--ls-border);border-radius:18px;background:rgba(245,248,255,.78)}
.room-layout-cell.is-drop-target{border-color:rgba(67,109,185,.5);background:rgba(226,236,255,.92);box-shadow:inset 0 0 0 1px rgba(67,109,185,.16)}
.room-layout-axis{position:absolute;top:8px;left:10px;font-size:12px;color:var(--ls-muted)}
.drag-seat-card,.drag-seat-empty{display:flex;flex-direction:column;justify-content:center;min-height:58px;border-radius:14px;padding:10px}
.drag-seat-card{cursor:grab;border:1px solid rgba(67,109,185,.18);background:#fff;box-shadow:0 6px 14px rgba(38,61,112,.08)}
.drag-seat-card.is-dragging{cursor:grabbing;opacity:.72}
.drag-seat-card strong{color:var(--ls-text)}
.drag-seat-card span,.drag-seat-empty{font-size:12px;color:var(--ls-muted)}
.drag-seat-empty{border:1px dashed rgba(67,109,185,.18);background:rgba(255,255,255,.5);align-items:center}
.provider-card{display:flex;flex-direction:column;gap:14px}
.provider-meta{align-items:center;color:var(--ls-muted);font-size:13px}
.provider-actions{justify-content:flex-end}
.provider-model-field{grid-column:1 / -1}
.provider-model-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
.provider-model-alert{margin-top:10px;width:100%;overflow:hidden}
.provider-model-alert :deep(.el-alert__content){min-width:0}
.provider-model-alert :deep(.el-alert__title){display:block;line-height:1.45}
.provider-model-alert-body{display:grid;gap:8px}
.provider-model-alert-text{margin:0;white-space:pre-line;line-height:1.55;overflow-wrap:anywhere;word-break:break-word}
.provider-model-alert-list{margin:0;padding-left:18px;display:grid;gap:4px;line-height:1.5}
.provider-model-alert-list li{overflow-wrap:anywhere;word-break:break-word}
.panel-stack-gap{margin-bottom:16px}
@media (max-width: 1100px){.admin-grid,.two-col{grid-template-columns:1fr}}
</style>
