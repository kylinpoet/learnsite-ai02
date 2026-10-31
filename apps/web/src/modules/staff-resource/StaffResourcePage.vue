<template>
  <div class="page-stack">
    <StaffPageHead title="资源中心" :sub="pageSummary">
      <template #actions>
        <n-button type="primary" @click="openItemCreate">新建资源</n-button>
      </template>
    </StaffPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sf-panel">
      <div class="sf-panel__body"><n-skeleton :rows="8" animated /></div>
    </div>

    <template v-else-if="bootstrap">
      <StaffStatStrip :items="statItems" />

      <div class="sf-split">
        <section class="sf-panel">
          <div class="sf-tabs">
            <button
              type="button"
              :class="['sf-tabs__item', { 'is-active': activeCategory === 'all' }]"
              @click="activeCategory = 'all'"
            >
              全部
              <span class="sf-tabs__count">{{ bootstrap.items.length }}</span>
            </button>
            <button
              v-for="category in bootstrap.categories"
              :key="category.id"
              type="button"
              :class="['sf-tabs__item', { 'is-active': activeCategory === category.id }]"
              @click="activeCategory = category.id"
            >
              {{ category.name }}
              <span class="sf-tabs__count">{{ category.item_count }}</span>
            </button>
          </div>

          <div class="sf-toolbar">
            <n-input
              v-model:value="keyword"
              class="sf-toolbar__search"
              clearable
              placeholder="搜索资源标题 / 摘要"
            />
            <n-select
              v-model:value="typeFilter"
              :options="typeFilterOptions"
              class="filter-select"
            />
            <div class="sf-toolbar__right">
              <span>{{ filteredItems.length }} / {{ bootstrap.items.length }} 条</span>
              <n-button :loading="isLoading" text @click="loadBootstrap">刷新</n-button>
            </div>
          </div>

          <p v-if="!filteredItems.length" class="sf-empty">
            {{
              bootstrap.items.length
                ? '当前筛选条件下没有资源。'
                : '还没有资源。点右上角「新建资源」添加第一条内容，学生端资源中心会同步显示。'
            }}
          </p>

          <template v-else>
            <div class="sf-rows__head sf-cols-resources">
              <span>资源</span>
              <span>分类</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            <div class="sf-rows">
              <article
                v-for="item in filteredItems"
                :key="item.id"
                class="sf-row sf-row--cols sf-row--link sf-cols-resources"
                @click="openPreview(item)"
              >
                <div class="sf-row__main">
                  <p class="sf-row__title">
                    <span class="sf-row__title-text">{{ item.title }}</span>
                  </p>
                  <p class="sf-row__meta">
                    <span>{{ typeLabel(item.resource_type) }}</span>
                    <span>{{ item.owner_name }}</span>
                    <span v-if="item.summary">{{ item.summary }}</span>
                  </p>
                </div>

                <span class="resource-category">{{ item.category?.name || '未分类' }}</span>
                <span>
                  <span :class="['sf-pill', item.is_published ? 'sf-pill--pos' : '']">
                    <span v-if="item.is_published" class="sf-pill__dot" />
                    {{ item.is_published ? '已发布' : '草稿' }}
                  </span>
                </span>

                <div class="sf-row__action" @click.stop>
                  <n-button v-if="item.external_url" text @click="openExternal(item.external_url)">打开外链</n-button>
                  <n-button v-else text @click="openPreview(item)">预览</n-button>
                </div>
              </article>
            </div>
          </template>
        </section>

        <aside class="sf-panel">
          <header class="sf-panel__head">
            <h2 class="sf-panel__title">
              分类
              <span class="sf-panel__count">{{ bootstrap.categories.length }}</span>
            </h2>
            <div class="sf-panel__actions">
              <n-button text type="primary" @click="openCategoryCreate">新建分类</n-button>
            </div>
          </header>
          <div class="sf-panel__body sf-panel__body--flush">
            <button
              type="button"
              :class="['sf-row', 'sf-row--link', 'category-row', { 'sf-row--active': activeCategory === 'all' }]"
              @click="activeCategory = 'all'"
            >
              <span class="category-row__main">
                <span class="sf-row__title"><span class="sf-row__title-text">全部资源</span></span>
                <span class="category-row__desc">不分分类查看</span>
              </span>
              <span class="sf-row__value">{{ bootstrap.items.length }}<small>条</small></span>
            </button>

            <p v-if="!bootstrap.categories.length" class="sf-empty">
              还没有分类。先新建分类，资源才能按分类展示。
            </p>

            <button
              v-for="category in bootstrap.categories"
              :key="category.id"
              type="button"
              :class="['sf-row', 'sf-row--link', 'category-row', { 'sf-row--active': activeCategory === category.id }]"
              @click="activeCategory = category.id"
            >
              <span class="category-row__main">
                <span class="sf-row__title"><span class="sf-row__title-text">{{ category.name }}</span></span>
                <span class="category-row__desc">{{ category.description || '暂无分类说明' }}</span>
              </span>
              <span class="sf-row__value">{{ category.item_count }}<small>条</small></span>
            </button>
          </div>
        </aside>
      </div>
    </template>

    <n-drawer v-model:show="categoryDrawerVisible" :width="drawerWidth" placement="right">
      <n-drawer-content closable title="新建资源分类">
        <n-form label-placement="top" @submit.prevent>
          <n-form-item label="分类名称">
            <n-input v-model:value="categoryForm.name" maxlength="80" placeholder="例如：课堂导学" />
          </n-form-item>
          <n-form-item label="分类说明">
            <n-input
              v-model:value="categoryForm.description"
              :rows="3"
              maxlength="500"
              placeholder="用于说明分类用途"
              type="textarea"
            />
          </n-form-item>
          <n-form-item label="排序">
            <n-input-number v-model:value="categoryForm.sort_order" :max="9999" :min="1" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="categoryDrawerVisible = false">取消</n-button>
            <n-button :loading="savingCategory" type="primary" @click="submitCategory">保存分类</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="itemDrawerVisible" :width="drawerWidthWide" placement="right">
      <n-drawer-content closable title="新建资源">
        <n-form label-placement="top" @submit.prevent>
          <n-form-item label="资源标题">
            <n-input v-model:value="itemForm.title" maxlength="120" placeholder="例如：人工智能基础导读卡" />
          </n-form-item>

          <div class="form-inline-grid">
            <n-form-item label="资源分类">
              <n-select
                v-model:value="itemForm.category_id"
                :options="categoryOptions"
                class="full-width"
                clearable
                placeholder="请选择分类"
              />
            </n-form-item>
            <n-form-item label="资源类型">
              <n-select v-model:value="itemForm.resource_type" :options="resourceTypeOptions" class="full-width" />
            </n-form-item>
          </div>

          <div class="form-inline-grid">
            <n-form-item label="排序">
              <n-input-number v-model:value="itemForm.sort_order" :max="9999" :min="1" />
            </n-form-item>
            <n-form-item label="学生端可见">
              <n-switch v-model:value="itemForm.is_published">
                <template #checked>发布</template>
                <template #unchecked>草稿</template>
              </n-switch>
            </n-form-item>
          </div>

          <n-form-item label="摘要">
            <n-input
              v-model:value="itemForm.summary"
              :rows="3"
              maxlength="1000"
              placeholder="用于学生端列表摘要"
              type="textarea"
            />
          </n-form-item>

          <n-form-item label="外链地址">
            <n-input
              v-model:value="itemForm.external_url"
              maxlength="255"
              placeholder="如需跳转外部网站可填写 https://..."
            />
          </n-form-item>

          <n-form-item label="正文内容">
            <RichTextEditor
              v-model="itemForm.content"
              :min-height="260"
              placeholder="资源正文支持富文本，可直接提供图文导学内容。"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="itemDrawerVisible = false">取消</n-button>
            <n-button :loading="savingItem" type="primary" @click="submitItem">保存资源</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal
      v-model:show="previewVisible"
      :title="previewItem?.title || '资源预览'"
      preset="card"
      style="width: min(760px, 94vw)"
    >
      <template v-if="previewItem">
        <div class="preview-meta">
          <span class="sf-pill">{{ previewItem.category?.name || '未分类' }}</span>
          <span class="sf-pill">{{ typeLabel(previewItem.resource_type) }}</span>
          <span :class="['sf-pill', previewItem.is_published ? 'sf-pill--pos' : '']">
            {{ previewItem.is_published ? '已发布' : '草稿' }}
          </span>
          <span class="sf-quiet">{{ previewItem.owner_name }}</span>
        </div>
        <p class="preview-summary">{{ previewItem.summary || '暂无摘要。' }}</p>
        <div class="preview-body">
          <RichTextContent
            :html="previewItem.content"
            empty-text="当前资源没有正文内容，可仅作为外链入口使用。"
          />
        </div>
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button v-if="previewItem?.external_url" secondary @click="openExternal(previewItem.external_url)">
            打开外链
          </n-button>
          <n-button @click="previewVisible = false">关闭</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSkeleton,
  NSpace,
  NSwitch,
} from 'naive-ui';
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from '@/ui/feedback';

