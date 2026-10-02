#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VALID_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const activeProcesses = new Set();

function isExecutable(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveCodexExecutable() {
  if (process.env.CODEX_PATH) {
    if (isExecutable(process.env.CODEX_PATH)) {
      return process.env.CODEX_PATH;
    }
    console.error(`Warning: Custom CODEX_PATH '${process.env.CODEX_PATH}' is invalid or not executable.`);
  }

  const home = os.homedir();
  const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = [];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    candidates.push(
      path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
      path.join(appData, 'npm', 'codex.cmd')
    );
  } else {
    candidates.push(
      path.join(home, '.local', 'bin', 'codex'),
      path.join(home, '.codex', 'bin', 'codex'),
      path.join(home, '.cargo', 'bin', 'codex'),
      path.join(home, '.npm-global', 'bin', 'codex'),
      '/usr/local/bin/codex',
      '/usr/bin/codex',
      '/bin/codex',
      '/snap/bin/codex',
      '/opt/homebrew/bin/codex'
    );
  }

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);
  for (const dir of pathDirs) {
    if (!dir) continue;
    const fullPath = path.join(dir, binaryName);
    if (isExecutable(fullPath)) {
      return fullPath;
    }
  }

  return binaryName;
}

const CODEX_EXE = resolveCodexExecutable();
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

function readCodexConfig() {
  try {
    if (fs.existsSync(CODEX_CONFIG_PATH)) {
      const content = fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
      const modelMatch = content.match(/^model\s*=\s*"([^"]+)"/m);
      const reasoningMatch = content.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/m);
      return {
        defaultModel: modelMatch ? modelMatch[1] : 'gpt-6.1-sol',
        defaultReasoningEffort: reasoningMatch ? reasoningMatch[1] : 'xhigh',
      };
    }
  } catch (err) {
    console.error('Error reading Codex config:', err);
  }
  return {
    defaultModel: 'gpt-6.1-sol',
    defaultReasoningEffort: 'xhigh',
  };
}

function normalizeReasoningEffort(effort, fallback = 'high') {
  if (!effort) return fallback;
  const val = String(effort).toLowerCase().trim();
  if (val === 'light') return 'low';
  if (VALID_REASONING_EFFORTS.includes(val)) return val;
  return fallback;
}

function checkAstraApproval(model, userConfirmed) {
  const isAstra = model && String(model).toLowerCase().includes('astra');
  // Strict boolean validation as recommended by Sol audit
  if (isAstra && userConfirmed !== true) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `[APPROVAL_REQUIRED] The 'astra' model is a top-tier high-resource model requiring explicit human confirmation.
Antigravity must prompt the user via an interactive choice modal (ask_question) before proceeding with Astra.
Once explicitly approved by the user, re-invoke this tool with strict boolean parameter 'user_confirmed: true'.`,
        },
      ],
    };
  }
  return null;
}

