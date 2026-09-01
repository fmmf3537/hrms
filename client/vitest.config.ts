import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// M5-2 前端测试脚手架：复用 vite 的 vue 插件（测试会 import .vue SFC）
// 与 alias 约定；测试本身为 node 环境（不挂载组件，无需 jsdom）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // happy-dom：router/index.ts 模块加载即调 createWebHistory() 依赖 window；
    // 用例不挂载组件，无需 jsdom 那么重的环境
    environment: 'happy-dom',
    // 真正的入口只有 tests/run-all.test.ts（聚合执行 src 下 23 个用例文件）；
    // src/**/__tests__/*.test.ts 是自包含用例集（自定义 describe/it 收集 + 导出 run*Tests），
    // 不作为 vitest 测试文件直接执行
    include: ['tests/**/*.test.ts'],
  },
});
