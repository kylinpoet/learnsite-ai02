import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * 可见性感知轮询：课堂页「签到/提交状态」实时刷新用。
 *
 * 约定：
 * - 页面切到后台（document.hidden）立即停机，回到前台立刻补刷一次；
 * - 同一时刻只允许一个请求在飞（in-flight 去重），手动刷新与自动轮询共用同一条通道；
 * - 失败按 10s → 20s → 40s → 60s 退避，成功后立刻恢复正常节奏；
 * - 组件卸载时清定时器并 abort 在飞请求，避免离开页面后继续打接口。
 */

const BACKOFF_DELAYS = [20_000, 40_000, 60_000] as const;

export type VisibilityPollingOptions = {
  /** 实际拉取逻辑；收到 AbortSignal，卸载时应能被打断 */
  fetcher: (signal: AbortSignal) => Promise<void>;
  /** 正常节奏，默认 10s */
  intervalMs?: number;
  /** 关闭时既不排下一次，也不发请求；支持传入 ref 动态开关 */
  enabled?: boolean | Ref<boolean>;
  /** 挂载后是否立即拉一次，默认 true */
  immediate?: boolean;
};

export function useVisibilityPolling(options: VisibilityPollingOptions) {
  const intervalMs = options.intervalMs ?? 10_000;

  const isRefreshing = ref(false);
  const lastUpdatedAt = ref<number | null>(null);
  const lastError = ref<string | null>(null);
  const failureCount = ref(0);
  const isDocumentHidden = ref(typeof document !== 'undefined' && document.hidden);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let disposed = false;

  const isPaused = computed(() => isDocumentHidden.value || !isEnabled());

  function isEnabled(): boolean {
    const value = options.enabled;
    if (value === undefined) {
      return true;
    }
    return typeof value === 'boolean' ? value : value.value;
  }

  function nextDelay(): number {
    if (failureCount.value <= 0) {
      return intervalMs;
    }
    const index = Math.min(failureCount.value - 1, BACKOFF_DELAYS.length - 1);
    return BACKOFF_DELAYS[index];
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    clearTimer();
    if (disposed || !isEnabled() || isDocumentHidden.value) {
      return;
    }
    timer = setTimeout(() => {
      void tick();
    }, nextDelay());
  }

  async function run() {
    if (disposed || !isEnabled() || isDocumentHidden.value || isRefreshing.value) {
      return;
    }

    const requestController = new AbortController();
    controller = requestController;
    isRefreshing.value = true;
    try {
      await options.fetcher(requestController.signal);
      if (requestController.signal.aborted) {
        return;
      }
      failureCount.value = 0;
      lastError.value = null;
      lastUpdatedAt.value = Date.now();
    } catch (error) {
      if (requestController.signal.aborted) {
        return;
      }
      failureCount.value += 1;
      lastError.value = error instanceof Error ? error.message : '刷新失败';
    } finally {
      if (controller === requestController) {
        controller = null;
      }
      isRefreshing.value = false;
    }
  }

  async function tick() {
    await run();
    schedule();
  }

  /** 手动刷新：与自动轮询共用同一通道，不会产生并发请求 */
  async function refreshNow() {
    clearTimer();
    await tick();
  }

  function handleVisibilityChange() {
    isDocumentHidden.value = document.hidden;
    if (document.hidden) {
      clearTimer();
      return;
    }
    void tick();
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (options.immediate === false) {
      schedule();
      return;
    }
    void tick();
  });

  onBeforeUnmount(() => {
    disposed = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearTimer();
    controller?.abort();
    controller = null;
  });

  return {
    isRefreshing,
    isPaused,
    lastUpdatedAt,
    lastError,
    failureCount,
    refreshNow,
  };
}
