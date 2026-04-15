/**
 * 维度审查 Agent 系统 - 实现多个独立的审查 Agent
 * 
 * 架构设计：
 * 1. AgentRunner: 基础抽象类，定义 Agent 执行接口
 * 2. 五个维度 Agent: LogicAgent、SecurityAgent、PerformanceAgent、MaintainabilityAgent、EdgeCaseAgent
 * 3. AdversaryAgent: 对抗式审查，以全新视角寻找遗漏问题和质疑误报
 * 4. IssueCalibrtor: 根据对抗审查结果调整置信度和去重
 * 
 * 典型用法：
 * ```typescript
 * // 并行执行所有维度 Agent
 * const dimensionAgents = [
 *   new LogicAgent(),
 *   new SecurityAgent(),
 *   new PerformanceAgent(),
 *   new MaintainabilityAgent(),
 *   new EdgeCaseAgent(),
 * ];
 * 
 * const dimensionResults = await Promise.all(
 *   dimensionAgents.map(agent => agent.review(files, context))
 * );
 * 
 * const allIssues = dimensionResults.flatMap(r => r.issues);
 * 
 * // 运行对抗审查
 * const adversary = new AdversaryAgent();
 * const adversaryResult = await adversary.challenge(files, context, allIssues);
 * 
 * // 调整问题
 * const calibrator = new IssueCalibrtor();
 * const finalIssues = calibrator.calibrate(allIssues, adversaryResult);
 * ```
 */

export { AgentRunner } from './agent-runner';
export { LogicAgent } from './logic-agent';
export { SecurityAgent } from './security-agent';
export { PerformanceAgent } from './performance-agent';
export { MaintainabilityAgent } from './maintainability-agent';
export { EdgeCaseAgent } from './edge-case-agent';
export { AdversaryAgent, type IssueJudgment, type AdversaryReviewResponse } from './adversary-agent';
export { IssueCalibrtor } from './issue-calibrator';
export * from './prompts';
