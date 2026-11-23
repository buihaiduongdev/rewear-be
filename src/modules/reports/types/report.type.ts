import type {
  REPORT_ACTION,
  REPORT_MEASURE,
  REPORT_OUTCOME,
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_TARGET,
} from '../constants/report.constant';

export type ReportTargetType =
  (typeof REPORT_TARGET)[keyof typeof REPORT_TARGET];
export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];
export type ReportReason = (typeof REPORT_REASON)[keyof typeof REPORT_REASON];
export type ReportOutcome =
  (typeof REPORT_OUTCOME)[keyof typeof REPORT_OUTCOME];
export type ReportMeasure =
  (typeof REPORT_MEASURE)[keyof typeof REPORT_MEASURE];
export type ReportAction = (typeof REPORT_ACTION)[keyof typeof REPORT_ACTION];
export type ReportTargetSnapshot = {
  type: ReportTargetType;
  id: string;
  shopId: string;
  label: string;
  contextOrderId: string | null;
};
export type CreateReportInput = {
  requestId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description: string;
  evidenceIds: string[];
};
export type ReportQuery = {
  limit: number;
  offset: number;
  status?: ReportStatus;
  targetType?: ReportTargetType;
};
export type ReportSupplementInput = {
  requestId: string;
  text: string;
  evidenceIds: string[];
};
export type ClaimReportInput = { requestId: string; expectedVersion: number };
export type ResolveReportInput = ClaimReportInput & {
  outcome: ReportOutcome;
  action: ReportMeasure;
  reason: string;
  adminNote: string;
  expectedTargetVersion?: number;
};
