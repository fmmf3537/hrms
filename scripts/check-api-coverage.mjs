/**
 * Purpose: Verify that the generated Postman collection covers the OpenAPI operations.
 * Usage: node scripts/check-api-coverage.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENAPI_PATH = path.join(ROOT_DIR, 'docs', 'openapi.yaml');
const COLLECTION_PATH = path.join(ROOT_DIR, 'postman', 'hrms-api.postman_collection.json');

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
        isPublic: false,
      };
      pathOperationSeen = true;
      operations.push(currentOperation);
      continue;
    }

    if (!currentOperation) {
      continue;
    }

    if (/^      security:\s*\[\s*\]\s*$/.test(line)) {
      currentOperation.isPublic = true;
    }
  }

  return operations;
}

function operationKey(operation) {
  return `${operation.method} ${operation.path}`;
}

function collectRequestItems(items) {
  const requests = [];

  for (const item of items) {
    if (Array.isArray(item.item)) {
      requests.push(...collectRequestItems(item.item));
    }

    if (item.request && item.request.url) {
      requests.push(item);
    }
  }

  return requests;
}

function requestKey(item) {
  const method = String(item.request.method).toLowerCase();
  const url = item.request.url;
  let segments;

  if (Array.isArray(url.path) && url.path.length > 0) {
    segments = url.path;
  } else {
    const raw = String(url.raw || '').replace(/^\{\{baseUrl\}\}/, '');
    segments = raw.split('/').filter(Boolean);
  }

  const normalizedPath = segments
    .map((segment) => {
      if (segment.startsWith(':') && segment.length > 1) {
        return `{${segment.slice(1)}}`;
      }
      return segment;
    })
    .join('/');

  return `${method} /${normalizedPath}`;
}

try {
  const openapiText = readFileSync(OPENAPI_PATH, 'utf8');
  const openapiOperations = extractOperations(openapiText);
  const collection = JSON.parse(readFileSync(COLLECTION_PATH, 'utf8'));
  const collectionRequests = collectRequestItems(collection.item || []);
  const openapiKeys = new Set(openapiOperations.map(operationKey));
  const collectionKeys = new Set(collectionRequests.map(requestKey));
  const missing = [...openapiKeys].filter((key) => !collectionKeys.has(key)).sort();
  const extra = [...collectionKeys].filter((key) => !openapiKeys.has(key)).sort();

  if (missing.length > 0 || extra.length > 0) {
    if (missing.length > 0) {
      console.log(`Missing from collection (${missing.length}):`);
      for (const key of missing) {
        console.log(`  ${key}`);
      }
    }
    if (extra.length > 0) {
      console.log(`Missing from OpenAPI (${extra.length}):`);
      for (const key of extra) {
        console.log(`  ${key}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log(`Coverage: ${openapiKeys.size}/${openapiKeys.size} (100%)`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
