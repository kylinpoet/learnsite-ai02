<template>
  <div class="page-stack teacher-dashboard">
    <section class="hero-panel dashboard-hero">
      <div>
        <p class="eyebrow">教师工作台</p>
        <h2>{{ pageTitle }}</h2>
        <p class="hero-copy">
          把当前班级、课程、座位签到、小组协作和共享资料集中放在一个入口里，教师一进后台就能快速看到课堂状态。
        </p>
        <div class="chip-row">
          <el-tag
            v-for="role in dashboard?.current_user.roles || []"
            :key="role"
            round
            :type="role === 'admin' ? 'warning' : 'success'"
          >
            {{ role === 'admin' ? '管理员权限' : '教师权限' }}
          </el-tag>
        </div>
      </div>

      <div class="chip-row hero-actions">
        <el-button type="primary" @click="openLaunchpad">课堂会话中心</el-button>
        <el-button plain @click="router.push('/staff/lesson-plans')">学案管理</el-button>
        <el-button plain @click="router.push('/staff/submissions')">作品评分</el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <div class="soft-card panel">
          <el-skeleton :rows="10" />
        </div>
      </template>

      <template #default>
        <template v-if="dashboard">
          <section class="metric-grid dashboard-metric-grid">
            <article v-for="item in dashboardMetricCards" :key="item.label" class="metric-tile dashboard-metric-card">
              <div class="dashboard-metric-card__top">
                <span class="dashboard-metric-card__icon" :class="`dashboard-metric-card__icon--${item.tone}`">
                  <AppIcon :icon="item.icon" :size="20" />
                </span>
                <p class="metric-label">{{ item.label }}</p>
              </div>
              <p class="metric-value">{{ item.value }}</p>
              <p class="metric-note">{{ item.note }}</p>
            </article>
          </section>

          <section class="dashboard-insights-grid">
            <article class="soft-card panel dashboard-chart-card">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">班级节奏</p>
                  <h3>签到与到课分布</h3>
                  <p class="section-note">按可开课班级查看今日已签到与待签到人数，方便快速判断课堂状态。</p>
                </div>
                <el-tag round type="info">{{ dashboard.launchpad.classes.length }} 个班级</el-tag>
              </div>
              <el-empty v-if="!dashboard.launchpad.classes.length" description="当前还没有可视化班级数据" />
              <AppChart v-else :height="280" :option="classAttendanceChartOption" />
            </article>

            <article class="soft-card panel dashboard-chart-card">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">今日重点</p>
                  <h3>工作台任务分布</h3>
                  <p class="section-note">把签到、待评阅和推荐作品放进同一张图里，帮助老师先处理最紧急的事项。</p>
                </div>
                <el-tag round type="warning">实时总览</el-tag>
              </div>
              <AppChart :height="280" :option="teacherOpsChartOption" />
            </article>
          </section>

          <section class="soft-card panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">课堂聚焦</p>
                <h3>班级与课程</h3>
              </div>
              <div class="chip-row">
                <el-tag round>{{ selectedClass?.student_count || 0 }} 名学生</el-tag>
                <el-tag round type="success">{{ selectedPlan?.task_count || 0 }} 个任务</el-tag>
              </div>
            </div>

            <div class="launch-row">
              <el-select v-model="launchForm.class_id" class="full-width" filterable placeholder="请选择班级">
                <el-option
                  v-for="item in dashboard.launchpad.classes"
                  :key="item.id"
                  :label="`${item.class_name} · ${item.student_count}人 · 已签到${item.checked_in_count}人`"
                  :value="item.id"
                />
              </el-select>

              <el-select v-model="launchForm.plan_id" class="full-width" filterable placeholder="请选择学案">
                <el-option
                  v-for="item in dashboard.launchpad.ready_plans"
                  :key="item.id"
                  :label="`${item.title} · ${item.unit_title} / ${item.lesson_title}`"
                  :value="item.id"
                />
              </el-select>

              <div class="chip-row">
                <el-button
                  :disabled="!launchForm.class_id || !launchForm.plan_id"
                  :loading="isLaunching"
                  type="primary"
                  @click="startClassroom"
                >
                  开始上课
                </el-button>
                <el-button v-if="authStore.isAdmin" plain @click="openRoomSettings">
                  系统设置中维护座位表
                </el-button>
              </div>
            </div>

            <div class="hint-box">
              <p class="hint-title">课堂预览</p>
              <p class="section-note">{{ launchPreviewText }}</p>
            </div>
          </section>

          <section v-if="focusRoster" class="soft-card panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">当前班级</p>
                <h3>
                  {{ focusRoster.class_name }}
                  <span v-if="focusRoster.room"> · {{ focusRoster.room.name }}</span>
                </h3>
                <p class="section-note">
                  系统设置中维护好机房座位号与 IP 后，学生登录就会按 IP 自动匹配座位并点亮。
                </p>
                <p v-if="focusRoster.focus_plan" class="section-note">
                  当前会话学案：{{ focusRoster.focus_plan.title }}（座位卡同步展示提交状态）
                </p>
              </div>
              <div class="chip-row">
                <el-tag round>{{ focusRoster.student_count }} 名学生</el-tag>
                <el-tag round type="success">已签到 {{ focusRoster.checked_in_count }}</el-tag>
                <el-tag round type="warning">未签到 {{ focusRoster.pending_signin_count }}</el-tag>
              </div>
            </div>
            <div class="submission-legend">
              <span class="legend-item"><span class="submission-square submission-square-none"></span>未交</span>
              <span class="legend-item"><span class="submission-square submission-square-partial"></span>部分提交</span>
              <span class="legend-item"><span class="submission-square submission-square-completed"></span>完成</span>
            </div>

            <div v-if="focusRoster.room" class="seat-grid-shell">
              <div class="seat-grid" :style="seatGridStyle">
                <article
                  v-for="seat in focusRoster.seats"
                  :key="seat.seat_key"
                  class="seat-card"
                  :class="{
                    'seat-card-empty': !seat.student,
                    'seat-card-signed': seat.signed_in_today,
                    'seat-card-virtual': seat.is_virtual,
                    'seat-card-disabled': !seat.is_enabled,
                  }"
                >
                  <div class="seat-top">
                    <strong>座位 {{ seat.seat_label }}</strong>
                    <span>{{ seat.is_virtual ? '未配置座位' : `IP ${seat.ip_address}` }}</span>
                  </div>

                  <template v-if="seat.student">
                    <div class="seat-name-row">
                      <p class="seat-name">{{ seat.student.display_name }}</p>
                      <span
                        class="submission-square"
                        :class="submissionSquareClass(seat.student.focus_plan_submission_stage)"
                      />
                    </div>
                  </template>

                  <template v-else>
                    <p class="seat-name seat-name-empty">
                      {{ seat.is_virtual ? '该网格位置未配置座位' : '当前位置无人登录' }}
                    </p>
                    <p class="seat-meta">
                      {{ seat.is_virtual ? '请在系统设置补齐该位置座位' : (seat.hostname || '空座位') }}
                    </p>
                  </template>
                </article>
              </div>
            </div>
            <el-empty v-else description="当前班级还没有绑定机房，请先维护座位表" />

            <div v-if="focusRoster.unassigned_students.length" class="hint-box">
              <p class="hint-title">未签到学生</p>
              <div class="chip-row">
                <el-tag
                  v-for="student in focusRoster.unassigned_students"
                  :key="student.user_id"
                  round
                  type="info"
                >
                  {{ student.display_name }}
                </el-tag>
              </div>
            </div>
          </section>

          <section class="soft-card panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">小组协作</p>
                <h3>按班查看小组与共享文件</h3>
                <p class="section-note">
                  当前跟随顶部班级选择切换，只展示这个班的小组成员、签到、座位和共享文件。
                </p>
              </div>
              <div class="chip-row">
                <el-tag round>{{ focusGroupSummary?.group_count || 0 }} 个小组</el-tag>
                <el-tag round type="success">共享文件 {{ focusGroupSummary?.shared_file_count || 0 }}</el-tag>
                <el-button plain :loading="groupLoading" @click="refreshFocusGroupOverview">刷新小组</el-button>
                <el-button plain :disabled="!focusClassId" @click="openGroupManager">分组维护</el-button>
              </div>
            </div>

            <el-alert
              v-if="groupError"
              :closable="false"
              :title="groupError"
              class="section-alert"
              type="error"
            />

            <div v-else-if="groupLoading" class="group-grid">
              <div v-for="index in 2" :key="index" class="group-card group-card-skeleton">
                <el-skeleton animated :rows="7" />
              </div>
            </div>

            <template v-else-if="groupOverview">
              <div class="chip-row class-summary-row">
                <el-tag round>{{ groupOverview.class.class_name }}</el-tag>
                <el-tag round>{{ groupOverview.class.student_count }} 名学生</el-tag>
                <el-tag round type="success">已签到 {{ groupOverview.class.checked_in_count }}</el-tag>
              </div>

              <div v-if="groupOverview.groups.length" class="group-grid">
                <article v-for="group in groupOverview.groups" :key="group.id" class="group-card">
                  <div class="group-card-top">
                    <div>
                      <p class="group-name">{{ group.name }}</p>
                      <p class="group-note">
                        第 {{ group.group_no }} 组
                        <span v-if="group.leader_name"> · 组长 {{ group.leader_name }}</span>
                      </p>
                    </div>
                    <div class="chip-row group-chip-row">
                      <el-tag round>{{ group.member_count }} 人</el-tag>
                      <el-tag round type="success">已到课 {{ group.checked_in_count }}</el-tag>
                      <el-tag round type="warning">待到课 {{ group.pending_count }}</el-tag>
                    </div>
                  </div>

                  <p class="group-description">
                    {{ group.description || '本组可共享资料、协作编辑和提交课堂任务素材。' }}
                  </p>

                  <div class="member-strip">
                    <article
                      v-for="member in group.members"
                      :key="member.user_id"
                      class="member-pill"
                      :class="{ 'member-pill-signed': member.checked_in_today }"
                    >
                      <div class="member-pill-top">
                        <span class="member-name">{{ member.display_name }}</span>
                        <el-tag round size="small" :type="member.role === 'leader' ? 'success' : 'info'">
                          {{ member.role === 'leader' ? '组长' : '成员' }}
                        </el-tag>
                      </div>
                      <p class="member-note">{{ member.student_no }}</p>
                      <p class="member-note">
                        {{ member.seat_label || '未绑定座位' }}
                        <span v-if="member.room_name"> · {{ member.room_name }}</span>
                      </p>
                      <p class="member-note">
                        {{ member.checked_in_today ? `签到 ${formatDateTime(member.checked_in_at)}` : '未签到' }}
                      </p>
                    </article>
                  </div>

