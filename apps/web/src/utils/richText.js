export function richTextToPlainText(html) {
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
export function isRichTextEmpty(html) {
    return !richTextToPlainText(html);
}
export function normalizeRichTextHtml(html) {
    if (!html) {
        return '';
    }
    return isRichTextEmpty(html) ? '' : html.trim();
}
export function richTextToExcerpt(html, maxLength = 120) {
    const plainText = richTextToPlainText(html);
    if (!plainText) {
        return '';
    }
    if (plainText.length <= maxLength) {
        return plainText;
    }
    return `${plainText.slice(0, maxLength).trim()}...`;
}
