// M0.5-5: AI 知识库文档 service | HRMS
// CRUD + 入库自动分块 / embedding

import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import * as auditService from '../audit.service';

import * as embeddingService from './embedding.service';

export interface CreateDocumentInput {
  title: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  /** 为 true 时跳过 embedding（seed 可自行写向量） */
  skipEmbed?: boolean;
}

export interface ListDocumentsQuery {
  sourceType?: string;
  enabled?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * 创建知识库文档并自动分块 + embedding；嵌入失败抛 60111
 */
export async function createDocument(input: CreateDocumentInput) {
  const doc = await prisma.aiDocument.create({
    data: {
      title: input.title,
      sourceType: input.sourceType,
      content: input.content,
      metadata: (input.metadata ?? undefined) as object | undefined,
      createdBy: input.createdBy ?? null,
      enabled: true,
    },
  });

  if (!input.skipEmbed) {
    const chunks = embeddingService.chunkText(input.content);
    try {
      await embeddingService.storeDocumentEmbeddings(doc.id, chunks);
    } catch (err) {
      // 嵌入失败时软删文档，避免半成品
      await prisma.aiDocument.update({
        where: { id: doc.id },
        data: { deletedAt: new Date(), enabled: false },
      });
      if (err instanceof AppError) throw err;
      throw new AppError('文本嵌入失败', 500, 60111);
    }
  }

  if (input.createdBy) {
    await auditService.auditLog({
      userId: input.createdBy,
      action: auditService.AUDIT_ACTIONS.CREATE,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
      resourceId: doc.id,
      description: `创建 AI 文档: ${input.title}`,
    });
  }

  return doc;
}

/**
 * 分页列出未删除的知识库文档
 */
export async function listDocuments(query: ListDocumentsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where = {
    deletedAt: null,
    ...(query.sourceType ? { sourceType: query.sourceType } : {}),
    ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.aiDocument.count({ where }),
    prisma.aiDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        sourceType: true,
        metadata: true,
        enabled: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  return {
    data, total, page, pageSize,
  };
}

/**
 * 按 ID 获取文档（含正文）
 */
export async function getById(id: string) {
  const doc = await prisma.aiDocument.findFirst({
    where: { id, deletedAt: null },
  });
  if (!doc) {
    throw new AppError('知识库文档不存在', 404, 10100);
  }
  return doc;
}

/**
 * 软删除知识库文档
 */
export async function softDelete(id: string, userId?: string) {
  const doc = await prisma.aiDocument.findFirst({
    where: { id, deletedAt: null },
  });
  if (!doc) {
    throw new AppError('知识库文档不存在', 404, 10100);
  }
  const updated = await prisma.aiDocument.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });
  if (userId) {
    await auditService.auditLog({
      userId,
      action: auditService.AUDIT_ACTIONS.DELETE,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
      resourceId: id,
      description: `软删除 AI 文档: ${doc.title}`,
    });
  }
  return updated;
}
