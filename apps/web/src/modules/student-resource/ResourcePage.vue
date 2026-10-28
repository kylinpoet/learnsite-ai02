<template>
  <div class="page-stack">
    <SaPageHeader
      description="在这里按分类浏览课堂资源与延伸阅读，快速找到本节课需要的学习材料。"
      eyebrow="在线资源"
      title="课堂资源与延伸阅读"
    >
      <template #actions>
        <n-button :loading="isLoading" type="primary" @click="loadResources">刷新资源</n-button>
      </template>
    </SaPageHeader>

    <n-alert v-if="errorMessage" :closable="false" :title="errorMessage" type="error" />

    <SaPanel v-if="isLoading">
      <n-skeleton :rows="10" animated />
    </SaPanel>

    <template v-else-if="resourceData">
      <div class="metric-grid">
        <article class="metric-tile">
          <p class="metric-label">资源分类</p>
          <p class="metric-value">{{ resourceData.categories.length }}</p>
          <p class="metric-note">按教学用途组织</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">资源总数</p>
          <p class="metric-value">{{ resourceData.total_count }}</p>
          <p class="metric-note">当前学生可见资源</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">推荐资源</p>
          <p class="metric-value">{{ resourceData.featured_items.length }}</p>
          <p class="metric-note">默认优先展示重点资源</p>
        </article>
        <article class="metric-tile">
          <p class="metric-label">当前分类</p>
          <p class="metric-value resource-metric-text">{{ activeCategory?.name || '--' }}</p>
          <p class="metric-note">{{ activeCategory?.item_count || 0 }} 条资源</p>
        </article>
      </div>

      <SaPanel
        v-if="resourceData.featured_items.length"
        description="优先展示适合课堂使用和延伸阅读的内容。"
        title="推荐资源"
      >
        <div class="featured-grid">
          <article
            v-for="item in resourceData.featured_items"
            :key="item.id"
            class="featured-card"
            @click="selectResource(item.id)"
          >
            <div class="chip-row">
              <n-tag round>{{ typeLabel(item.resource_type) }}</n-tag>
              <n-tag v-if="item.category" round type="info">{{ item.category.name }}</n-tag>
            </div>
            <h4>{{ item.title }}</h4>
            <p>{{ item.summary || '暂无资源摘要。' }}</p>
          </article>
        </div>
      </SaPanel>

      <div class="detail-grid">
        <SaPanel description="切换分类后，可查看该分类下全部资源。" title="分类浏览">
          <n-tabs v-model:value="activeCategoryKey" class="resource-tabs">
            <n-tab-pane
              v-for="category in resourceData.categories"
              :key="category.id"
              :name="String(category.id)"
              :tab="`${category.name}（${category.item_count}）`"
            >
              <n-empty v-if="!category.items.length" description="该分类下暂时没有资源" />

              <div v-else class="resource-list">
                <article
                  v-for="item in category.items"
                  :key="item.id"
                  :class="['resource-item', { 'resource-item-active': selectedResourceId === item.id }]"
                  @click="selectResource(item.id)"
                >
                  <div class="resource-item__top">
                    <strong>{{ item.title }}</strong>
                    <n-tag round>{{ typeLabel(item.resource_type) }}</n-tag>
                  </div>
                  <p class="resource-item__summary">{{ item.summary || '暂无资源摘要。' }}</p>
                  <p class="section-note">提供者：{{ item.owner_name }}</p>
                </article>
              </div>
            </n-tab-pane>
          </n-tabs>
        </SaPanel>

        <SaPanel description="支持文章阅读和外链跳转。" title="资源详情">
          <template v-if="resourceDetail?.external_url" #actions>
            <n-button secondary type="primary" @click="openExternal(resourceDetail.external_url)">
              打开外链
            </n-button>
          </template>

          <n-empty v-if="!resourceDetail" description="请先从左侧选择一条资源" />

          <template v-else>
            <div class="chip-row detail-chip-row">
              <n-tag round>{{ typeLabel(resourceDetail.resource_type) }}</n-tag>
              <n-tag v-if="resourceDetail.category" round type="info">
                {{ resourceDetail.category.name }}
              </n-tag>
              <n-tag round type="success">{{ resourceDetail.owner_name }}</n-tag>
            </div>

            <h3 class="detail-title">{{ resourceDetail.title }}</h3>
            <p class="detail-summary">{{ resourceDetail.summary || '暂无摘要。' }}</p>

            <RichTextContent
              :html="resourceDetail.content"
              empty-text="当前资源没有正文内容，可直接使用外链或摘要信息。"
            />

            <div v-if="resourceDetail.related_items.length" class="related-box">
              <p class="related-box__title">同类资源推荐</p>
              <div class="chip-row">
                <n-tag
                  v-for="item in resourceDetail.related_items"
                  :key="item.id"
                  round
                  type="warning"
                  @click="selectResource(item.id)"
                >
                  {{ item.title }}
                </n-tag>
              </div>
            </div>
          </template>
        </SaPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSkeleton, NTabPane, NTabs, NTag } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { apiGet } from '@/api/http';
import RichTextContent from '@/components/RichTextContent.vue';
import SaPageHeader from '@/components/sa/SaPageHeader.vue';
import SaPanel from '@/components/sa/SaPanel.vue';
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
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 9fr) minmax(0, 15fr);
  gap: 16px;
  align-items: start;
}

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

.resource-metric-text {
  font-size: clamp(24px, 2vw, 34px);
}

.featured-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.featured-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--ls-border);
  background: var(--ls-panel);
  cursor: pointer;
}

.featured-card h4 {
  margin: 0;
}

.featured-card p {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.resource-tabs {
  width: 100%;
}

.resource-list {
  display: grid;
  gap: 12px;
}

.resource-item {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--ls-border);
  background: var(--ls-elevated);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.resource-item:hover,
.resource-item-active {
  border-color: rgba(74, 135, 255, 0.45);
  transform: translateY(-1px);
}

.resource-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.resource-item__summary {
  margin: 0;
  color: var(--ls-muted);
  line-height: 1.7;
}

.detail-chip-row {
  margin-bottom: 14px;
}

.detail-title {
  margin: 0 0 8px;
}

.detail-summary {
  margin: 0 0 18px;
  color: var(--ls-muted);
  line-height: 1.7;
}

.related-box {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--ls-border);
}

.related-box__title {
  margin: 0 0 10px;
  font-weight: 700;
}

@media (max-width: 1100px) {
  .featured-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