<div class="drive-panel">
                    <div class="panel-head drive-panel-head">
                      <div>
                        <p class="group-name group-name-small">{{ group.shared_drive.display_name }}</p>
                        <p class="group-note">
                          已用 {{ formatBytes(group.shared_drive.used_bytes) }} / {{ group.shared_drive.quota_mb }} MB
                        </p>
                      </div>
                      <div class="chip-row">
                        <el-tag round type="warning">{{ group.shared_drive.file_count }} 个文件</el-tag>
                        <input
                          :id="groupUploadInputId(group.id)"
                          hidden
                          multiple
                          type="file"
                          @change="handleGroupUploadChange(group, $event)"
                        />
                        <el-button
                          plain
                          size="small"
                          :disabled="uploadingGroupId !== null && uploadingGroupId !== group.id"
                          :loading="uploadingGroupId === group.id"
                          @click="openGroupUploadPicker(group.id)"
                        >
                          上传资料
                        </el-button>
                      </div>
                    </div>

                    <el-progress
                      :percentage="Math.min(group.shared_drive.usage_percent, 100)"
                      :stroke-width="16"
                      status="success"
                    />
                    <p class="file-meta">{{ groupDriveLimitText(group.shared_drive.limits) }}</p>

                    <div v-if="group.shared_drive.files.length" class="file-list">
                      <article v-for="file in group.shared_drive.files.slice(0, 5)" :key="file.id" class="file-item">
                        <div class="file-main">
                          <p class="file-name">{{ file.name }}</p>
                          <p class="file-meta">
                            {{ file.ext.toUpperCase() || 'FILE' }} · {{ file.size_kb }} KB ·
                            {{ formatDateTime(file.updated_at) }}
                          </p>
                          <p v-if="file.uploaded_by_name" class="file-meta">
                            上传者 {{ file.uploaded_by_name }}
                            <span v-if="file.uploaded_by_student_no"> / {{ file.uploaded_by_student_no }}</span>
                          </p>
                        </div>
                        <el-button
                          link
                          type="primary"
                          :loading="downloadingGroupFileId === file.id"
                          @click="downloadGroupFile(file)"
                        >
                          下载
                        </el-button>
                      </article>
                    </div>
                    <el-empty v-else description="这个小组还没有共享文件" :image-size="72" />
                  </div>

                  <div class="activity-panel">
                    <div class="panel-head drive-panel-head">
                      <div>
                        <p class="group-name group-name-small">课堂动态</p>
                        <p class="group-note">同步展示签到、共享文件和小组共同提交的最近动作。</p>
                      </div>
                      <el-tag round type="info">{{ group.activity_feed.length }} 条</el-tag>
                    </div>

                    <div v-if="group.activity_feed.length" class="activity-list">
                      <article
                        v-for="event in group.activity_feed.slice(0, 4)"
                        :key="event.id"
                        class="activity-item"
                      >
                        <div class="panel-head activity-head">
                          <div>
                            <p class="file-name">{{ event.title }}</p>
                            <p class="file-meta">{{ event.description }}</p>
                          </div>
                          <el-tag round size="small" :type="activityTagType(event.event_type)">
                            {{ event.event_label }}
                          </el-tag>
                        </div>
                        <p class="file-meta">
                          {{ formatDateTime(event.occurred_at) }}
                          <span v-if="event.actor_name"> · {{ event.actor_name }}</span>
                          <span v-if="event.actor_student_no"> · {{ event.actor_student_no }}</span>
                        </p>
                      </article>
                    </div>
                    <el-empty v-else description="这个小组还没有新的课堂动态" :image-size="72" />
                  </div>

                  <div class="activity-panel">
                    <div class="panel-head drive-panel-head">
                      <div>
                        <p class="group-name group-name-small">操作日志</p>
                        <p class="group-note">持久化记录分组调整、共享文件、共享草稿与正式提交，便于课后追溯。</p>
                      </div>
                      <el-tag round type="warning">{{ group.operation_logs.length }} 条</el-tag>
                    </div>

                    <div v-if="group.operation_logs.length" class="activity-list">
                      <article
                        v-for="log in group.operation_logs.slice(0, 4)"
                        :key="`group-log-${log.id}`"
                        class="activity-item"
                      >
                        <div class="panel-head activity-head">
                          <div>
                            <p class="file-name">{{ log.title }}</p>
                            <p class="file-meta">{{ log.description }}</p>
                          </div>
                          <el-tag round size="small" :type="operationTagType(log.event_type)">
                            {{ log.event_label }}
                          </el-tag>
                        </div>
                        <p class="file-meta">
                          {{ formatDateTime(log.occurred_at) }}
                          <span v-if="log.actor_name"> 路 {{ log.actor_name }}</span>
                          <span v-if="log.actor_role"> 路 {{ roleText(log.actor_role) }}</span>
                        </p>
                      </article>
                    </div>
                    <el-empty v-else description="这个小组还没有操作日志" :image-size="72" />
                  </div>
                </article>
              </div>

              <el-empty v-else description="当前班级还没有建立小组" />
            </template>
          </section>

          <section class="soft-card panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">小组任务进度</p>
                <h3>按班查看当前学案的小组共同提交完成度</h3>
                <p class="section-note">
                  跟随顶部的班级和学案选择切换，只聚焦“小组共同提交”任务。老师可以快速看出哪些小组还没开始、哪些已经提交、哪些已经评阅。
                </p>
              </div>
              <div class="chip-row">
                <el-tag round>{{ groupTaskProgressSummary?.task_count || 0 }} 个小组任务</el-tag>
                <el-tag round type="success">
                  已提交 {{ groupTaskProgressSummary?.submitted_count || 0 }}/{{ groupTaskProgressSummary?.slot_count || 0 }}
                </el-tag>
                <el-tag round type="warning">
                  已评阅 {{ groupTaskProgressSummary?.reviewed_count || 0 }}/{{ groupTaskProgressSummary?.slot_count || 0 }}
                </el-tag>
                <el-button plain :loading="groupTaskProgressLoading" @click="refreshGroupTaskProgress">刷新进度</el-button>
              </div>
            </div>

            <el-alert
              v-if="groupTaskProgressError"
              :closable="false"
              :title="groupTaskProgressError"
              class="section-alert"
              type="error"
            />

            <el-empty
              v-else-if="!focusClassId || !launchForm.plan_id"
              description="请先在页面顶部选择班级和学案"
            />

            <div v-else-if="groupTaskProgressLoading" class="progress-skeleton-grid">
              <div v-for="index in 2" :key="index" class="progress-card progress-card-skeleton">
                <el-skeleton animated :rows="8" />
              </div>
            </div>

            <template v-else-if="groupTaskProgress">
              <div class="chip-row class-summary-row">
                <el-tag round>{{ groupTaskProgress.class.class_name }}</el-tag>
                <el-tag round type="success">{{ groupTaskProgress.plan.title }}</el-tag>
                <el-tag round>{{ groupTaskProgress.plan.unit_title }} / {{ groupTaskProgress.plan.lesson_title }}</el-tag>
              </div>

              <el-empty
                v-if="!groupTaskProgress.tasks.length"
                description="当前学案还没有设置小组共同提交任务"
              />

              <template v-else>
                <div class="progress-overview-grid">
                  <article
                    v-for="group in groupTaskCompletionRows"
                    :key="group.group_id"
                    class="progress-card"
                  >
                    <div class="group-card-top">
                      <div>
                        <p class="group-name">{{ group.group_name }}</p>
                        <p class="group-note">
                          第 {{ group.group_no }} 组
                          <span v-if="group.leader_name"> · 组长 {{ group.leader_name }}</span>
                        </p>
                      </div>
                      <div class="chip-row group-chip-row">
                        <el-tag round>{{ group.member_count }} 人</el-tag>
                        <el-tag round type="success">{{ group.submitted_count }}/{{ group.total_task_count }} 已提交</el-tag>
                        <el-tag round type="warning">{{ group.reviewed_count }} 已评阅</el-tag>
                      </div>
                    </div>

                    <el-progress
                      :percentage="group.completion_percent"
                      :stroke-width="16"
                      status="success"
                    />
                    <div class="chip-row progress-chip-row">
                      <el-tag round>待完成 {{ group.pending_count }}</el-tag>
                      <el-tag round type="info">评阅进度 {{ group.review_percent }}%</el-tag>
                    </div>
                  </article>
                </div>

                <div class="task-progress-list">
                  <article v-for="task in groupTaskProgress.tasks" :key="task.task_id" class="progress-card">
                    <div class="panel-head">
                      <div>
                        <p class="group-name">{{ task.task_title }}</p>
                        <p class="group-note">
                          {{ task.task_type === 'programming' ? '编程任务' : '上传任务' }} · 小组共同提交
                        </p>
                      </div>
                      <div class="chip-row group-chip-row">
                        <el-tag round type="success">
                          已提交 {{ task.submitted_count }}/{{ groupTaskProgress.summary.group_count }}
                        </el-tag>
                        <el-tag round type="warning">
                          已评阅 {{ task.reviewed_count }}/{{ groupTaskProgress.summary.group_count }}
                        </el-tag>
                        <el-button link type="primary" @click="openTaskReview(task.task_id)">
                          打开评分页
                        </el-button>
                      </div>
                    </div>

                    <div class="progress-bar-stack">
                      <div class="progress-line">
                        <span class="member-note">提交进度</span>
                        <span class="member-note">{{ progressPercent(task.submitted_count, groupTaskProgress.summary.group_count) }}%</span>
                      </div>
                      <el-progress
                        :percentage="progressPercent(task.submitted_count, groupTaskProgress.summary.group_count)"
                        :stroke-width="14"
                        status="success"
                      />
                      <div class="progress-line">
                        <span class="member-note">评阅进度</span>
                        <span class="member-note">{{ progressPercent(task.reviewed_count, groupTaskProgress.summary.group_count) }}%</span>
                      </div>
                      <el-progress
                        :percentage="progressPercent(task.reviewed_count, groupTaskProgress.summary.group_count)"
                        :stroke-width="14"
                        color="#d48a1f"
                      />
                    </div>

                    <div class="task-progress-grid">
                      <article
                        v-for="item in task.items"
                        :key="`${task.task_id}-${item.group_id}`"
                        class="task-progress-item"
                      >
                        <div class="group-card-top">
                          <div>
                            <p class="member-name">{{ item.group_name }}</p>
                            <p class="member-note">
                              第 {{ item.group_no }} 组
                              <span v-if="item.leader_name"> · 组长 {{ item.leader_name }}</span>
                            </p>
                          </div>
                          <el-tag round :type="groupTaskStatusType(item.status)">
                            {{ groupTaskStatusText(item.status) }}
                          </el-tag>
                        </div>

                        <div class="chip-row progress-chip-row">
                          <el-tag round>{{ item.member_count }} 人</el-tag>
                          <el-tag round type="info">文件 {{ item.file_count }}</el-tag>
                          <el-tag v-if="item.score !== null" round type="success">得分 {{ item.score }}</el-tag>
                          <el-tag v-if="item.is_recommended" round type="warning">推荐作品</el-tag>
                        </div>

                        <p class="member-note">
                          {{ item.submitted_by_name ? `提交人 ${item.submitted_by_name}` : '还没有小组提交记录' }}
                        </p>
                        <p class="member-note">
                          {{ item.updated_at ? `更新时间 ${formatDateTime(item.updated_at)}` : '等待本组开始提交' }}
                        </p>

                        <div v-if="item.submission_id" class="chip-row">
                          <el-button link type="primary" @click="openTaskReview(task.task_id)">去评分</el-button>
                        </div>
                      </article>
                    </div>
                  </article>
                </div>
              </template>
            </template>
          </section>

          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">管理班级</p>
              <p class="metric-value">{{ dashboard.stats.class_count }}</p>
              <p class="metric-note">教师当前可访问的班级数</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">今日签到</p>
              <p class="metric-value">{{ dashboard.today_overview.checked_in_today }}</p>
              <p class="metric-note">待签到 {{ dashboard.today_overview.pending_signin_count }} 人</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">进行中课堂</p>
              <p class="metric-value">{{ dashboard.today_overview.active_session_count }}</p>
              <p class="metric-note">涉及 {{ dashboard.today_overview.active_class_count }} 个班级</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">待评分作品</p>
              <p class="metric-value">{{ dashboard.today_overview.pending_review_count }}</p>
              <p class="metric-note">推荐作品 {{ dashboard.today_overview.recommended_count }} 份</p>
            </article>
          </div>

          <div class="history-grid">
            <section class="soft-card panel">
              <div class="panel-head"><h3>最近课堂</h3></div>
              <el-empty v-if="!dashboard.recent_sessions.length" description="还没有课堂记录" />
              <div v-else class="list-stack">
                <article v-for="item in dashboard.recent_sessions" :key="item.session_id" class="list-card">
                  <div class="panel-head">
                    <div>
                      <h3>{{ item.plan.title }}</h3>
                      <p class="section-note">{{ item.class.name }} · {{ item.plan.lesson_title }}</p>
                    </div>
                    <el-tag round :type="item.status === 'active' ? 'warning' : 'success'">
                      {{ item.status === 'active' ? '进行中' : '已结束' }}
                    </el-tag>
                  </div>
                  <div class="chip-row">
                    <el-tag round>{{ formatDateTime(item.started_at) }}</el-tag>
                    <el-tag round type="success">提交 {{ item.submission_count }}</el-tag>
                    <el-tag round type="warning">待评分 {{ item.pending_review_count }}</el-tag>
                  </div>
                </article>
              </div>
            </section>

            <section class="soft-card panel">
              <div class="panel-head"><h3>最近学案</h3></div>
              <el-empty v-if="!dashboard.recent_plans.length" description="暂无已发布学案" />
              <div v-else class="list-stack">
                <article v-for="item in dashboard.recent_plans" :key="item.id" class="list-card">
                  <h3>{{ item.title }}</h3>
                  <p class="section-note">{{ item.unit_title }} / {{ item.lesson_title }}</p>
                  <div class="chip-row">
                    <el-tag round>{{ item.assigned_date }}</el-tag>
                    <el-tag round type="success">任务 {{ item.task_count }}</el-tag>
                    <el-tag round type="warning">待完成 {{ item.pending_count }}</el-tag>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>
      </template>
    </el-skeleton>

    <el-drawer v-model="groupManagerVisible" :with-header="false" destroy-on-close size="78%">
      <div class="group-manager-shell">
        <div class="drawer-head">
          <div>
            <p class="eyebrow">分组维护</p>
            <h3>{{ groupManagerData?.class.class_name || selectedClass?.class_name || '当前班级' }}</h3>
            <p class="section-note">
              支持一键按组数重组，也支持手动调整成员和组长。保存后，教师小组概览和学生小组页会同步更新。
            </p>
          </div>
          <div class="chip-row">
            <el-tag round>{{ groupManagerData?.class.student_count || editableStudents.length }} 名学生</el-tag>
            <el-tag round type="success">已签到 {{ groupManagerData?.class.checked_in_count || 0 }}</el-tag>
            <el-tag round type="warning">未分组 {{ unassignedStudentCount }}</el-tag>
          </div>
        </div>

        <el-alert v-if="groupManagerError" :closable="false" :title="groupManagerError" type="error" />

        <el-skeleton :loading="groupManagerLoading" animated>
          <template #template>
            <div class="soft-card panel"><el-skeleton :rows="14" /></div>
          </template>

          <template #default>
            <template v-if="groupManagerData">
              <section class="soft-card panel">
                <div class="panel-head">
                  <div>
                    <h3>一键重组</h3>
                    <p class="section-note">
                      重新按人数均分当前班级所有学生。已有共享文件会保留在原小组空间中，不会自动删除。
                    </p>
                  </div>
                  <div class="chip-row">
                    <span class="inline-label">目标小组数</span>
                    <el-input-number
                      v-model="rebuildGroupCount"
                      :min="1"
                      :max="Math.max(editableStudents.length, 1)"
                      controls-position="right"
                    />
                    <el-button :loading="groupManagerRebuilding" type="warning" @click="rebuildGroups">
                      一键重组
                    </el-button>
                    <el-button :loading="groupManagerCreating" plain @click="createGroup">新增小组</el-button>
                    <el-button :loading="groupManagerSaving" type="primary" @click="saveGroupManagement">
                      保存分组
                    </el-button>
                  </div>
                </div>
              </section>

              <section class="soft-card panel">
                <div class="panel-head">
                  <div>
                    <h3>追溯记录</h3>
                    <p class="section-note">按时间汇总当前班级的小组操作，可快速回看是谁做了哪一次调整。</p>
                  </div>
                  <div class="chip-row">
                    <el-tag round type="warning">{{ groupManagerLogTotal }} 条</el-tag>
                    <el-button :loading="groupManagerLogExporting" plain @click="exportGroupManagerLogs">
                      导出 CSV
                    </el-button>
                  </div>
                </div>

                <div class="log-filter-grid">
                  <el-select v-model="groupManagerLogFilters.group_id" clearable placeholder="全部小组">
                    <el-option
                      v-for="item in groupManagerLogGroupOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-select v-model="groupManagerLogFilters.event_type" clearable placeholder="全部事件">
                    <el-option
                      v-for="item in groupOperationEventOptions"
                      :key="item.value || 'all'"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-select v-model="groupManagerLogFilters.actor_user_id" clearable filterable placeholder="全部成员">
                    <el-option
                      v-for="item in groupManagerLogActorOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-input
                    v-model="groupManagerLogFilters.keyword"
                    clearable
                    placeholder="搜索标题、任务、文件、说明"
                    @keyup.enter="refreshGroupManagerLogs"
                  />
                  <div class="chip-row">
                    <el-button :loading="groupManagerLogLoading" type="primary" plain @click="refreshGroupManagerLogs">
                      筛选日志
                    </el-button>
                    <el-button plain @click="resetGroupManagerLogFilters">重置</el-button>
                  </div>
                </div>

                <div v-if="groupManagerLogs.length" class="history-grid">
                  <article
                    v-for="log in groupManagerLogs"
                    :key="`class-log-${log.id}`"
                    class="list-card"
                  >
                    <div class="panel-head activity-head">
                      <div>
                        <p class="group-name group-name-small">{{ log.title }}</p>
                        <p class="section-note">{{ log.description }}</p>
                      </div>
                      <el-tag round size="small" :type="operationTagType(log.event_type)">
                        {{ log.event_label }}
                      </el-tag>
                    </div>
                    <p class="member-note">
                      {{ formatDateTime(log.occurred_at) }}
                      <span v-if="log.group_name"> 路 {{ log.group_name }}</span>
                      <span v-if="log.actor_name"> 路 {{ log.actor_name }}</span>
                      <span v-if="log.actor_role"> 路 {{ roleText(log.actor_role) }}</span>
                    </p>
                  </article>
                </div>
                <el-empty v-else :description="groupManagerLogLoading ? '正在加载小组操作日志' : '当前筛选条件下还没有可追溯的小组操作记录'" />
              </section>

              <div class="group-manager-grid">
                <section class="soft-card panel">
                  <div class="panel-head">
                    <div>
                      <h3>小组配置</h3>
                      <p class="section-note">可修改组名、说明、组长，也可删除空组。</p>
                    </div>
                    <el-tag round>{{ editableGroups.length }} 个小组</el-tag>
                  </div>

                  <div class="group-edit-grid">
                    <article
                      v-for="group in editableGroups"
                      :key="group.id"
                      class="group-edit-card"
                      :class="{ 'group-edit-card-active': isDropZoneActive(group.id) }"
                      @dragover="handleDropZoneDragOver($event, group.id)"
                      @dragleave="handleDropZoneDragLeave($event, group.id)"
                      @drop="handleDropZoneDrop($event, group.id)"
                    >
                      <div class="panel-head group-edit-head">
                        <div>
                          <p class="group-name">第 {{ group.group_no }} 组</p>
                          <p class="group-note">
                            {{ groupMembers(group.id).length }} 人
                            <span v-if="group.has_shared_files"> · 共享文件 {{ group.file_count }} 个</span>
                          </p>
                          <p class="member-note">把学生卡片拖到这里即可加入本组。</p>
                        </div>
                        <el-button link type="danger" :disabled="!canDeleteGroup(group)" @click="deleteGroup(group)">
                          删除空组
                        </el-button>
                      </div>

                      <div class="group-edit-form">
                        <label class="edit-label">
                          <span>组名</span>
                          <el-input v-model="group.name" maxlength="80" />
                        </label>

                        <label class="edit-label">
                          <span>组内说明</span>
                          <el-input
                            v-model="group.description"
                            :rows="2"
                            maxlength="500"
                            show-word-limit
                            type="textarea"
                          />
                        </label>

                        <label class="edit-label">
                          <span>组长</span>
                          <el-select
                            :model-value="group.leader_user_id"
                            class="full-width"
                            clearable
                            placeholder="先给这个组分配成员"
                            @update:model-value="updateGroupLeader(group.id, $event as number | null)"
                          >
                            <el-option
                              v-for="member in groupMembers(group.id)"
                              :key="member.user_id"
                              :label="`${member.display_name} · ${member.student_no}`"
                              :value="member.user_id"
                            />
                          </el-select>
                        </label>

                        <div class="member-preview-list">
                          <article
                            v-for="member in groupMembers(group.id)"
                            :key="member.user_id"
                            class="drag-member-chip"
                            :class="{
                              'drag-member-chip-leader': group.leader_user_id === member.user_id,
                              'drag-member-chip-dragging': draggingStudentUserId === member.user_id,
                            }"
                            draggable="true"
                            @dragstart="handleStudentDragStart(member, $event)"
                            @dragend="handleStudentDragEnd"
                          >
                            <div>
                              <p class="member-name">{{ member.display_name }}</p>
                              <p class="member-note">{{ member.student_no }}</p>
                            </div>
                            <el-tag round size="small" :type="group.leader_user_id === member.user_id ? 'success' : 'info'">
                              {{ group.leader_user_id === member.user_id ? '组长' : '成员' }}
                            </el-tag>
                          </article>
                          <div v-if="!groupMembers(group.id).length" class="drop-zone-empty">当前空组，拖一个学生到这里</div>
                        </div>
                      </div>
                    </article>
                  </div>
                </section>

                <section class="soft-card panel">
                  <div class="panel-head">
                    <div>
                      <h3>成员分配</h3>
                      <p class="section-note">支持直接拖拽到目标小组，也可用下方表格做精细调整。</p>
                    </div>
                    <el-tag round :type="draggingStudent ? 'success' : 'info'">
                      {{ draggingStudent ? `拖拽中：${draggingStudent.display_name}` : '拖拽已启用' }}
                    </el-tag>
                  </div>

                  <div
                    class="unassigned-pool"
                    :class="{ 'unassigned-pool-active': isDropZoneActive(null) }"
                    @dragover="handleDropZoneDragOver($event, null)"
                    @dragleave="handleDropZoneDragLeave($event, null)"
                    @drop="handleDropZoneDrop($event, null)"
                  >
                    <div class="panel-head">
                      <div>
                        <p class="group-name group-name-small">未分组池</p>
                        <p class="section-note">把学生拖到这里即可先移出小组，再继续调整。</p>
                      </div>
                      <el-tag round type="warning">{{ unassignedStudents.length }} 人</el-tag>
                    </div>

                    <div v-if="unassignedStudents.length" class="member-preview-list">
                      <article
                        v-for="student in unassignedStudents"
                        :key="student.user_id"
                        class="drag-member-chip drag-member-chip-unassigned"
                        :class="{ 'drag-member-chip-dragging': draggingStudentUserId === student.user_id }"
                        draggable="true"
                        @dragstart="handleStudentDragStart(student, $event)"
                        @dragend="handleStudentDragEnd"
                      >
                        <div>
                          <p class="member-name">{{ student.display_name }}</p>
                          <p class="member-note">{{ student.student_no }}</p>
                        </div>
                        <el-tag round size="small" type="warning">未分组</el-tag>
                      </article>
                    </div>
                    <div v-else class="drop-zone-empty">所有学生都已进入某个小组，可从左侧小组卡片继续互相拖动。</div>
                  </div>

                  <el-table :data="sortedEditableStudents" stripe>
                    <el-table-column label="学生" min-width="180">
                      <template #default="{ row }">
                        <div>
                          <p class="member-name">{{ row.display_name }}</p>
                          <p class="member-note">{{ row.student_no }}</p>
                        </div>
                      </template>
                    </el-table-column>

                    <el-table-column label="座位 / 签到" min-width="190">
                      <template #default="{ row }">
                        <p class="member-note">
                          {{ row.seat_label || '未绑定座位' }}
                          <span v-if="row.room_name"> · {{ row.room_name }}</span>
                        </p>
                        <p class="member-note">
                          {{ row.checked_in_today ? `签到 ${formatDateTime(row.checked_in_at)}` : '未签到' }}
                        </p>
                      </template>
                    </el-table-column>

                    <el-table-column label="当前状态" min-width="180">
                      <template #default="{ row }">
                        <p class="member-note">{{ row.current_group_name || '未分组' }}</p>
                        <p class="member-note">{{ roleText(row.current_role) }}</p>
                      </template>
                    </el-table-column>

                    <el-table-column label="调整到小组" min-width="220">
                      <template #default="{ row }">
                        <el-select
                          :model-value="row.target_group_id"
                          class="full-width"
                          clearable
                          placeholder="暂不分组"
                          @update:model-value="updateStudentGroup(row, $event as number | null)"
                        >
                          <el-option
                            v-for="group in editableGroups"
                            :key="group.id"
                            :label="`${group.name} · 第${group.group_no}组`"
                            :value="group.id"
                          />
                        </el-select>
                      </template>
                    </el-table-column>

                    <el-table-column label="当前组内身份" min-width="120">
                      <template #default="{ row }">
                        <el-tag round :type="isStudentLeader(row) ? 'success' : row.target_group_id ? 'info' : 'warning'">
                          {{ isStudentLeader(row) ? '组长' : row.target_group_id ? '成员' : '未分组' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                  </el-table>
                </section>
              </div>
            </template>
          </template>
        </el-skeleton>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { CheckCheck, ClipboardList, MonitorPlay, Sparkles } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut, apiUpload } from '@/api/http';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { readThemeToken } from '@/utils/themeTokens';

type Student = {
  user_id: number;
  student_no: string;
  display_name: string;
  checked_in_at?: string | null;
  submission_count: number;
  reviewed_submission_count: number;
  pending_review_count: number;
  latest_submission_at: string | null;
  focus_plan_submission_status: 'reviewed' | 'submitted' | 'not_started' | null;
  focus_plan_submitted_at: string | null;
  focus_plan_submitted_task_count: number;
  focus_plan_task_count: number;
  focus_plan_submission_stage: 'none' | 'partial' | 'completed';
};
type Seat = {
  seat_key: string;
  seat_id: number | null;
  seat_label: string;
  row_no: number;
  col_no: number;
  ip_address: string;
  hostname: string | null;
  is_enabled: boolean;
  is_virtual: boolean;
  signed_in_today: boolean;
  checked_in_at: string | null;
  student: Student | null;
};
type Roster = {
  class_id: number;
  class_name: string;
  student_count: number;
  checked_in_count: number;
  pending_signin_count: number;
  room: { id: number; name: string; row_count: number; col_count: number } | null;
  focus_plan: { id: number; title: string } | null;
  seats: Seat[];
  unassigned_students: Student[];
};
type LaunchpadClass = { id: number; class_name: string; student_count: number; checked_in_count: number };
type LaunchpadPlan = { id: number; title: string; lesson_title: string; unit_title: string; task_count: number; pending_count: number };
type DashboardPayload = {
  current_user: { display_name: string; title: string | null; roles: string[] };
  stats: { class_count: number };
  today_overview: {
    checked_in_today: number;
    pending_signin_count: number;
    active_session_count: number;
    active_class_count: number;
    pending_review_count: number;
    recommended_count: number;
  };
  launchpad: { default_class_id: number | null; default_plan_id: number | null; classes: LaunchpadClass[]; ready_plans: LaunchpadPlan[] };
  focus_class_id: number | null;
  class_rosters: Roster[];
  recent_sessions: Array<{
    session_id: number;
    status: string;
    started_at: string;
    class: { name: string };
    plan: { title: string; lesson_title: string };
    submission_count: number;
    pending_review_count: number;
  }>;
  recent_plans: Array<{ id: number; title: string; assigned_date: string; unit_title: string; lesson_title: string; task_count: number; pending_count: number }>;
};
type GroupFile = {
  id: number;
  name: string;
  original_name: string;
  ext: string;
  size_kb: number;
  updated_at: string | null;
  uploaded_by_name: string | null;
  uploaded_by_student_no: string | null;
};
type GroupActivityItem = {
  id: string;
  event_type: 'attendance' | 'drive_upload' | 'group_submission' | 'submission_reviewed' | string;
  event_label: string;
  occurred_at: string | null;
  group_id: number;
  group_name: string;
  group_no: number;
  actor_name: string | null;
  actor_student_no: string | null;
  title: string;
  description: string;
  file_id: number | null;
  submission_id: number | null;
  task_id: number | null;
};
type GroupOperationLogItem = {
  id: number;
  event_type: string;
  event_label: string;
  occurred_at: string | null;
  group_id: number | null;
  group_no: number | null;
  group_name: string;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_student_no: string | null;
  title: string;
  description: string;
  task_id: number | null;
  task_title: string | null;
  file_id: number | null;
  file_name: string | null;
  submission_id: number | null;
  version_no: number | null;
};
type GroupDriveLimits = {
  max_file_count: number;
  single_file_max_mb: number;
  allowed_extensions: string[];
  allowed_extensions_text: string;
};
type GroupMember = {
  user_id: number;
  student_no: string;
  display_name: string;
  role: string;
  seat_label: string | null;
  room_name: string | null;
  checked_in_today: boolean;
  checked_in_at: string | null;
};
type GroupOverview = {
  class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
    checked_in_count: number;
    group_count: number;
    shared_file_count: number;
  };
  groups: Array<{
    id: number;
    group_no: number;
    name: string;
    description: string | null;
    leader_name: string | null;
    leader_student_no: string | null;
    member_count: number;
    checked_in_count: number;
    pending_count: number;
    members: GroupMember[];
    shared_drive: {
      space_id: number;
      display_name: string;
      quota_mb: number;
      used_bytes: number;
      remaining_bytes: number;
      usage_percent: number;
      file_count: number;
      limits: GroupDriveLimits;
      files: GroupFile[];
    };
    activity_feed: GroupActivityItem[];
    operation_logs: GroupOperationLogItem[];
  }>;
};
type GroupOverviewItem = GroupOverview['groups'][number];
type GroupManagerStudent = {
  user_id: number;
  student_no: string;
  display_name: string;
  checked_in_today: boolean;
  checked_in_at: string | null;
  seat_label: string | null;
  room_name: string | null;
  current_group_id: number | null;
  current_group_no: number | null;
  current_group_name: string | null;
  current_role: string | null;
};
type GroupManagerGroup = {
  id: number;
  group_no: number;
  name: string;
  description: string | null;
  leader_user_id: number | null;
  leader_name: string | null;
  leader_student_no: string | null;
  member_count: number;
  file_count: number;
  used_bytes: number;
  has_shared_files: boolean;
  members: GroupMember[];
};
type GroupManagementPayload = {
  class: {
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
    checked_in_count: number;
    group_count: number;
    unassigned_count: number;
  };
  groups: GroupManagerGroup[];
  students: GroupManagerStudent[];
  operation_logs: GroupOperationLogItem[];
};
type GroupOperationLogQueryPayload = {
  items: GroupOperationLogItem[];
  total_count: number;
  limit: number;
};
type GroupTaskProgressItem = {
  group_id: number;
  group_no: number;
  group_name: string;
  leader_name: string | null;
  member_count: number;
  status: string;
  submission_id: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  submitted_by_name: string | null;
  score: number | null;
  file_count: number;
  is_recommended: boolean;
};
type GroupTaskProgressTask = {
  task_id: number;
  task_title: string;
  task_type: string;
  submission_scope: string;
  submitted_count: number;
  reviewed_count: number;
  pending_count: number;
  items: GroupTaskProgressItem[];
};
type GroupTaskProgressPayload = {
  class: {
    id: number;
    class_name: string;
  };
  plan: {
    id: number;
    title: string;
    lesson_title: string;
    unit_title: string;
  };
  summary: {
    group_count: number;
    task_count: number;
    slot_count: number;
    submitted_count: number;
    reviewed_count: number;
    pending_count: number;
  };
  tasks: GroupTaskProgressTask[];
};
type GroupTaskCompletionRow = {
  group_id: number;
  group_no: number;
  group_name: string;
  leader_name: string | null;
  member_count: number;
  total_task_count: number;
  submitted_count: number;
  reviewed_count: number;
  pending_count: number;
  completion_percent: number;
  review_percent: number;
};
type EditableGroup = {
  id: number;
  group_no: number;
  name: string;
  description: string;
  leader_user_id: number | null;
  file_count: number;
  used_bytes: number;
  has_shared_files: boolean;
};
type EditableStudent = GroupManagerStudent & { target_group_id: number | null };

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();

