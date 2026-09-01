/**
 * M5-2 前端测试聚合入口（vitest）
 *
 * 背景：src/**\/__tests__\/*.test.ts 共 23 个用例文件采用自包含风格——
 * 文件内自定义 describe/it 收集用例，断言失败抛 Error，并导出
 * `run*Tests(): number`（返回用例数）。这些导出此前无人调用，测试从未真正执行。
 *
 * 本文件通过 import.meta.glob  eager 加载全部用例文件，逐一调用其 run*Tests
 * 导出，把每个文件包装成一个 vitest 测试：任一断言抛错即该文件失败。
 */
import { describe, expect, it } from 'vitest';

type Runnable = () => number | Promise<number>;

const modules = import.meta.glob<Record<string, unknown>>('../src/**/__tests__/*.test.ts', {
  eager: true,
});

const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));

describe('M5-2 前端自包含用例集（23 文件聚合）', () => {
  it.each(entries.map(([path]) => path))('%s 存在 run*Tests 导出', (path) => {
    const mod = modules[path];
    const runners = Object.keys(mod).filter((k) => /^run.*Tests$/.test(k));
    expect(runners.length, `${path} 未导出任何 run*Tests 函数`).toBeGreaterThan(0);
  });

  entries.forEach(([path, mod]) => {
    Object.entries(mod)
      .filter(([key, value]) => /^run.*Tests$/.test(key) && typeof value === 'function')
      .forEach(([key, fn]) => {
        it(`${path} :: ${key}()`, async () => {
          const count = await (fn as Runnable)();
          expect(count, `${key}() 应至少执行 1 个用例`).toBeGreaterThan(0);
        });
      });
  });
});
