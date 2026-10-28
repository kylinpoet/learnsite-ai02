/**
 * 统一反馈层（naive-ui discrete API）
 *
 * 目标：
 * 1. 脱离 n-config-provider 也能使用（登录页、路由守卫、axios 拦截器都需要）；
 * 2. 为旧代码提供与 Element Plus 同签名的过渡壳（ElMessage / ElMessageBox），
 *    迁移期只需替换 import 来源，业务代码零改动；
 * 3. 新代码统一使用 notify / confirmBox。
 */
import { createDiscreteApi, NInput } from 'naive-ui';
import { h, ref } from 'vue';

import { readThemeOverrides } from '@/ui/naive-theme';

const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps: { themeOverrides: readThemeOverrides() },
});

type MessagePayload = string | { message?: string; type?: string; duration?: number };

function resolveText(payload: MessagePayload): string {
  if (typeof payload === 'string') {
    return payload;
  }
  return payload?.message ?? '';
}

export const notify = {
  success: (text: MessagePayload, duration = 2600) => message.success(resolveText(text), { duration }),
  error: (text: MessagePayload, duration = 3200) => message.error(resolveText(text), { duration }),
  warning: (text: MessagePayload, duration = 3000) => message.warning(resolveText(text), { duration }),
  info: (text: MessagePayload, duration = 2600) => message.info(resolveText(text), { duration }),
  closeAll: () => message.destroyAll(),
};

type BoxType = 'success' | 'warning' | 'info' | 'error';

export type FeedbackBoxOptions = {
  type?: BoxType;
  confirmButtonText?: string;
  cancelButtonText?: string;
  showCancelButton?: boolean;
  dangerouslyUseHTMLString?: boolean;
  customClass?: string;
  inputType?: 'text' | 'textarea' | 'password';
  inputPlaceholder?: string;
  inputValue?: string;
  inputValidator?: (value: string) => boolean | string;
  closeOnClickModal?: boolean;
};

const severityMap: Record<BoxType, 'success' | 'warning' | 'info' | 'error'> = {
  success: 'success',
  warning: 'warning',
  info: 'info',
  error: 'error',
};

function normalizeArgs(
  titleOrOptions: string | FeedbackBoxOptions | undefined,
  maybeOptions: FeedbackBoxOptions | undefined,
): { title?: string; options: FeedbackBoxOptions } {
  if (typeof titleOrOptions === 'string') {
    return { title: titleOrOptions, options: { ...(maybeOptions || {}) } };
  }
  return { title: undefined, options: { ...(titleOrOptions || {}) } };
}

function renderBody(text: string, asHtml: boolean) {
  if (asHtml) {
    return h('div', {
      class: 'sa-box__html',
      innerHTML: text,
    });
  }
  return h(
    'div',
    { class: 'sa-box__text', style: 'white-space: pre-wrap; line-height: 1.7; word-break: break-word;' },
    text,
  );
}

/**
 * confirm / alert / prompt 的统一实现。
 * 语义与 Element Plus 对齐：取消或关闭时 reject('cancel')，确认时 resolve。
 */
