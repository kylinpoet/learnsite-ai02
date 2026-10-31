<template>
  <div class="page-stack">
    <StaffPageHead title="测验题库" :sub="pageSummary">
      <template #actions>
        <n-button type="primary" @click="openQuizCreate">发布测验</n-button>
        <n-button secondary @click="openBankCreate">新建题库</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="10" animated /></div>
    </div>

    <template v-else-if="bootstrap">
      <StaffStatStrip :items="statItems" />

      <section class="sf-panel">
        <div class="sf-tabs page-tabs">
          <button
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeTab === 'quizzes' }]"
            @click="activeTab = 'quizzes'"
          >
            已发布测验
            <span class="sf-tabs__count">{{ quizListMeta.total }}</span>
          </button>
          <button
            type="button"
            :class="['sf-tabs__item', { 'is-active': activeTab === 'banks' }]"
            @click="activeTab = 'banks'"
          >
            题库与题目
            <span class="sf-tabs__count">{{ bootstrap.banks.length }}</span>
          </button>
        </div>

        <!-- 已发布测验：页面要回答的第一个问题 -->
        <template v-if="activeTab === 'quizzes'">
          <div class="sf-toolbar">
            <n-input
              v-model:value="quizFilterKeyword"
              class="sf-toolbar__search"
              clearable
              placeholder="搜索测验标题 / 说明"
            />
            <n-select
              v-model:value="quizFilterClassId"
              :options="quizClassFilterOptions"
              class="filter-select"
              clearable
              placeholder="班级"
            />
            <n-select
              v-model:value="quizFilterStatus"
              :options="quizStatusFilterOptions"
              class="filter-select"
              placeholder="状态"
            />
            <n-select
              v-model:value="quizSortMode"
              :options="quizSortOptions"
              class="filter-select filter-select--wide"
              placeholder="排序"
            />
            <div class="sf-toolbar__right">
              <span class="sf-toolbar__count">{{ quizListMeta.total }} / {{ quizListMeta.overall_total }} 场</span>
            </div>
          </div>

          <p v-if="!quizRows.length && !isQuizTableLoading" class="sf-empty">
            {{
              quizListMeta.overall_total
                ? '当前筛选条件下没有测验。'
                : '还没有发布过测验。到「题库与题目」勾选题目，再点右上角发布测验。'
            }}
          </p>

          <div v-else>
            <div class="sf-rows__head sf-cols-quizzes">
              <span>测验</span>
              <span>题数</span>
              <span>参与</span>
              <span>平均分</span>
              <span>操作</span>
            </div>
            <div class="sf-rows">
            <article v-for="quiz in quizRows" :key="quiz.id" class="sf-row sf-row--cols sf-cols-quizzes">
              <div class="sf-row__main">
                <p class="sf-row__title">
                  <span class="sf-row__title-text">{{ quiz.title }}</span>
                  <span :class="['sf-pill', quizStatusPillClass(quiz.status)]">{{ quizStatusLabel(quiz.status) }}</span>
                </p>
                <p class="sf-row__meta">
                  <span>{{ quiz.class_name }}</span>
                  <span>{{ formatDateTime(quiz.updated_at) }}</span>
                  <span v-if="quiz.description">{{ quiz.description }}</span>
                </p>
              </div>

              <span class="sf-row__num" data-label="题数">{{ quiz.question_count }}</span>
              <span class="sf-row__num" data-label="参与">{{ quiz.attempt_count }}</span>
              <span class="sf-row__num" data-label="平均分">{{ quiz.average_score ?? '--' }}</span>

              <div class="sf-row__action">
                <n-dropdown
                  :options="quizRowActions(quiz)"
                  placement="bottom-end"
                  trigger="click"
                  @select="(key: string) => handleQuizRowAction(key, quiz)"
                >
                  <n-button quaternary circle size="small" aria-label="更多操作">···</n-button>
                </n-dropdown>
              </div>
            </article>
            </div>
          </div>

          <div v-if="quizPaginationTotal > 0" class="quiz-pagination">
            <n-pagination
              v-model:page="quizPage"
              v-model:page-size="quizPageSize"
              :item-count="quizPaginationTotal"
              :page-sizes="quizPageSizeOptionsList"
              :show-quick-jumper="!isNarrow"
              :show-size-picker="!isNarrow"
            >
              <template #prefix="{ itemCount }">共 {{ itemCount }} 条</template>
            </n-pagination>
          </div>
        </template>

        <!-- 题库与题目：维护题目，并在这里勾选下一场测验要用到的题 -->
        <template v-else>
          <div class="sf-toolbar">
            <n-input
              v-model:value="bankFilterKeyword"
              class="sf-toolbar__search"
              clearable
              placeholder="搜索题库名 / 说明 / 创建人"
            />
            <n-select
              v-model:value="bankFilterScope"
              :options="bankScopeFilterOptions"
              class="filter-select"
              placeholder="题库类型"
            />
            <div class="sf-toolbar__right">
              <span>已选 {{ selectedQuestionIds.length }} 题</span>
              <n-button
                :disabled="!selectedQuestionIds.length"
                size="small"
                type="primary"
                @click="openQuizCreate"
              >
                用这些题发布
              </n-button>
            </div>
          </div>

          <p v-if="!bootstrap.banks.length" class="sf-empty">
            还没有题库。先新建一个题库，再往里添加题目。
          </p>

          <template v-else>
            <div class="sf-tabs bank-tabs">
              <button
                v-for="bank in filteredBanks"
                :key="bank.id"
                type="button"
                :class="['sf-tabs__item', { 'is-active': activeBankId === bank.id }]"
                @click="selectBank(bank.id)"
              >
                {{ bank.title }}
                <span class="sf-tabs__count">{{ bank.question_count }}</span>
              </button>
            </div>

            <p v-if="!filteredBanks.length" class="sf-empty">当前筛选条件下没有题库。</p>

            <template v-else-if="activeBank">
              <header class="sf-panel__head bank-head">
                <div class="bank-head__main">
                  <h2 class="sf-panel__title">
                    题目
                    <span class="sf-panel__count">{{ activeBankQuestions.length }} 道</span>
                  </h2>
                  <p class="bank-head__meta">
                    {{ activeBank.owner_name }} · {{ activeBank.scope_type === 'system' ? '系统题库' : '教师题库' }}
                    <template v-if="activeBank.description"> · {{ activeBank.description }}</template>
                  </p>
                </div>
                <div class="sf-panel__actions">
                  <template v-if="activeBank.scope_type === 'staff'">
                    <n-button text type="primary" @click="openBankEditor(activeBank)">编辑题库</n-button>
                    <n-button
                      :loading="deletingBankId === activeBank.id"
                      text
                      type="error"
                      @click="deleteBank(activeBank)"
                    >
                      删除题库
                    </n-button>
                  </template>
                  <n-button size="small" type="primary" @click="openQuestionCreate">添加题目</n-button>
                </div>
              </header>

              <p v-if="!activeBankQuestions.length" class="sf-empty">
                这个题库还没有题目。点「添加题目」录入第一道单选题。
              </p>

              <div v-else class="sf-rows">
                <label
                  v-for="question in activeBankQuestions"
                  :key="question.id"
                  :class="['sf-row', 'question-row', { 'is-selected': selectedQuestionIds.includes(question.id) }]"
                >
                  <n-checkbox
                    :checked="selectedQuestionIds.includes(question.id)"
                    @update:checked="toggleQuestionSelection(question.id)"
                  />
                  <div class="sf-row__main">
                    <p class="sf-row__title">
                      <span class="sf-row__title-text">{{ question.content }}</span>
                      <span class="sf-pill">{{ question.difficulty }}</span>
                      <span class="sf-pill sf-pill--pos">答案 {{ correctOptionKey(question) }}</span>
                    </p>
                    <p class="question-row__options">
                      <span
                        v-for="option in question.options"
                        :key="option.id"
                        :class="['question-row__option', { 'is-correct': option.is_correct }]"
                      >
                        {{ option.key }}. {{ option.text }}
                      </span>
                    </p>
                  </div>
                  <div v-if="activeBankCanEdit" class="sf-row__action" @click.stop>
                    <n-dropdown
                      :options="questionRowActions(question)"
                      placement="bottom-end"
                      trigger="click"
                      @select="(key: string) => handleQuestionRowAction(key, question)"
                    >
                      <n-button quaternary circle size="small" aria-label="题目操作">···</n-button>
                    </n-dropdown>
                  </div>
                </label>
              </div>
            </template>
          </template>
        </template>
      </section>
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

    <n-drawer v-model:show="bankCreateVisible" :width="drawerWidth" placement="right">
      <n-drawer-content closable title="新建题库">
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
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="closeBankCreate">取消</n-button>
            <n-button :loading="creatingBank" type="primary" @click="submitBank">保存题库</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="questionCreateVisible" :width="drawerWidthWide" placement="right">
      <n-drawer-content closable title="添加题目">
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
            <div class="option-editor__head">
              <strong>选项</strong>
              <n-button :disabled="questionForm.options.length >= 8" text type="primary" @click="appendOption">
                添加选项
              </n-button>
            </div>
            <div class="option-editor__list">
              <div v-for="(item, index) in questionForm.options" :key="item.option_key" class="option-editor__row">
                <n-input v-model:value="item.option_key" class="option-key" disabled />
                <n-input v-model:value="item.option_text" :maxlength="500" placeholder="选项内容" />
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
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="closeQuestionCreate">取消</n-button>
            <n-button :loading="creatingQuestion" type="primary" @click="submitQuestion">保存题目</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="quizCreateVisible" :width="drawerWidthWide" placement="right">
      <n-drawer-content closable title="发布课堂测验">
        <n-form label-placement="top">
          <n-form-item label="测验标题">
            <n-input v-model:value="quizForm.title" :maxlength="120" placeholder="例如：809 班课堂测验：网络与搜索" />
          </n-form-item>
          <n-form-item label="测验说明">
            <n-input
              v-model:value="quizForm.description"
              :maxlength="1000"
              :rows="3"
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
          <n-form-item label="题目">
            <n-select
              v-model:value="selectedQuestionIds"
              :max-tag-count="2"
              :options="quizQuestionOptions"
              class="full-width"
              filterable
              multiple
              placeholder="从题库里选择题目"
            />
            <p class="drawer-note">当前已选 {{ selectedQuestionIds.length }} 题；题目可在「题库与题目」页签里勾选。</p>
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="closeQuizCreate">取消</n-button>
            <n-button :loading="creatingQuiz" type="primary" @click="submitQuiz">发布测验</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NDropdown,
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
} from 'naive-ui';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from '@/ui/feedback';
import { createDebouncedAbortableRequestRunner } from '@/utils/debouncedAbortableRequest';
import { formatDateTime as formatDateTimeValue } from '@/utils/datetime';

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

