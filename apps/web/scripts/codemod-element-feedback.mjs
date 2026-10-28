#!/usr/bin/env node
/**
 * 命令式反馈 API 批量迁移：把 ElMessage / ElMessageBox 的 import 来源
 * 从 'element-plus' 换成统一兼容层 '@/ui/feedback'。
 *
 *   node ./scripts/codemod-element-feedback.mjs            # dry-run，只打印 diff
 *   node ./scripts/codemod-element-feedback.mjs --write    # 实际写入
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const write = process.argv.includes('--write');
const sourceDir = resolve(root, 'src');
const extensions = new Set(['.vue', '.ts', '.tsx']);
const skipDirs = new Set(['node_modules', 'dist']);

const supported = new Set(['ElMessage', 'ElMessageBox']);
const importPattern = /import\s*(type\s*)?\{([^}]*)\}\s*from\s*['"]element-plus['"];?/g;

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        walk(join(dir, entry.name), files);
      }
      continue;
    }
    const dot = entry.name.lastIndexOf('.');
    const ext = dot >= 0 ? entry.name.slice(dot) : '';
    if (extensions.has(ext)) {
      files.push(join(dir, entry.name));
    }
  }
}

const files = [];
walk(sourceDir, files);

let changed = 0;
let skipped = 0;

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  if (!original.includes('element-plus')) {
    continue;
  }
  let next = original.replace(importPattern, (match, typeKeyword, names) => {
    const list = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const unsupported = list.filter((name) => !supported.has(name.split(/\s+as\s+/)[0].trim()));
    if (unsupported.length) {
      console.warn(`[codemod] 跳过（含非反馈 API: ${unsupported.join(', ')}） ${relative(root, file)}`);
      skipped += 1;
      return match;
    }
    return `import ${typeKeyword || ''}{ ${list.join(', ')} } from '@/ui/feedback';`;
  });

  if (next === original) {
    continue;
  }
  changed += 1;
  if (!write) {
    const before = original.split(/\r?\n/).filter((line) => line.includes('element-plus'));
    const after = next.split(/\r?\n/).filter((line) => line.includes('@/ui/feedback'));
    console.log(`\n--- ${relative(root, file)}`);
    before.forEach((line) => console.log(`- ${line.trim()}`));
    after.forEach((line) => console.log(`+ ${line.trim()}`));
    continue;
  }
  writeFileSync(file, next, 'utf8');
  console.log(`[codemod] 已改写 ${relative(root, file)}`);
}

console.log(
  `\n[codemod] ${write ? '写入' : 'dry-run'}：${changed} 个文件${write ? '已更新' : '待更新'}，${skipped} 个文件跳过。`,
);
if (!write && changed > 0) {
  console.log('[codemod] 确认无误后追加 --write 执行。');
}
