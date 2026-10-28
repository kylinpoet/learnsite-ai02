<template>
  <div class="page-stack">
    <SaPageHeader
      compact
      description="建题库、维护题目、按班级发布测验。"
      eyebrow="测验题库"
      title="教师题库与课堂测验发布"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadBootstrap()">刷新数据</n-button>
        <n-button secondary @click="resetForms">重置表单</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="12" animated />
    </SaPanel>

    <template v-else-if="bootstrap">
      <div class="ls-row">
        <article class="metric-tile">
          <p class="metric-label">可管班级</p>
          <p class="metric-value">{{ bootstrap.classes.length }}</p>
          <p class="metric-note">当前账号可发布测验的班级数</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">题库数量</p>
          <p class="metric-value">{{ bootstrap.banks.length }}</p>
          <p class="metric-note">包含系统内置和教师自建题库</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">题目数量</p>
          <p class="metric-value">{{ totalQuestionCount }}</p>
          <p class="metric-note">当前可用于组卷的总题数</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">已发布测验</p>
          <p class="metric-value">{{ quizListMeta.overall_total }}</p>
          <p class="metric-note">按当前账号可见班级统计</p>
        </article>
      </div>

      <SaPanel>
        <template #header>
          <div class="section-head">
            <div>
              <h3>测验参与与平均分</h3>
              <p class="section-note">柱为参与人数，折线为平均分（满分 100），便于横向对比已发布测验的掌握情况。</p>
            </div>
          </div>
        </template>
        <n-empty v-if="!quizRows.length" description="当前还没有已发布测验可以统计。" />
        <AppChart v-else :height="300" :option="quizPerformanceOption" />
      </SaPanel>

      <div class="content-grid grid-8-16">
        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>新建题库</h3>
                <p class="section-note">先建立一个题库，再向其中添加题目。</p>
              </div>
            </div>
          </template>

          <n-form label-placement="top">
            <n-form-item label="题库名称">
              <n-input v-model:value="bankForm.title" :maxlength="120" placeholder="例如：七年级人工智能基础题库" />
            </n-form-item>
            <n-form-item label="题库说明">
              <n-input
                v-model:value="bankForm.description"
                :maxlength="1000"
                :rows="4"
                placeholder="说明这套题库服务的单元、课次或课堂主题"
                type="textarea"
              />
            </n-form-item>
            <n-button :loading="creatingBank" type="primary" @click="submitBank">
              保存题库
            </n-button>
          </n-form>
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>题库列表</h3>
                <p class="section-note">用于后续出题和组卷，点击后可直接作为默认题库。</p>
              </div>
              <n-tag round type="info">共 {{ filteredBanks.length }} / {{ bootstrap.banks.length }} 个题库</n-tag>
            </div>
          </template>

          <div class="filter-row">
            <n-input
              v-model:value="bankFilterKeyword"
              clearable
              placeholder="搜索题库名 / 说明 / 创建人"
            />
            <n-select
              v-model:value="bankFilterScope"
              :options="bankScopeFilterOptions"
              class="filter-select"
              placeholder="题库类型"
            />
          </div>

          <n-empty
            v-if="!filteredBanks.length"
            :description="bootstrap.banks.length ? '当前筛选条件下没有题库' : '当前还没有题库'"
          />

          <div v-else class="bank-list">
            <article
              v-for="bank in filteredBanks"
              :key="bank.id"
              class="bank-card"
              :class="{ 'bank-card-active': activeBankId === bank.id }"
              @click="selectBank(bank.id)"
            >
              <div class="bank-card__top">
                <div>
                  <h4>{{ bank.title }}</h4>
                  <p class="bank-card__meta">
                    {{ bank.owner_name }} · {{ bank.scope_type === 'system' ? '系统题库' : '教师题库' }}
                  </p>
                </div>
                <div class="bank-card__actions">
                  <n-tag round>{{ bank.question_count }} 题</n-tag>
                  <n-space v-if="bank.scope_type === 'staff'" size="small">
                    <n-button
                      :disabled="deletingBankId === bank.id"
                      text
                      type="primary"
                      @click.stop="openBankEditor(bank)"
                    >
                      编辑
                    </n-button>
                    <n-button
                      :loading="deletingBankId === bank.id"
                      text
                      type="error"
                      @click.stop="deleteBank(bank)"
                    >
                      删除
                    </n-button>
                  </n-space>
                </div>
              </div>
              <p class="bank-card__desc">{{ bank.description || '暂无题库说明。' }}</p>
            </article>
          </div>
        </SaPanel>
      </div>

      <div class="content-grid grid-8-16">
        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>添加题目</h3>
                <p class="section-note">当前仅支持单选题，必须有且仅有一个正确答案。</p>
              </div>
              <n-tag round type="success">{{ activeBank?.title || '请先选题库' }}</n-tag>
            </div>
          </template>

          <n-form label-placement="top">
            <n-form-item label="所属题库">
              <n-select
                v-model:value="questionForm.bank_id"
                :options="bankSelectOptions"
                class="full-width"
                filterable
                placeholder="请选择题库"
              />
            </n-form-item>

            <n-form-item label="题目内容">
              <n-input
                v-model:value="questionForm.content"
                :maxlength="4000"
                :rows="4"
                placeholder="输入题干，例如：人工智能应用设计时首先要明确什么？"
                type="textarea"
              />
            </n-form-item>

            <div class="form-inline-grid">
              <n-form-item label="难度">
                <n-select v-model:value="questionForm.difficulty" :options="difficultyOptions" class="full-width" />
              </n-form-item>
              <n-form-item label="正确答案">
                <n-radio-group v-model:value="questionForm.correct_key">
                  <n-radio-button
                    v-for="item in questionForm.options"
                    :key="item.option_key"
                    :label="item.option_key"
                    :value="item.option_key"
                  />
                </n-radio-group>
              </n-form-item>
            </div>

            <div class="option-editor">
              <div class="section-head">
                <strong>选项编辑</strong>
                <n-button
                  :disabled="questionForm.options.length >= 8"
                  text
                  type="primary"
                  @click="appendOption"
                >
                  添加选项
                </n-button>
              </div>

              <div class="option-editor__list">
                <div
                  v-for="(item, index) in questionForm.options"
                  :key="item.option_key"
                  class="option-editor__row"
                >
                  <n-input v-model:value="item.option_key" class="option-key" disabled />
                  <n-input
                    v-model:value="item.option_text"
                    :maxlength="500"
                    placeholder="请输入选项内容"
                  />
                  <n-button
                    :disabled="questionForm.options.length <= 2"
                    text
                    type="error"
                    @click="removeOption(index)"
                  >
                    删除
                  </n-button>
                </div>
              </div>
            </div>

            <n-form-item label="解析">
              <n-input
                v-model:value="questionForm.explanation"
                :maxlength="2000"
                :rows="3"
                placeholder="可选，学生提交后用于展示解析"
                type="textarea"
              />
            </n-form-item>

            <n-button :loading="creatingQuestion" type="primary" @click="submitQuestion">
              保存题目
            </n-button>
          </n-form>
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>当前题库题目</h3>
                <p class="section-note">可直接勾选题目用于发布测验。</p>
              </div>
              <n-tag round type="warning">{{ activeBankQuestions.length }} 题</n-tag>
            </div>
          </template>

          <n-empty v-if="!activeBankQuestions.length" description="当前题库还没有题目" />

          <div v-else class="question-bank-list">
            <label
              v-for="question in activeBankQuestions"
              :key="question.id"
              class="question-bank-item"
            >
              <n-checkbox
                :checked="selectedQuestionIds.includes(question.id)"
                @update:checked="toggleQuestionSelection(question.id)"
              />
              <div class="question-bank-item__body">
                <div class="question-bank-item__head">
                  <div class="chip-row">
                    <n-tag round>{{ question.difficulty }}</n-tag>
                    <n-tag round type="info">ID {{ question.id }}</n-tag>
                  </div>
                  <n-space v-if="activeBankCanEdit" size="small">
                    <n-button
                      :disabled="deletingQuestionId === question.id"
                      text
                      type="primary"
                      @click.stop="openQuestionEditor(question)"
                    >
                      编辑
                    </n-button>
                    <n-button
                      :loading="deletingQuestionId === question.id"
                      text
                      type="error"
                      @click.stop="deleteQuestion(question.id)"
                    >
                      删除
                    </n-button>
                  </n-space>
                </div>
                <p class="question-bank-item__content">{{ question.content }}</p>
                <p class="section-note">
                  {{
                    question.options
                      .map((option) => `${option.key}. ${option.text}${option.is_correct ? '（正确）' : ''}`)
                      .join('  ')
                  }}
                </p>
              </div>
            </label>
          </div>
        </SaPanel>
      </div>

      <div class="content-grid grid-8-16">
        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>发布课堂测验</h3>
                <p class="section-note">从左侧题库勾题后，选择班级即可立即发布。</p>
              </div>
            </div>
          </template>

          <n-form label-placement="top">
            <n-form-item label="测验标题">
              <n-input v-model:value="quizForm.title" :maxlength="120" placeholder="例如：809 班课堂测验：网络与搜索" />
            </n-form-item>
            <n-form-item label="测验说明">
              <n-input
                v-model:value="quizForm.description"
                :maxlength="1000"
                :rows="4"
                placeholder="说明本次测验主题、范围和使用场景"
                type="textarea"
              />
            </n-form-item>
            <n-form-item label="发布班级">
              <n-select
                v-model:value="quizForm.class_id"
                :options="classSelectOptions"
                class="full-width"
                filterable
                placeholder="请选择班级"
              />
            </n-form-item>
            <n-form-item label="已选题目">
              <div class="selected-question-box">
                <p class="selected-question-box__summary">
                  当前已选 {{ selectedQuestionIds.length }} 题
                </p>
                <div v-if="selectedQuestionIds.length" class="chip-row">
                  <n-tag
                    v-for="questionId in selectedQuestionIds"
                    :key="questionId"
                    closable
                    round
                    @close="removeSelectedQuestion(questionId)"
                  >
                    题目 {{ questionId }}
                  </n-tag>
                </div>
                <p v-else class="section-note">请先在上方题库列表勾选题目。</p>
              </div>
            </n-form-item>

            <n-button :loading="creatingQuiz" type="primary" @click="submitQuiz">
              发布测验
            </n-button>
          </n-form>
        </SaPanel>

        <SaPanel>
          <template #header>
            <div class="section-head">
              <div>
                <h3>已发布测验</h3>
                <p class="section-note">展示当前账号可见班级的测验发布情况与参与概览。</p>
              </div>
              <n-tag round type="info">共 {{ quizListMeta.total }} / {{ quizListMeta.overall_total }} 条</n-tag>
            </div>
          </template>

          <div class="filter-row filter-row--quiz">
            <n-input
              v-model:value="quizFilterKeyword"
              clearable
              placeholder="搜索测验标题 / 说明"
            />
            <n-select
              v-model:value="quizFilterClassId"
              :options="quizClassFilterOptions"
              class="filter-select"
              clearable
              placeholder="按班级筛选"
            />
            <n-select
              v-model:value="quizFilterStatus"
              :options="quizStatusFilterOptions"
              class="filter-select"
              placeholder="状态筛选"
            />
            <n-select
              v-model:value="quizSortMode"
              :options="quizSortOptions"
              class="filter-select"
              placeholder="排序方式"
            />
          </div>

          <n-spin v-if="!quizRows.length" :show="isQuizTableLoading">
            <n-empty
              :description="quizListMeta.overall_total ? '当前筛选条件下没有测验' : '当前还没有发布测验'"
            />
          </n-spin>

          <SaDataTable v-else :data="quizRows" :loading="isQuizTableLoading" row-key="id" stripe>
            <SaTableColumn label="测验标题" min-width="220" prop="title" />
            <SaTableColumn label="班级" min-width="100" prop="class_name" />
            <SaTableColumn label="状态" min-width="100">
              <template #default="{ row }">
                <n-tag :type="quizStatusTagType(row.status)" round>
                  {{ quizStatusLabel(row.status) }}
                </n-tag>
              </template>
            </SaTableColumn>
            <SaTableColumn label="题数" min-width="80" prop="question_count" />
            <SaTableColumn label="参与人数" min-width="100" prop="attempt_count" />
            <SaTableColumn label="平均分" min-width="100">
              <template #default="{ row }">
                {{ row.average_score ?? '--' }}
              </template>
            </SaTableColumn>
            <SaTableColumn label="更新时间" min-width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.updated_at) }}
              </template>
            </SaTableColumn>
            <SaTableColumn label="操作" min-width="220">
              <template #default="{ row }">
                <n-space size="small">
                  <n-button
                    :disabled="updatingQuizStatusId === row.id || deletingQuizId === row.id"
                    text
                    type="primary"
                    @click="openQuizEditor(row)"
                  >
                    编辑
                  </n-button>
                  <n-button
                    :disabled="deletingQuizId === row.id"
                    :loading="updatingQuizStatusId === row.id"
                    text
                    type="primary"
                    @click="toggleQuizStatus(row)"
                  >
                    {{ row.status === 'active' ? '停用' : '启用' }}
                  </n-button>
                  <n-button
                    :loading="deletingQuizId === row.id"
                    text
                    type="error"
                    @click="deleteQuiz(row)"
                  >
                    删除
                  </n-button>
                </n-space>
              </template>
            </SaTableColumn>
          </SaDataTable>

          <div v-if="quizPaginationTotal > 0" class="quiz-pagination">
            <n-pagination
              v-model:page="quizPage"
              v-model:page-size="quizPageSize"
              :item-count="quizPaginationTotal"
              :page-sizes="quizPageSizeOptionsList"
              show-quick-jumper
              show-size-picker
            >
              <template #prefix="{ itemCount }">共 {{ itemCount }} 条</template>
            </n-pagination>
          </div>
        </SaPanel>
      </div>
    </template>

    <n-modal
      v-model:show="questionEditorVisible"
      :mask-closable="false"
      :title="editingQuestionId ? `编辑题目 #${editingQuestionId}` : '编辑题目'"
      preset="card"
      style="width: min(760px, 94vw)"
    >
      <n-form label-placement="top">
        <n-form-item label="题目内容">
          <n-input
            v-model:value="questionEditorForm.content"
            :maxlength="4000"
            :rows="4"
            placeholder="输入题干，例如：人工智能应用设计时首先要明确什么？"
            type="textarea"
          />
        </n-form-item>

        <div class="form-inline-grid">
          <n-form-item label="难度">
            <n-select v-model:value="questionEditorForm.difficulty" :options="difficultyOptions" class="full-width" />
          </n-form-item>
          <n-form-item label="正确答案">
            <n-radio-group v-model:value="questionEditorForm.correct_key">
              <n-radio-button
                v-for="item in questionEditorForm.options"
                :key="item.option_key"
                :label="item.option_key"
                :value="item.option_key"
              />
            </n-radio-group>
          </n-form-item>
        </div>

        <div class="option-editor">
          <div class="section-head">
            <strong>选项编辑</strong>
            <n-button
              :disabled="questionEditorForm.options.length >= 8"
              text
              type="primary"
              @click="appendEditorOption"
            >
              添加选项
            </n-button>
          </div>

          <div class="option-editor__list">
            <div
              v-for="(item, index) in questionEditorForm.options"
              :key="item.option_key"
              class="option-editor__row"
            >
              <n-input v-model:value="item.option_key" class="option-key" disabled />
              <n-input
                v-model:value="item.option_text"
                :maxlength="500"
                placeholder="请输入选项内容"
              />
              <n-button
                :disabled="questionEditorForm.options.length <= 2"
                text
                type="error"
                @click="removeEditorOption(index)"
              >
                删除
              </n-button>
            </div>
          </div>
        </div>

        <n-form-item label="解析">
          <n-input
            v-model:value="questionEditorForm.explanation"
            :maxlength="2000"
            :rows="3"
            placeholder="可选，学生提交后用于展示解析"
            type="textarea"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="closeQuestionEditor">取消</n-button>
          <n-button
            :loading="updatingQuestion"
            type="primary"
            @click="submitQuestionUpdate"
          >
            保存修改
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal
      v-model:show="bankEditorVisible"
      :mask-closable="false"
      :title="editingBankId ? `编辑题库 #${editingBankId}` : '编辑题库'"
      preset="card"
      style="width: min(620px, 92vw)"
    >
      <n-form label-placement="top">
        <n-form-item label="题库名称">
          <n-input
            v-model:value="bankEditorForm.title"
            :maxlength="120"
            placeholder="例如：七年级人工智能基础题库"
          />
        </n-form-item>
        <n-form-item label="题库说明">
          <n-input
            v-model:value="bankEditorForm.description"
            :maxlength="1000"
            :rows="4"
            placeholder="说明这套题库服务的单元、课次或课堂主题"
            type="textarea"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="closeBankEditor">取消</n-button>
          <n-button
            :loading="updatingBank"
            type="primary"
            @click="submitBankUpdate"
          >
            保存题库修改
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal
      v-model:show="quizEditorVisible"
      :mask-closable="false"
      :title="editingQuizId ? `编辑测验 #${editingQuizId}` : '编辑测验'"
      preset="card"
      style="width: min(760px, 94vw)"
    >
      <n-form label-placement="top">
        <n-form-item label="测验标题">
          <n-input
            v-model:value="quizEditorForm.title"
            :maxlength="120"
            placeholder="例如：809 班课堂测验：网络与搜索"
          />
        </n-form-item>
        <n-form-item label="测验说明">
          <n-input
            v-model:value="quizEditorForm.description"
            :maxlength="1000"
            :rows="4"
            placeholder="说明本次测验主题、范围和使用场景"
            type="textarea"
          />
        </n-form-item>
        <n-form-item label="发布班级">
          <n-select
            v-model:value="quizEditorForm.class_id"
            :options="classSelectOptions"
            class="full-width"
            filterable
            placeholder="请选择班级"
          />
        </n-form-item>
        <n-form-item label="测验题目">
          <n-select
            v-model:value="quizEditorForm.question_ids"
            :max-tag-count="1"
            :options="quizQuestionOptions"
            class="full-width"
            filterable
            multiple
            placeholder="请选择至少 1 道题目"
          />
          <p class="section-note">当前已选 {{ quizEditorForm.question_ids.length }} 题，可拖动滚轮快速检索题干关键词。</p>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="closeQuizEditor">取消</n-button>
          <n-button
            :loading="updatingQuiz"
            type="primary"
            @click="submitQuizUpdate"
          >
            保存测验修改
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCheckbox,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPagination,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSkeleton,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui';
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import SaDataTable from '@/components/sa/SaDataTable.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
import SaTableColumn from '@/components/sa/SaTableColumn.vue';
import { useChartTheme } from '@/composables/useChartTheme';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { createDebouncedAbortableRequestRunner } from '@/utils/debouncedAbortableRequest';