function executeCodex(args, stdinInput = null, cwd = process.cwd(), abortSignal = null) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `codex-out-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.txt`
    );

    const cleanArgs = args[0] === 'exec' ? args.slice(1) : args;
    const fullArgs = ['exec', '--skip-git-repo-check', '--ephemeral', '-o', tmpFile, ...cleanArgs];

    const child = spawn(CODEX_EXE, fullArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    activeProcesses.add(child);

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
      });
    }

    if (stdinInput) {
      child.stdin.write(stdinInput);
    }
    child.stdin.end();

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString('utf-8');
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString('utf-8');
    });

    child.on('error', (err) => {
      activeProcesses.delete(child);
      cleanup();
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `[CODEX_CLI_NOT_FOUND] Could not find executable '${CODEX_EXE}'. Please install OpenAI Codex CLI ('npm install -g @openai/codex' or https://codex.openai.com) and ensure 'codex' is in your PATH.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code, signal) => {
      activeProcesses.delete(child);
      let result = '';
      if (fs.existsSync(tmpFile)) {
        try {
          result = fs.readFileSync(tmpFile, 'utf-8').trim();
        } catch (_) {}
      }

      cleanup();

      if (!result && stdout) {
        result = stdout.trim();
      }

      if (code !== 0 || signal) {
        const errorDetail = stderr.trim() || `Process exited with code ${code || signal}`;
        resolve({
          isError: true,
          output: `Codex execution error (${code || signal}):\n${errorDetail}\n${result ? '\nPartial output:\n' + result : ''}`.trim(),
          exitCode: code,
        });
      } else {
        resolve({ isError: false, output: result, exitCode: 0 });
      }
    });

    function cleanup() {
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      } catch (_) {}
    }
  });
}

function executeCodexReview(args, cwd = process.cwd(), abortSignal = null) {
  return new Promise((resolve, reject) => {
    // Sol audit: enforce read-only sandbox on reviews as well
    const fullArgs = ['review', '--config', 'sandbox_mode="read-only"', ...args];

    const child = spawn(CODEX_EXE, fullArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    activeProcesses.add(child);

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
      });
    }

    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString('utf-8');
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString('utf-8');
    });

    child.on('error', (err) => {
      activeProcesses.delete(child);
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `[CODEX_CLI_NOT_FOUND] Could not find executable '${CODEX_EXE}'. Please install OpenAI Codex CLI ('npm install -g @openai/codex' or https://codex.openai.com) and ensure 'codex' is in your PATH.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code, signal) => {
      activeProcesses.delete(child);
      const output = stdout.trim();
      if (code !== 0 || signal) {
        const errorDetail = stderr.trim() || `Review process exited with code ${code || signal}`;
        resolve({
          isError: true,
          output: `Codex review error (${code || signal}):\n${errorDetail}\n${output ? '\nPartial review:\n' + output : ''}`.trim(),
          exitCode: code,
        });
      } else {
        resolve({
          isError: false,
          output: output || 'Codex review reported no changes or clean status.',
          exitCode: 0,
        });
      }
    });
  });
}

// Graceful cleanup on shutdown
function terminateAllProcesses() {
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch (_) {}
  }
  activeProcesses.clear();
}

process.on('SIGINT', () => {
  terminateAllProcesses();
  process.exit(0);
});

process.on('SIGTERM', () => {
  terminateAllProcesses();
  process.exit(0);
});