const dashboard = ref<DashboardPayload | null>(null);
const errorMessage = ref('');
const isLoading = ref(true);
const isLaunching = ref(false);
const launchForm = ref({ class_id: null as number | null, plan_id: null as number | null });

const groupOverview = ref<GroupOverview | null>(null);
const groupError = ref('');
const groupLoading = ref(false);
const downloadingGroupFileId = ref<number | null>(null);
const uploadingGroupId = ref<number | null>(null);
const groupTaskProgress = ref<GroupTaskProgressPayload | null>(null);
const groupTaskProgressError = ref('');
const groupTaskProgressLoading = ref(false);

const groupManagerVisible = ref(false);
const groupManagerData = ref<GroupManagementPayload | null>(null);
const groupManagerError = ref('');
const groupManagerLoading = ref(false);
const groupManagerSaving = ref(false);
const groupManagerCreating = ref(false);
const groupManagerRebuilding = ref(false);
const groupManagerLogs = ref<GroupOperationLogItem[]>([]);
const groupManagerLogTotal = ref(0);
const groupManagerLogLoading = ref(false);
const groupManagerLogExporting = ref(false);
const groupManagerLogFilters = ref({
  group_id: null as number | null,
  event_type: '',
  actor_user_id: null as number | null,
  keyword: '',
});
const editableGroups = ref<EditableGroup[]>([]);
const editableStudents = ref<EditableStudent[]>([]);
const rebuildGroupCount = ref(1);
const draggingStudentUserId = ref<number | null>(null);
const activeDropZoneKey = ref<string | null>(null);

