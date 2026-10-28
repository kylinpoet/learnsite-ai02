#!/usr/bin/env node
/**
 * 迁移门禁：禁止使用 Element Plus。
 * 命中任一规则即以退出码 1 结束，并打印 文件:行号。
 *
 * 用法：
 *   node ./scripts/check-no-element.mjs            # 扫描 src 全量
 *   node ./scripts/check-no-element.mjs src/modules/staff-admin
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const targets = (args.length ? args : ['src']).map((arg) => resolve(root, arg));

const extensions = new Set(['.vue', '.ts', '.tsx', '.js', '.mjs', '.jsx']);
const skipDirs = new Set(['node_modules', 'dist', '.git', 'coverage']);

const rules = [
  { name: 'element-plus import', pattern: /from\s+['"]element-plus['"]/ },
  { name: 'element-plus icons import', pattern: /@element-plus\/icons-vue/ },
  { name: 'element-plus tag', pattern: /<el-[a-z]/ },
  { name: 'v-loading directive', pattern: /\bv-loading\b/ },
  { name: 'ElMessage / ElMessageBox from element', pattern: /\bElMessage(Box)?\b\s*(?:,|\})?.*from\s+['"]element-plus['"]/ },
];

function walk(dir, files) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {
        continue;
      }
      walk(join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) {
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
for (const target of targets) {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    console.error(`[check-no-element] 路径不存在: ${target}`);
    process.exit(2);
  }
  if (stat.isDirectory()) {
    walk(target, files);
  } else {
    files.push(target);
  }
}

let hits = 0;
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes('el-') && !content.includes('element-plus') && !content.includes('v-loading')) {
    continue;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        hits += 1;
        console.log(`${relative(root, file)}:${index + 1}: ${rule.name} -> ${line.trim().slice(0, 140)}`);
      }
    }
  });
}

if (hits > 0) {
  console.error(`\n[check-no-element] 发现 ${hits} 处 Element Plus 残留（${files.length} 个文件已扫描）。`);
  process.exit(1);
}

console.log(`[check-no-element] 通过：${files.length} 个文件无 Element Plus 残留。`);
