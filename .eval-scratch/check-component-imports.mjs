import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.vue')) files.push(full);
  }
};
dirs.forEach((d) => walk(d));

const pascal = (tag) => 'N' + tag.replace(/^n-/, '').split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const script = text.split('</script>')[0];
  const tags = new Set();
  for (const match of text.matchAll(/<(n-[a-z0-9-]+)/g)) tags.add(match[1]);
  const missing = [];
  for (const tag of tags) {
    const name = pascal(tag);
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(script)) missing.push(`${tag}(${name})`);
  }
  const saUsed = new Set();
  for (const match of text.matchAll(/<(Sa[A-Za-z]+)/g)) saUsed.add(match[1]);
  for (const comp of saUsed) {
    const re = new RegExp(`import\\s+${comp}\\s+from`);
    if (!re.test(script)) missing.push(comp);
  }
  if (/<AppIcon/.test(text) && !/import\s+AppIcon\s+from/.test(script)) missing.push('AppIcon');
  if (missing.length) {
    problems += 1;
    console.log(`${relative(root, file)}: 缺少导入 -> ${missing.join(', ')}`);
  }
}
console.log(problems ? `\n共 ${problems} 个文件缺少组件导入` : '\n全部文件组件导入完整');
process.exit(problems ? 1 : 0);
