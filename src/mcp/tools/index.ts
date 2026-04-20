/**
 * tools/index.ts - MCP 工具模块统一导出
 */

export { reviewDiffSchema, handleReviewDiff } from './review-diff';
export { reviewFilesSchema, handleReviewFiles } from './review-files';
export { configureSchema, handleConfigure, getRuntimeConfig, resetRuntimeConfig, initRuntimeConfigFromPersisted } from './configure';
export { promptVersioningSchema, handlePromptVersioning } from './prompt-versioning';
export { configVersioningSchema, handleConfigVersioning } from './config-versioning';
export { healthSchema, handleHealth, buildHealthInfo } from './health';
export type { HealthInfo } from './health';
export {
  statsSchema,
  handleStats,
  getStats,
  resetStatsInternal,
  loadStatsFromDisk,
  saveStatsToDisk,
  setStatsFilePath,
  getStatsFilePath,
  STATS_FILE_NAME,
} from './stats';
export type { ReviewStats } from './stats';
export {
  persistConfig,
  loadPersistedConfig,
  validateImportConfig,
  persistConfigSync,
  getConfigFilePath,
  CONFIG_FILE_NAME,
  importConfigSchema,
} from './config-persistence';
