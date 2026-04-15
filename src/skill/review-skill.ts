import {
  ReviewDimension,
  ReviewRequest,
  ReviewReport,
} from '../types';
import { GitDiffCollector, FileCollector } from '../input';
import { ReviewOrchestrator, OrchestratorConfig } from '../orchestrator';
import { ReportGenerator, GeneratorConfig } from '../output';

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
    try {
      // 验证参数
      this.validateParams(params);

      // 构建审查请求
      const request = await this.buildReviewRequest(params);

      // 执行审查
      console.log(`开始代码审查，模式: ${params.mode}`);
      const report = await this.orchestrator.run(request);

      // 生成报告
      const formatList = this.parseFormats(params.formats || 'markdown');
      const reportFiles = await this.generateReports(report, params.outputDir, formatList);

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
   */
  private async buildReviewRequest(params: SkillParams): Promise<ReviewRequest> {
    const projectRoot = params.projectRoot || './';

    let files;
    let diff;

    if (params.mode === 'diff') {
      // 从 git diff 获取文件列表
      files = await this.gitDiffCollector.collect();
      diff = undefined; // Will be populated from file diffs
    } else if (params.mode === 'file') {
      // 单个文件
      files = await this.fileCollector.collect(params.path!);
    } else {
      // 目录
      files = await this.fileCollector.collect(params.path!);
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
/review [模式] [选项]
\`\`\`

## 模式

- \`diff\` - 审查 git diff（默认）
- \`file\` - 审查单个文件
- \`directory\` - 审查整个目录

## 选项

- \`--path\` - 文件或目录路径（file/directory 模式必需）
- \`--dimensions\` - 审查维度（逗号分隔），可选值：logic, security, performance, maintainability, edge_cases
- \`--formats\` - 输出格式（逗号分隔），可选值：json, markdown（默认: markdown）
- \`--enable-adversary\` - 启用对抗审查（默认: true）
- \`--project-root\` - 项目根目录（默认: ./）
- \`--output-dir\` - 输出目录

## 示例

审查最近的 git 变更：
\`\`\`
/review diff
\`\`\`

审查单个文件：
\`\`\`
/review file --path src/app.ts
\`\`\`

审查目录，仅关注安全问题：
\`\`\`
/review directory --path src --dimensions security
\`\`\`

审查并生成 JSON 和 Markdown 报告：
\`\`\`
/review diff --formats json,markdown --output-dir ./reports
\`\`\`
    `;
  }
}