const AppChart = defineAsyncComponent(() => import('@/components/AppChart.vue'));

type QuizSortMode = 'updated_desc' | 'updated_asc' | 'attempt_desc' | 'attempt_asc';
type QuizStatusFilter = '' | 'active' | 'inactive';

type StaffBootstrapPayload = {
  classes: Array<{
    id: number;
    class_name: string;
    grade_no: number;
    class_no: number;
    student_count: number;
  }>;
  banks: Array<{
    id: number;
    title: string;
    description: string | null;
    scope_type: string;
    owner_name: string;
    question_count: number;
    questions: Array<{
      id: number;
      content: string;
      difficulty: string;
      explanation: string | null;
      options: Array<{
        id: number;
        key: string;
        text: string;
        is_correct: boolean;
      }>;
    }>;
  }>;
  quizzes: Array<{
    id: number;
    title: string;
    description: string | null;
    status: string;
    class_id: number;
    class_name: string;
    question_count: number;
    question_ids: number[];
    attempt_count: number;
    average_score: number | null;
    updated_at: string | null;
  }>;
  quiz_list: {
    total: number;
    overall_total: number;
    page: number;
    page_size: number;
    page_count: number;
    sort_mode: QuizSortMode;
  };
};
type QuizBootstrapMode = 'full' | 'quiz_list';
type StaffBootstrapResponsePayload = Pick<StaffBootstrapPayload, 'quizzes' | 'quiz_list'> &
  Partial<Pick<StaffBootstrapPayload, 'classes' | 'banks'>>;

