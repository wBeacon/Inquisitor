import {
  ReviewDimension,
  ReviewRequest,
  ReviewReport,
} from '../types';
import { GitDiffCollector, FileCollector } from '../input';
import { ReviewOrchestrator, OrchestratorConfig } from '../orchestrator';
import { ReportGenerator, GeneratorConfig } from '../output';
import { loadConfig, InquisitorConfig } from './config-loader';
import { ProgressReporter } from './progress-reporter';

/**
 * Skill 命令参数
 */
export interface SkillParams {
  /** 审查模式：'diff'（git diff）、'file'（单文件）、'directory'（目录） */
  mode: 'diff' | 'file' | 'directory';
  /** 文件路径或目录路径 */
  path?: string;
  /** 指定审查维度（逗号分隔） */
  dimensions?: string;
  /** 输出格式（逗号分隔）：json、markdown */
  formats?: string;
  /** 是否启用对抗审查 */
  enableAdversary?: boolean;
  /** 项目根目录 */
  projectRoot?: string;
  /** 输出目录 */
  outputDir?: string;
  /** 最低严重程度阈值，低于此阈值的问题不报告 */
  severityThreshold?: string;
}

/**
 * Skill 结果
 */
export interface SkillResult {
  success: boolean;
  report?: ReviewReport;
  message: string;
  error?: string;
  reportFiles?: string[];
}

/**
 * ReviewSkill - 代码审查 Claude Code Skill
 * 将整个审查引擎封装为可调用的 Skill
 */
export class ReviewSkill {
  private orchestrator: ReviewOrchestrator;
  private reportGenerator: ReportGenerator;
  private gitDiffCollector: GitDiffCollector;
  private fileCollector: FileCollector;

  constructor(
    orchestratorConfig?: OrchestratorConfig,
    generatorConfig?: GeneratorConfig
  ) {
    this.orchestrator = new ReviewOrchestrator(orchestratorConfig);
    this.reportGenerator = new ReportGenerator(generatorConfig);
    this.gitDiffCollector = new GitDiffCollector();
    this.fileCollector = new FileCollector();
  }

  /**
   * 执行代码审查 Skill
   */
  async execute(params: SkillParams): Promise<SkillResult> {
    const progress = new ProgressReporter();

    try {
      // 验证参数
      this.validateParams(params);

      // 加载项目配置
      const projectRoot = params.projectRoot || './';
      const config = loadConfig(projectRoot);

      // 合并 config 和 params：params 优先级高于 config
      const mergedDimensions = params.dimensions || (config.dimensions ? config.dimensions.join(',') : undefined);
      const mergedFormats = params.formats || (config.formats ? config.formats.join(',') : undefined);
      const mergedSeverityThreshold = params.severityThreshold || config.severityThreshold;

      // 如果有 severityThreshold，传入编排器配置
      if (mergedSeverityThreshold) {
        const currentConfig = this.orchestrator.getConfig();
        // 重新构建编排器以应用新的 severityThreshold
        this.orchestrator = new ReviewOrchestrator({
          ...currentConfig,
          severityThreshold: mergedSeverityThreshold,
        });
      }

      // 采集阶段
      progress.onPhase('collecting');
      const request = await this.buildReviewRequest(
        { ...params, dimensions: mergedDimensions },
        config
      );

      // 审查阶段
      progress.onPhase('reviewing');
      console.log(`开始代码审查，模式: ${params.mode}`);
      const report = await this.orchestrator.run(request);

      // 报告阶段
      progress.onPhase('reporting');
      const formatList = this.parseFormats(mergedFormats || 'markdown');
      const reportFiles = await this.generateReports(report, params.outputDir, formatList);

      // 完成
      progress.onPhase('done');

      return {
        success: true,
        report,
        message: `审查完成，发现 ${report.summary.totalIssues} 个问题`,
        reportFiles,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: '审查执行失败',
        error: errorMessage,
      };
    }
  }

