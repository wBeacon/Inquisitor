import { ReviewIssue } from '../types';

/**
 * severity 排序映射（数值越小优先级越高，用于排序）
 * critical(0) > high(1) > medium(2) > low(3)
 */
export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * false_positive 的 severity 降级映射
 * critical -> high, high -> medium, medium -> low, low -> low
 */
export const SEVERITY_DOWNGRADE: Record<string, ReviewIssue['severity']> = {
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'low',
};