const totalQuizCount = computed(() => quizListMeta.value.overall_total);
const activeQuizCount = computed(
  () => (bootstrap.value?.quizzes || []).filter((quiz) => quiz.status === 'active').length
);

/** 标题下一行只写结论：数字在统计带里，这里不重复 */
const pageSummary = computed(() => {
  if (!bootstrap.value) {
    return '';
  }
  if (!totalQuestionCount.value) {
    return '题库还是空的。先新建题库并录入题目，才能组卷发布。';
  }
  if (!totalQuizCount.value) {
    return `题库里有 ${totalQuestionCount.value} 道题，还没有发布过测验。`;
  }
  const quizzes = bootstrap.value.quizzes || [];
  const attempted = quizzes.filter((quiz) => quiz.attempt_count > 0).length;
  if (!attempted) {
    return `${totalQuizCount.value} 场测验已发布，还没有学生作答。`;
  }
  return `${attempted} / ${totalQuizCount.value} 场测验已有学生作答。`;
});

const statItems = computed<StaffStatItem[]>(() => [
  { label: '可管班级', value: bootstrap.value?.classes.length ?? 0, unit: '个' },
  { label: '题库', value: bootstrap.value?.banks.length ?? 0, unit: '个' },
  { label: '题目', value: totalQuestionCount.value, unit: '道' },
  {
    label: '已发布测验',
    value: totalQuizCount.value,
    unit: '场',
    note: activeQuizCount.value ? `${activeQuizCount.value} 场进行中` : undefined,
  },
]);