type StaffBankRecord = StaffBootstrapPayload['banks'][number];
type StaffBankQuestion = StaffBootstrapPayload['banks'][number]['questions'][number];
type StaffQuizRecord = StaffBootstrapPayload['quizzes'][number];
type QuizListPreferences = {
  keyword: string;
  class_id: number | null;
  status: QuizStatusFilter;
  sort_mode: QuizSortMode;
  page: number;
  page_size: number;
};
type QuizListMeta = StaffBootstrapPayload['quiz_list'];

type QuestionOptionForm = {
  option_key: string;
  option_text: string;
};

const QUIZ_LIST_PREFERENCES_KEY = 'learnsite.staff.quizzes.list.preferences.v1';
const quizPageSizeOptions = [5, 10, 20, 50] as const;
const quizPageSizeOptionsList = [...quizPageSizeOptions];
const difficultyOptions = [
  { label: '基础', value: '基础' },
  { label: '提升', value: '提升' },
  { label: '挑战', value: '挑战' },
];
const bankScopeFilterOptions = [
  { label: '全部题库', value: '' },
  { label: '教师题库', value: 'staff' },
  { label: '系统题库', value: 'system' },
];
const quizStatusFilterOptions = [
  { label: '全部状态', value: '' },
  { label: '进行中', value: 'active' },
  { label: '已停用', value: 'inactive' },
];
const quizSortOptions = [
  { label: '更新时间：新到旧', value: 'updated_desc' },
  { label: '更新时间：旧到新', value: 'updated_asc' },
  { label: '参与人数：高到低', value: 'attempt_desc' },
  { label: '参与人数：低到高', value: 'attempt_asc' },
];
const defaultQuizListPreferences: QuizListPreferences = {
  keyword: '',
  class_id: null,
  status: '',
  sort_mode: 'updated_desc',
  page: 1,
  page_size: 10,
};
const quizSortModes: QuizSortMode[] = ['updated_desc', 'updated_asc', 'attempt_desc', 'attempt_asc'];
const quizStatusFilters: QuizStatusFilter[] = ['', 'active', 'inactive'];
const defaultQuizListMeta: QuizListMeta = {
  total: 0,
  overall_total: 0,
  page: 1,
  page_size: 10,
  page_count: 1,
  sort_mode: 'updated_desc',
};

