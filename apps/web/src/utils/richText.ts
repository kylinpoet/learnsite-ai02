const meaningfulRichHtmlTagPattern =
  /<\s*(img|video|audio|iframe|embed|object|svg|canvas|table|form|input|textarea|select|button|style|font|figure|math|hr)\b/i;

export function richTextToPlainText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.body.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function hasMeaningfulRichHtml(html: string): boolean {
  if (meaningfulRichHtmlTagPattern.test(html)) {
    return true;
  }

  if (typeof DOMParser === 'undefined') {
    return false;
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  const meaningfulSelector = [
    'img',
    'video',
    'audio',
    'iframe',
    'embed',
    'object',
    'svg',
    'canvas',
    'table',
    'form',
    'input',
    'textarea',
    'select',
    'button',
    'style',
    'font',
    'figure',
    'math',
    'hr',
  ].join(',');
  return Boolean(document.body.querySelector(meaningfulSelector));
}

export function isRichTextEmpty(html: string | null | undefined): boolean {
  const normalized = (html || '').trim();
  if (!normalized) {
    return true;
  }
  if (richTextToPlainText(normalized)) {
    return false;
  }
  return !hasMeaningfulRichHtml(normalized);
}

export function normalizeRichTextHtml(html: string | null | undefined): string {
  const normalized = (html || '').trim();
  if (!normalized) {
    return '';
  }
  return isRichTextEmpty(normalized) ? '' : normalized;
}

export function richTextToExcerpt(html: string | null | undefined, maxLength = 120): string {
  const plainText = richTextToPlainText(html);
  if (!plainText) {
    return '';
  }
  if (plainText.length <= maxLength) {
    return plainText;
  }
  return `${plainText.slice(0, maxLength).trim()}...`;
}