const activeTab = ref<'quizzes' | 'banks'>('quizzes');
/** 窄屏把分页的跳页与每页条数收起来，避免换行 */
const isNarrow = ref(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
const syncIsNarrow = () => {
  isNarrow.value = window.innerWidth < 640;
};
const bankCreateVisible = ref(false);
const questionCreateVisible = ref(false);
const quizCreateVisible = ref(false);
const drawerWidth = 460;
const drawerWidthWide = 'min(720px, 94vw)';

function openBankCreate() {
  bankForm.title = '';
  bankForm.description = '';
  bankCreateVisible.value = true;
}

function closeBankCreate() {
  bankCreateVisible.value = false;
}

function openQuestionCreate() {
  resetQuestionForm();
  questionCreateVisible.value = true;
}

function closeQuestionCreate() {
  questionCreateVisible.value = false;
  resetQuestionForm();
}

function openQuizCreate() {
  quizCreateVisible.value = true;
}

function closeQuizCreate() {
  quizCreateVisible.value = false;
}

/** 状态药丸：进行中为正、停用为中性 */
function quizStatusPillClass(status: string) {
  return status === 'active' ? 'sf-pill--pos' : '';
}

function quizRowActions(quiz: StaffQuizRecord) {
  return [
    { label: '编辑', key: 'edit' },
    { label: quiz.status === 'active' ? '停用' : '启用', key: 'toggle' },
    { label: '删除', key: 'delete' },
  ];
}

function handleQuizRowAction(key: string, quiz: StaffQuizRecord) {
  if (key === 'edit') {
    openQuizEditor(quiz);
    return;
  }
  if (key === 'toggle') {
    void toggleQuizStatus(quiz);
    return;
  }
  if (key === 'delete') {
    void deleteQuiz(quiz);
  }
}

function correctOptionKey(question: StaffBankQuestion) {
  return question.options.find((option) => option.is_correct)?.key || '--';
}

function questionRowActions(_question: StaffBankQuestion) {
  return [
    { label: '编辑', key: 'edit' },
    { label: '删除', key: 'delete' },
  ];
}

function handleQuestionRowAction(key: string, question: StaffBankQuestion) {
  if (key === 'edit') {
    openQuestionEditor(question);
    return;
  }
  if (key === 'delete') {
    void deleteQuestion(question.id);
  }
}

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
  return formatDateTimeValue(value, { fallback: '暂无', sliceStart: 0, sliceEnd: 16 });
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
    closeBankCreate();
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
    closeQuestionCreate();
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
    closeQuizCreate();
    activeTab.value = 'quizzes';
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
  window.addEventListener('resize', syncIsNarrow);
  await loadBootstrap();
  resetQuestionForm();
  quizQueryWatcherReady.value = true;
});