const server = new Server(
  {
    name: 'omniagent-cli-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const config = readCodexConfig();
  return {
    tools: [
      {
        name: 'codex_status',
        description:
          'Get the active OpenAI Codex CLI configuration, active model, reasoning effort, and governance policies (e.g. Astra approval rules).',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'codex_debug_error',
        description:
          'Consult OpenAI Codex to diagnose errors, exceptions, stack traces, or unexpected test/build failures and suggest solutions.',
        inputSchema: {
          type: 'object',
          properties: {
            error_message: {
              type: 'string',
              description: 'The exact error message or stack trace to diagnose.',
            },
            context: {
              type: 'string',
              description: 'Additional context, what command was run, expected behavior, or relevant logs.',
            },
            file_paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of file paths relevant to the failure.',
            },
            workspace_path: {
              type: 'string',
              description: 'Optional absolute path to workspace root.',
            },
            model: {
              type: 'string',
              description: `Model to use (default: "${config.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`,
            },
            reasoning_effort: {
              type: 'string',
              enum: VALID_REASONING_EFFORTS,
              description: 'Reasoning effort depth (default: "xhigh" for debugging).',
            },
            user_confirmed: {
              type: 'boolean',
              description: 'Mandatory true confirmation if using the top-tier "astra" model.',
            },
          },
          required: ['error_message'],
        },
      },
      {
        name: 'codex_analyze',
        description:
          'Perform deep architectural, dependency, and structural code analysis in read-only sandbox mode using OpenAI Codex.',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The specific question, architectural aspect, or focus area to analyze.',
            },
            file_paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of files or directories to inspect.',
            },
            workspace_path: {
              type: 'string',
              description: 'Optional absolute path to workspace root.',
            },
            model: {
              type: 'string',
              description: `Model to use (default: "${config.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`,
            },
            reasoning_effort: {
              type: 'string',
              enum: VALID_REASONING_EFFORTS,
              description: 'Reasoning effort depth (default: "high").',
            },
            user_confirmed: {
              type: 'boolean',
              description: 'Mandatory true confirmation if using the top-tier "astra" model.',
            },
          },
          required: ['task'],
        },
      },
      {
        name: 'codex_review_code',
        description:
          'Run an automated code review on uncommitted repository changes or a specific git diff using OpenAI Codex in read-only mode.',
        inputSchema: {
          type: 'object',
          properties: {
            instructions: {
              type: 'string',
              description: 'Review focus guidelines, constraints, conventions, or security/performance checks.',
            },
            scope: {
              type: 'string',
              description: 'Scope of changes: "uncommitted" (default), or base branch (e.g. "main"), or commit SHA.',
            },
            workspace_path: {
              type: 'string',
              description: 'Optional absolute path to workspace root.',
            },
            model: {
              type: 'string',
              description: `Model to use (default: "${config.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`,
            },
            reasoning_effort: {
              type: 'string',
              enum: VALID_REASONING_EFFORTS,
              description: 'Reasoning effort depth (default: "high").',
            },
            user_confirmed: {
              type: 'boolean',
              description: 'Mandatory true confirmation if using the top-tier "astra" model.',
            },
          },
        },
      },
      {
        name: 'codex_implement',
        description:
          'Request OpenAI Codex to synthesize complex code, algorithms, structural refactorings, or boilerplate in read-only sandbox mode.',
        inputSchema: {
          type: 'object',
          properties: {
            specification: {
              type: 'string',
              description: 'Detailed specification and functional requirements for the code.',
            },
            context_files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths to files that provide context, contracts, interfaces, or existing implementations.',
            },
            workspace_path: {
              type: 'string',
              description: 'Optional absolute path to workspace root.',
            },
            model: {
              type: 'string',
              description: `Model to use (default: "${config.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`,
            },
            reasoning_effort: {
              type: 'string',
              enum: VALID_REASONING_EFFORTS,
              description: 'Reasoning effort depth (default: "xhigh").',
            },
            user_confirmed: {
              type: 'boolean',
              description: 'Mandatory true confirmation if using the top-tier "astra" model.',
            },
          },
          required: ['specification'],
        },
      },
      {
        name: 'codex_consult',
        description:
          'Consult OpenAI Codex for a second opinion on an architecture plan, refactoring strategy, or technical trade-offs.',
        inputSchema: {
          type: 'object',
          properties: {
            proposal: {
              type: 'string',
              description: 'The proposed plan, architecture, or refactoring strategy to evaluate.',
            },
            specific_questions: {
              type: 'string',
              description: 'Specific concerns, trade-offs, or questions to address.',
            },
            workspace_path: {
              type: 'string',
              description: 'Optional absolute path to workspace root.',
            },
            model: {
              type: 'string',
              description: `Model to use (default: "${config.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`,
            },
            reasoning_effort: {
              type: 'string',
              enum: VALID_REASONING_EFFORTS,
              description: 'Reasoning effort depth (default: "medium").',
            },
            user_confirmed: {
              type: 'boolean',
              description: 'Mandatory true confirmation if using the top-tier "astra" model.',
            },
          },
          required: ['proposal'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const config = readCodexConfig();
  const abortSignal = extra && extra.signal;

  if (name === 'codex_status') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: isExecutable(CODEX_EXE) ? 'operational' : 'degraded_cli_missing',
              executable_path: CODEX_EXE,
              active_config: {
                model: config.defaultModel,
                reasoning_effort: config.defaultReasoningEffort,
                config_path: CODEX_CONFIG_PATH,
              },
              available_models: [
                { id: 'gpt-6.1-sol', tier: 'default', description: 'Flagship general-purpose model' },
                { id: 'gpt-6.0-sol', tier: 'standard', description: 'Previous stable flagship' },
                { id: 'luna', tier: 'fast', description: 'High-speed model for quick advice' },
                {
                  id: 'astra',
                  tier: 'top-tier',
                  description: 'Maximum depth reasoning model (Requires user confirmation)',
                },
              ],
              reasoning_effort_levels: VALID_REASONING_EFFORTS,
              governance_policy: {
                astra_requires_survey_confirmation: true,
                default_sandbox: 'read-only',
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Strict input validation
  const requestedModel = typeof args.model === 'string' && args.model.trim() ? args.model.trim() : config.defaultModel;
  const approvalCheck = checkAstraApproval(requestedModel, args.user_confirmed);
  if (approvalCheck) {
    return approvalCheck;
  }

  const workspaceCwd =
    typeof args.workspace_path === 'string' && fs.existsSync(args.workspace_path)
      ? args.workspace_path
      : process.cwd();

  const reasoningEffort = normalizeReasoningEffort(args.reasoning_effort, config.defaultReasoningEffort);

  const cliModelArgs = [
    '-c',
    `model="${requestedModel}"`,
    '-c',
    `model_reasoning_effort="${reasoningEffort}"`,
  ];

  try {
    if (name === 'codex_debug_error') {
      if (typeof args.error_message !== 'string' || !args.error_message.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Validation Error: error_message must be a non-empty string.' }],
        };
      }

      const filesContext =
        Array.isArray(args.file_paths) && args.file_paths.length > 0
          ? `\nRelevant files:\n${args.file_paths.join('\n')}`
          : '';

      const prompt = `[TASK: ROOT CAUSE ANALYSIS & DEBUGGING]
Please diagnose the following error and provide concrete root cause analysis and a step-by-step fix recommendation:

ERROR MESSAGE:
${args.error_message}

CONTEXT & DESCRIPTION:
${args.context || 'Not provided'}
${filesContext}`;

      const res = await executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, prompt],
        null,
        workspaceCwd,
        abortSignal
      );

      return {
        isError: res.isError,
        content: [{ type: 'text', text: res.output || 'No output received from Codex.' }],
      };
    }

    if (name === 'codex_analyze') {
      if (typeof args.task !== 'string' || !args.task.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Validation Error: task must be a non-empty string.' }],
        };
      }

      const filesContext =
        Array.isArray(args.file_paths) && args.file_paths.length > 0
          ? `\nTarget files:\n${args.file_paths.join('\n')}`
          : '';

      const prompt = `[TASK: ARCHITECTURAL & CODE ANALYSIS]
Please perform a detailed code and architectural analysis for the following request:

OBJECTIVE:
${args.task}
${filesContext}`;

      const res = await executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, prompt],
        null,
        workspaceCwd,
        abortSignal
      );

      return {
        isError: res.isError,
        content: [{ type: 'text', text: res.output || 'No output received from Codex.' }],
      };
    }

    if (name === 'codex_review_code') {
      const reviewArgs = [...cliModelArgs];
      const scope = typeof args.scope === 'string' ? args.scope.trim() : 'uncommitted';

      if (scope === 'uncommitted') {
        reviewArgs.push('--uncommitted');
      } else if (scope.match(/^[0-9a-f]{7,40}$/i)) {
        reviewArgs.push('--commit', scope);
      } else {
        reviewArgs.push('--base', scope);
      }

      if (typeof args.instructions === 'string' && args.instructions.trim()) {
        reviewArgs.push(args.instructions.trim());
      }

      const res = await executeCodexReview(reviewArgs, workspaceCwd, abortSignal);
      return {
        isError: res.isError,
        content: [{ type: 'text', text: res.output || 'Codex review reported clean status.' }],
      };
    }

    if (name === 'codex_implement') {
      if (typeof args.specification !== 'string' || !args.specification.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Validation Error: specification must be a non-empty string.' }],
        };
      }

      const filesContext =
        Array.isArray(args.context_files) && args.context_files.length > 0
          ? `\nContext files:\n${args.context_files.join('\n')}`
          : '';

      const prompt = `[TASK: CODE IMPLEMENTATION]
Please provide the implementation / code solution for the following specification.
Provide clean, idiomatic code with clear explanations of non-trivial logic.

SPECIFICATION:
${args.specification}
${filesContext}`;

      const res = await executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, prompt],
        null,
        workspaceCwd,
        abortSignal
      );

      return {
        isError: res.isError,
        content: [{ type: 'text', text: res.output || 'No output received from Codex.' }],
      };
    }

    if (name === 'codex_consult') {
      if (typeof args.proposal !== 'string' || !args.proposal.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Validation Error: proposal must be a non-empty string.' }],
        };
      }

      const prompt = `[TASK: SECOND OPINION & DESIGN CONSULTATION]
Please evaluate the following proposal and provide a technical critique, potential pitfalls, and alternative approaches:

PROPOSAL:
${args.proposal}

QUESTIONS:
${args.specific_questions || 'General review and risk assessment'}`;

      const res = await executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, prompt],
        null,
        workspaceCwd,
        abortSignal
      );

      return {
        isError: res.isError,
        content: [{ type: 'text', text: res.output || 'No output received from Codex.' }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Codex execution error: ${error.message}` }],
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OmniAgent MCP Server running on stdio');
}

run().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
