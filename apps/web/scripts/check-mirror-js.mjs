import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(webRoot, 'src');

const counterpartByJsExt = {
  '.js': ['.ts', '.tsx', '.mts'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts', '.ts'],
};

function listFilesRecursively(rootDir) {
  const result = [];
  const queue = [rootDir];

  while (queue.length) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile()) {
        result.push(absolutePath);
      }
    }
  }

  return result;
}

function findMirrorPairs() {
  if (!fs.existsSync(srcRoot)) {
    console.log(`[check:mirror-js] skip: src path not found: ${srcRoot}`);
    return [];
  }

  const files = listFilesRecursively(srcRoot);
  const mirrors = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const tsExtCandidates = counterpartByJsExt[ext];
    if (!tsExtCandidates) {
      continue;
    }

    const basePath = filePath.slice(0, -ext.length);
    const tsMatches = tsExtCandidates
      .map((candidateExt) => `${basePath}${candidateExt}`)
      .filter((candidatePath) => fs.existsSync(candidatePath));

    if (tsMatches.length === 0) {
      continue;
    }

    mirrors.push({
      jsPath: filePath,
      tsPaths: tsMatches,
    });
  }

  return mirrors.sort((a, b) => a.jsPath.localeCompare(b.jsPath));
}

const mirrors = findMirrorPairs();

if (mirrors.length === 0) {
  console.log('[check:mirror-js] pass: no .js/.ts mirror files found under apps/web/src');
  process.exit(0);
}

console.error('[check:mirror-js] fail: found .js mirror files that duplicate TS sources:');

for (const mirror of mirrors) {
  const relJs = path.relative(webRoot, mirror.jsPath).replaceAll('\\', '/');
  const relTs = mirror.tsPaths
    .map((tsPath) => path.relative(webRoot, tsPath).replaceAll('\\', '/'))
    .join(', ');
  console.error(`  - ${relJs}  <=>  ${relTs}`);
}

console.error('Remove mirrored JS files in src before commit.');
process.exit(1);
