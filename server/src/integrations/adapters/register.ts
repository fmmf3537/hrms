// M0.5-4/M0.5-5: 注册所有 adapter | HRMS
import { registerAdapter } from '../adapter.interface';

import { EmailAdapter } from './email.adapter';
import { EsignAdapter } from './esign.adapter';
import { LlmAdapter } from './llm.adapter';
import { MapAdapter } from './map.adapter';
import { OcrAdapter } from './ocr.adapter';
import { SmsAdapter } from './sms.adapter';

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;
  registerAdapter('esign', EsignAdapter);
  registerAdapter('sms', SmsAdapter);
  registerAdapter('email', EmailAdapter);
  registerAdapter('llm', LlmAdapter);
  registerAdapter('ocr', OcrAdapter);
  registerAdapter('map', MapAdapter);
  registered = true;
}
