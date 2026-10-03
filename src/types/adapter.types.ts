export interface AdapterProbeResult {
  id?: string;
  name?: string;
  installed: boolean;
  command?: string;
  version?: string;
  path?: string;
  config?: any;
  configPath?: string;
  availableModels?: string[];
  supportedReasoningEfforts?: string[];
  authStatus?: string;
  authMethod?: string;
  activeAccount?: string;
  account?: string;
  loginHint?: string;
}

export interface ExecutionResult {
  isError: boolean;
  output: string;
  errorDetail?: string;
  threadId?: string | null;
  exitCode?: number | null;
}

export interface ExecutionOptions {
  cwd?: string;
  model?: string;
  reasoningEffort?: string;
  abortSignal?: AbortSignal;
  onProgress?: (info: { message?: string; percent?: number }) => void;
  threadId?: string | null;
  userConfirmed?: boolean;
}

export interface ProgressReporter {
  (info: { message?: string; percent?: number }): void;
}

export interface CliAdapter {
  id: string;
  name: string;
  probe(): Promise<AdapterProbeResult>;
  execute(prompt: string, options?: ExecutionOptions): Promise<ExecutionResult>;
}