function openBox(
  kind: 'confirm' | 'alert' | 'prompt',
  text: string,
  titleOrOptions?: string | FeedbackBoxOptions,
  maybeOptions?: FeedbackBoxOptions,
): Promise<any> {
  const { title, options } = normalizeArgs(titleOrOptions, maybeOptions);
  const boxTitle = title ?? (kind === 'alert' ? '提示' : '请确认');
  const severity = severityMap[options.type ?? 'warning'] ?? 'warning';
  const inputValue = ref(options.inputValue ?? '');
  const errorText = ref('');

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      fn();
    };

    const buildContent = () => {
      const children = [renderBody(text, Boolean(options.dangerouslyUseHTMLString))];
      if (kind === 'prompt') {
        const isTextarea = options.inputType === 'textarea';
        const isPassword = options.inputType === 'password';
        children.push(
          h(NInput, {
            value: inputValue.value,
            type: isTextarea ? 'textarea' : isPassword ? 'password' : 'text',
            showPasswordOn: isPassword ? 'click' : undefined,
            placeholder: options.inputPlaceholder ?? '',
            autofocus: true,
            rows: isTextarea ? 3 : undefined,
            style: 'margin-top: 12px;',
            'onUpdate:value': (value: string) => {
              inputValue.value = value;
              errorText.value = '';
            },
            onKeyup: (event: KeyboardEvent) => {
              if (event.key === 'Enter' && !isTextarea) {
                const positive = document.querySelector<HTMLButtonElement>('.n-dialog__action .n-button--primary-type');
                positive?.click();
              }
            },
          }),
        );
      }
      if (errorText.value) {
        children.push(
          h(
            'p',
            { style: 'margin: 8px 0 0; color: #d03050; font-size: 12px;' },
            errorText.value,
          ),
        );
      }
      return h('div', { class: 'sa-box__body' }, children);
    };

    const createOptions: Record<string, unknown> = {
      title: boxTitle,
      content: () => buildContent(),
      positiveText: options.confirmButtonText ?? '确定',
      maskClosable: options.closeOnClickModal === false ? false : true,
      onPositiveClick: () => {
        if (kind === 'prompt' && typeof options.inputValidator === 'function') {
          const verdict = options.inputValidator(inputValue.value);
          if (verdict !== true) {
            errorText.value = typeof verdict === 'string' ? verdict : '请输入有效内容';
            return false;
          }
        }
        settle(() => resolve(kind === 'prompt' ? { value: inputValue.value, action: 'confirm' } : true));
        return true;
      },
      onNegativeClick: () => {
        settle(() => reject('cancel'));
      },
      onClose: () => {
        settle(() => reject('cancel'));
      },
    };

    if (kind !== 'alert' && options.showCancelButton !== false) {
      createOptions.negativeText = options.cancelButtonText ?? '取消';
    }
    if (options.customClass) {
      createOptions.class = options.customClass;
    }

    const api = (dialog as unknown as Record<string, (opts: Record<string, unknown>) => void>)[severity];
    api.call(dialog, createOptions);
  });
}

export type ConfirmResult = boolean;

/** 新代码推荐用法：返回值不是异常，避免 try/catch 噪音。 */
export const confirmBox = {
  confirm: async (text: string, title = '请确认', options: FeedbackBoxOptions = {}): Promise<ConfirmResult> => {
    try {
      await openBox('confirm', text, title, { type: 'warning', ...options });
      return true;
    } catch {
      return false;
    }
  },
  prompt: async (
    text: string,
    title = '请输入',
    options: FeedbackBoxOptions = {},
  ): Promise<{ value: string } | null> => {
    try {
      const result = await openBox('prompt', text, title, { type: 'info', ...options });
      return { value: String(result?.value ?? '') };
    } catch {
      return null;
    }
  },
  alert: (text: string, title = '提示', options: FeedbackBoxOptions = {}): Promise<void> =>
    openBox('alert', text, title, { type: 'info', ...options }).then(() => undefined),
};

/* ------------------------------------------------------------------ */
/* 过渡壳：签名对齐 Element Plus，迁移期替换 import 来源即可            */
/* ------------------------------------------------------------------ */

type ElMessageLike = ((payload: MessagePayload) => void) & {
  success: (payload: MessagePayload) => void;
  error: (payload: MessagePayload) => void;
  warning: (payload: MessagePayload) => void;
  info: (payload: MessagePayload) => void;
  close: () => void;
  closeAll: () => void;
};

const elMessageImpl = ((payload: MessagePayload) => {
  message.info(resolveText(payload));
}) as ElMessageLike;

elMessageImpl.success = (payload) => notify.success(payload);
elMessageImpl.error = (payload) => notify.error(payload);
elMessageImpl.warning = (payload) => notify.warning(payload);
elMessageImpl.info = (payload) => notify.info(payload);
elMessageImpl.close = () => message.destroyAll();
elMessageImpl.closeAll = () => message.destroyAll();

export const ElMessage = elMessageImpl;

export const ElMessageBox = {
  confirm: (text: string, titleOrOptions?: string | FeedbackBoxOptions, options?: FeedbackBoxOptions) =>
    openBox('confirm', text, titleOrOptions, options),
  alert: (text: string, titleOrOptions?: string | FeedbackBoxOptions, options?: FeedbackBoxOptions) =>
    openBox('alert', text, titleOrOptions, options),
  prompt: (text: string, titleOrOptions?: string | FeedbackBoxOptions, options?: FeedbackBoxOptions) =>
    openBox('prompt', text, titleOrOptions, options),
  close: () => undefined,
};