let groupRequestKey = 0;
let groupTaskProgressRequestKey = 0;
let groupManagerRequestKey = 0;

const groupOperationEventOptions = [
  { label: '全部事件', value: '' },
  { label: '新建小组', value: 'group_created' },
  { label: '保存分组', value: 'group_saved' },
  { label: '一键重组', value: 'group_rebuilt' },
  { label: '删除小组', value: 'group_deleted' },
  { label: '共享草稿同步', value: 'group_draft_synced' },
  { label: '共享草稿清空', value: 'group_draft_cleared' },
  { label: '小组正式提交', value: 'group_submission_submitted' },
  { label: '教师评阅', value: 'group_submission_reviewed' },
  { label: '学生上传文件', value: 'group_file_uploaded' },
  { label: '学生删除文件', value: 'group_file_deleted' },
  { label: '教师上传文件', value: 'teacher_group_file_uploaded' },
];

const pageTitle = computed(() => {
  const user = dashboard.value?.current_user;
  return user ? (user.title ? `${user.display_name} · ${user.title}` : user.display_name) : '教师工作台';
});
const focusClassId = computed(() => launchForm.value.class_id ?? dashboard.value?.focus_class_id ?? dashboard.value?.launchpad.default_class_id ?? null);
const focusRoster = computed(() => dashboard.value?.class_rosters.find((item) => item.class_id === focusClassId.value) ?? null);
const selectedClass = computed(() => dashboard.value?.launchpad.classes.find((item) => item.id === launchForm.value.class_id) ?? null);
const selectedPlan = computed(() => dashboard.value?.launchpad.ready_plans.find((item) => item.id === launchForm.value.plan_id) ?? null);
const focusGroupSummary = computed(() => groupOverview.value?.class ?? null);
const groupTaskProgressSummary = computed(() => groupTaskProgress.value?.summary ?? null);
const groupManagerLogGroupOptions = computed(() =>
  (groupManagerData.value?.groups || []).map((group) => ({
    label: `第 ${group.group_no} 组 / ${group.name}`,
    value: group.id,
  }))
);
const groupManagerLogActorOptions = computed(() => {
  const optionMap = new Map<number, { label: string; value: number }>();
  const sourceLogs = [...(groupManagerData.value?.operation_logs || []), ...groupManagerLogs.value];
  for (const item of sourceLogs) {
    if (!item.actor_user_id || !item.actor_name) {
      continue;
    }
    const suffix = item.actor_student_no ? ` / ${item.actor_student_no}` : '';
    optionMap.set(item.actor_user_id, {
      label: `${item.actor_name}${suffix}`,
      value: item.actor_user_id,
    });
  }
  return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
});
const seatGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${focusRoster.value?.room?.col_count || 1}, minmax(96px, 108px))`,
}));
const sortedEditableStudents = computed(() => [...editableStudents.value].sort((a, b) => a.student_no.localeCompare(b.student_no, 'zh-CN')));
const unassignedStudents = computed(() => sortedEditableStudents.value.filter((student) => student.target_group_id === null));
const unassignedStudentCount = computed(() => editableStudents.value.filter((student) => student.target_group_id === null).length);
const draggingStudent = computed(() => editableStudents.value.find((student) => student.user_id === draggingStudentUserId.value) ?? null);
const groupTaskCompletionRows = computed<GroupTaskCompletionRow[]>(() => {
  const payload = groupTaskProgress.value;
  if (!payload || !payload.tasks.length) {
    return [];
  }

  const rows = new Map<number, GroupTaskCompletionRow>();
  for (const task of payload.tasks) {
    for (const item of task.items) {
      const existing = rows.get(item.group_id) ?? {
        group_id: item.group_id,
        group_no: item.group_no,
        group_name: item.group_name,
        leader_name: item.leader_name,
        member_count: item.member_count,
        total_task_count: payload.tasks.length,
        submitted_count: 0,
        reviewed_count: 0,
        pending_count: 0,
        completion_percent: 0,
        review_percent: 0,
      };

      if (item.status !== 'not_started') {
        existing.submitted_count += 1;
      }
      if (item.status === 'reviewed') {
        existing.reviewed_count += 1;
      }

      rows.set(item.group_id, existing);
    }
  }

  return Array.from(rows.values())
    .map((row) => {
      const pending_count = Math.max(row.total_task_count - row.submitted_count, 0);
      return {
        ...row,
        pending_count,
        completion_percent: progressPercent(row.submitted_count, row.total_task_count),
        review_percent: progressPercent(row.reviewed_count, row.total_task_count),
      };
    })
    .sort((left, right) => left.group_no - right.group_no || left.group_id - right.group_id);
});
const dashboardMetricCards = computed(() => {
  const overview = dashboard.value?.today_overview;
  if (!overview) {
    return [];
  }

  return [
    {
      label: '已签到',
      value: overview.checked_in_today,
      note: `待签到 ${overview.pending_signin_count} 人`,
      icon: CheckCheck,
      tone: 'primary',
    },
    {
      label: '进行中课堂',
      value: overview.active_session_count,
      note: `涉及 ${overview.active_class_count} 个班级`,
      icon: MonitorPlay,
      tone: 'accent',
    },
    {
      label: '待评阅',
      value: overview.pending_review_count,
      note: '仍有作品等待教师查看与评阅',
      icon: ClipboardList,
      tone: 'warning',
    },
    {
      label: '推荐作品',
      value: overview.recommended_count,
      note: '可用于课堂展示、点评或优秀作品推荐',
      icon: Sparkles,
      tone: 'success',
    },
  ];
});

const classAttendanceChartOption = computed(() => {
  appStore.currentTheme;
  const classes = dashboard.value?.launchpad.classes || [];
  const textColor = readThemeToken('--ls-text', '#243a4d');
  const mutedColor = readThemeToken('--ls-muted', '#61758b');
  const borderColor = readThemeToken('--ls-border', 'rgba(36, 70, 87, 0.14)');
  const primaryColor = readThemeToken('--ls-primary', '#ff8a1f');
  const accentColor = readThemeToken('--ls-accent', '#11c7b1');

  return {
    color: [accentColor, primaryColor],
    grid: {
      left: 12,
      right: 12,
      top: 36,
      bottom: 8,
      containLabel: true,
    },
    legend: {
      top: 0,
      textStyle: {
        color: mutedColor,
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    xAxis: {
      type: 'category',
      data: classes.map((item) => item.class_name),
      axisLine: {
        lineStyle: {
          color: borderColor,
        },
      },
      axisLabel: {
        color: mutedColor,
        interval: 0,
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: {
        show: false,
      },
      splitLine: {
        lineStyle: {
          color: borderColor,
        },
      },
      axisLabel: {
        color: mutedColor,
      },
    },
    series: [
      {
        name: '已签到',
        type: 'bar',
        stack: 'attendance',
        barMaxWidth: 28,
        data: classes.map((item) => item.checked_in_count),
        itemStyle: {
          borderRadius: [10, 10, 0, 0],
        },
      },
      {
        name: '待签到',
        type: 'bar',
        stack: 'attendance',
        barMaxWidth: 28,
        data: classes.map((item) => Math.max(item.student_count - item.checked_in_count, 0)),
        itemStyle: {
          borderRadius: [10, 10, 0, 0],
        },
      },
    ],
    textStyle: {
      color: textColor,
      fontFamily: 'var(--ls-font)',
    },
  };
});

const teacherOpsChartOption = computed(() => {
  appStore.currentTheme;
  const overview = dashboard.value?.today_overview;
  const textColor = readThemeToken('--ls-text', '#243a4d');
  const mutedColor = readThemeToken('--ls-muted', '#61758b');
  const primaryColor = readThemeToken('--ls-primary', '#ff8a1f');
  const accentColor = readThemeToken('--ls-accent', '#11c7b1');
  const warningColor = '#ffb347';
  const neutralColor = '#8f96b5';

  return {
    tooltip: {
      trigger: 'item',
    },
    legend: {
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: {
        color: mutedColor,
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 14,
          borderColor: '#ffffff',
          borderWidth: 3,
        },
        label: {
          color: textColor,
          formatter: '{b}\n{c}',
          fontSize: 12,
        },
        emphasis: {
          label: {
            fontSize: 13,
            fontWeight: 700,
          },
        },
        data: [
          { value: overview?.checked_in_today || 0, name: '已签到', itemStyle: { color: accentColor } },
          { value: overview?.pending_signin_count || 0, name: '待签到', itemStyle: { color: primaryColor } },
          { value: overview?.pending_review_count || 0, name: '待评阅', itemStyle: { color: warningColor } },
          { value: overview?.recommended_count || 0, name: '推荐作品', itemStyle: { color: neutralColor } },
        ],
      },
    ],
    textStyle: {
      color: textColor,
      fontFamily: 'var(--ls-font)',
    },
  };
});

const launchPreviewText = computed(() => {
  if (!selectedClass.value || !selectedPlan.value) return '请选择班级和学案，然后一键开课。';
  return `将“${selectedPlan.value.title}”推送到 ${selectedClass.value.class_name}，学生登录后会自动签到，并在座位图和小组面板中同步呈现。`;
});

function formatDateTime(value: string | null) {
  if (!value) return '暂无记录';
  return value.replace('T', ' ').slice(0, 16);
}

function submissionSquareClass(stage: Student['focus_plan_submission_stage']) {
  if (stage === 'completed') return 'submission-square-completed';
  if (stage === 'partial') return 'submission-square-partial';
  return 'submission-square-none';
}

function activityTagType(eventType: string) {
  if (eventType === 'attendance') return 'success';
  if (eventType === 'drive_upload') return 'warning';
  if (eventType === 'submission_reviewed') return 'danger';
  return 'info';
}

function operationTagType(eventType: string) {
  if (eventType.includes('deleted')) return 'danger';
  if (eventType.includes('reviewed')) return 'warning';
  if (eventType.includes('submitted')) return 'success';
  if (eventType.includes('draft')) return 'info';
  return 'primary';
}

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
}

function groupDriveLimitText(limits: GroupDriveLimits) {
  const extensionPreview = limits.allowed_extensions.slice(0, 8).join(', ');
  const extensionSuffix = limits.allowed_extensions.length > 8 ? ' 等' : '';
  const extensionText = limits.allowed_extensions.length
    ? `类型 ${extensionPreview}${extensionSuffix}`
    : '类型不限';
  return `单个文件 ${limits.single_file_max_mb} MB · 最多 ${limits.max_file_count} 个 · ${extensionText}`;
}

function progressPercent(doneCount: number, totalCount: number) {
  if (!totalCount) return 0;
  return Math.round((doneCount / totalCount) * 100);
}

function roleText(role: string | null) {
  if (role === 'leader') return '组长';
  if (role === 'member') return '成员';
  if (role === 'teacher') return '教师';
  if (role === 'admin') return '管理员';
  if (role === 'student') return '学生';
  return '未分组';
}

function groupTaskStatusText(status: string) {
  if (status === 'reviewed') return '已评阅';
  if (status === 'submitted') return '已提交';
  return '未开始';
}

function groupTaskStatusType(status: string) {
  if (status === 'reviewed') return 'success';
  if (status === 'submitted') return 'warning';
  return 'info';
}

function getDownloadFileName(contentDisposition: string | null, fallbackName: string) {
  if (!contentDisposition) return fallbackName;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
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

function applyDefaults(payload: DashboardPayload) {
  launchForm.value.class_id = launchForm.value.class_id ?? payload.focus_class_id ?? payload.launchpad.default_class_id ?? payload.launchpad.classes[0]?.id ?? null;
  launchForm.value.plan_id = launchForm.value.plan_id ?? payload.launchpad.default_plan_id ?? payload.launchpad.ready_plans[0]?.id ?? null;
}

function hydrateGroupManager(payload: GroupManagementPayload) {
  groupManagerData.value = payload;
  groupManagerLogs.value = payload.operation_logs;
  groupManagerLogTotal.value = payload.operation_logs.length;
  editableGroups.value = payload.groups.map((group) => ({
    id: group.id,
    group_no: group.group_no,
    name: group.name,
    description: group.description || '',
    leader_user_id: group.leader_user_id,
    file_count: group.file_count,
    used_bytes: group.used_bytes,
    has_shared_files: group.has_shared_files,
  }));
  editableStudents.value = payload.students.map((student) => ({ ...student, target_group_id: student.current_group_id }));
  rebuildGroupCount.value = payload.groups.filter((group) => group.member_count > 0).length || payload.groups.length || 1;
  editableGroups.value.forEach((group) => ensureGroupLeader(group.id));
}

function groupMembers(groupId: number) {
  return [...editableStudents.value]
    .filter((student) => student.target_group_id === groupId)
    .sort((a, b) => a.student_no.localeCompare(b.student_no, 'zh-CN'));
}

function ensureGroupLeader(groupId: number) {
  const group = editableGroups.value.find((item) => item.id === groupId);
  if (!group) return;
  const members = groupMembers(groupId);
  if (!members.length) {
    group.leader_user_id = null;
    return;
  }
  if (!members.some((member) => member.user_id === group.leader_user_id)) {
    group.leader_user_id = members[0].user_id;
  }
}

function updateGroupLeader(groupId: number, leaderUserId: number | null | undefined) {
  const group = editableGroups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.leader_user_id = leaderUserId ?? null;
  ensureGroupLeader(groupId);
}

function updateStudentGroup(student: EditableStudent, nextGroupId: number | null | undefined) {
  const previousGroupId = student.target_group_id;
  const normalizedNextGroupId = nextGroupId ?? null;
  student.target_group_id = normalizedNextGroupId;
  if (previousGroupId !== null) ensureGroupLeader(previousGroupId);
  if (normalizedNextGroupId !== null) ensureGroupLeader(normalizedNextGroupId);
}

function dropZoneKey(groupId: number | null) {
  return groupId === null ? 'unassigned' : `group-${groupId}`;
}

function isDropZoneActive(groupId: number | null) {
  return activeDropZoneKey.value === dropZoneKey(groupId);
}

function handleStudentDragStart(student: EditableStudent, event: DragEvent) {
  draggingStudentUserId.value = student.user_id;
  activeDropZoneKey.value = dropZoneKey(student.target_group_id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(student.user_id));
  }
}

function handleStudentDragEnd() {
  draggingStudentUserId.value = null;
  activeDropZoneKey.value = null;
}

function handleDropZoneDragOver(event: DragEvent, groupId: number | null) {
  if (!draggingStudentUserId.value) return;
  event.preventDefault();
  activeDropZoneKey.value = dropZoneKey(groupId);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleDropZoneDragLeave(event: DragEvent, groupId: number | null) {
  const currentTarget = event.currentTarget;
  const nextTarget = event.relatedTarget;
  if (currentTarget instanceof HTMLElement && nextTarget instanceof Node && currentTarget.contains(nextTarget)) {
    return;
  }
  if (activeDropZoneKey.value === dropZoneKey(groupId)) {
    activeDropZoneKey.value = null;
  }
}

function handleDropZoneDrop(event: DragEvent, groupId: number | null) {
  event.preventDefault();
  const rawStudentId = event.dataTransfer?.getData('text/plain') || String(draggingStudentUserId.value ?? '');
  const studentId = Number(rawStudentId);
  const student = editableStudents.value.find((item) => item.user_id === studentId);
  if (!student) {
    handleStudentDragEnd();
    return;
  }
  updateStudentGroup(student, groupId);
  activeDropZoneKey.value = dropZoneKey(groupId);
  handleStudentDragEnd();
}

function isStudentLeader(student: EditableStudent) {
  if (student.target_group_id === null) return false;
  const group = editableGroups.value.find((item) => item.id === student.target_group_id);
  return group?.leader_user_id === student.user_id;
}

function canDeleteGroup(group: EditableGroup) {
  return groupMembers(group.id).length === 0 && !group.has_shared_files && !groupManagerSaving.value;
}

async function loadDashboard() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师或管理员账号';
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiGet<DashboardPayload>('/staff/dashboard', authStore.token);
    dashboard.value = payload;
    applyDefaults(payload);
    await Promise.all([
      loadGroupOverview(focusClassId.value),
      loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
    ]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载教师工作台失败';
  } finally {
    isLoading.value = false;
  }
}

async function loadGroupOverview(classId: number | null) {
  const requestKey = ++groupRequestKey;
  if (!authStore.token || !classId) {
    groupOverview.value = null;
    groupError.value = '';
    groupLoading.value = false;
    return;
  }
  groupLoading.value = true;
  groupError.value = '';
  try {
    const payload = await apiGet<GroupOverview>(`/staff/classes/${classId}/groups`, authStore.token);
    if (requestKey !== groupRequestKey) return;
    groupOverview.value = payload;
  } catch (error) {
    if (requestKey !== groupRequestKey) return;
    groupOverview.value = null;
    groupError.value = error instanceof Error ? error.message : '加载班级小组失败';
  } finally {
    if (requestKey === groupRequestKey) groupLoading.value = false;
  }
}

async function loadGroupTaskProgress(classId: number | null, planId: number | null) {
  const requestKey = ++groupTaskProgressRequestKey;
  if (!authStore.token || !classId || !planId) {
    groupTaskProgress.value = null;
    groupTaskProgressError.value = '';
    groupTaskProgressLoading.value = false;
    return;
  }
  groupTaskProgressLoading.value = true;
  groupTaskProgressError.value = '';
  try {
    const payload = await apiGet<GroupTaskProgressPayload>(
      `/staff/classes/${classId}/plans/${planId}/group-task-progress`,
      authStore.token
    );
    if (requestKey !== groupTaskProgressRequestKey) return;
    groupTaskProgress.value = payload;
  } catch (error) {
    if (requestKey !== groupTaskProgressRequestKey) return;
    groupTaskProgress.value = null;
    groupTaskProgressError.value = error instanceof Error ? error.message : '加载小组任务进度失败';
  } finally {
    if (requestKey === groupTaskProgressRequestKey) groupTaskProgressLoading.value = false;
  }
}

async function loadGroupManagement(classId: number | null) {
  const requestKey = ++groupManagerRequestKey;
  if (!authStore.token || !classId) {
    groupManagerData.value = null;
    editableGroups.value = [];
    editableStudents.value = [];
    groupManagerLogs.value = [];
    groupManagerLogTotal.value = 0;
    groupManagerError.value = '';
    groupManagerLoading.value = false;
    return;
  }
  groupManagerLoading.value = true;
  groupManagerError.value = '';
  try {
    const payload = await apiGet<GroupManagementPayload>(`/staff/classes/${classId}/group-management`, authStore.token);
    if (requestKey !== groupManagerRequestKey) return;
    hydrateGroupManager(payload);
  } catch (error) {
    if (requestKey !== groupManagerRequestKey) return;
    groupManagerData.value = null;
    editableGroups.value = [];
    editableStudents.value = [];
    groupManagerError.value = error instanceof Error ? error.message : '加载分组维护数据失败';
  } finally {
    if (requestKey === groupManagerRequestKey) groupManagerLoading.value = false;
  }
}

function buildGroupManagerLogQuery() {
  const searchParams = new URLSearchParams();
  if (groupManagerLogFilters.value.group_id !== null) {
    searchParams.set('group_id', String(groupManagerLogFilters.value.group_id));
  }
  if (groupManagerLogFilters.value.event_type) {
    searchParams.set('event_type', groupManagerLogFilters.value.event_type);
  }
  if (groupManagerLogFilters.value.actor_user_id !== null) {
    searchParams.set('actor_user_id', String(groupManagerLogFilters.value.actor_user_id));
  }
  if (groupManagerLogFilters.value.keyword.trim()) {
    searchParams.set('keyword', groupManagerLogFilters.value.keyword.trim());
  }
  return searchParams.toString();
}

async function loadGroupManagerLogs(classId: number | null) {
  if (!authStore.token || !classId) {
    groupManagerLogs.value = [];
    groupManagerLogTotal.value = 0;
    groupManagerLogLoading.value = false;
    return;
  }

  groupManagerLogLoading.value = true;
  groupManagerError.value = '';
  try {
    const query = buildGroupManagerLogQuery();
    const suffix = query ? `?${query}` : '';
    const payload = await apiGet<GroupOperationLogQueryPayload>(
      `/staff/classes/${classId}/group-operation-logs${suffix}`,
      authStore.token
    );
    groupManagerLogs.value = payload.items;
    groupManagerLogTotal.value = payload.total_count;
  } catch (error) {
    groupManagerError.value = error instanceof Error ? error.message : '加载小组操作日志失败';
  } finally {
    groupManagerLogLoading.value = false;
  }
}

async function refreshFocusGroupOverview() {
  await loadGroupOverview(focusClassId.value);
}

async function refreshGroupTaskProgress() {
  await loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id);
}

async function refreshGroupManagerLogs() {
  await loadGroupManagerLogs(focusClassId.value);
}

async function resetGroupManagerLogFilters() {
  groupManagerLogFilters.value = {
    group_id: null,
    event_type: '',
    actor_user_id: null,
    keyword: '',
  };
  await loadGroupManagerLogs(focusClassId.value);
}

async function startClassroom() {
  if (!authStore.token || !launchForm.value.class_id || !launchForm.value.plan_id) return;
  isLaunching.value = true;
  errorMessage.value = '';
  try {
    const payload = await apiPost<{ session: { session_id: number }; progress_created_count: number }>(
      '/classroom/sessions',
      { class_id: launchForm.value.class_id, plan_id: launchForm.value.plan_id },
      authStore.token
    );
    ElMessage.success(`课堂已开启，已同步到 ${payload.progress_created_count} 位学生`);
    await router.push(`/staff/classroom/${payload.session.session_id}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '开始上课失败';
  } finally {
    isLaunching.value = false;
  }
}