function loadQuizListPreferences(): QuizListPreferences {
  if (typeof window === 'undefined') {
    return { ...defaultQuizListPreferences };
  }
  try {
    const raw = window.localStorage.getItem(QUIZ_LIST_PREFERENCES_KEY);
    if (!raw) {
      return { ...defaultQuizListPreferences };
    }
    const parsed = JSON.parse(raw) as Partial<QuizListPreferences>;
    const classId =
      typeof parsed.class_id === 'number' && Number.isInteger(parsed.class_id) && parsed.class_id > 0
        ? parsed.class_id
        : null;
    const status = quizStatusFilters.includes(parsed.status as QuizStatusFilter)
      ? (parsed.status as QuizStatusFilter)
      : defaultQuizListPreferences.status;
    const sortMode = quizSortModes.includes(parsed.sort_mode as QuizSortMode)
      ? (parsed.sort_mode as QuizSortMode)
      : defaultQuizListPreferences.sort_mode;
    const pageSize =
      typeof parsed.page_size === 'number' &&
      Number.isInteger(parsed.page_size) &&
      quizPageSizeOptions.includes(parsed.page_size as (typeof quizPageSizeOptions)[number])
        ? parsed.page_size
        : defaultQuizListPreferences.page_size;
    const page =
      typeof parsed.page === 'number' && Number.isInteger(parsed.page) && parsed.page > 0
        ? parsed.page
        : defaultQuizListPreferences.page;

    return {
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : defaultQuizListPreferences.keyword,
      class_id: classId,
      status,
      sort_mode: sortMode,
      page,
      page_size: pageSize,
    };
  } catch {
    return { ...defaultQuizListPreferences };
  }
}

function saveQuizListPreferences(payload: QuizListPreferences) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(QUIZ_LIST_PREFERENCES_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage failures so the main flow keeps working.
  }
}

const authStore = useAuthStore();
const { axisX, axisY, base, grid, legend, palette, tokens, tooltip } = useChartTheme();
const initialQuizListPreferences = loadQuizListPreferences();

const isLoading = ref(true);
const errorMessage = ref('');
const isQuizTableLoading = ref(false);
const bootstrap = ref<StaffBootstrapPayload | null>(null);

const creatingBank = ref(false);
const updatingBank = ref(false);
const creatingQuestion = ref(false);
const creatingQuiz = ref(false);
const updatingQuestion = ref(false);
const updatingQuiz = ref(false);
const deletingBankId = ref<number | null>(null);
const deletingQuestionId = ref<number | null>(null);
const deletingQuizId = ref<number | null>(null);
const updatingQuizStatusId = ref<number | null>(null);
const bankEditorVisible = ref(false);
const editingBankId = ref<number | null>(null);
const questionEditorVisible = ref(false);
const editingQuestionId = ref<number | null>(null);
const quizEditorVisible = ref(false);
const editingQuizId = ref<number | null>(null);

const activeBankId = ref<number | null>(null);
const selectedQuestionIds = ref<number[]>([]);
const bankFilterKeyword = ref('');
const bankFilterScope = ref('');
const quizFilterKeyword = ref(initialQuizListPreferences.keyword);
const quizFilterClassId = ref<number | null>(initialQuizListPreferences.class_id);
const quizFilterStatus = ref<QuizStatusFilter>(initialQuizListPreferences.status);
const quizSortMode = ref<QuizSortMode>(initialQuizListPreferences.sort_mode);
const quizPage = ref(initialQuizListPreferences.page);
const quizPageSize = ref(initialQuizListPreferences.page_size);
const isSyncingQuizQueryState = ref(false);
const quizQueryWatcherReady = ref(false);
const bootstrapRequestRunner = createDebouncedAbortableRequestRunner();
let latestBootstrapLoadSequence = 0;

const bankForm = reactive({
  title: '',
  description: '',
});

const bankEditorForm = reactive({
  title: '',
  description: '',
});

const questionForm = reactive<{
  bank_id: number | null;
  content: string;
  difficulty: string;
  explanation: string;
  correct_key: string;
  options: QuestionOptionForm[];
}>({
  bank_id: null,
  content: '',
  difficulty: '基础',
  explanation: '',
  correct_key: 'A',
  options: createDefaultOptions(),
});

