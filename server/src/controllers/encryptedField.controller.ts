// M0.5-3: 加密字段 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as encryptedFieldService from '../services/encryptedField.service';
import type {
  BatchDecryptInput, CreateFieldInput, DecryptInput, RotateKeyInput,
} from '../services/encryptedField.service';

export const listFields = asyncHandler(async (req: Request, res: Response) => {
  const enabledOnly = req.query.enabledOnly === 'true';
  const fields = await encryptedFieldService.listFields({ enabledOnly });
  res.json({ success: true, data: fields });
});

export const createField = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Omit<CreateFieldInput, 'description'> & { description?: string };
  const result = await encryptedFieldService.createField({
    tableName: body.tableName,
    columnName: body.columnName,
    accessRoles: body.accessRoles,
    encryptionAlgo: body.encryptionAlgo,
    description: body.description,
  });
  res.status(201).json({ success: true, data: result });
});

export const deleteField = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await encryptedFieldService.deleteField(id);
  res.json({ success: true });
});

export const decrypt = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { ciphertext: string; keyVersion?: number; recordId?: string };
  const input: DecryptInput = {
    fieldId: id,
    ciphertext: body.ciphertext,
    keyVersion: body.keyVersion,
    recordId: body.recordId,
    userId: req.user!.userId,
    userRoles: req.user!.roles,
    ipAddress: req.ip ?? null,
  };
  const result = await encryptedFieldService.decryptValue(input);
  res.json({ success: true, data: result });
});

export const decryptBatch = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { fieldId: string; records: Array<{ recordId?: string; ciphertext: string }> };
  const input: BatchDecryptInput = {
    fieldId: body.fieldId,
    records: body.records,
    userId: req.user!.userId,
    userRoles: req.user!.roles,
    ipAddress: req.ip ?? null,
  };
  const result = await encryptedFieldService.decryptBatch(input);
  res.json({ success: true, data: result });
});

export const rotateKey = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { newKeyVersion: number };
  const input: RotateKeyInput = {
    fieldId: id,
    newKeyVersion: body.newKeyVersion,
  };
  const result = await encryptedFieldService.rotateKey(input);
  res.json({ success: true, data: result });
});