function groupUploadInputId(groupId: number) {
  return `staff-group-upload-${groupId}`;
}

function openGroupUploadPicker(groupId: number) {
  if (uploadingGroupId.value !== null) return;
  const input = document.getElementById(groupUploadInputId(groupId));
  if (input instanceof HTMLInputElement) {
    input.click();
  }
}

async function handleGroupUploadChange(group: GroupOverviewItem, event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length || !authStore.token) return;

  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  uploadingGroupId.value = group.id;
  groupError.value = '';
  try {
    const payload = await apiUpload<GroupOverview>(`/staff/groups/${group.id}/drive/files`, formData, authStore.token);
    groupOverview.value = payload;
    if (groupManagerVisible.value) {
      await loadGroupManagement(payload.class.id);
      await loadGroupManagerLogs(payload.class.id);
    }
    ElMessage.success(`已将 ${files.length} 个文件上传到 ${group.name}`);
  } catch (error) {
    groupError.value = error instanceof Error ? error.message : '上传共享文件失败';
  } finally {
    uploadingGroupId.value = null;
  }
}

async function downloadGroupFile(file: GroupFile) {
  if (!authStore.token) return;
  downloadingGroupFileId.value = file.id;
  groupError.value = '';
  try {
    const response = await apiGetBlob(`/staff/drives/files/${file.id}`, authStore.token);
    const blob = await response.blob();
    triggerBrowserDownload(blob, getDownloadFileName(response.headers.get('content-disposition'), file.name));
  } catch (error) {
    groupError.value = error instanceof Error ? error.message : '下载共享文件失败';
  } finally {
    downloadingGroupFileId.value = null;
  }
}

