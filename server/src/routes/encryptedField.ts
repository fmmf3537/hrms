// M0.5-3: 加密字段 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as encryptedFieldController from '../controllers/encryptedField.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listFieldsSchema = z.object({
  enabledOnly: z.coerce.boolean().default(false),
});

const createFieldSchema = z.object({
  tableName: z.string().min(1).max(100),
  columnName: z.string().min(1).max(100),
  accessRoles: z.array(z.string().min(1)).min(1).max(20),
  encryptionAlgo: z.string().min(1).max(50).optional(),
  description: z.string().max(1000).optional(),
});

const decryptSchema = z.object({
  ciphertext: z.string().min(1).max(5000),
  keyVersion: z.number().int().min(1).max(100)
    .optional(),
  recordId: z.string().uuid().optional(),
});

const decryptBatchSchema = z.object({
  fieldId: z.string().uuid(),
  records: z
    .array(
      z.object({
        recordId: z.string().uuid().optional(),
        ciphertext: z.string().min(1).max(5000),
      }),
    )
    .min(1)
    .max(100),
});

const rotateKeySchema = z.object({
  newKeyVersion: z.number().int().min(2).max(100),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.ENCRYPTED_FIELD_READ),
  validate(listFieldsSchema, 'query'),
  encryptedFieldController.listFields,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.ENCRYPTED_FIELD_WRITE),
  validate(createFieldSchema),
  encryptedFieldController.createField,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.ENCRYPTED_FIELD_WRITE),
  encryptedFieldController.deleteField,
);
router.post(
  '/:id/decrypt',
  requirePermission(PERMISSIONS.ENCRYPTED_FIELD_DECRYPT),
  validate(decryptSchema),
  encryptedFieldController.decrypt,
);
router.post(
  '/decrypt-batch',
  requirePermission(PERMISSIONS.ENCRYPTED_FIELD_DECRYPT),
  validate(decryptBatchSchema),
  encryptedFieldController.decryptBatch,
);
router.post(
  '/:id/rotate-key',
  requirePermission(PERMISSIONS.ENCRYPTED_FIELD_ROTATE),
  validate(rotateKeySchema),
  encryptedFieldController.rotateKey,
);

export default router;
