// M0-02: lint config | adapted from recruiting-system | 2026-08-23
/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'plugin:vue/vue3-essential',
    'plugin:vue/vue3-strongly-recommended',
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-airbnb',
    '@vue/eslint-config-typescript',
    '@vue/eslint-config-prettier/skip-formatting',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['vue'],
  rules: {
    // Vue 3 Composition API 规则
    'vue/script-setup-uses-vars': 'error',
    'vue/multi-word-component-names': 'off',
    'vue/no-multiple-template-root': 'off',
    'vue/require-default-prop': 'off',
    'vue/no-v-html': 'off',

    // TypeScript 规则
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',

    // Airbnb 规则调整
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-param-reassign': ['error', { props: false }],
    'no-underscore-dangle': 'off',
    'class-methods-use-this': 'off',
    // Pinia store 等单具名导出文件不适用 default export 偏好
    'import/prefer-default-export': 'off',
    // vite/vitest 配置文件与测试文件允许引用 devDependencies
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: ['**/*.config.ts', '**/*.config.js', '**/*.config.cjs', '**/tests/**', '**/__tests__/**', '**/*.test.ts'],
    }],
    'max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
  },
  settings: {
    // 复用 tsconfig.json 的 paths 做别名解析（与服务端一致）
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  ignorePatterns: ['dist', 'node_modules', '*.d.ts'],
};
