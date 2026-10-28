<template>
  <div class="sw-resource">
    <StudentPageHead title="课程资源" :sub="headSub">
      <template #actions>
        <n-button :loading="isLoading" @click="loadResources">刷新</n-button>
      </template>
    </StudentPageHead>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <div v-if="isLoading" class="sw-panel">
      <div class="sw-panel__body">
        <n-skeleton :rows="8" animated />
      </div>
    </div>

    <div v-else-if="resourceData" class="sw-reader">
      <StudentPanel title="分类" :count="`${resourceData.categories.length} 个`" flush>
        <div v-if="resourceData.categories.length" class="sw-cats">
          <button
            v-for="category in resourceData.categories"
            :key="category.id"
            type="button"
            :class="['sw-row', 'sw-row--link', 'sw-cat', { 'is-active': String(category.id) === activeCategoryKey }]"
            @click="activeCategoryKey = String(category.id)"
          >
            <span class="sw-row__main">
              <span class="sw-row__title">{{ category.name }}</span>
            </span>
            <span class="sw-row__value">{{ category.item_count }}</span>
          </button>
        </div>
        <StudentEmpty v-else box text="还没有可查看的分类，老师发布资源后会出现在这里。" />
      </StudentPanel>

      <StudentPanel
        :title="activeCategory?.name || '资源列表'"
        :count="activeCategory ? `${categoryItems.length} 份` : undefined"
        flush
      >
        <template v-if="categoryItems.length">
          <button
            v-for="item in categoryItems"
            :key="item.id"
            type="button"
            :class="['sw-row', 'sw-row--link', 'sw-item', { 'is-active': selectedResourceId === item.id }]"
            @click="selectResource(item.id)"
          >
            <span class="sw-row__main">
              <span class="sw-row__title">{{ item.title }}</span>
              <span class="sw-row__meta">
                <span>{{ typeLabel(item.resource_type) }}</span>
                <span>{{ item.owner_name }}</span>
              </span>
            </span>
            <span v-if="item.external_url" class="sw-chip">外链</span>
          </button>
        </template>
        <StudentEmpty v-else box :text="activeCategory ? '这个分类下还没有资源，换一个分类看看。' : '先选择一个分类，资源会列在这里。'" />
      </StudentPanel>

      <StudentPanel
        :title="resourceDetail?.title || '资源详情'"
        :count="resourceDetail ? typeLabel(resourceDetail.resource_type) : undefined"
      >
        <template v-if="resourceDetail?.external_url" #actions>
          <n-button secondary @click="openExternal(resourceDetail.external_url)">打开外链</n-button>
        </template>

        <StudentEmpty v-if="!resourceDetail" box text="从中间列表选一篇材料，正文会显示在这里。" />

        <div v-else class="sw-detail">
          <p class="sw-row__meta sw-detail__meta">
            <span>{{ resourceDetail.category?.name || '未分类' }}</span>
            <span>提供者 {{ resourceDetail.owner_name }}</span>
            <span v-if="resourceDetail.external_url">外链资源</span>
          </p>

          <p class="sw-detail__summary">{{ resourceDetail.summary || '暂无摘要。' }}</p>

          <RichTextContent
            :html="resourceDetail.content"
            empty-text="这篇材料没有正文，可直接打开外链查看。"
          />

          <div v-if="resourceDetail.related_items.length" class="sw-detail__related">
            <p class="sw-detail__related-label">同分类的其他材料</p>
            <button
              v-for="item in resourceDetail.related_items"
              :key="item.id"
              type="button"
              class="sw-row sw-row--link sw-detail__related-row"
              @click="selectResource(item.id)"
            >
              <span class="sw-row__main">
                <span class="sw-row__title">{{ item.title }}</span>
                <span class="sw-row__meta">{{ typeLabel(item.resource_type) }}</span>
              </span>
            </button>
          </div>
        </div>
      </StudentPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NSkeleton } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import { useAuthStore } from '@/stores/auth';

type ResourceSummary = {
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
};

type ResourceListPayload = {
  categories: Array<{
    id: number;
    name: string;
    description: string | null;
    item_count: number;
    items: ResourceSummary[];
  }>;
  featured_items: ResourceSummary[];
  total_count: number;
};

type ResourceDetailPayload = ResourceSummary & {
  related_items: ResourceSummary[];
};

const authStore = useAuthStore();
const route = useRoute();

const isLoading = ref(true);
const errorMessage = ref('');
const resourceData = ref<ResourceListPayload | null>(null);
const activeCategoryKey = ref('');
const selectedResourceId = ref<number | null>(null);
const resourceDetail = ref<ResourceDetailPayload | null>(null);

