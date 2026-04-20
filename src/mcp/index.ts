/**
 * index.ts - MCP 模块公共导出
 *
 * 导出 createServer 工厂函数，供外部程序以库的形式集成 Inquisitor MCP Server。
 */

export { createServer } from './server';
export {
  reviewDiffSchema,
  handleReviewDiff,
  reviewFilesSchema,
  handleReviewFiles,
  configureSchema,
  handleConfigure,
  getRuntimeConfig,
  resetRuntimeConfig,
} from './tools';
