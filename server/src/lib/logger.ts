// 结构化日志（M5-11: V1.2 §6.2 日志升级，pino 替代裸 console/morgan）
// 分层：
//   - development：pino-pretty 可读输出（stdout）
//   - production：JSON 输出到 stdout（docker logs 收集）；设 LOG_FILE 时同时落盘
//     （容器挂载 server/logs 卷，宿主机 logrotate 轮转）
//   - test：JSON stdout（vitest NODE_ENV=test 自动走此分支，无副作用）
import pino, { type Logger } from 'pino';

import { env } from './env';

const LOG_FILE = process.env.LOG_FILE ?? '';
const level = (process.env.LOG_LEVEL as pino.Level | undefined)
  ?? (env.NODE_ENV === 'development' ? 'debug' : 'info');

function createLogger(): Logger {
  const base = {
    level,
    base: { service: 'hrms-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  // 落盘模式：文件 + stdout 双写（不 prettify，保证文件为结构化 JSON）
  if (LOG_FILE) {
    return pino(base, pino.multistream([
      { stream: pino.destination({ dest: LOG_FILE, sync: false }) },
      { stream: pino.destination(1) },
    ]));
  }
  // 本地开发：human-readable
  if (env.NODE_ENV === 'development') {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    });
  }
  // 生产 / 测试：JSON stdout
  return pino(base);
}

export const logger: Logger = createLogger();

export default logger;