async function exportGroupManagerLogs() {
  if (!authStore.token || !focusClassId.value) {
    return;
  }

  groupManagerLogExporting.value = true;
  groupManagerError.value = '';
  try {
    const query = buildGroupManagerLogQuery();
    const suffix = query ? `?${query}` : '';
    const response = await apiGetBlob(
      `/staff/classes/${focusClassId.value}/group-operation-logs/export${suffix}`,
      authStore.token
    );
    const blob = await response.blob();
    triggerBrowserDownload(
      blob,
      getDownloadFileName(response.headers.get('content-disposition'), 'group-operation-logs.csv')
    );
    ElMessage.success('小组操作日志已导出');
  } catch (error) {
    groupManagerError.value = error instanceof Error ? error.message : '导出小组操作日志失败';
  } finally {
    groupManagerLogExporting.value = false;
  }
}

async function openGroupManager() {
  groupManagerVisible.value = true;
  await loadGroupManagement(focusClassId.value);
  await loadGroupManagerLogs(focusClassId.value);
}

function openTaskReview(taskId: number) {
  void router.push(`/staff/submissions/${taskId}`);
}

async function createGroup() {
  if (!authStore.token || !focusClassId.value) return;
  groupManagerCreating.value = true;
  groupManagerError.value = '';
  try {
    const payload = await apiPost<GroupManagementPayload>(`/staff/classes/${focusClassId.value}/groups`, {}, authStore.token);
    hydrateGroupManager(payload);
    await Promise.all([
      loadGroupOverview(focusClassId.value),
      loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
      loadGroupManagerLogs(focusClassId.value),
    ]);
    ElMessage.success('已新增一个空小组');
  } catch (error) {
    groupManagerError.value = error instanceof Error ? error.message : '新增小组失败';
  } finally {
    groupManagerCreating.value = false;
  }
}

