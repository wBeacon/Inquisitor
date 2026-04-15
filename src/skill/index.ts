/**
 * Skill 模块 - Claude Code Skill 集成
 * 
 * 核心类：
 * - ReviewSkill: 代码审查 Skill 的主类
 * 
 * 使用方式：
 * ```typescript
 * const skill = new ReviewSkill();
 * const result = await skill.execute({
 *   mode: 'diff',
 *   formats: 'markdown,json'
 * });
 * ```
 */

export { ReviewSkill, SkillParams, SkillResult } from './review-skill';
