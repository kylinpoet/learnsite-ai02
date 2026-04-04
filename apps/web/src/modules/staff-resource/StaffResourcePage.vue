<template>
  <div class="page-stack">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">资源管理</p>
        <h2>教师资源中心与分类维护</h2>
        <p class="hero-copy">
          这里统一维护学生资源中心的分类、文章和外链内容，学生端只读浏览，教师端负责运营。
        </p>
      </div>
      <el-space wrap>
        <el-button :loading="isLoading" type="primary" @click="loadBootstrap">刷新资源</el-button>
        <el-button plain @click="resetForms">重置表单</el-button>
      </el-space>
    </section>

    <el-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <el-skeleton :loading="isLoading" animated>
      <template #template>
        <el-card class="soft-card">
          <el-skeleton :rows="12" />
        </el-card>
      </template>

      <template #default>
        <template v-if="bootstrap">
          <div class="metric-grid">
            <article class="metric-tile">
              <p class="metric-label">资源分类</p>
              <p class="metric-value">{{ bootstrap.categories.length }}</p>
              <p class="metric-note">按教学用途组织</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">资源总数</p>
              <p class="metric-value">{{ bootstrap.items.length }}</p>
              <p class="metric-note">当前后台已维护资源</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">已发布</p>
              <p class="metric-value">{{ publishedCount }}</p>
              <p class="metric-note">学生端当前可见资源</p>
            </article>
            <article class="metric-tile">
              <p class="metric-label">文章型</p>
              <p class="metric-value">{{ articleCount }}</p>
              <p class="metric-note">含富文本正文的资源</p>
            </article>
          </div>

          <el-row :gutter="16">
            <el-col :lg="8" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>新建分类</h3>
                      <p class="section-note">分类会同步影响学生端资源展示。</p>
                    </div>
                  </div>
                </template>

                <el-form label-position="top" @submit.prevent>
                  <el-form-item label="分类名称">
                    <el-input v-model="categoryForm.name" maxlength="80" placeholder="例如：课堂导学" />
                  </el-form-item>
                  <el-form-item label="分类说明">
                    <el-input
                      v-model="categoryForm.description"
                      :rows="3"
                      maxlength="500"
                      placeholder="用于说明分类用途"
                      type="textarea"
                    />
                  </el-form-item>
                  <el-form-item label="排序">
                    <el-input-number v-model="categoryForm.sort_order" :min="1" :max="9999" />
                  </el-form-item>
                  <el-button :loading="savingCategory" type="primary" @click="submitCategory">
                    保存分类
                  </el-button>
                </el-form>
              </el-card>

              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>分类列表</h3>
                      <p class="section-note">可快速查看每个分类下资源数量。</p>
                    </div>
                  </div>
                </template>

                <div class="category-list">
                  <article
                    v-for="item in bootstrap.categories"
                    :key="item.id"
                    class="category-card"
                  >
                    <div class="category-card__top">
                      <strong>{{ item.name }}</strong>
                      <el-tag round>{{ item.item_count }} 条</el-tag>
                    </div>
                    <p class="category-card__desc">{{ item.description || '暂无分类说明。' }}</p>
                    <p class="section-note">排序 {{ item.sort_order }}</p>
                  </article>
                </div>
              </el-card>
            </el-col>

            <el-col :lg="16" :sm="24">
              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>新建资源</h3>
                      <p class="section-note">支持文章正文与外链并存，便于课堂导学和课后延伸。</p>
                    </div>
                  </div>
                </template>

                <el-form label-position="top" @submit.prevent>
                  <el-form-item label="资源标题">
                    <el-input v-model="itemForm.title" maxlength="120" placeholder="例如：人工智能基础导读卡" />
                  </el-form-item>

                  <div class="form-inline-grid">
                    <el-form-item label="资源分类">
                      <el-select
                        v-model="itemForm.category_id"
                        class="full-width"
                        clearable
                        placeholder="请选择分类"
                      >
                        <el-option
                          v-for="item in bootstrap.categories"
                          :key="item.id"
                          :label="item.name"
                          :value="item.id"
                        />
                      </el-select>
                    </el-form-item>

                    <el-form-item label="资源类型">
                      <el-select v-model="itemForm.resource_type" class="full-width">
                        <el-option label="文章" value="article" />
                        <el-option label="外链" value="link" />
                      </el-select>
                    </el-form-item>
                  </div>

                  <div class="form-inline-grid">
                    <el-form-item label="排序">
                      <el-input-number v-model="itemForm.sort_order" :min="1" :max="9999" />
                    </el-form-item>
                    <el-form-item label="是否发布">
                      <el-switch v-model="itemForm.is_published" active-text="已发布" inactive-text="未发布" />
                    </el-form-item>
                  </div>

                  <el-form-item label="摘要">
                    <el-input
                      v-model="itemForm.summary"
                      :rows="3"
                      maxlength="1000"
                      placeholder="用于学生端列表摘要"
                      type="textarea"
                    />
                  </el-form-item>

                  <el-form-item label="外链地址">
                    <el-input
                      v-model="itemForm.external_url"
                      maxlength="255"
                      placeholder="如需跳转外部网站可填写 https://..."
                    />
                  </el-form-item>

                  <el-form-item label="正文内容">
                    <RichTextEditor
                      v-model="itemForm.content"
                      :min-height="260"
                      placeholder="资源正文支持富文本，可直接提供图文导学内容。"
                    />
                  </el-form-item>

                  <el-button :loading="savingItem" type="primary" @click="submitItem">保存资源</el-button>
                </el-form>
              </el-card>

              <el-card class="soft-card">
                <template #header>
                  <div class="section-head">
                    <div>
                      <h3>资源列表</h3>
                      <p class="section-note">点击任意资源可在下方查看正文预览。</p>
                    </div>
                  </div>
                </template>

                <el-empty v-if="!bootstrap.items.length" description="当前还没有资源内容" />

                <template v-else>
                  <el-table :data="bootstrap.items" stripe @row-click="handleRowClick">
                    <el-table-column label="标题" min-width="220" prop="title" />
                    <el-table-column label="分类" min-width="120">
                      <template #default="{ row }">
                        {{ row.category?.name || '未分类' }}
                      </template>
                    </el-table-column>
                    <el-table-column label="类型" min-width="90">
                      <template #default="{ row }">
                        {{ typeLabel(row.resource_type) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="发布" min-width="90">
                      <template #default="{ row }">
                        <el-tag :type="row.is_published ? 'success' : 'info'" round>
                          {{ row.is_published ? '是' : '否' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="提供者" min-width="110" prop="owner_name" />
                    <el-table-column label="排序" min-width="90" prop="sort_order" />
                  </el-table>

                  <div v-if="previewItem" class="preview-box">
                    <div class="section-head">
                      <div>
                        <h3>{{ previewItem.title }}</h3>
                        <p class="section-note">
                          {{ previewItem.category?.name || '未分类' }} · {{ typeLabel(previewItem.resource_type) }} · {{ previewItem.owner_name }}
                        </p>
                      </div>
                      <el-button
                        v-if="previewItem.external_url"
                        plain
                        type="primary"
                        @click="openExternal(previewItem.external_url)"
                      >
                        打开外链
                      </el-button>
                    </div>
                    <p class="preview-summary">{{ previewItem.summary || '暂无摘要。' }}</p>
                    <RichTextContent
                      :html="previewItem.content"
                      empty-text="当前资源没有正文内容，可仅作为外链入口使用。"
                    />
                  </div>
                </template>
              </el-card>
            </el-col>
          </el-row>
        </template>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

import { apiGet, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';

type StaffResourceBootstrap = {
  categories: Array<{
    id: number;
    name: string;
    description: string | null;
    sort_order: number;
    item_count: number;
  }>;
  items: Array<{
    id: number;
    title: string;
    resource_type: string;
    summary: string | null;
    content: string | null;
    external_url: string | null;
    sort_order: number;
    is_published: boolean;
    owner_name: string;
    category: {
      id: number;
      name: string;
    } | null;
  }>;
};

const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const savingCategory = ref(false);
const savingItem = ref(false);
const bootstrap = ref<StaffResourceBootstrap | null>(null);
const previewItemId = ref<number | null>(null);

const categoryForm = reactive({
  name: '',
  description: '',
  sort_order: 1,
});

const itemForm = reactive({
  title: '',
  category_id: null as number | null,
  resource_type: 'article',
  summary: '',
  content: '',
  external_url: '',
  sort_order: 1,
  is_published: true,
});

const previewItem = computed(() =>
  bootstrap.value?.items.find((item) => item.id === previewItemId.value) || null
);

const publishedCount = computed(() =>
  (bootstrap.value?.items || []).filter((item) => item.is_published).length
);

const articleCount = computed(() =>
  (bootstrap.value?.items || []).filter((item) => item.resource_type === 'article').length
);

function typeLabel(type: string) {
  if (type === 'article') {
    return '文章';
  }
  if (type === 'link') {
    return '外链';
  }
  return type;
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function handleRowClick(row: StaffResourceBootstrap['items'][number]) {
  previewItemId.value = row.id;
}

function resetForms() {
  categoryForm.name = '';
  categoryForm.description = '';
  categoryForm.sort_order = 1;

  itemForm.title = '';
  itemForm.category_id = null;
  itemForm.resource_type = 'article';
  itemForm.summary = '';
  itemForm.content = '';
  itemForm.external_url = '';
  itemForm.sort_order = 1;
  itemForm.is_published = true;
}

async function loadBootstrap() {
  if (!authStore.token) {
    errorMessage.value = '请先登录教师账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    bootstrap.value = await apiGet<StaffResourceBootstrap>('/resources/staff/bootstrap', authStore.token);
    if (!previewItemId.value && bootstrap.value.items[0]) {
      previewItemId.value = bootstrap.value.items[0].id;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载资源管理失败';
  } finally {
    isLoading.value = false;
  }
}

async function submitCategory() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!categoryForm.name.trim()) {
    ElMessage.warning('请填写分类名称');
    return;
  }

  savingCategory.value = true;
  try {
    bootstrap.value = await apiPost<StaffResourceBootstrap>(
      '/resources/staff/categories',
      {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        sort_order: categoryForm.sort_order,
      },
      authStore.token
    );
    ElMessage.success('资源分类已保存');
    categoryForm.name = '';
    categoryForm.description = '';
    categoryForm.sort_order = 1;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存资源分类失败');
  } finally {
    savingCategory.value = false;
  }
}

async function submitItem() {
  if (!authStore.token) {
    ElMessage.warning('请先登录教师账号');
    return;
  }
  if (!itemForm.title.trim()) {
    ElMessage.warning('请填写资源标题');
    return;
  }

  savingItem.value = true;
  try {
    bootstrap.value = await apiPost<StaffResourceBootstrap>(
      '/resources/staff/items',
      {
        title: itemForm.title.trim(),
        category_id: itemForm.category_id,
        resource_type: itemForm.resource_type,
        summary: itemForm.summary.trim() || null,
        content: itemForm.content.trim() || null,
        external_url: itemForm.external_url.trim() || null,
        sort_order: itemForm.sort_order,
        is_published: itemForm.is_published,
      },
      authStore.token
    );
    ElMessage.success('资源已保存');
    if (bootstrap.value.items[0]) {
      previewItemId.value = bootstrap.value.items[0].id;
    }
    itemForm.title = '';
    itemForm.category_id = null;
    itemForm.resource_type = 'article';
    itemForm.summary = '';
    itemForm.content = '';
    itemForm.external_url = '';
    itemForm.sort_order = 1;
    itemForm.is_published = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存资源失败');
  } finally {
    savingItem.value = false;
  }
}

onMounted(loadBootstrap);
</script>

<style scoped>
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-head h3 {
  margin: 0 0 4px;
}

.form-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.category-list {
  display: grid;
  gap: 12px;
}

.category-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--ls-border);
  background: rgba(255, 255, 255, 0.94);
}

.category-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.category-card__desc,
.preview-summary {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.preview-box {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px dashed var(--ls-border);
  display: grid;
  gap: 14px;
}

@media (max-width: 900px) {
  .form-inline-grid {
    grid-template-columns: 1fr;
  }
}
</style>
