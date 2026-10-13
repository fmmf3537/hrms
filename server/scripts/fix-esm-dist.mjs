// M5-13: ESM dist 修复脚本
// 背景：server 为 "type":"module"（ESM），tsconfig module=ESNext + moduleResolution=node，
// tsc 输出保留不带扩展名的相对导入（如 `from './app'`），Node ESM 运行时会报 ERR_MODULE_NOT_FOUND。
// 本脚本在 `tsc` 构建后扫描 dist，将相对导入补上 .js（目录导入补 /index.js）。
// 用法：node scripts/fix-esm-dist.mjs（在 server/ 目录执行）
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** 递归收集 dist 下所有 .js 文件 */
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

let changed = 0;
let total = 0;
for (const file of collect(root)) {
  /** 将不带扩展名的相对导入补上扩展名 */
  const fix = (match, prefix, spec, suffix) => {
    if (/\.(js|json|node)$/.test(spec)) return match; // 已有扩展名，跳过
    const base = join(dirname(file), spec);
    if (existsSync(base) && statSync(base).isDirectory()) {
      return `${prefix}${spec}/index.js${suffix}`;
    }
    if (existsSync(`${base}.js`)) {
      return `${prefix}${spec}.js${suffix}`;
    }
    if (existsSync(`${base}.json`)) {
      return `${prefix}${spec}.json${suffix}`;
    }
    // 解析不到的目标保持原样（避免破坏输出）
    console.warn(`[fix-esm] unresolved: ${relative(root, file)} -> ${spec}`);
    return match;
  };

  const src = readFileSync(file, 'utf8');
  const out = src
    .replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, fix)      // from './x' / export {a} from './y' / export * from './z'
    .replace(/(import\s+['"])(\.\.?\/[^'"]+)(['"])/g, fix)     // import './x'
    .replace(/(import\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g, fix); // import('./x')
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
  total++;
}
console.log(`[fix-esm] done: ${total} files scanned, ${changed} files rewritten`);