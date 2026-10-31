<template>
  <div v-if="shouldRender" class="ai-help-root">
    <button
      v-show="showLauncher"
      ref="ballRef"
      type="button"
      class="ju-launcher"
      :class="launcherClass"
      :style="ballStyle"
      :title="open ? '收起小榉AI帮' : '问小榉AI帮（可拖到不挡数据的位置）'"
      :aria-label="open ? '收起 AI 助手小榉AI帮' : '打开 AI 助手小榉AI帮（可拖动）'"
      :aria-expanded="open"
      @pointerdown="onPointerDown"
      @click="onClick"
    >
      <span class="ju-sprite" aria-hidden="true" />
      <span class="ju-launcher-tip">{{ open ? '收起' : '问小榉AI帮' }}</span>
    </button>

    <component
      :is="PanelComponent"
      v-if="open"
      :closing="closing"
      :panel-style="viewport.w > NARROW_W ? placementStyle : EMPTY_STYLE"
      :context-query="contextQuery"
      :page-hint="pageHint"
      @close="close"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { useAuthStore } from '@/stores/auth';
import type { ContextQuery } from '@/types/domain';

/**
 * 入口（圆形头像）必须立刻可见，而面板依赖 Markdown 渲染链（marked + dompurify），
 * 所以面板按需加载：从没点过小榉AI帮的用户不下载这部分代码。
 */
const PanelComponent = defineAsyncComponent(() => import('./assistant/AssistantPanel.vue'));

type Pt = { x: number; y: number };
type Viewport = { w: number; h: number };

const NARROW_W = 720;
const SIZE_WIDE = 68;
const SIZE_NARROW = 58;
const EDGE = 12;
/** 贴边阈值：小于它算靠边，松手后自动缩进。必须大于 EDGE，否则中间有一段"拖到位却不缩" */
const DOCK_PX = 18;
/** 位移小于它算点击，避免手抖两像素把球拖走又顺手打开面板 */
const DRAG_SLOP = 4;
const PANEL_W = 600;
const PANEL_H = 760;
/** 面板与球之间的间隙：球要能单独点到（点它收起面板） */
const GAP = 12;
const POS_KEY = 'learnsite-ai-help:launcher-pos';
/** 窄屏传空对象而不是 null：Vue 会清掉上一次的内联 left/top/width，让媒体查询接管 */
const EMPTY_STYLE: Record<string, string> = {};

const route = useRoute();
const authStore = useAuthStore();

const ballRef = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const closing = ref(false);
const saved = ref<Pt | null>(readSaved());
const viewport = ref<Viewport>({ w: window.innerWidth, h: window.innerHeight });
const dragging = ref(false);
/** 用时间戳而不是布尔开关记录"刚拖完"：某些浏览器的指针捕获会吞掉拖后那次 click */
const dragEndAt = ref(0);
let closeTimer: number | null = null;
let dragRef: { id: number; x0: number; y0: number; ox: number; oy: number; moved: boolean } | null = null;

const shouldRender = computed(() => {
  const inWorkspace = route.path.startsWith('/student') || route.path.startsWith('/staff');
  return inWorkspace && Boolean(authStore.token);
});

const spot = computed(() =>
  clampToViewport(saved.value ?? defaultSpot(viewport.value), viewport.value)
);
const size = computed(() => sizeOf(viewport.value));

const onRightHalf = computed(() => spot.value.x + size.value / 2 >= viewport.value.w / 2);

/** 靠边判定：拖动中一律不缩进（手正拿着球，缩进会让它从指针底下滑走）；只做左右 */
const dock = computed<'left' | 'right' | null>(() => {
  if (dragging.value) {
    return null;
  }
  if (spot.value.x <= DOCK_PX) {
    return 'left';
  }
  if (viewport.value.w - (spot.value.x + size.value) <= DOCK_PX) {
    return 'right';
  }
  return null;
});

const launcherClass = computed(() => ({
  dragging: dragging.value,
  'tip-left': onRightHalf.value,
  'is-open': open.value,
  'dock-left': dock.value === 'left',
  'dock-right': dock.value === 'right',
}));

const ballStyle = computed(() => ({ left: `${spot.value.x}px`, top: `${spot.value.y}px` }));
const placementStyle = computed(() => panelPlacement(spot.value, viewport.value));
/** 窄屏里面板贴底占满，球留着只会被压住，干脆不显示 */
const showLauncher = computed(() => !(open.value && viewport.value.w <= NARROW_W));

const contextQuery = computed<ContextQuery>(() => {
  const query: ContextQuery = {};
  const courseId = asPositiveInt(route.params.courseId) ?? asPositiveInt(route.query.courseId);
  const taskId = asPositiveInt(route.params.taskId) ?? asPositiveInt(route.query.taskId);
  const planId = asPositiveInt(route.params.planId) ?? asPositiveInt(route.query.planId);
  const sessionId = asPositiveInt(route.params.sessionId) ?? asPositiveInt(route.query.sessionId);
  if (courseId) query.course_id = courseId;
  if (taskId) query.task_id = taskId;
  if (planId) query.plan_id = planId;
  if (sessionId) query.session_id = sessionId;
  return query;
});

