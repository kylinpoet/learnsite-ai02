import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const write = process.argv.includes('--write');
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.vue')) files.push(full);
  }
};
walk(join(root, 'src'));

const showTags = new Set(['n-modal', 'n-drawer']);
let total = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const templateEnd = text.indexOf('</template>');
  const head = templateEnd > 0 ? text.slice(0, templateEnd) : text;
  let changed = false;
  const nextHead = head.replace(/<(n-[a-z0-9-]+)([^>]*?)>/g, (match, tag, attrs) => {
    if (!/\bv-model="/.test(attrs)) return match;
    const replacement = showTags.has(tag) ? 'v-model:show' : 'v-model:value';
    changed = true;
    total += 1;
    console.log(`${relative(root, file)}: <${tag}> v-model -> ${replacement}`);
    return `<${tag}${attrs.replace(/\bv-model="/, `${replacement}="`)}>`;
  });
  if (changed && write) {
    writeFileSync(file, nextHead + text.slice(head.length), 'utf8');
  }
}
console.log(`\n共 ${total} 处${write ? '已修复' : '待修复'}`);