const questionEditorForm = reactive<{
  content: string;
  difficulty: string;
  explanation: string;
  correct_key: string;
  options: QuestionOptionForm[];
}>({
  content: '',
  difficulty: '基础',
  explanation: '',
  correct_key: 'A',
  options: createDefaultOptions(),
});

const quizForm = reactive({
  title: '',
  description: '',
  class_id: null as number | null,
});

const quizEditorForm = reactive<{
  title: string;
  description: string;
  class_id: number | null;
  question_ids: number[];
}>({
  title: '',
  description: '',
  class_id: null,
  question_ids: [],
});

const totalQuestionCount = computed(() =>
  (bootstrap.value?.banks || []).reduce((sum, bank) => sum + bank.question_count, 0)
);

const activeBank = computed(() =>
  bootstrap.value?.banks.find((bank) => bank.id === activeBankId.value) || null
);

const filteredBanks = computed(() => {
  const banks = bootstrap.value?.banks || [];
  const keyword = bankFilterKeyword.value.trim().toLowerCase();
  const scope = bankFilterScope.value;

  return banks.filter((bank) => {
    if (scope && bank.scope_type !== scope) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return [bank.title, bank.description || '', bank.owner_name]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
});

const activeBankQuestions = computed(() => activeBank.value?.questions || []);
const activeBankCanEdit = computed(() => activeBank.value?.scope_type === 'staff');
const quizQuestionOptions = computed(() =>
  (bootstrap.value?.banks || []).flatMap((bank) =>
    bank.questions.map((question) => ({
      id: question.id,
      label: `${bank.title} · #${question.id} · ${question.content.slice(0, 32)}${question.content.length > 32 ? '...' : ''}`,
    }))
  )
);
const quizRows = computed(() => bootstrap.value?.quizzes || []);
const bankSelectOptions = computed(() =>
  (bootstrap.value?.banks || []).map((bank) => ({
    label: `${bank.title}（${bank.question_count} 题）`,
    value: bank.id,
  }))
);
const classSelectOptions = computed(() =>
  (bootstrap.value?.classes || []).map((item) => ({
    label: `${item.class_name} · ${item.student_count} 人`,
    value: item.id,
  }))
);
const quizClassFilterOptions = computed(() =>
  (bootstrap.value?.classes || []).map((item) => ({
    label: item.class_name,
    value: item.id,
  }))
);
const quizListMeta = computed<QuizListMeta>(() => bootstrap.value?.quiz_list || defaultQuizListMeta);
const quizPaginationTotal = computed(() => quizListMeta.value.total);

const quizPerformanceOption = computed(() => {
  const quizzes = (bootstrap.value?.quizzes || []).slice(0, 12);
  return base({
    tooltip: tooltip('axis'),
    legend: legend({ top: 0 }),
    grid: grid({ top: 42 }),
    xAxis: axisX(quizzes.map((item) => item.title), {
      axisLabel: { color: tokens.value.muted, fontSize: 11, width: 76, overflow: 'truncate', interval: 0 },
    }),
    yAxis: [
      axisY({ name: '参与人数', nameTextStyle: { color: tokens.value.muted } }),
      axisY({ name: '平均分', nameTextStyle: { color: tokens.value.muted }, max: 100, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '参与人数',
        type: 'bar',
        barMaxWidth: 30,
        itemStyle: { color: palette.value[0], borderRadius: [6, 6, 0, 0] },
        data: quizzes.map((item) => item.attempt_count),
      },
      {
        name: '平均分',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 7,
        connectNulls: true,
        lineStyle: { color: palette.value[1] },
        itemStyle: { color: palette.value[1] },
        data: quizzes.map((item) => (item.average_score === null ? null : Number(item.average_score.toFixed(1)))),
      },
    ],
  });
});

watch(
  [quizFilterKeyword, quizFilterClassId, quizFilterStatus, quizSortMode, quizPage, quizPageSize],
  (nextValue, prevValue) => {
    const [nextKeyword, nextClassId, nextStatus, nextSortMode, nextPage, nextPageSize] = nextValue;
    if (prevValue) {
      const [prevKeyword, prevClassId, prevStatus, prevSortMode] = prevValue;
      const quizFilterChanged =
        nextKeyword !== prevKeyword ||
        nextClassId !== prevClassId ||
        nextStatus !== prevStatus ||
        nextSortMode !== prevSortMode;
      if (quizFilterChanged && nextPage !== 1) {
        quizPage.value = 1;
        return;
      }
    }

    saveQuizListPreferences({
      keyword: nextKeyword,
      class_id: nextClassId,
      status: nextStatus,
      sort_mode: nextSortMode,
      page: nextPage,
      page_size: nextPageSize,
    });

    if (!quizQueryWatcherReady.value || isSyncingQuizQueryState.value) {
      return;
    }
    void loadBootstrap({ withLoading: false, mode: 'quiz_list', debounceMs: 160 });
  }
);

function buildQuizBootstrapPath(mode: QuizBootstrapMode = 'full') {
  const query = new URLSearchParams();
  const keyword = quizFilterKeyword.value.trim();
  if (keyword) {
    query.set('quiz_keyword', keyword);
  }
  if (quizFilterClassId.value) {
    query.set('quiz_class_id', String(quizFilterClassId.value));
  }
  if (quizFilterStatus.value) {
    query.set('quiz_status', quizFilterStatus.value);
  }
  query.set('quiz_sort_mode', quizSortMode.value);
  query.set('quiz_page', String(Math.max(1, quizPage.value)));
  const safePageSize = quizPageSizeOptions.includes(quizPageSize.value as (typeof quizPageSizeOptions)[number])
    ? quizPageSize.value
    : defaultQuizListPreferences.page_size;
  query.set('quiz_page_size', String(safePageSize));
  if (mode === 'quiz_list') {
    query.set('bootstrap_mode', 'quiz_list');
  }
  return `/quizzes/staff/bootstrap?${query.toString()}`;
}

function applyBootstrapQuizMeta(payload: StaffBootstrapPayload, options: { hasClassScope?: boolean } = {}) {
  const listMeta = payload.quiz_list || defaultQuizListMeta;
  const hasClassScope = options.hasClassScope ?? true;
  isSyncingQuizQueryState.value = true;
  try {
    if (hasClassScope && quizFilterClassId.value && !payload.classes.some((item) => item.id === quizFilterClassId.value)) {
      quizFilterClassId.value = null;
    }
    if (quizSortModes.includes(listMeta.sort_mode)) {
      quizSortMode.value = listMeta.sort_mode;
    }
    const safePageSize = quizPageSizeOptions.includes(listMeta.page_size as (typeof quizPageSizeOptions)[number])
      ? listMeta.page_size
      : defaultQuizListPreferences.page_size;
    quizPageSize.value = safePageSize;
    quizPage.value = Math.max(1, listMeta.page || 1);
  } finally {
    isSyncingQuizQueryState.value = false;
  }
}

function createDefaultOptions() {
  return ['A', 'B', 'C', 'D'].map((key) => ({
    option_key: key,
    option_text: '',
  }));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  return value.replace('T', ' ').slice(0, 16);
}

function quizStatusLabel(status: string) {
  if (status === 'active') {
    return '进行中';
  }
  if (status === 'inactive') {
    return '已停用';
  }
  return status;
}

function quizStatusTagType(status: string) {
  if (status === 'active') {
    return 'success';
  }
  if (status === 'inactive') {
    return 'info';
  }
  return 'warning';
}

function selectBank(bankId: number) {
  activeBankId.value = bankId;
  questionForm.bank_id = bankId;
  selectedQuestionIds.value = selectedQuestionIds.value.filter((id) =>
    (bootstrap.value?.banks || []).some((bank) => bank.questions.some((question) => question.id === id))
  );
}

function resetQuestionForm() {
  questionForm.bank_id = activeBankId.value;
  questionForm.content = '';
  questionForm.difficulty = '基础';
  questionForm.explanation = '';
  questionForm.correct_key = 'A';
  questionForm.options = createDefaultOptions();
}

function resetQuestionEditorForm() {
  questionEditorForm.content = '';
  questionEditorForm.difficulty = '基础';
  questionEditorForm.explanation = '';
  questionEditorForm.correct_key = 'A';
  questionEditorForm.options = createDefaultOptions();
}

function resetBankEditorForm() {
  bankEditorForm.title = '';
  bankEditorForm.description = '';
}

function resetQuizEditorForm() {
  quizEditorForm.title = '';
  quizEditorForm.description = '';
  quizEditorForm.class_id = null;
  quizEditorForm.question_ids = [];
}

function resetForms() {
  bankForm.title = '';
  bankForm.description = '';
  closeBankEditor();
  resetQuestionForm();
  closeQuestionEditor();
  closeQuizEditor();
  quizForm.title = '';
  quizForm.description = '';
  quizForm.class_id = null;
  selectedQuestionIds.value = [];
}

function openBankEditor(bank: StaffBankRecord) {
  editingBankId.value = bank.id;
  bankEditorForm.title = bank.title;
  bankEditorForm.description = bank.description || '';
  bankEditorVisible.value = true;
}

function closeBankEditor() {
  bankEditorVisible.value = false;
  editingBankId.value = null;
  resetBankEditorForm();
}

function openQuestionEditor(question: StaffBankQuestion) {
  editingQuestionId.value = question.id;
  questionEditorForm.content = question.content;
  questionEditorForm.difficulty = question.difficulty || '基础';
  questionEditorForm.explanation = question.explanation || '';

  const sortedOptions = [...question.options].sort((a, b) => a.key.localeCompare(b.key));
  const normalizedOptions = sortedOptions.map((item, index) => ({
    option_key: String.fromCharCode(65 + index),
    option_text: item.text,
  }));
  questionEditorForm.options = normalizedOptions.length ? normalizedOptions : createDefaultOptions();

  const correctIndex = sortedOptions.findIndex((item) => item.is_correct);
  questionEditorForm.correct_key = questionEditorForm.options[correctIndex]?.option_key || questionEditorForm.options[0]?.option_key || 'A';
  questionEditorVisible.value = true;
}

function closeQuestionEditor() {
  questionEditorVisible.value = false;
  editingQuestionId.value = null;
  resetQuestionEditorForm();
}

function openQuizEditor(quiz: StaffQuizRecord) {
  editingQuizId.value = quiz.id;
  quizEditorForm.title = quiz.title;
  quizEditorForm.description = quiz.description || '';
  quizEditorForm.class_id = quiz.class_id;
  quizEditorForm.question_ids = [...(quiz.question_ids || [])];
  quizEditorVisible.value = true;
}

function closeQuizEditor() {
  quizEditorVisible.value = false;
  editingQuizId.value = null;
  resetQuizEditorForm();
}

function appendOption() {
  const nextKey = String.fromCharCode(65 + questionForm.options.length);
  questionForm.options.push({
    option_key: nextKey,
    option_text: '',
  });
}

function removeOption(index: number) {
  if (questionForm.options.length <= 2) {
    return;
  }
  questionForm.options.splice(index, 1);
  questionForm.options = questionForm.options.map((item, itemIndex) => ({
    ...item,
    option_key: String.fromCharCode(65 + itemIndex),
  }));
  if (!questionForm.options.some((item) => item.option_key === questionForm.correct_key)) {
    questionForm.correct_key = questionForm.options[0]?.option_key || 'A';
  }
}

function appendEditorOption() {
  const nextKey = String.fromCharCode(65 + questionEditorForm.options.length);
  questionEditorForm.options.push({
    option_key: nextKey,
    option_text: '',
  });
}

function removeEditorOption(index: number) {
  if (questionEditorForm.options.length <= 2) {
    return;
  }
  questionEditorForm.options.splice(index, 1);
  questionEditorForm.options = questionEditorForm.options.map((item, itemIndex) => ({
    ...item,
    option_key: String.fromCharCode(65 + itemIndex),
  }));
  if (!questionEditorForm.options.some((item) => item.option_key === questionEditorForm.correct_key)) {
    questionEditorForm.correct_key = questionEditorForm.options[0]?.option_key || 'A';
  }
}

function toggleQuestionSelection(questionId: number) {
  if (selectedQuestionIds.value.includes(questionId)) {
    selectedQuestionIds.value = selectedQuestionIds.value.filter((id) => id !== questionId);
    return;
  }
  selectedQuestionIds.value = [...selectedQuestionIds.value, questionId];
}

function removeSelectedQuestion(questionId: number) {
  selectedQuestionIds.value = selectedQuestionIds.value.filter((id) => id !== questionId);
}

async function loadBootstrap(options: { withLoading?: boolean; mode?: QuizBootstrapMode; debounceMs?: number } = {}) {
  const withLoading = options.withLoading ?? true;
  const mode = options.mode ?? 'full';
  const debounceMs = Math.max(0, options.debounceMs ?? 0);
  if (!authStore.token) {
    bootstrapRequestRunner.cancel();
    errorMessage.value = '请先登录教师账号';
    isLoading.value = false;
    isQuizTableLoading.value = false;
    return;
  }

  const loadSequence = latestBootstrapLoadSequence + 1;
  latestBootstrapLoadSequence = loadSequence;

  if (withLoading) {
    isLoading.value = true;
  } else {
    isQuizTableLoading.value = true;
  }
  errorMessage.value = '';

  try {
    const payload = await bootstrapRequestRunner.run(
      (signal) => apiGet<StaffBootstrapResponsePayload>(buildQuizBootstrapPath(mode), authStore.token, signal),
      { delayMs: debounceMs }
    );
    if (loadSequence !== latestBootstrapLoadSequence || payload === null) {
      return;
    }
    const mergedPayload: StaffBootstrapPayload = {
      classes: payload.classes ?? bootstrap.value?.classes ?? [],
      banks: payload.banks ?? bootstrap.value?.banks ?? [],
      quizzes: payload.quizzes,
      quiz_list: payload.quiz_list,
    };
    bootstrap.value = mergedPayload;
    applyBootstrapQuizMeta(mergedPayload, { hasClassScope: Array.isArray(payload.classes) });
    if (!activeBankId.value || !mergedPayload.banks.some((bank) => bank.id === activeBankId.value)) {
      activeBankId.value = mergedPayload.banks[0]?.id ?? null;
    }
    if (questionForm.bank_id === null || !mergedPayload.banks.some((item) => item.id === questionForm.bank_id)) {
      questionForm.bank_id = activeBankId.value;
    }
  } catch (error) {
    if (loadSequence !== latestBootstrapLoadSequence) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : '加载题库数据失败';
  } finally {
    if (withLoading && loadSequence === latestBootstrapLoadSequence) {
      isLoading.value = false;
    }
    if (!withLoading && loadSequence === latestBootstrapLoadSequence) {
      isQuizTableLoading.value = false;
    }
  }
}

async function submitBank() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!bankForm.title.trim()) {
    ElMessage.warning('请填写题库名称');
    return;
  }

  creatingBank.value = true;
  try {
    await apiPost<StaffBootstrapPayload>(
      '/quizzes/staff/banks',
      {
        title: bankForm.title.trim(),
        description: bankForm.description.trim() || null,
      },
      authStore.token
    );
    activeBankId.value = null;
    questionForm.bank_id = null;
    await loadBootstrap({ withLoading: false });
    bankForm.title = '';
    bankForm.description = '';
    ElMessage.success('题库已创建');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建题库失败');
  } finally {
    creatingBank.value = false;
  }
}

async function submitBankUpdate() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!editingBankId.value) {
    ElMessage.warning('未找到可编辑的题库');
    return;
  }
  if (!bankEditorForm.title.trim()) {
    ElMessage.warning('请填写题库名称');
    return;
  }

  updatingBank.value = true;
  try {
    await apiPut<StaffBootstrapPayload>(
      `/quizzes/staff/banks/${editingBankId.value}`,
      {
        title: bankEditorForm.title.trim(),
        description: bankEditorForm.description.trim() || null,
      },
      authStore.token
    );
    await loadBootstrap({ withLoading: false });
    closeBankEditor();
    ElMessage.success('题库已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新题库失败');
  } finally {
    updatingBank.value = false;
  }
}