  /**
   * 验证参数
   */
  private validateParams(params: SkillParams): void {
    if (!params.mode || !['diff', 'file', 'directory'].includes(params.mode)) {
      throw new Error('无效的审查模式，必须为: diff, file, directory');
    }

    if ((params.mode === 'file' || params.mode === 'directory') && !params.path) {
      throw new Error(`${params.mode} 模式需要指定 path 参数`);
    }

    if (params.dimensions) {
      const validDimensions = Object.values(ReviewDimension);
      const requestedDimensions = params.dimensions.split(',').map((d) => d.trim());

      for (const dim of requestedDimensions) {
        if (!validDimensions.includes(dim as ReviewDimension)) {
          throw new Error(
            `无效的审查维度: ${dim}，有效的维度: ${validDimensions.join(', ')}`
          );
        }
      }
    }

    if (params.formats) {
      const validFormats = ['json', 'markdown'];
      const requestedFormats = params.formats.split(',').map((f) => f.trim());

      for (const fmt of requestedFormats) {
        if (!validFormats.includes(fmt)) {
          throw new Error(
            `无效的输出格式: ${fmt}，有效的格式: ${validFormats.join(', ')}`
          );
        }
      }
    }
  }

  /**
   * 构建审查请求
   * @param params Skill 参数
   * @param config 项目配置（包含 ignore 模式等）
   */
  private async buildReviewRequest(params: SkillParams, config: InquisitorConfig): Promise<ReviewRequest> {
    const projectRoot = params.projectRoot || './';
    const ignorePatterns = config.ignore;

    let files;
    let diff;

    if (params.mode === 'diff') {
      // 从 git diff 获取文件列表
      files = await this.gitDiffCollector.collect();
      diff = undefined; // Will be populated from file diffs
    } else if (params.mode === 'file') {
      // 单个文件，传入 ignore 模式
      files = await this.fileCollector.collect(params.path!, ignorePatterns);
    } else {
      // 目录，传入 ignore 模式
      files = await this.fileCollector.collect(params.path!, ignorePatterns);
    }

    // 解析审查维度
    const dimensions = params.dimensions
      ? (params.dimensions.split(',').map((d) => d.trim()) as ReviewDimension[])
      : undefined;

    return {
      files,
      diff,
      dimensions,
      context: {
        contextLines: 50,
        includeFullFile: true,
        includeDependencies: true,
        projectRoot,
      },
      mode: 'review',
    };
  }

  /**
   * 解析输出格式
   */
  private parseFormats(formatString: string): Array<'json' | 'markdown'> {
    return formatString
      .split(',')
      .map((f) => f.trim() as 'json' | 'markdown')
      .filter((f) => f === 'json' || f === 'markdown');
  }

  /**
   * 生成报告文件
   */
  private async generateReports(
    report: ReviewReport,
    outputDir?: string,
    formats?: Array<'json' | 'markdown'>
  ): Promise<string[]> {
    if (!outputDir || !formats || formats.length === 0) {
      return [];
    }

    const generator = new ReportGenerator({ formats });
    await generator.toFile(report, outputDir, 'review');

    // 返回生成的文件列表
    return formats.map((fmt) => `review-report.${fmt === 'markdown' ? 'md' : fmt}`);
  }

  /**
   * 获取 Skill 帮助信息
   */
  static getHelpText(): string {
    return `
# 代码审查 Skill

## 用法

\`\`\`
/review [选项] [路径]
\`\`\`

## 模式

- \`/review\` - 审查 git diff（默认）
- \`/review path/to/file.ts\` - 审查单个文件（裸路径自动识别为文件模式）
- \`/review --full src/\` - 审查整个目录

## 选项

- \`--fast\` - 跳过对抗审查阶段，加速审查
- \`--full <path>\` - 全目录扫描模式 (directory mode)
- \`--formats <formats>\` - 输出格式（逗号分隔），可选值：json, markdown（默认: markdown）
- \`--dimensions <dims>\` - 审查维度（逗号分隔），可选值：logic, security, performance, maintainability, edge_cases

## 配置文件

项目根目录下可放置 \`.inquisitor.json\` 配置文件：

\`\`\`json
{
  "ignore": ["**/*.test.ts", "node_modules/**"],
  "rules": { "maxFileSize": 100000 },
  "severityThreshold": "medium",
  "dimensions": ["logic", "security"]
}
\`\`\`

## 示例

审查最近的 git 变更：
\`\`\`
/review
\`\`\`

审查单个文件：
\`\`\`
/review src/app.ts
\`\`\`

快速审查（跳过对抗阶段）：
\`\`\`
/review --fast src/app.ts
\`\`\`

审查目录，生成 JSON 和 Markdown 报告：
\`\`\`
/review --full src/ --formats json,markdown
\`\`\`

仅关注安全维度审查：
\`\`\`
/review --dimensions security src/app.ts
\`\`\`
    `;
  }
}
