/**
 * Purpose: Generate the HRMS Postman collection from the OpenAPI contract.
 * Usage: node scripts/build-postman-collection.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENAPI_PATH = path.join(ROOT_DIR, 'docs', 'openapi.yaml');
const OUTPUT_PATH = path.join(ROOT_DIR, 'postman', 'hrms-api.postman_collection.json');
const OUTPUT_RELATIVE_PATH = path.relative(ROOT_DIR, OUTPUT_PATH).split(path.sep).join('/');

function extractOperations(openapiText) {
  const operations = [];
  let inPaths = false;
  let currentPath = '';
  let pathOperationSeen = false;
  let currentOperation = null;

  for (const line of openapiText.split(/\r?\n/)) {
    if (line === 'paths:') {
      inPaths = true;
      continue;
    }

    if (inPaths && line && !/^\s/.test(line)) {
      inPaths = false;
    }

    if (!inPaths) {
      continue;
    }

    const pathMatch = line.match(/^  (\/\S+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      pathOperationSeen = false;
      currentOperation = null;
      continue;
    }

    const methodMatch = line.match(/^    (get|post|patch|put|delete):\s*$/);
    if (methodMatch && currentPath && !pathOperationSeen) {
      currentOperation = {
        method: methodMatch[1],
        path: currentPath,
        tag: null,
        summary: null,
        isPublic: false,
        hasBody: false,
      };
      pathOperationSeen = true;
      operations.push(currentOperation);
      continue;
    }

    if (!currentOperation) {
      continue;
    }

    const tagMatch = line.match(/^      tags:\s*(.*?)\s*$/);
    if (tagMatch) {
      const firstTag = tagMatch[1]
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '');
      currentOperation.tag = firstTag || null;
      continue;
    }

    const summaryMatch = line.match(/^      summary:\s*(.*?)\s*$/);
    if (summaryMatch) {
      let summary = summaryMatch[1].trim();
      const quote = summary[0];
      if ((quote === '"' || quote === "'") && summary.at(-1) === quote) {
        summary = summary.slice(1, -1);
      }
      currentOperation.summary = summary || null;
      continue;
    }

    if (/^      security:\s*\[\s*\]\s*$/.test(line)) {
      currentOperation.isPublic = true;
      continue;
    }

    if (/^      requestBody:\s*$/.test(line)) {
      currentOperation.hasBody = true;
    }
  }

  return operations;
}

function comparePaths(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function buildUrl(pathname) {
  const pathSegments = [];
  const variables = [];

  for (const segment of pathname.split('/').filter(Boolean)) {
    const parameterMatch = segment.match(/^\{([^}]+)\}$/);
    if (parameterMatch) {
      const key = parameterMatch[1];
      pathSegments.push(`:${key}`);
      variables.push({ key, value: '' });
    } else {
      pathSegments.push(segment);
    }
  }

  return {
    raw: `{{baseUrl}}/${pathSegments.join('/')}`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
    variable: variables,
  };
}

function buildTokenEvent() {
  return [
    {
      listen: 'test',
      script: {
        exec: [
          'const response = pm.response.json();',
          'if (response && response.data) {',
          '  if (response.data.accessToken) {',
          '    pm.collectionVariables.set("accessToken", response.data.accessToken);',
          '  }',
          '  if (response.data.refreshToken) {',
          '    pm.collectionVariables.set("refreshToken", response.data.refreshToken);',
          '  }',
          '}',
        ],
      },
    },
  ];
}

function buildRequest(operation) {
  const request = {
    method: operation.method.toUpperCase(),
    header: [],
    url: buildUrl(operation.path),
  };

  if (operation.isPublic) {
    request.auth = { type: 'noauth' };
  }

  if (operation.hasBody) {
    // 特殊端点给出可用 body（直接配合环境变量跑通）；其余一律占位，字段见 docs/api-spec.md
    let raw = '{\n\n}';
    if (operation.path === '/auth/login') {
      raw = '{\n  "username": "{{username}}",\n  "password": "{{password}}"\n}';
    } else if (operation.path === '/auth/refresh') {
      raw = '{\n  "refreshToken": "{{refreshToken}}"\n}';
    } else if (operation.path === '/auth/change-password') {
      raw = '{\n  "oldPassword": "{{password}}",\n  "newPassword": "NewPass@123"\n}';
    }
    request.body = {
      mode: 'raw',
      raw,
      options: { raw: { language: 'json' } },
    };
  }

  const item = {
    name: operation.summary || `${operation.method.toUpperCase()} ${operation.path}`,
    request,
  };

  if (operation.path === '/auth/login' || operation.path === '/auth/refresh') {
    item.event = buildTokenEvent();
  }

  return item;
}

function buildCollection(operations) {
  const groups = new Map();

  for (const operation of operations) {
    const tag = operation.tag || '其他';
    if (!groups.has(tag)) {
      groups.set(tag, []);
    }
    groups.get(tag).push(operation);
  }

  const items = [];
  for (const [tag, group] of groups) {
    group.sort((left, right) => comparePaths(left.path, right.path));
    items.push({
      name: tag,
      item: group.map(buildRequest),
    });
  }

  return {
    info: {
      name: 'HRMS API',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [
        {
          key: 'token',
          value: '{{accessToken}}',
          type: 'string',
        },
      ],
    },
    item: items,
    variable: [
      { key: 'accessToken', value: '' },
      { key: 'refreshToken', value: '' },
    ],
  };
}

const openapiText = readFileSync(OPENAPI_PATH, 'utf8');
const operations = extractOperations(openapiText);
if (operations.length === 0) {
  throw new Error('No OpenAPI operations found');
}

const collection = buildCollection(operations);
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Generated ${operations.length} requests in ${collection.item.length} folders → ${OUTPUT_RELATIVE_PATH}`);
