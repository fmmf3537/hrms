// M0.5-3: 加密字段 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import * as encryptedFieldController from '../controllers/encryptedField.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate);

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

router.get('/', validate(listFieldsSchema, 'query'), encryptedFieldController.listFields);
router.post('/', validate(createFieldSchema), encryptedFieldController.createField);
router.delete('/:id', encryptedFieldController.deleteField);
router.post('/:id/decrypt', validate(decryptSchema), encryptedFieldController.decrypt);
router.post('/decrypt-batch', validate(decryptBatchSchema), encryptedFieldController.decryptBatch);
router.post('/:id/rotate-key', validate(rotateKeySchema), encryptedFieldController.rotateKey);

export default router;
