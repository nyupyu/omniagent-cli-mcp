export interface BugReportOptions {
  errorMessage?: string;
  context?: string;
  doctorReport?: any;
}

export interface BugReportResult {
  title: string;
  body: string;
  issueUrl: string;
  prompt: string;
}