async function deleteBank(bank: StaffBankRecord) {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `将删除题库“${bank.title}”。仅空题库可删除；若仍有题目会被拦截。是否继续？`,
      '删除题库确认',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      }
    );
  } catch {
    return;
  }

  deletingBankId.value = bank.id;
  try {
    await apiDelete<StaffBootstrapPayload>(`/quizzes/staff/banks/${bank.id}`, authStore.token);
    await loadBootstrap({ withLoading: false });
    selectedQuestionIds.value = selectedQuestionIds.value.filter((id) =>
      (bootstrap.value?.banks || []).some((item) => item.questions.some((question) => question.id === id))
    );
    if (editingBankId.value === bank.id) {
      closeBankEditor();
    }

    ElMessage.success('题库已删除');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除题库失败');
  } finally {
    deletingBankId.value = null;
  }
}

async function submitQuestion() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!questionForm.bank_id) {
    ElMessage.warning('请先选择题库');
    return;
  }
  if (!questionForm.content.trim()) {
    ElMessage.warning('请填写题目内容');
    return;
  }
  if (questionForm.options.some((item) => !item.option_text.trim())) {
    ElMessage.warning('请先补全所有选项内容');
    return;
  }

  creatingQuestion.value = true;
  try {
    await apiPost<StaffBootstrapPayload>(
      '/quizzes/staff/questions',
      {
        bank_id: questionForm.bank_id,
        content: questionForm.content.trim(),
        difficulty: questionForm.difficulty,
        explanation: questionForm.explanation.trim() || null,
        options: questionForm.options.map((item) => ({
          option_key: item.option_key,
          option_text: item.option_text.trim(),
          is_correct: item.option_key === questionForm.correct_key,
        })),
      },
      authStore.token
    );
    await loadBootstrap({ withLoading: false });
    if (questionForm.bank_id) {
      activeBankId.value = questionForm.bank_id;
    }
    resetQuestionForm();
    ElMessage.success('题目已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存题目失败');
  } finally {
    creatingQuestion.value = false;
  }
}

