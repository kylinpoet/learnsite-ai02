type RunRequestOptions = {
  delayMs?: number;
  abortInFlight?: boolean;
};

type RequestFactory<T> = (signal: AbortSignal) => Promise<T>;

type DebouncedAbortableRequestRunner = {
  run<T>(requestFactory: RequestFactory<T>, options?: RunRequestOptions): Promise<T | null>;
  cancel(): void;
};

function isAbortError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name?: unknown }).name) === 'AbortError';
  }
  return false;
}

export function createDebouncedAbortableRequestRunner(): DebouncedAbortableRequestRunner {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: ((value: null) => void) | null = null;
  let activeController: AbortController | null = null;
  let latestSequence = 0;

  const clearPendingTimer = () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (pendingResolve) {
      pendingResolve(null);
      pendingResolve = null;
    }
  };

  const abortInFlightRequest = () => {
    if (!activeController) {
      return;
    }
    activeController.abort();
    activeController = null;
  };

  const executeRequest = async <T>(sequence: number, requestFactory: RequestFactory<T>) => {
    activeController = new AbortController();
    try {
      const result = await requestFactory(activeController.signal);
      if (sequence !== latestSequence) {
        return null;
      }
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      throw error;
    } finally {
      if (sequence === latestSequence) {
        activeController = null;
      }
    }
  };

  const run: DebouncedAbortableRequestRunner['run'] = async (requestFactory, options = {}) => {
    const sequence = latestSequence + 1;
    latestSequence = sequence;
    const delayMs = Math.max(0, options.delayMs ?? 0);
    const abortInFlight = options.abortInFlight ?? true;

    clearPendingTimer();
    if (abortInFlight) {
      abortInFlightRequest();
    }

    if (delayMs <= 0) {
      return executeRequest(sequence, requestFactory);
    }

    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        pendingResolve = null;
        executeRequest(sequence, requestFactory).then(resolve).catch(reject);
      }, delayMs);
    });
  };

  const cancel = () => {
    latestSequence += 1;
    clearPendingTimer();
    abortInFlightRequest();
  };

  return { run, cancel };
}