const pageHint = computed(() =>
  Object.keys(contextQuery.value).length ? '已带入当前页面的课程 / 学案上下文' : ''
);

function sizeOf(vp: Viewport) {
  return vp.w <= NARROW_W ? SIZE_NARROW : SIZE_WIDE;
}

/** 球必须完整可见：拖出边界要能拉回来，而不是拖丢 */
function clampToViewport(p: Pt, vp: Viewport): Pt {
  const s = sizeOf(vp);
  return {
    x: Math.round(Math.min(Math.max(EDGE, p.x), Math.max(EDGE, vp.w - s - EDGE))),
    y: Math.round(Math.min(Math.max(EDGE, p.y), Math.max(EDGE, vp.h - s - EDGE))),
  };
}

function defaultSpot(vp: Viewport): Pt {
  const s = sizeOf(vp);
  return clampToViewport({ x: vp.w - 22 - s, y: vp.h - 22 - s }, vp);
}

function readSaved(): Pt | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    return typeof parsed.x === 'number' && typeof parsed.y === 'number'
      ? { x: parsed.x, y: parsed.y }
      : null;
  } catch {
    // 隐身模式下 localStorage 会抛，位置记不住不是大事
    return null;
  }
}

function writeSaved(p: Pt) {
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    // 同上，忽略
  }
}

/**
 * 面板贴着球放：球在右半屏，面板整个长在球左边；球在左半屏长在右边。
 * 必须留出 GAP，否则球被面板盖住，"点球收起"永远点不到。
 */
function panelPlacement(point: Pt, vp: Viewport): Record<string, string> {
  const s = sizeOf(vp);
  const w = Math.min(PANEL_W, vp.w - 32);
  const h = Math.min(PANEL_H, vp.h - 32);
  const onRight = point.x + s / 2 >= vp.w / 2;
  const raw = onRight ? point.x - GAP - w : point.x + s + GAP;
  const left = Math.min(Math.max(EDGE, raw), Math.max(EDGE, vp.w - w - EDGE));
  const top = Math.min(Math.max(EDGE, point.y + s - h), Math.max(EDGE, vp.h - h - EDGE));
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${w}px`,
    height: `${h}px`,
    right: 'auto',
    bottom: 'auto',
  };
}

function asPositiveInt(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function openPanel() {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
  syncViewport();
  closing.value = false;
  open.value = true;
}

/** 先挂 closing 播 0.18s 退场动画再真正卸载，避免面板"啪"地消失 */
function close() {
  if (closeTimer !== null) {
    return;
  }
  closing.value = true;
  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    open.value = false;
    closing.value = false;
  }, 180);
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }
  try {
    ballRef.value?.setPointerCapture(event.pointerId);
  } catch {
    // 某些环境（合成事件、个别指针设备）拿不到捕获；拖动逻辑仍走 window 上的 move/up
  }
  dragRef = {
    id: event.pointerId,
    x0: event.clientX,
    y0: event.clientY,
    ox: spot.value.x,
    oy: spot.value.y,
    moved: false,
  };
}

function onPointerMove(event: PointerEvent) {
  const d = dragRef;
  if (!d || d.id !== event.pointerId) {
    return;
  }
  const dx = event.clientX - d.x0;
  const dy = event.clientY - d.y0;
  if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) {
    return;
  }
  if (!d.moved) {
    d.moved = true;
    dragging.value = true;
  }
  saved.value = clampToViewport({ x: d.ox + dx, y: d.oy + dy }, viewport.value);
}

function onPointerUp(event: PointerEvent) {
  const d = dragRef;
  if (!d || d.id !== event.pointerId) {
    return;
  }
  dragRef = null;
  if (!d.moved) {
    return; // 没动过 = 点击，交给 onClick
  }
  dragEndAt.value = Date.now(); // 抑制随后那次 click，否则拖完就弹面板
  dragging.value = false;
  saved.value = clampToViewport(saved.value ?? defaultSpot(viewport.value), viewport.value);
  writeSaved(saved.value);
}

function onClick() {
  if (Date.now() - dragEndAt.value < 250) {
    return;
  }
  if (open.value) {
    close();
  } else {
    openPanel();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    close();
  }
}

function onResize() {
  syncViewport();
}

/** 统一读一次视口：宽高钳制、球位置重置都依赖它 */
function syncViewport() {
  const next: Viewport = { w: window.innerWidth, h: window.innerHeight };
  if (next.w === viewport.value.w && next.h === viewport.value.h) {
    return;
  }
  viewport.value = next;
  if (saved.value !== null) {
    saved.value = clampToViewport(saved.value, next);
  }
}

let vpObserver: ResizeObserver | null = null;

onMounted(() => {
  syncViewport();
  // resize 事件在某些内嵌浏览器（面板尺寸变化但窗口不变）下不触发，补一个 observer
  if (typeof ResizeObserver !== 'undefined') {
    vpObserver = new ResizeObserver(() => syncViewport());
    vpObserver.observe(document.documentElement);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
});

onBeforeUnmount(() => {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
  }
  vpObserver?.disconnect();
  vpObserver = null;
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});
</script>