const activeCategory = computed(() =>
  resourceData.value?.categories.find((item) => String(item.id) === activeCategoryKey.value) || null
);
const categoryItems = computed(() => activeCategory.value?.items || []);

const headSub = computed(() => {
  if (!resourceData.value) {
    return '';
  }
  return `${resourceData.value.categories.length} 个分类 · ${resourceData.value.total_count} 份材料`;
});

function requestedResourceId() {
  const value = Number(route.query.resourceId);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function findCategoryByResourceId(resourceId: number) {
  return resourceData.value?.categories.find((category) =>
    category.items.some((item) => item.id === resourceId)
  ) || null;
}

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

async function loadResourceDetail(resourceId: number) {
  if (!authStore.token) {
    return;
  }
  selectedResourceId.value = resourceId;
  try {
    resourceDetail.value = await apiGet<ResourceDetailPayload>(`/resources/${resourceId}`, authStore.token);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载资源详情失败';
  }
}

async function loadResources() {
  if (!authStore.token) {
    errorMessage.value = '请先登录学生账号';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    resourceData.value = await apiGet<ResourceListPayload>('/resources/student', authStore.token);
    const routeResourceId = requestedResourceId();
    const preferredCategory = routeResourceId ? findCategoryByResourceId(routeResourceId) : null;
    const firstCategory = preferredCategory || resourceData.value.categories[0];
    if (firstCategory) {
      activeCategoryKey.value = String(firstCategory.id);
      const firstResource =
        (routeResourceId && firstCategory.items.find((item) => item.id === routeResourceId))
        || firstCategory.items[0]
        || resourceData.value.featured_items[0];
      if (firstResource) {
        await loadResourceDetail(firstResource.id);
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载资源中心失败';
  } finally {
    isLoading.value = false;
  }
}

async function selectResource(resourceId: number) {
  await loadResourceDetail(resourceId);
}

watch(activeCategoryKey, async (value) => {
  if (!value || !resourceData.value) {
    return;
  }
  const category = resourceData.value.categories.find((item) => String(item.id) === value);
  if (!category) {
    return;
  }
  if (selectedResourceId.value && category.items.some((item) => item.id === selectedResourceId.value)) {
    return;
  }
  if (category.items[0]) {
    await loadResourceDetail(category.items[0].id);
  }
});

watch(
  () => route.query.resourceId,
  async () => {
    const resourceId = requestedResourceId();
    if (!resourceId || !resourceData.value || selectedResourceId.value === resourceId) {
      return;
    }
    const category = findCategoryByResourceId(resourceId);
    if (!category) {
      return;
    }
    activeCategoryKey.value = String(category.id);
    await loadResourceDetail(resourceId);
  }
);

onMounted(loadResources);
</script>

<style scoped>
.sw-resource {
  display: grid;
  gap: var(--sw-section-gap);
}

/* 三栏阅读器：分类 200 / 列表 300 / 详情自适应 */
.sw-reader {
  display: grid;
  grid-template-columns: 200px 300px minmax(0, 1fr);
  gap: var(--sw-gap);
  align-items: start;
}

.sw-cat,
.sw-item {
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sw-cat {
  min-height: 44px;
}

.sw-cat:hover,
.sw-item:hover {
  background: var(--sw-surface-2);
}

.sw-cat.is-active,
.sw-item.is-active {
  background: var(--sw-surface-2);
}

.sw-cat.is-active .sw-row__title,
.sw-item.is-active .sw-row__title {
  font-weight: 600;
}

.sw-detail__meta {
  margin: 0 0 10px;
}

.sw-detail__summary {
  max-width: 70ch;
  margin: 0 0 16px;
  color: var(--sw-text);
  font-size: 14px;
  line-height: 1.7;
}

.sw-detail :deep(.rich-text-content) {
  max-width: 70ch;
}

.sw-detail__related {
  max-width: 70ch;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--sw-line-soft);
}

.sw-detail__related-label {
  margin: 0 0 2px;
  color: var(--sw-muted);
  font-size: 12px;
}

.sw-detail__related-row {
  min-height: 44px;
  padding: 8px 0;
}

.sw-detail__related-row + .sw-detail__related-row {
  border-top: 1px solid var(--sw-line-soft);
}

@media (max-width: 1080px) {
  .sw-reader {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 窄屏把分类压成一行可换行的选择条 */
  .sw-cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px;
  }

  .sw-cats .sw-cat {
    width: auto;
    min-width: 0;
    max-width: 100%;
    min-height: 34px;
    padding: 6px 10px;
    border-top: 0;
    border-radius: 4px;
  }

  .sw-cats .sw-cat + .sw-cat {
    border-top: 0;
  }
}
</style>
