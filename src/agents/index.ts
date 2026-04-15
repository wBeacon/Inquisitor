/**
 * 维度审查 Agent 系统 - 实现多个独立的审查 Agent
 * 
 * 架构设计：
 * 1. AgentRunner: 基础抽象类，定义 Agent 执行接口
 * 2. 五个维度 Agent: LogicAgent、SecurityAgent、PerformanceAgent、MaintainabilityAgent、EdgeCaseAgent
 * 3. 每个 Agent 拥有独立的 system prompt 和审查策略
 * 4. 支持并行执行，通过 Promise.all() 实现高效的多维度审查
 * 
 * 典型用法：
 * ```typescript
 * const agents = [
 *   new LogicAgent(),
 *   new SecurityAgent(),
 *   new PerformanceAgent(),
 *   new MaintainabilityAgent(),
 *   new EdgeCaseAgent(),
 * ];
 * 
 * const results = await Promise.all(
 *   agents.map(agent => agent.review(files, context))
 * );
 * ```
 */

export { AgentRunner } from './agent-runner';
export { LogicAgent } from './logic-agent';
export { SecurityAgent } from './security-agent';
export { PerformanceAgent } from './performance-agent';
export { MaintainabilityAgent } from './maintainability-agent';
export { EdgeCaseAgent } from './edge-case-agent';
export * from './prompts';