import { apiGet, apiPost } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import StaffPageHead from '@/components/staff/StaffPageHead.vue';
import StaffStatStrip, { type StaffStatItem } from '@/components/staff/StaffStatStrip.vue';
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

type ResourceItem = StaffResourceBootstrap['items'][number];

const authStore = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref('');
const savingCategory = ref(false);
const savingItem = ref(false);
const bootstrap = ref<StaffResourceBootstrap | null>(null);
const activeCategory = ref<'all' | number>('all');
const keyword = ref('');
const typeFilter = ref<'all' | 'article' | 'link'>('all');
const previewVisible = ref(false);
const previewItem = ref<ResourceItem | null>(null);
const categoryDrawerVisible = ref(false);
const itemDrawerVisible = ref(false);

const drawerWidth = 'min(460px, 94vw)';
const drawerWidthWide = 'min(720px, 94vw)';

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

const categories = computed(() => bootstrap.value?.categories || []);
const items = computed(() => bootstrap.value?.items || []);

const categoryOptions = computed(() => categories.value.map((item) => ({ label: item.name, value: item.id })));

const resourceTypeOptions = [
  { label: '文章', value: 'article' },
  { label: '外链', value: 'link' },
];

const typeFilterOptions = [
  { label: '全部类型', value: 'all' },
  { label: '文章', value: 'article' },
  { label: '外链', value: 'link' },
];

