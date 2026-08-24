# 【任务 ID】M0-02：ESLint + Prettier + TypeScript 配置

## 【任务目标】
为 `D:/projects/hrms/` 项目配置统一的 ESLint / Prettier / TypeScript 规则，**严格复用招聘系统的配置文件**，确保两端代码风格一致。

## 【前置状态】
- M0-01 已完成：`D:/projects/hrms/` 已有 `client/` `server/` `mobile/` 三个子目录及占位 package.json
- 当前目录还没有任何 lint / TS 配置文件

## 【强制约束】
- 项目根目录：`D:/projects/hrms/`
- 参考项目（只读）：`C:/Users/fmmf/Kimi/recruiting-system/`
- **必须先 Read 以下参考文件，再决定怎么写**：
  - `C:/Users/fmmf/Kimi/recruiting-system/server/.eslintrc.cjs`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/tsconfig.json`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/.eslintrc.cjs`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/tsconfig.json`
  - `C:/Users/fmmf/Kimi/recruiting-system/client/tsconfig.node.json`
  - `C:/Users/fmmf/Kimi/recruiting-system/.prettierrc`（若不存在则用下面的默认）
- 不要执行 `pnpm install` / `pnpm lint` / `pnpm format` / 任何 npm 命令
- 不要创建业务代码（src 目录留空）
- 不要初始化 git

## 【需要创建的文件】

### 1. `D:/projects/hrms/.prettierrc`
**优先级 1**：如果 `C:/Users/fmmf/Kimi/recruiting-system/.prettierrc` 存在，原样复制内容到此。
**优先级 2**：如果不存在，使用以下内容：
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 2. `D:/projects/hrms/.prettierignore`
```
node_modules
dist
build
coverage
*.log
pnpm-lock.yaml
public
*.min.js
*.min.css
```

### 3. `D:/projects/hrms/server/.eslintrc.cjs`
**直接复制** `C:/Users/fmmf/Kimi/recruiting-system/server/.eslintrc.cjs` 的内容，**原样写入** `D:/projects/hrms/server/.eslintrc.cjs`。

### 4. `D:/projects/hrms/server/tsconfig.json`
**直接复制** `C:/Users/fmmf/Kimi/recruiting-system/server/tsconfig.json` 的内容，**原样写入** `D:/projects/hrms/server/tsconfig.json`。
唯一允许的修改：如果 `include`/`exclude` 字段引用了招聘系统特有的目录（如 `src/recruitment/**`），改为通用模式 `src/**/*`。
其他字段（`compilerOptions.strict`、`target`、`module`、`moduleResolution`、`outDir`、`esModuleInterop` 等）**保持不变**。

### 5. `D:/projects/hrms/client/.eslintrc.cjs`
**直接复制** `C:/Users/fmmf/Kimi/recruiting-system/client/.eslintrc.cjs` 的内容，**原样写入** `D:/projects/hrms/client/.eslintrc.cjs`。

### 6. `D:/projects/hrms/client/tsconfig.json`
**直接复制** `C:/Users/fmmf/Kimi/recruiting-system/client/tsconfig.json` 的内容，**原样写入** `D:/projects/hrms/client/tsconfig.json`。
唯一允许的修改：如果 `include`/`references` 字段引用了招聘系统特有路径，改为通用模式。

### 7. `D:/projects/hrms/client/tsconfig.node.json`
**直接复制** `C:/Users/fmmf/Kimi/recruiting-system/client/tsconfig.node.json` 的内容。

### 8. `D:/projects/hrms/.editorconfig`
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{md,markdown}]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

## 【package.json 升级】

### 9. 修改 `D:/projects/hrms/server/package.json`
在 `devDependencies` 中添加（**先 Read 招聘系统 server/package.json 的 devDependencies，把 eslint / prettier / typescript / @typescript-eslint 相关的包名+版本原样复用**）：

预期包含但不限于：
- `typescript`
- `eslint`
- `prettier`
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `eslint-config-airbnb-base`
- `eslint-config-airbnb-typescript`
- `eslint-plugin-import`

**版本号必须与招聘系统一致**（直接 Read `C:/Users/fmmf/Kimi/recruiting-system/server/package.json` 的对应版本）。

同时更新 `scripts`：
```json
"lint": "eslint src --ext .ts",
"lint:fix": "eslint src --ext .ts --fix",
"format": "prettier --write \"src/**/*.ts\"",
"format:check": "prettier --check \"src/**/*.ts\"",
"type-check": "tsc --noEmit"
```

### 10. 修改 `D:/projects/hrms/client/package.json`
同样 Read `C:/Users/fmmf/Kimi/recruiting-system/client/package.json`，把 lint / prettier / typescript / vue 相关的 devDependencies 复用过来：
- `typescript`
- `eslint`
- `prettier`
- `vue-tsc`
- `@vue/eslint-config-typescript`
- `@vue/eslint-config-airbnb`（如招聘系统使用）
- `@vue/eslint-config-prettier`
- `eslint-plugin-vue`

同时更新 `scripts`：
```json
"lint": "eslint . --ext .vue,.js,.ts --ignore-path .gitignore",
"lint:fix": "eslint . --ext .vue,.js,.ts --fix --ignore-path .gitignore",
"format": "prettier --write \"src/**/*.{js,ts,vue,css,scss,json}\"",
"format:check": "prettier --check \"src/**/*.{js,ts,vue,css,scss,json}\"",
"type-check": "vue-tsc --noEmit"
```

## 【执行步骤】

1. 先 Read 招聘系统的 6 个参考文件（列在【强制约束】中）
2. 按上述清单创建/修改 10 个文件
3. 在每个新建的配置文件顶部加一行注释（仅 .cjs / .json / .ini 文件可加，注意 .json 不支持注释则跳过）：
   - `.cjs` 文件首行加：`// M0-02: lint config | adapted from recruiting-system | 2026-08-23`
   - `.json` 文件不加注释（避免破坏 JSON 解析）
4. **不要执行 `pnpm install`**（用户后续手动跑）
5. **不要执行 `pnpm lint`**（src 目录还是空的，会报错）

## 【验收】

完成后输出：

1. 完整目录树（含新建的 8 个配置文件 + 修改的 2 个 package.json）
2. 表格列出每个文件的：
   - 路径
   - 字节数
   - 是否从招聘系统复制（Y/N/部分）
   - 如有差异，差异点说明
3. 招聘系统的 6 个源文件路径（你实际 Read 了哪些）
4. 任何无法决定的偏差（例如招聘系统某个字段你看不懂）

## 【禁止事项】

- 不要执行 `pnpm install` / `pnpm lint` / `pnpm format` / `npm` 任何命令
- 不要创建 `src/` 目录或任何业务代码
- 不要修改 `C:/Users/fmmf/Kimi/recruiting-system/` 任何文件
- 不要"自作主张"调整 ESLint 规则（如关掉某条规则、改 printWidth）
- 不要安装额外的 lint 插件
- 不要初始化 git
