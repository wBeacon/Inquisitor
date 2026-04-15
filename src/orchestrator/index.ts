/**
 * 编排器模块 - 协调完整的代码审查流程
 * 
 * 核心类：
 * - ReviewOrchestrator: 主编排器，负责流程协调
 * 
 * 使用方式：
 * ```typescript
 * const orchestrator = new ReviewOrchestrator({ enableAdversary: true });
 * const report = await orchestrator.run(reviewRequest);
 * ```
 */

export { ReviewOrchestrator, OrchestratorConfig } from './review-orchestrator';
