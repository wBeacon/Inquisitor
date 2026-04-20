import { ReviewRequest, ReviewReport } from '../types';

/**
 * 外部 Orchestrator 配置（用于分布式执行）
 */
export interface ExternalOrchestratorConfig {
  /** 远程审查服务的基础 URL */
  baseUrl: string;
  /** 请求超时时间（毫秒），默认 60000 */
  timeout?: number;
  /** API 认证密钥（可选） */
  apiKey?: string;
}

/**
 * 外部 Orchestrator - 调用远程审查服务
 *
 * 用于分布式执行场景，通过 HTTP 将审查请求发送到远程服务，
 * 而不是在本地执行。
 */
export class ExternalOrchestrator {
  private baseUrl: string;
  private timeout: number;
  private apiKey?: string;

  constructor(config: ExternalOrchestratorConfig) {
    // 移除末尾的斜杠以保证 URL 格式一致
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 60000; // 默认 60 秒
    this.apiKey = config.apiKey;
  }

  /**
   * 向远程服务提交审查请求
   *
   * @param request 审查请求
   * @returns 审查报告
   * @throws 当远程服务返回错误时抛出
   */
  async run(request: ReviewRequest): Promise<ReviewReport> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 添加认证头（如果提供了 API 密钥）
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // 使用 AbortController + setTimeout 代替 AbortSignal.timeout()。
    // 后者仅在 Node 17.6+ 可用，为了在更广泛的 Node 版本下工作，
    // 并且 finally 中能清理定时器，避免 timer 泄漏。
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(`${this.baseUrl}/api/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `External orchestrator failed: ${response.status} ${response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Failed to connect to external orchestrator at ${this.baseUrl}: ${error.message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