async function submitQuestionUpdate() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!editingQuestionId.value) {
    ElMessage.warning('未找到可编辑的题目');
    return;
  }
  if (!questionEditorForm.content.trim()) {
    ElMessage.warning('请填写题目内容');
    return;
  }
  if (questionEditorForm.options.some((item) => !item.option_text.trim())) {
    ElMessage.warning('请先补全所有选项内容');
    return;
  }

  updatingQuestion.value = true;
  try {
    await apiPut<StaffBootstrapPayload>(
      `/quizzes/staff/questions/${editingQuestionId.value}`,
      {
        content: questionEditorForm.content.trim(),
        difficulty: questionEditorForm.difficulty,
        explanation: questionEditorForm.explanation.trim() || null,
        options: questionEditorForm.options.map((item) => ({
          option_key: item.option_key,
          option_text: item.option_text.trim(),
          is_correct: item.option_key === questionEditorForm.correct_key,
        })),
      },
      authStore.token
    );
    await loadBootstrap({ withLoading: false });
    closeQuestionEditor();
    ElMessage.success('题目已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新题目失败');
  } finally {
    updatingQuestion.value = false;
  }
}

async function deleteQuestion(questionId: number) {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  const question = activeBankQuestions.value.find((item) => item.id === questionId);
  const previewContent = question?.content || `题目 ${questionId}`;

  try {
    await ElMessageBox.confirm(
      `将删除题目“${previewContent}”。已被测验引用或已有作答记录的题目不能删除。是否继续？`,
      '删除题目确认',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      }
    );
  } catch {
    return;
  }

  deletingQuestionId.value = questionId;
  try {
    await apiDelete<StaffBootstrapPayload>(`/quizzes/staff/questions/${questionId}`, authStore.token);
    await loadBootstrap({ withLoading: false });
    selectedQuestionIds.value = selectedQuestionIds.value.filter((id) =>
      (bootstrap.value?.banks || []).some((bank) => bank.questions.some((item) => item.id === id))
    );
    if (editingQuestionId.value === questionId) {
      closeQuestionEditor();
    }
    ElMessage.success('题目已删除');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除题目失败');
  } finally {
    deletingQuestionId.value = null;
  }
}