async function rebuildGroups() {
  if (!authStore.token || !focusClassId.value || !editableStudents.value.length) return;
  const targetGroupCount = Math.max(1, Math.min(rebuildGroupCount.value, editableStudents.value.length));
  try {
    await ElMessageBox.confirm(
      `将按 ${targetGroupCount} 个小组重新分配当前班级所有学生。已有共享文件会保留在原小组空间中，是否继续？`,
      '一键重组',
      { type: 'warning', confirmButtonText: '继续重组', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  groupManagerRebuilding.value = true;
  groupManagerError.value = '';
  try {
    const payload = await apiPost<GroupManagementPayload>(
      `/staff/classes/${focusClassId.value}/groups/rebuild`,
      { group_count: targetGroupCount },
      authStore.token
    );
    hydrateGroupManager(payload);
    await Promise.all([
      loadGroupOverview(focusClassId.value),
      loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
      loadGroupManagerLogs(focusClassId.value),
    ]);
    ElMessage.success('已完成一键重组');
  } catch (error) {
    groupManagerError.value = error instanceof Error ? error.message : '一键重组失败';
  } finally {
    groupManagerRebuilding.value = false;
  }
}

async function deleteGroup(group: EditableGroup) {
  if (!authStore.token || !canDeleteGroup(group)) return;
  try {
    await ElMessageBox.confirm(
      `确定删除“${group.name}”吗？只有空组且无共享文件的小组才能删除。`,
      '删除小组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  groupManagerError.value = '';
  try {
    const payload = await apiDelete<GroupManagementPayload>(`/staff/groups/${group.id}`, authStore.token);
    hydrateGroupManager(payload);
    await Promise.all([
      loadGroupOverview(focusClassId.value),
      loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
      loadGroupManagerLogs(focusClassId.value),
    ]);
    ElMessage.success('小组已删除');
  } catch (error) {
    groupManagerError.value = error instanceof Error ? error.message : '删除小组失败';
  }
}

async function saveGroupManagement() {
  if (!authStore.token || !focusClassId.value) return;
  groupManagerSaving.value = true;
  groupManagerError.value = '';
  try {
    const groupsPayload = editableGroups.value.map((group) => {
      const members = groupMembers(group.id);
      const leaderUserId = members.find((member) => member.user_id === group.leader_user_id)?.user_id ?? members[0]?.user_id ?? null;
      return {
        id: group.id,
        name: group.name.trim(),
        description: group.description.trim() || null,
        leader_user_id: leaderUserId,
        member_user_ids: members.map((member) => member.user_id),
      };
    });
    const payload = await apiPut<GroupManagementPayload>(
      `/staff/classes/${focusClassId.value}/group-management`,
      { groups: groupsPayload },
      authStore.token
    );
    hydrateGroupManager(payload);
    await Promise.all([
      loadGroupOverview(focusClassId.value),
      loadGroupTaskProgress(focusClassId.value, launchForm.value.plan_id),
      loadGroupManagerLogs(focusClassId.value),
    ]);
    ElMessage.success('分组调整已保存');
  } catch (error) {
    groupManagerError.value = error instanceof Error ? error.message : '保存分组失败';
  } finally {
    groupManagerSaving.value = false;
  }
}

function openLaunchpad() {
  void router.push('/staff/classroom');
}

function openRoomSettings() {
  void router.push({ path: '/staff/admin/system', query: { tab: 'rooms' } });
}

watch(
  focusClassId,
  (classId, previousClassId) => {
    if (classId !== previousClassId) {
      void loadGroupOverview(classId);
      if (groupManagerVisible.value) {
        void loadGroupManagement(classId);
        void loadGroupManagerLogs(classId);
      }
      return;
    }
    if (!groupOverview.value) void loadGroupOverview(classId);
  },
  { immediate: false }
);

watch(groupManagerVisible, (visible) => {
  if (visible) {
    void loadGroupManagement(focusClassId.value);
    void loadGroupManagerLogs(focusClassId.value);
  }
});

watch(
  [focusClassId, () => launchForm.value.plan_id],
  ([classId, planId], [previousClassId, previousPlanId]) => {
    if (classId !== previousClassId || planId !== previousPlanId) {
      void loadGroupTaskProgress(classId, planId);
      return;
    }
    if (!groupTaskProgress.value) void loadGroupTaskProgress(classId, planId);
  },
  { immediate: false }
);

onMounted(() => {
  void loadDashboard();
});
</script>

<style scoped>
.teacher-dashboard,
.list-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.dashboard-hero {
  background:
    radial-gradient(circle at top right, rgba(255, 210, 111, 0.24), transparent 30%),
    radial-gradient(circle at bottom left, rgba(47, 135, 255, 0.14), transparent 38%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(242, 247, 255, 0.93));
  border-color: var(--ls-border);
  box-shadow: var(--ls-shadow), var(--ls-surface-glow);
}

.dashboard-metric-grid,
.dashboard-insights-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dashboard-metric-grid {
  display: grid;
}

.dashboard-insights-grid {
  display: grid;
  gap: 14px;
}

.dashboard-metric-card {
  display: grid;
  gap: 10px;
  min-height: 116px;
  align-content: start;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.dashboard-metric-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--ls-soft-shadow), var(--ls-surface-glow);
}

.dashboard-metric-card__top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dashboard-metric-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--ls-primary-soft);
  color: var(--ls-primary);
}

.dashboard-metric-card__icon--accent {
  background: color-mix(in srgb, var(--ls-accent) 16%, white);
  color: var(--ls-accent);
}

.dashboard-metric-card__icon--warning {
  background: rgba(255, 179, 71, 0.18);
  color: #c97805;
}

.dashboard-metric-card__icon--success {
  background: rgba(40, 185, 126, 0.16);
  color: #1a9a68;
}

.dashboard-chart-card {
  display: grid;
  gap: 14px;
}

.panel {
  padding: 20px;
  border-radius: 20px;
}

.panel-head,
.launch-row,
.seat-top,
.group-card-top,
.member-pill-top,
.file-item,
.drawer-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.panel-head,
.group-card-top,
.drive-panel-head,
.drawer-head {
  align-items: flex-start;
}

.chip-row,
.hero-actions,
.group-chip-row,
.class-summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.full-width {
  width: 100%;
}

.hint-box {
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(67, 109, 185, 0.14);
  background: rgba(67, 109, 185, 0.06);
}

.hint-title,
.seat-name,
.group-name,
.member-name,
.file-name {
  margin: 0;
  font-weight: 700;
  color: var(--ls-text);
}

.section-note,
.seat-meta,
.group-note,
.group-description,
.member-note,
.file-meta {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.section-alert {
  margin-bottom: 16px;
}

.submission-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin-bottom: 10px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ls-muted);
}

.seat-grid-shell {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  padding: 2px 0 6px;
}

.seat-grid {
  display: grid;
  width: max-content;
  gap: 8px;
  margin-inline: auto;
}

.seat-card {
  border: 1px solid var(--ls-border);
  border-radius: 12px;
  padding: 7px 9px;
  background: rgba(255, 255, 255, 0.95);
  min-height: 68px;
  box-shadow: var(--ls-surface-glow);
}

.seat-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: opacity 0.16s ease, max-height 0.16s ease;
  pointer-events: none;
  font-size: 11px;
  color: var(--ls-muted);
  margin-bottom: 0;
}

