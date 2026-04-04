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

export function isRichTextEmpty(html: string | null | undefined): boolean {
  return !richTextToPlainText(html);
}

export function normalizeRichTextHtml(html: string | null | undefined): string {
  if (!html) {
    return '';
  }

  return isRichTextEmpty(html) ? '' : html.trim();
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
