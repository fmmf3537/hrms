// M0.5-4: 第三方对接 Adapter 接口 | HRMS
// 统一抽象：所有外部服务都实现 send/test/sync 三个方法
// 实际接入由各 adapter 内部处理（fetch / SDK / webhook 等）

export type IntegrationType = 'http_api' | 'webhook' | 'database' | 'file';

export interface AdapterResult {
  success: boolean;
  recordCount?: number;
  data?: unknown; // 外部服务返回数据
  error?: string;
  duration?: number; // 毫秒
}

export interface TestResult {
  success: boolean;
  error?: string;
  latency?: number; // 毫秒
}

/**
 * Adapter 基础接口
 * 实际 adapter 继承此接口 + 实现具体逻辑
 */
export interface IAdapter {
  /** Adapter code，必须与 Integration.code 唯一对应 */
  readonly code: string;
  /** Adapter 类型，决定后续调度策略 */
  readonly type: IntegrationType;

  /**
   * 发送 / 调用
   * @param payload 业务参数（如短信内容、电子签文件）
   * @param config 集成配置（含 endpoint / API key 等）
   */
  send(payload: unknown, config: Record<string, unknown>): Promise<AdapterResult>;

  /**
   * 测试连通性
   * 不传业务参数，只验证凭证有效 + 网络可达
   */
  testConnection(config: Record<string, unknown>): Promise<TestResult>;

  /**
   * 主动同步（拉取外部数据）
   * M0.5-4 阶段先不实现，返回 success
   */
  sync(config: Record<string, unknown>): Promise<AdapterResult>;
}

/**
 * Adapter 注册表
 * 启动时由 integration.service 加载，业务调用时按 code 路由
 */
const adapterRegistry = new Map<string, new() => IAdapter>();

export function registerAdapter(code: string, ctor: new () => IAdapter): void {
  adapterRegistry.set(code, ctor);
}

export function getAdapter(code: string): IAdapter | null {
  const ctor = adapterRegistry.get(code);
  // eslint-disable-next-line new-cap
  return ctor ? new ctor() : null;
}

export function listAdapterCodes(): string[] {
  return [...adapterRegistry.keys()];
}
