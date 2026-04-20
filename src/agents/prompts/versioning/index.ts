/**
 * Prompt Versioning Module - 导出入口
 *
 * 包含版本管理、A/B测试、快照归档和版本选择功能
 */

// 核心类型导出
export { VersionedPrompt } from './types';
export { PromptVersionMetadata } from './types';
export { PromptVersionMetrics } from './types';
export { PromptVersionListItem } from './types';
export { VersionSelectionStrategy } from './types';
export { VersionSelectionResult } from './types';
export { VersionComparison } from './types';
export { VersionRollbackRequest } from './types';
export { VersionRollbackResult } from './types';
export { VersionQueryOptions } from './types';
export { VersionQueryResult } from './types';
export { VersionedPromptRegistry } from './types';
export { PromptVersioningConfig } from './types';

// 版本管理器
export { PromptVersioningManager } from './prompt-versioning-manager';

// A/B 测试管理器及类型
export { ABTestConfig } from './ab-test-manager';
export { ABTestAssignment } from './ab-test-manager';
export { ABTestObservation } from './ab-test-manager';
export { ABTestStatistics } from './ab-test-manager';
export { VersionPerformanceReport } from './ab-test-manager';
export { ABTestManager } from './ab-test-manager';

// 版本选择器
export { VersionSelector } from './version-selector';

// 快照归档系统
export { PromptSnapshot } from './prompt-archive';
export { SnapshotQueryOptions } from './prompt-archive';
export { SnapshotQueryResult } from './prompt-archive';
export { PerformanceAggregation } from './prompt-archive';
export { PromptArchive } from './prompt-archive';