.seat-card:hover .seat-top,
.seat-card:focus-within .seat-top {
  max-height: 18px;
  opacity: 1;
  margin-bottom: 4px;
}

.seat-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.submission-square {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: 0 0 10px;
  border: 1px solid rgba(17, 24, 39, 0.22);
}

.submission-square-none {
  background: #e53935;
}

.submission-square-partial {
  background: #1e88e5;
}

.submission-square-completed {
  background: #2e7d32;
}

.seat-card-signed {
  border-color: rgba(24, 172, 114, 0.28);
  background: linear-gradient(180deg, rgba(233, 252, 244, 0.96), rgba(255, 255, 255, 0.92));
}

.seat-card-empty {
  background: rgba(250, 250, 252, 0.92);
}

.seat-card-virtual {
  border-style: dashed;
}

.seat-card-disabled {
  opacity: 0.58;
}

.seat-name-empty {
  color: var(--ls-muted);
}

.seat-name {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seat-meta {
  font-size: 10px;
  line-height: 1.25;
}

.group-grid,
.metric-grid,
.history-grid,
.log-filter-grid,
.group-manager-grid,
.progress-skeleton-grid,
.progress-overview-grid,
.task-progress-list,
.task-progress-grid,
.progress-bar-stack {
  display: grid;
  gap: 16px;
}

.group-grid,
.history-grid,
.log-filter-grid,
.progress-skeleton-grid,
.progress-overview-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.group-card,
.progress-card,
.task-progress-item {
  display: grid;
  gap: 16px;
  border: 1px solid var(--ls-border);
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 251, 255, 0.92));
  box-shadow: var(--ls-soft-shadow);
}

.group-card-skeleton {
  min-height: 240px;
}

.progress-card-skeleton {
  min-height: 220px;
}

.group-name {
  font-size: 18px;
}

.group-name-small {
  font-size: 15px;
}

.group-description {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(67, 109, 185, 0.08);
}

.member-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.member-pill {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(67, 109, 185, 0.12);
  background: rgba(255, 255, 255, 0.96);
}

.member-pill-signed {
  border-color: rgba(24, 172, 114, 0.24);
  background: rgba(233, 252, 244, 0.88);
}

.member-note,
.file-meta {
  font-size: 12px;
}

.progress-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.progress-chip-row {
  align-items: center;
}

.drive-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(235, 170, 75, 0.18);
  background: rgba(255, 248, 233, 0.78);
}

.activity-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(67, 109, 185, 0.12);
  background: rgba(67, 109, 185, 0.06);
}

.file-list {
  display: grid;
  gap: 10px;
}

.activity-list {
  display: grid;
  gap: 10px;
}

.log-filter-grid {
  margin-bottom: 16px;
}

.file-item {
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed rgba(67, 109, 185, 0.14);
}

.file-item:last-child {
  border-bottom: none;
}

.activity-item {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(67, 109, 185, 0.1);
  background: rgba(255, 255, 255, 0.94);
}

.activity-head {
  margin-bottom: 0;
}

.file-main {
  min-width: 0;
}

.file-name,
.file-meta {
  word-break: break-all;
}

.metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.list-card,
.metric-tile,
.group-edit-card {
  border: 1px solid var(--ls-border);
  border-radius: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--ls-surface-glow);
}

.group-manager-shell {
  display: grid;
  gap: 16px;
}

.inline-label {
  display: inline-flex;
  align-items: center;
  color: var(--ls-muted);
}

.group-manager-grid {
  grid-template-columns: 1.1fr 1.3fr;
}

.group-edit-grid {
  display: grid;
  gap: 16px;
}

.group-edit-card-active {
  border-color: rgba(47, 135, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(47, 135, 255, 0.12);
}

.group-edit-head {
  align-items: center;
}

.group-edit-form {
  display: grid;
  gap: 12px;
}

.unassigned-pool {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
  border: 1px dashed rgba(212, 138, 31, 0.36);
  border-radius: 18px;
  background: rgba(255, 248, 233, 0.72);
}

.unassigned-pool-active {
  border-color: rgba(47, 135, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(47, 135, 255, 0.12);
}

.edit-label {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--ls-muted);
}

.member-preview-list {
  display: grid;
  gap: 8px;
}

.drag-member-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(67, 109, 185, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  cursor: grab;
}

.drag-member-chip:active {
  cursor: grabbing;
}

.drag-member-chip-leader {
  border-color: rgba(24, 172, 114, 0.26);
  background: rgba(233, 252, 244, 0.9);
}

.drag-member-chip-unassigned {
  border-style: dashed;
}

.drag-member-chip-dragging {
  opacity: 0.45;
}

.drop-zone-empty {
  padding: 14px 12px;
  border: 1px dashed rgba(67, 109, 185, 0.18);
  border-radius: 14px;
  color: var(--ls-muted);
  text-align: center;
  background: rgba(255, 255, 255, 0.72);
}

@media (max-width: 1280px) {
  .group-manager-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1200px) {
  .dashboard-metric-grid,
  .dashboard-insights-grid,
  .group-grid,
  .history-grid,
  .log-filter-grid,
  .progress-skeleton-grid,
  .progress-overview-grid,
  .task-progress-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1100px) {
  .launch-row,
  .panel-head,
  .group-card-top,
  .file-item,
  .drawer-head {
    flex-direction: column;
  }

  .metric-grid,
  .history-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .member-strip {
    grid-template-columns: 1fr;
  }
}
</style>