async function submitQuiz() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!quizForm.title.trim()) {
    ElMessage.warning('请填写测验标题');
    return;
  }
  if (!quizForm.class_id) {
    ElMessage.warning('请选择发布班级');
    return;
  }
  if (!selectedQuestionIds.value.length) {
    ElMessage.warning('请至少勾选 1 道题目');
    return;
  }

  creatingQuiz.value = true;
  try {
    await apiPost<StaffBootstrapPayload>(
      '/quizzes/staff/quizzes',
      {
        title: quizForm.title.trim(),
        description: quizForm.description.trim() || null,
        class_id: quizForm.class_id,
        question_ids: selectedQuestionIds.value,
      },
      authStore.token
    );
    await loadBootstrap({ withLoading: false, mode: 'quiz_list' });
    quizForm.title = '';
    quizForm.description = '';
    quizForm.class_id = null;
    selectedQuestionIds.value = [];
    ElMessage.success('测验已发布');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发布测验失败');
  } finally {
    creatingQuiz.value = false;
  }
}

async function submitQuizUpdate() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!editingQuizId.value) {
    ElMessage.warning('未找到可编辑的测验');
    return;
  }
  if (!quizEditorForm.title.trim()) {
    ElMessage.warning('请填写测验标题');
    return;
  }
  if (!quizEditorForm.class_id) {
    ElMessage.warning('请选择发布班级');
    return;
  }
  if (!quizEditorForm.question_ids.length) {
    ElMessage.warning('请至少选择 1 道题目');
    return;
  }

  updatingQuiz.value = true;
  try {
    await apiPut<StaffBootstrapPayload>(
      `/quizzes/staff/quizzes/${editingQuizId.value}`,
      {
        title: quizEditorForm.title.trim(),
        description: quizEditorForm.description.trim() || null,
        class_id: quizEditorForm.class_id,
        question_ids: quizEditorForm.question_ids,
      },
      authStore.token
    );
    await loadBootstrap({ withLoading: false, mode: 'quiz_list' });
    closeQuizEditor();
    ElMessage.success('测验已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新测验失败');
  } finally {
    updatingQuiz.value = false;
  }
}

async function deleteQuiz(quiz: StaffQuizRecord) {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `将删除测验“${quiz.title}”。无作答记录可直接删除；若已有学生作答将被拦截。是否继续？`,
      '删除测验确认',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      }
    );
  } catch {
    return;
  }

  deletingQuizId.value = quiz.id;
  try {
    await apiDelete<StaffBootstrapPayload>(`/quizzes/staff/quizzes/${quiz.id}`, authStore.token);
    await loadBootstrap({ withLoading: false, mode: 'quiz_list' });
    if (editingQuizId.value === quiz.id) {
      closeQuizEditor();
    }
    ElMessage.success('测验已删除');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除测验失败');
  } finally {
    deletingQuizId.value = null;
  }
}

async function toggleQuizStatus(quiz: StaffBootstrapPayload['quizzes'][number]) {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }

  const nextStatus = quiz.status === 'active' ? 'inactive' : 'active';
  if (nextStatus === 'inactive') {
    try {
      await ElMessageBox.confirm(
        `将停用测验“${quiz.title}”。停用后学生测验首页将不再显示该测验，是否继续？`,
        '停用测验确认',
        {
          type: 'warning',
          confirmButtonText: '确认停用',
          cancelButtonText: '取消',
        }
      );
    } catch {
      return;
    }
  }

  updatingQuizStatusId.value = quiz.id;
  try {
    await apiPut<StaffBootstrapPayload>(
      `/quizzes/staff/quizzes/${quiz.id}/status`,
      { status: nextStatus },
      authStore.token
    );
    await loadBootstrap({ withLoading: false, mode: 'quiz_list' });
    ElMessage.success(nextStatus === 'active' ? '测验已启用' : '测验已停用');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新测验状态失败');
  } finally {
    updatingQuizStatusId.value = null;
  }
}

onMounted(async () => {
  await loadBootstrap();
  resetQuestionForm();
  quizQueryWatcherReady.value = true;
});

onUnmounted(() => {
  bootstrapRequestRunner.cancel();
});
</script>

<style scoped>
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}

.content-grid {
  display: grid;
  gap: 16px;
  align-items: start;
}

.grid-8-16 {
  grid-template-columns: minmax(0, 8fr) minmax(0, 16fr);
}

.grid-half {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.grid-11-13 {
  grid-template-columns: minmax(0, 11fr) minmax(0, 13fr);
}

.full-width {
  width: 100%;
}

.section-head h3 {
  margin: 0 0 4px;
}

.filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px 160px;
  gap: 10px;
  margin-bottom: 12px;
}

.filter-row--quiz {
  grid-template-columns: minmax(0, 1.4fr) 150px 140px 190px;
}

.filter-select {
  width: 100%;
}

.quiz-pagination {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.bank-list,
.question-bank-list {
  display: grid;
  gap: 12px;
}

.bank-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--ls-border);
  background: var(--ls-card);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.bank-card:hover,
.bank-card-active {
  transform: translateY(-1px);
  border-color: rgba(74, 135, 255, 0.45);
  box-shadow: 0 14px 24px rgba(69, 108, 171, 0.12);
}

.bank-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.bank-card__actions {
  display: grid;
  justify-items: end;
  gap: 6px;
}

.bank-card__top h4 {
  margin: 0 0 6px;
}

.bank-card__meta,
.bank-card__desc {
  margin: 0;
  color: var(--ls-muted);
}

.bank-card__desc {
  margin-top: 10px;
  line-height: 1.7;
}

.form-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.option-editor {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
}

.option-editor__list {
  display: grid;
  gap: 10px;
}

.option-editor__row {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.option-key {
  max-width: 82px;
}

.question-bank-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--ls-border);
  background: var(--ls-card);
}

.question-bank-item__body {
  display: grid;
  gap: 10px;
}

.question-bank-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.question-bank-item__content {
  margin: 0;
  font-weight: 600;
  line-height: 1.7;
}

.selected-question-box {
  width: 100%;
  min-height: 90px;
  padding: 14px;
  border-radius: 16px;
  border: 1px dashed var(--ls-border);
  background: var(--ls-panel-soft);
  display: grid;
  gap: 10px;
}

.selected-question-box__summary {
  margin: 0;
  font-weight: 700;
}

@media (max-width: 900px) {
  .grid-8-16,
  .grid-half,
  .grid-11-13,
  .filter-row,
  .form-inline-grid,
  .option-editor__row {
    grid-template-columns: 1fr;
  }
}
</style>
