import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = 'dist/assets';
const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
let raw = 0;
let gz = 0;
for (const f of files) {
  const buf = readFileSync(join(dir, f));
  raw += buf.length;
  gz += gzipSync(buf).length;
}
const label = process.argv[2] || 'snapshot';
const line = `${label}: files=${files.length} raw=${(raw / 1024).toFixed(0)}KB gzip=${(gz / 1024).toFixed(0)}KB`;
writeFileSync(join('..', '..', '.eval-scratch', `bundle-${label}.txt`), line);
console.log(line);
