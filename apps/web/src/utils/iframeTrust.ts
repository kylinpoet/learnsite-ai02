const TRUSTED_EXTERNAL_IFRAME_ORIGINS = new Set<string>([
  'http://10.230.39.247',
]);

const BASE_IFRAME_SANDBOX = 'allow-scripts allow-forms allow-downloads allow-popups';
const TRUSTED_IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation';

const IFRAME_TAG_PATTERN = /<iframe\b/i;
const IMAGE_TAG_PATTERN = /<img\b/i;

export function normalizeIframeSrc(src: string | null | undefined) {
  if (typeof src !== 'string') {
    return '';
  }
  const trimmed = src.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\\/g, '/');
}

function resolveWindowOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '';
  }
  return window.location.origin;
}

function parseOrigin(urlValue: string) {
  const trimmed = normalizeIframeSrc(urlValue);
  if (!trimmed) {
    return '';
  }

  try {
    const baseOrigin = resolveWindowOrigin() || 'http://localhost';
    return new URL(trimmed, baseOrigin).origin;
  } catch {
    return '';
  }
}

function parseUrl(urlValue: string) {
  const trimmed = normalizeIframeSrc(urlValue);
  if (!trimmed) {
    return null;
  }

  try {
    const baseOrigin = resolveWindowOrigin() || 'http://localhost';
    return new URL(trimmed, baseOrigin);
  } catch {
    return null;
  }
}

function mergeSandboxPermissions(currentSandbox: string) {
  const tokens = new Set(
    currentSandbox
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  );

  TRUSTED_IFRAME_SANDBOX.split(/\s+/).forEach((token) => {
    const normalized = token.trim();
    if (normalized) {
      tokens.add(normalized);
    }
  });

  return Array.from(tokens).join(' ');
}

export function isTrustedIframeSrc(src: string | null | undefined) {
  const origin = parseOrigin(src || '');
  if (!origin) {
    return false;
  }

  const windowOrigin = resolveWindowOrigin();
  if (windowOrigin && origin === windowOrigin) {
    return true;
  }

  return TRUSTED_EXTERNAL_IFRAME_ORIGINS.has(origin);
}

export function resolveIframeSandbox(src: string | null | undefined) {
  if (isTrustedIframeSrc(src)) {
    return TRUSTED_IFRAME_SANDBOX;
  }
  return BASE_IFRAME_SANDBOX;
}

export function shouldBypassReferrerForExternalImage(src: string | null | undefined) {
  const parsed = parseUrl(src || '');
  if (!parsed) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const windowOrigin = resolveWindowOrigin();
  return Boolean(windowOrigin && parsed.origin !== windowOrigin);
}

export function patchTrustedIframeSandboxInHtml(html: string) {
  if (!html || typeof DOMParser === 'undefined' || !IFRAME_TAG_PATTERN.test(html)) {
    return html;
  }

  const documentRef = new DOMParser().parseFromString(html, 'text/html');
  const iframeElements = Array.from(documentRef.body.querySelectorAll('iframe'));
  if (!iframeElements.length) {
    return html;
  }

  let hasChanges = false;
  iframeElements.forEach((iframeElement) => {
    const currentSrc = iframeElement.getAttribute('src');
    if (currentSrc !== null) {
      const normalizedSrc = normalizeIframeSrc(currentSrc);
      if (normalizedSrc && normalizedSrc !== currentSrc.trim()) {
        iframeElement.setAttribute('src', normalizedSrc);
        hasChanges = true;
      }
    }

    const src = iframeElement.getAttribute('src') || '';
    if (!isTrustedIframeSrc(src) || !iframeElement.hasAttribute('sandbox')) {
      return;
    }

    const currentSandbox = iframeElement.getAttribute('sandbox') || '';
    const nextSandbox = mergeSandboxPermissions(currentSandbox);
    if (nextSandbox && nextSandbox !== currentSandbox) {
      iframeElement.setAttribute('sandbox', nextSandbox);
      hasChanges = true;
    }
  });

  return hasChanges ? documentRef.body.innerHTML : html;
}

export function patchImageLinkPolicyInHtml(html: string) {
  if (!html || typeof DOMParser === 'undefined' || !IMAGE_TAG_PATTERN.test(html)) {
    return html;
  }

  const documentRef = new DOMParser().parseFromString(html, 'text/html');
  const imageElements = Array.from(documentRef.body.querySelectorAll('img[src]'));
  if (!imageElements.length) {
    return html;
  }

  let hasChanges = false;
  imageElements.forEach((imageElement) => {
    const currentSrc = imageElement.getAttribute('src') || '';
    const normalizedSrc = normalizeIframeSrc(currentSrc);
    if (normalizedSrc && normalizedSrc !== currentSrc.trim()) {
      imageElement.setAttribute('src', normalizedSrc);
      hasChanges = true;
    }

    if (!shouldBypassReferrerForExternalImage(normalizedSrc || currentSrc)) {
      return;
    }

    const currentReferrerPolicy = (imageElement.getAttribute('referrerpolicy') || '').trim().toLowerCase();
    if (currentReferrerPolicy !== 'no-referrer') {
      imageElement.setAttribute('referrerpolicy', 'no-referrer');
      hasChanges = true;
    }
  });

  return hasChanges ? documentRef.body.innerHTML : html;
}