onUnmounted(() => {
  window.removeEventListener('resize', syncIsNarrow);
  bootstrapRequestRunner.cancel();
});
</script>

<style scoped>
.page-stack {
  width: min(1680px, 100%);
  margin: 0 auto;
}

/* 页面页签与题库页签：都与面板同宽 */
.page-tabs {
  padding: 0 16px;
}

.bank-tabs {
  padding: 0 16px;
  background: var(--sf-surface-2);
}

.filter-select {
  width: 132px;
  flex: none;
}

.filter-select--wide {
  width: 176px;
}

.quiz-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--sf-line-soft);
}

@media (max-width: 640px) {
  .quiz-pagination {
    justify-content: center;
    padding: 10px 8px;
  }

  .quiz-pagination :deep(.n-pagination) {
    flex-wrap: wrap;
    justify-content: center;
  }
}

/* 题库抬头：题库名 + 归属 + 已选提示 */
.bank-head {
  align-items: flex-start;
  flex-wrap: wrap;
}

.bank-head__main {
  min-width: 0;
}

.bank-head__meta {
  margin: 4px 0 0;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

/* 题目行：勾选框 + 题干 + 一行选项 + 操作 */
.question-row {
  align-items: flex-start;
  cursor: pointer;
}

.question-row.is-selected {
  background: color-mix(in srgb, var(--ls-primary) 6%, var(--sf-surface));
}

.question-row__options {
  display: -webkit-box;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.question-row__option {
  margin-right: 12px;
  white-space: nowrap;
}

.question-row__option.is-correct {
  color: var(--sf-pos);
  font-weight: 600;
}



/* 抽屉里的表单 */
.full-width {
  width: 100%;
}

.form-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.option-editor {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.option-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.option-editor__list {
  display: grid;
  gap: 8px;
}

.option-editor__row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.option-key {
  max-width: 56px;
}

.drawer-note {
  margin: 6px 0 0;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .filter-select,
  .filter-select--wide {
    width: auto;
  }

  .form-inline-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