const publishedCount = computed(() => items.value.filter((item) => item.is_published).length);
const draftCount = computed(() => items.value.length - publishedCount.value);

const filteredItems = computed(() => {
  const term = keyword.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (activeCategory.value !== 'all' && item.category?.id !== activeCategory.value) {
      return false;
    }
    if (typeFilter.value !== 'all' && item.resource_type !== typeFilter.value) {
      return false;
    }
    if (!term) {
      return true;
    }
    return `${item.title} ${item.summary || ''}`.toLowerCase().includes(term);
  });
});

const pageSummary = computed(() => {
  if (!items.value.length) {
    return '还没有资源。先建分类，再添加第一条资源，学生端资源中心才会出现内容。';
  }
  return `学生端可见 ${publishedCount.value} 条资源，分布在 ${categories.value.length} 个分类；另有 ${draftCount.value} 条草稿未发布。`;
});

const statItems = computed<StaffStatItem[]>(() => [
  { label: '分类', value: categories.value.length, unit: '个', note: '按教学用途组织' },
  { label: '资源总数', value: items.value.length, unit: '条', note: '含草稿' },
  {
    label: '已发布',
    value: publishedCount.value,
    unit: '条',
    note: publishedCount.value ? '学生端当前可见' : '学生端还看不到资源',
  },
  {
    label: '草稿',
    value: draftCount.value,
    unit: '条',
    note: draftCount.value ? '补全后发布即可' : '所有资源都已发布',
  },
]);

function typeLabel(type: string) {
  if (type === 'article') {
    return '文章';
  }
  if (type === 'link') {
    return '外链';
  }
  return type;
}

function openExternal(url: string | null) {
  if (!url) {
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openPreview(item: ResourceItem) {
  previewItem.value = item;
  previewVisible.value = true;
}

function openCategoryCreate() {
  categoryForm.name = '';
  categoryForm.description = '';
  categoryForm.sort_order = 1;
  categoryDrawerVisible.value = true;
}

function openItemCreate() {
  itemForm.title = '';
  itemForm.category_id = activeCategory.value === 'all' ? null : activeCategory.value;
  itemForm.resource_type = 'article';
  itemForm.summary = '';
  itemForm.content = '';
  itemForm.external_url = '';
  itemForm.sort_order = 1;
  itemForm.is_published = true;
  itemDrawerVisible.value = true;
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
    categoryDrawerVisible.value = false;
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
    itemDrawerVisible.value = false;
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
.form-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.full-width {
  width: 100%;
}

.filter-select {
  flex: none;
  width: 128px;
}

.sf-cols-resources {
  grid-template-columns: minmax(0, 1fr) 120px 96px 108px;
}

.resource-category {
  overflow: hidden;
  color: var(--sf-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-row {
  width: 100%;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.category-row:focus-visible {
  outline: 2px solid var(--sf-accent);
  outline-offset: -2px;
}

.category-row__main {
  min-width: 0;
  flex: 1 1 auto;
}

.category-row__desc {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--sf-muted);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-row .sf-row__value small {
  display: inline;
  margin-left: 3px;
}

.preview-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.preview-summary {
  margin: 0 0 16px;
  color: var(--sf-text);
  font-size: 14px;
  line-height: 1.7;
}

.preview-body {
  max-height: 56vh;
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--sf-line-soft);
  border-radius: var(--sf-r-card);
  background: var(--sf-surface-2);
}

@media (max-width: 900px) {
  .form-inline-grid {
    grid-template-columns: 1fr;
  }

  .filter-select {
    flex: 1 1 112px;
    width: auto;
  }
}
</style>
