export type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';

export type FilePreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';

const previewableImageExtensions = new Set(['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

const inlinePreviewTextExtensions = new Set(['md', 'txt']);

const previewableTextExtensions = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'log',
  'html',
  'css',
  'js',
  'ts',
  'xml',
  'yml',
  'yaml',
  'py',
]);

type PreviewCandidateFile = {
  ext: string;
  mime_type?: string;
};

export function detectPreviewKind(file: PreviewCandidateFile, blob: Blob): PreviewKind {
  const ext = file.ext.toLowerCase();
  const mediaType = blob.type || file.mime_type || '';

  if (ext === 'pdf' || mediaType.includes('pdf')) {
    return 'pdf';
  }
  if (mediaType.startsWith('image/') || previewableImageExtensions.has(ext)) {
    return 'image';
  }
  if (mediaType.startsWith('text/') || inlinePreviewTextExtensions.has(ext)) {
    return 'text';
  }
  return 'unsupported';
}

export function detectFilePreviewKind(ext: string, mimeType: string): FilePreviewKind {
  const normalizedExt = ext.toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedExt === 'pdf' || normalizedMimeType.includes('pdf')) {
    return 'pdf';
  }
  if (normalizedMimeType.startsWith('image/') || previewableImageExtensions.has(normalizedExt)) {
    return 'image';
  }
  if (normalizedMimeType.startsWith('text/') || previewableTextExtensions.has(normalizedExt)) {
    return 'text';
  }
  return 'unsupported';
}
