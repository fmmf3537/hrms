// M0.5-4: 注册所有 adapter | HRMS
import { registerAdapter } from '../adapter.interface';

import { EmailAdapter } from './email.adapter';
import { EsignAdapter } from './esign.adapter';
import { LlmAdapter } from './llm.adapter';
import { SmsAdapter } from './sms.adapter';

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;
  registerAdapter('esign', EsignAdapter);
  registerAdapter('sms', SmsAdapter);
  registerAdapter('email', EmailAdapter);
  registerAdapter('llm', LlmAdapter);
  // ocr / map 待 M0.5-5 接入
  registered = true;
}
