#!/usr/bin/env node
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let _modelcontextprotocol_sdk_server_stdio_js = require("@modelcontextprotocol/sdk/server/stdio.js");
let _modelcontextprotocol_sdk_server_index_js = require("@modelcontextprotocol/sdk/server/index.js");
let _modelcontextprotocol_sdk_types_js = require("@modelcontextprotocol/sdk/types.js");
let fs = require("fs");
fs = __toESM(fs);
let os = require("os");
os = __toESM(os);
let path = require("path");
path = __toESM(path);
let child_process = require("child_process");
let crypto = require("crypto");
crypto = __toESM(crypto);
//#region src/services/progress.service.ts
/**
* Returns a human-readable stage description based on elapsed time and task type.
*/
function getProgressStage(elapsed, type = "general", _backend = "Agent") {
	let stage = "Active";
	if (type === "review") {
		if (elapsed < 6) stage = "Collecting git diff & initializing sandbox";
		else if (elapsed < 18) stage = "Analyzing code changes & AST impact";
		else if (elapsed < 40) stage = "Deep reasoning & security audit";
		else if (elapsed < 75) stage = "Evaluating edge cases & test regressions";
		else stage = "Formulating final code review findings";
	} else if (elapsed < 6) stage = "Initializing CLI session & workspace context";
	else if (elapsed < 18) stage = "Analyzing problem & specifications";
	else if (elapsed < 40) stage = "Reasoning deeply & exploring solutions";
	else if (elapsed < 75) stage = "Verifying architecture & edge cases";
	else stage = "Synthesizing recommendations";
	return `${stage} (${elapsed}s elapsed)`;
}
/**
* Creates an MCP-compliant progress reporter supporting indeterminate updates.
*/
function createProgressReporter(server, progressToken) {
	let observedUpdates = 0;
	return function reportProgress(messageOrInfo, progress = null, total = null) {
		if (progressToken == null) return;
		let message;
		let explicitProgress = progress;
		if (typeof messageOrInfo === "string") message = messageOrInfo;
		else if (messageOrInfo && typeof messageOrInfo === "object") {
			message = String(messageOrInfo.message || "");
			if (typeof messageOrInfo.percent === "number") explicitProgress = messageOrInfo.percent;
		} else message = String(messageOrInfo || "");
		observedUpdates++;
		const params = {
			progressToken,
			progress: typeof explicitProgress === "number" ? explicitProgress : observedUpdates,
			message
		};
		if (typeof total === "number") params.total = total;
		server?.notification({
			method: "notifications/progress",
			params
		})?.catch(() => {});
	};
}
//#endregion
//#region src/services/policy.service.ts
const GOVERNED_TOP_TIER_MODELS = /* @__PURE__ */ new Set([
	"astra",
	"claude-3-opus",
	"claude-3-opus-20240229",
	"opus"
]);
/**
* Validates whether top-tier expensive reasoning models have explicit user confirmation.
*/
function checkModelGovernance(modelName, userConfirmed = false) {
	if (typeof modelName !== "string") return null;
	const normalized = modelName.trim().toLowerCase();
	if (GOVERNED_TOP_TIER_MODELS.has(normalized)) {
		if (userConfirmed !== true) return {
			isError: true,
			content: [{
				type: "text",
				text: `[GOVERNANCE ERROR] The selected model '${modelName}' is a top-tier deep reasoning model. Execution strictly requires explicit user confirmation (user_confirmed: true). Please prompt the user before initiating requests with this tier.`
			}]
		};
	}
	return null;
}
/**
* Resolves workspace path strictly; errors out if explicit path does not exist.
*/
function resolveWorkspacePath(rawPath) {
	if (typeof rawPath === "string" && rawPath.trim()) {
		const cleanPath = rawPath.trim();
		if (!fs.default.existsSync(cleanPath)) throw new Error(`Validation Error: The specified workspace path does not exist: '${cleanPath}'`);
		if (!fs.default.statSync(cleanPath).isDirectory()) throw new Error(`Validation Error: The specified workspace path is not a directory: '${cleanPath}'`);
		return cleanPath;
	}
	return process.cwd();
}
//#endregion
//#region src/constants/index.ts
/**
* @fileoverview Central branding, naming, and tool constants for SynAgent MCP Server.
* Prevents magic strings across tool definitions, dispatchers, handlers, and configuration.
*/
const BRAND = {
	NAME: "SynAgent",
	TAGLINE: "Cross-Agent CLI Bridge",
	PACKAGE_NAME: "synagent",
	SERVER_NAME: "synagent",
	SERVER_VERSION: "0.9.0-dev",
	GITHUB_OWNER: "nyupyu",
	GITHUB_REPO: "synagent"
};
const CONFIG_CONSTANTS = {
	DIR_NAME: ".synagent",
	LEGACY_DIR_NAME: ".omniagent",
	FILE_NAME: "config.json",
	ENV_DIR: "SYNAGENT_DIR",
	LEGACY_ENV_DIR: "OMNIAGENT_DIR",
	ENV_CONFIG: "SYNAGENT_CONFIG",
	LEGACY_ENV_CONFIG: "OMNIAGENT_CONFIG",
	ENV_SESSIONS_DIR: "SYNAGENT_SESSIONS_DIR",
	LEGACY_ENV_SESSIONS_DIR: "OMNIAGENT_SESSIONS_DIR"
};
/**
* Enumeration of all registered tool names across SynAgent, legacy OmniAgent aliases, and direct Codex CLI tools.
*/
const TOOL_NAMES = {
	DOCTOR: "synagent_doctor",
	SET_DEFAULT: "synagent_set_default",
	QUOTA_STATUS: "synagent_quota_status",
	REPORT_BUG: "synagent_report_bug",
	CLOSE_SESSION: "synagent_close_session",
	REVIEW: "synagent_review",
	CONSULT: "synagent_consult",
	ANALYZE: "synagent_analyze",
	LEGACY_DOCTOR: "omniagent_doctor",
	LEGACY_SET_DEFAULT: "omniagent_set_default",
	LEGACY_QUOTA_STATUS: "omniagent_quota_status",
	LEGACY_REPORT_BUG: "omniagent_report_bug",
	LEGACY_CLOSE_SESSION: "omniagent_close_session",
	LEGACY_REVIEW: "omniagent_review",
	LEGACY_CONSULT: "omniagent_consult",
	LEGACY_ANALYZE: "omniagent_analyze",
	CODEX_STATUS: "codex_status",
	CODEX_DEBUG: "codex_debug_error",
	CODEX_ANALYZE: "codex_analyze",
	CODEX_REVIEW: "codex_review_code",
	CODEX_IMPLEMENT: "codex_implement",
	CODEX_CONSULT: "codex_consult"
};
/**
* Returns a standardized description for backward-compatible alias tools.
*
* @param primaryToolName The name of the primary replacement tool.
* @returns Human-readable description referencing the primary tool.
*/
function getLegacyAliasDescription(primaryToolName) {
	return `Backward-compatible alias for ${primaryToolName}.`;
}
const GITHUB_NEW_ISSUE_BASE = `https://github.com/${BRAND.GITHUB_OWNER}/${BRAND.GITHUB_REPO}/issues/new`;
const MAX_RAW_INPUT_LENGTH = 4096;
function safeSlice(str, maxLength = 80) {
	if (!str || typeof str !== "string") return "";
	const chars = Array.from(str);
	if (chars.length <= maxLength) return str;
	return chars.slice(0, maxLength).join("") + "\n\n...[truncated]";
}
function redactCodeBlocks(text) {
	if (!text || typeof text !== "string") return "";
	const lines = text.split(/\r?\n/);
	const result = [];
	let inBlock = false;
	let fenceChar = "";
	let fenceLen = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!inBlock) {
			const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})/);
			if (match) {
				inBlock = true;
				fenceChar = match[1][0];
				fenceLen = match[1].length;
				result.push("[code block redacted for privacy]");
				continue;
			}
			result.push(line);
		} else {
			const closeMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ ]*$/);
			if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
				inBlock = false;
				fenceChar = "";
				fenceLen = 0;
				continue;
			}
		}
	}
	return result.join("\n");
}
/**
* Strips secrets, API keys, Bearer/Basic tokens, private keys, and user home directory paths.
* Bound to MAX_RAW_INPUT_LENGTH with strictly linear non-backtracking pattern matching.
*/
function sanitizeText(text) {
	if (!text || typeof text !== "string") return "";
	let sanitized = redactCodeBlocks(text);
	sanitized = sanitized.replace(/diff --git [\s\S]*/g, "[git diff redacted for privacy]\n");
	sanitized = sanitized.replace(/--- a\/[\s\S]*?\+\+\+ b\/[\s\S]*/g, "[git diff redacted for privacy]\n");
	sanitized = sanitized.length > 4096 ? sanitized.slice(0, MAX_RAW_INPUT_LENGTH) : sanitized;
	const home = os.default.homedir();
	if (home) {
		sanitized = sanitized.split(home).join("~");
		sanitized = sanitized.split(home.replace(/\\/g, "/")).join("~");
	}
	sanitized = sanitized.replace(/-----BEGIN [A-Z0-9 _-]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 _-]+PRIVATE KEY-----/gi, "-----BEGIN PRIVATE KEY-----\n***[REDACTED]***\n-----END PRIVATE KEY-----");
	sanitized = sanitized.replace(/Authorization\s*:\s*(Bearer|Basic|Token)\s+[^\s,;]+/gi, "Authorization: $1 ***[REDACTED]***");
	sanitized = sanitized.replace(/Authorization\s*:\s*(?!Bearer|Basic|Token)[^\s,;]+/gi, "Authorization: ***[REDACTED]***");
	sanitized = sanitized.replace(/\bBearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer ***[REDACTED]***");
	sanitized = sanitized.replace(/\bBasic\s+[a-zA-Z0-9+/=]{16,}/gi, "Basic ***[REDACTED]***");
	sanitized = sanitized.replace(/(?:sk-[a-zA-Z0-9_-]{20,})/g, "sk-***[REDACTED]***");
	sanitized = sanitized.replace(/(?:AIza[0-9A-Za-z-_]{35})/g, "AIza***[REDACTED]***");
	sanitized = sanitized.replace(/(?:ghp_[a-zA-Z0-9]{36})/g, "ghp_***[REDACTED]***");
	sanitized = sanitized.replace(/(?:github_pat_[a-zA-Z0-9_]{80,})/g, "github_pat_***[REDACTED]***");
	sanitized = sanitized.replace(/\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16,20})\b/g, (_m, p) => p.slice(0, 4) + "***[REDACTED]***");
	sanitized = sanitized.replace(/\b(xox[baprs]-[a-zA-Z0-9-]+)\b/g, "xox-***[REDACTED]***");
	sanitized = sanitized.replace(/(aws_access_key_id|aws_secret_access_key|aws_session_token|aws_security_token)\s*[:=]\s*[^\s,;]+/gi, "$1=***[REDACTED]***");
	sanitized = sanitized.replace(/(["']?(?:api[_-]?key|token|secret|password|passwd|auth|access[_-]?key)["']?\s*[:=]\s*)(["'])(?:\\.|(?!\2)[^\\])*\2/gi, "$1$2***[REDACTED]***$2");
	sanitized = sanitized.replace(/(["']?(?:api[_-]?key|token|secret|password|passwd|auth|access[_-]?key)["']?\s*[:=]\s*)(?!["'])([^"'\s,\r\n}{]+)/gi, "$1***[REDACTED]***");
	sanitized = sanitized.replace(/([?&](?:token|key|secret|apiKey)=)[^&\s]+/gi, "$1***[REDACTED]***");
	sanitized = sanitized.replace(/\b(https?|ftp|ssh|git):\/\/([^@\s\/?#]+)@/gi, "$1://***[REDACTED]***@");
	return sanitized;
}
/**
* Builds a sanitized, pre-filled GitHub bug report URL and markdown preview.
*/
function generateBugReport(options) {
	const { errorMessage, context, doctorReport = null } = options;
	try {
		const cleanError = sanitizeText(errorMessage || "Unknown error occurred");
		const cleanContext = sanitizeText(context || "Execution during MCP tool call");
		const title = `[Bug]: ${safeSlice(cleanError.split(/\r?\n/)[0] || "Unknown error", 80)}`;
		let doctorSummary = "Not provided";
		if (doctorReport && doctorReport.backends) doctorSummary = Object.entries(doctorReport.backends).map(([id, b]) => `- **${b.name || id}**: ${b.installed ? `v${b.version}` : "Not installed"}`).join("\n");
		const body = `### Description & Context
${safeSlice(cleanContext, 300)}

### Error Diagnostic
\`\`\`text
${safeSlice(cleanError, 800)}
\`\`\`

### Environment Details
- **${BRAND.NAME} MCP Version**: ${BRAND.SERVER_VERSION}
- **Node.js**: ${process.version}
- **OS**: ${os.default.type()} ${os.default.release()} (${os.default.arch()})
- **Detected CLIs**:
${doctorSummary}

---
*Note: Best-effort automated redaction was applied. Please review the details above before submitting to ensure no sensitive or proprietary data is included.*
`;
		let issueUrl;
		try {
			issueUrl = `${GITHUB_NEW_ISSUE_BASE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
		} catch (_) {
			issueUrl = GITHUB_NEW_ISSUE_BASE;
		}
		return {
			title,
			body,
			issueUrl,
			prompt: `Would you like to report this issue to GitHub to help improve ${BRAND.NAME}?\n\nClick the link below to review and submit the pre-filled issue in your browser (no tokens or extra login needed):\n\n**[Submit Bug Report on GitHub](${issueUrl})**\n\n<details><summary>Preview Sanitized Report</summary>\n\n${body}\n</details>`
		};
	} catch (_err) {
		return {
			title: "[Bug]: Unhandled Error",
			body: String(errorMessage || ""),
			issueUrl: GITHUB_NEW_ISSUE_BASE,
			prompt: `An unexpected error occurred. You can submit feedback or a bug report here:\n\n**[Submit Bug Report on GitHub](${GITHUB_NEW_ISSUE_BASE})**`
		};
	}
}
//#endregion
//#region src/services/process.service.ts
const activeProcesses = /* @__PURE__ */ new Set();
/**
* Safely terminates a process and all its children across Windows and POSIX.
*/
function killProcessSafely(proc) {
	if (!proc || !proc.pid) return;
	try {
		proc.stdin?.destroy();
		proc.stdout?.destroy();
		proc.stderr?.destroy();
	} catch (_) {}
	try {
		if (process.platform === "win32") {
			if (proc.killed || proc.exitCode !== null) return;
			const taskkillExe = process.env.SystemRoot ? path.default.join(process.env.SystemRoot, "System32", "taskkill.exe") : "taskkill.exe";
			(0, child_process.spawn)(taskkillExe, [
				"/pid",
				String(proc.pid),
				"/T",
				"/F"
			], {
				windowsHide: true,
				stdio: "ignore"
			}).on("error", () => {
				try {
					proc.kill("SIGTERM");
				} catch (_) {}
			});
		} else try {
			process.kill(-proc.pid, "SIGTERM");
		} catch (_) {
			try {
				proc.kill("SIGTERM");
			} catch (_) {}
		}
	} catch (_) {
		try {
			proc.kill("SIGTERM");
		} catch (_) {}
	}
}
/**
* Terminates all running child processes tracked by OmniAgent.
*/
function terminateAllProcesses() {
	for (const proc of activeProcesses) killProcessSafely(proc);
	activeProcesses.clear();
}
process.on("SIGINT", () => {
	terminateAllProcesses();
	process.exit(0);
});
process.on("SIGTERM", () => {
	terminateAllProcesses();
	process.exit(0);
});
const MAX_BUFFER_BYTES = 524288;
/**
* Spawns a child command with stdin piping, stream decoding, and timeout/abort handling.
*/
function runCommand(command, args, options = {}) {
	const { cwd = process.cwd(), stdinInput = null, abortSignal = null, timeoutMs = null, maxBufferBytes = MAX_BUFFER_BYTES, onStderrLine = null } = options;
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = (0, child_process.spawn)(command, args, {
				cwd,
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: true,
				shell: false,
				detached: process.platform !== "win32"
			});
		} catch (err) {
			return reject(err);
		}
		activeProcesses.add(child);
		let timer = null;
		let onAbort = null;
		const cleanup = () => {
			activeProcesses.delete(child);
			if (timer) clearTimeout(timer);
			if (abortSignal && onAbort) abortSignal.removeEventListener("abort", onAbort);
		};
		if (abortSignal) {
			if (abortSignal.aborted) {
				killProcessSafely(child);
				cleanup();
				return reject(/* @__PURE__ */ new Error("Operation aborted"));
			}
			onAbort = () => {
				cleanup();
				killProcessSafely(child);
				reject(/* @__PURE__ */ new Error("Operation aborted"));
			};
			abortSignal.addEventListener("abort", onAbort);
		}
		if (typeof timeoutMs === "number" && timeoutMs > 0) timer = setTimeout(() => {
			cleanup();
			killProcessSafely(child);
			reject(/* @__PURE__ */ new Error(`Command timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		if (child.stdin) {
			child.stdin.on("error", () => {});
			if (stdinInput) child.stdin.write(stdinInput);
			child.stdin.end();
		}
		let stdout = "";
		let stderr = "";
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let stdoutTruncated = false;
		let stderrTruncated = false;
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (d) => {
			const chunkBytes = Buffer.byteLength(d, "utf8");
			if (stdoutBytes + chunkBytes <= maxBufferBytes) {
				stdout += d;
				stdoutBytes += chunkBytes;
			} else if (!stdoutTruncated) {
				const remaining = Math.max(0, maxBufferBytes - stdoutBytes);
				if (remaining > 0) {
					stdout += Buffer.from(d, "utf8").subarray(0, remaining).toString("utf8");
					stdoutBytes += remaining;
				}
				stdout += "\n...[stdout truncated: buffer limit reached]";
				stdoutTruncated = true;
			}
		});
		child.stderr?.on("data", (d) => {
			const chunkBytes = Buffer.byteLength(d, "utf8");
			if (stderrBytes + chunkBytes <= maxBufferBytes) {
				stderr += d;
				stderrBytes += chunkBytes;
			} else if (!stderrTruncated) {
				const remaining = Math.max(0, maxBufferBytes - stderrBytes);
				if (remaining > 0) {
					stderr += Buffer.from(d, "utf8").subarray(0, remaining).toString("utf8");
					stderrBytes += remaining;
				}
				stderr += "\n...[stderr truncated: buffer limit reached]";
				stderrTruncated = true;
			}
			if (onStderrLine) {
				const lines = d.trim().split(/\r?\n/).filter(Boolean);
				for (const line of lines) onStderrLine(line);
			}
		});
		child.on("error", (err) => {
			cleanup();
			reject(err);
		});
		child.on("close", (code, signal) => {
			cleanup();
			resolve({
				stdout,
				stderr,
				exitCode: code,
				signal,
				isTruncated: stdoutTruncated || stderrTruncated
			});
		});
	});
}
//#endregion
//#region src/adapters/codex.adapter.ts
const id$1 = "codex";
const name$1 = "OpenAI Codex CLI";
const CODEX_EXE = process.env.CODEX_PATH || "codex";
const CODEX_CONFIG_PATH = path.default.join(os.default.homedir(), ".codex", "config.toml");
const VALID_REASONING_EFFORTS = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
function resolveCodexCommand() {
	if (process.platform === "win32") {
		const appData = process.env.APPDATA || "";
		const globalCodexJs = path.default.join(appData, "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
		if (fs.default.existsSync(globalCodexJs)) return {
			command: process.execPath,
			argsPrefix: [globalCodexJs]
		};
	}
	return {
		command: CODEX_EXE,
		argsPrefix: []
	};
}
const CODEX_CMD = resolveCodexCommand();
function readCodexConfig() {
	const result = {
		defaultModel: "gpt-6.1-sol",
		defaultReasoningEffort: "high",
		sandboxMode: "read-only"
	};
	try {
		if (fs.default.existsSync(CODEX_CONFIG_PATH)) {
			const content = fs.default.readFileSync(CODEX_CONFIG_PATH, "utf-8");
			const modelMatch = content.match(/model\s*=\s*["']([^"']+)["']/);
			if (modelMatch) result.defaultModel = modelMatch[1];
			const effortMatch = content.match(/model_reasoning_effort\s*=\s*["']([^"']+)["']/);
			if (effortMatch && VALID_REASONING_EFFORTS.includes(effortMatch[1])) result.defaultReasoningEffort = effortMatch[1];
		}
	} catch (_) {}
	return result;
}
function normalizeReasoningEffort(effort, defaultEffort = "high") {
	if (typeof effort === "string" && VALID_REASONING_EFFORTS.includes(effort.toLowerCase())) return effort.toLowerCase();
	return defaultEffort;
}
async function probe$2() {
	const config = readCodexConfig();
	let installed = false;
	let version = "unknown";
	try {
		const res = await runCommand(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, "--version"], { timeoutMs: 5e3 });
		if (res.exitCode === 0) {
			installed = true;
			version = res.stdout.trim() || "installed";
		}
	} catch (_) {}
	return {
		id: "codex",
		name: "OpenAI Codex CLI",
		installed,
		version,
		command: CODEX_CMD.command,
		configPath: CODEX_CONFIG_PATH,
		config,
		availableModels: [
			"gpt-6.1-sol",
			"gpt-6.0-sol",
			"luna",
			"astra"
		],
		supportedReasoningEfforts: VALID_REASONING_EFFORTS
	};
}
function formatCodexActivity(event) {
	if (!event || typeof event !== "object") return null;
	const type = event.type;
	if (type === "thread.started") return "Initializing session...";
	if (type === "turn.started") return "Starting task analysis...";
	if (type === "item.started" || type === "item.updated") {
		const item = event.item || event;
		const itemType = item.type || item.item_type || "";
		if (itemType === "command") {
			const cmd = (item.command || item.detail || "").replace(/[\r\n]+/g, " ");
			return `Running: ${cmd.slice(0, 50)}${cmd.length > 50 ? "..." : ""}`;
		}
		if (itemType === "file_search" || itemType === "search") return `Searching: ${item.query || item.pattern || "repository"}`;
		if (itemType === "read_file" || itemType === "file_read") {
			const f = item.path || item.file || "";
			return `Reading: ${path.default.basename(f) || "file"}`;
		}
		if (itemType === "thought" || itemType === "reasoning") {
			const summary = (item.summary || item.text || item.content || "").replace(/[\r\n]+/g, " ").trim();
			if (summary) return `Reasoning: ${summary.slice(0, 60)}${summary.length > 60 ? "..." : ""}`;
			return "Analyzing architecture...";
		}
		if (itemType === "agent_message" || itemType === "message") return "Formulating findings...";
		if (item.summary) return String(item.summary).replace(/[\r\n]+/g, " ").slice(0, 60);
	}
	if (type === "item.completed") {
		const item = event.item || event;
		if (item.type === "command") return `Completed: ${(item.command || "command").replace(/[\r\n]+/g, " ").slice(0, 40)}`;
	}
	return null;
}
function truncateToByteLength(str, maxBytes, suffix = "") {
	if (typeof str !== "string") return "";
	const suffixBytes = Buffer.byteLength(suffix, "utf8");
	if (Buffer.byteLength(str, "utf8") <= maxBytes) return str;
	const targetBytes = Math.max(0, maxBytes - suffixBytes);
	const buf = Buffer.from(str, "utf8");
	let end = targetBytes;
	while (end > 0 && (buf[end] & 192) === 128) end--;
	return buf.toString("utf8", 0, end) + suffix;
}
function createCodexStreamCollector({ onProgress = null, maxLineBuffer = 1048576, maxTotalMessageBytes = 1048576, maxMessages = 50, maxTextPerMessage = 524288 } = {}) {
	let stdoutBuffer = "";
	let discardingOversizedLine = false;
	let hasDiscardedOversizedLine = false;
	let capturedThreadId = null;
	let totalMessageBytes = 0;
	const messageMap = /* @__PURE__ */ new Map();
	const rawFallbackLines = [];
	const jsonErrorLines = [];
	const MAX_FALLBACK_LINES = 20;
	function processLine(line) {
		const trimmed = line.trim();
		if (!trimmed) return;
		if (trimmed.startsWith("{")) try {
			const event = JSON.parse(trimmed);
			if (event.type === "thread.started" && (event.thread_id || event.id)) capturedThreadId = event.thread_id || event.id;
			const item = event.item || event;
			if (item.type === "agent_message" || item.type === "message") {
				let text = item.text || item.content || item.message;
				if (text && typeof text === "string") {
					if (Buffer.byteLength(text, "utf8") > maxTextPerMessage) text = truncateToByteLength(text, maxTextPerMessage, "\n...[truncated]");
					const msgBytes = Buffer.byteLength(text, "utf8");
					const id = item.id || `msg_${messageMap.size}`;
					if (messageMap.has(id)) {
						const prevText = messageMap.get(id);
						const prevBytes = Buffer.byteLength(prevText, "utf8");
						const delta = msgBytes - prevBytes;
						if (totalMessageBytes + delta <= maxTotalMessageBytes) {
							messageMap.set(id, text);
							totalMessageBytes += delta;
						} else {
							const availableBytes = Math.max(0, maxTotalMessageBytes - (totalMessageBytes - prevBytes));
							let truncated;
							if (availableBytes >= 20) truncated = truncateToByteLength(text, availableBytes, "\n...[truncated]");
							else truncated = "[truncated]";
							messageMap.set(id, truncated);
							totalMessageBytes = totalMessageBytes - prevBytes + Buffer.byteLength(truncated, "utf8");
						}
					} else if (messageMap.size < maxMessages) {
						if (totalMessageBytes + msgBytes <= maxTotalMessageBytes) {
							messageMap.set(id, text);
							totalMessageBytes += msgBytes;
						} else {
							const availableBytes = Math.max(0, maxTotalMessageBytes - totalMessageBytes);
							if (availableBytes >= 20) {
								const truncated = truncateToByteLength(text, availableBytes, "\n...[truncated]");
								messageMap.set(id, truncated);
								totalMessageBytes += Buffer.byteLength(truncated, "utf8");
							} else if (availableBytes > 0) {
								messageMap.set(id, "[truncated]");
								totalMessageBytes += Buffer.byteLength("[truncated]", "utf8");
							}
						}
					}
				}
			}
			const err = event.error || (event.type === "error" || event.type === "turn.failed" ? event : null);
			if (err && jsonErrorLines.length < 20) {
				const rawMsg = typeof err === "string" ? err : err.message || err.detail || err.error && err.error.message || JSON.stringify(err);
				if (rawMsg) {
					const prefix = "[Codex Error] ";
					const maxMsgLen = 486;
					let cleanMsg = String(rawMsg);
					if (cleanMsg.length > maxMsgLen) cleanMsg = cleanMsg.slice(0, 483) + "...";
					jsonErrorLines.push(`${prefix}${cleanMsg}`);
				}
			}
			const activity = formatCodexActivity(event);
			if (activity && onProgress) onProgress(`[Codex] ${activity}`);
		} catch (_) {
			if (rawFallbackLines.length < MAX_FALLBACK_LINES) rawFallbackLines.push(trimmed.slice(0, 500));
		}
		else if (rawFallbackLines.length < MAX_FALLBACK_LINES) rawFallbackLines.push(trimmed.slice(0, 500));
	}
	function pushChunk(chunk) {
		stdoutBuffer += chunk;
		if (Buffer.byteLength(stdoutBuffer, "utf8") > maxLineBuffer && !stdoutBuffer.includes("\n")) {
			stdoutBuffer = "";
			discardingOversizedLine = true;
			hasDiscardedOversizedLine = true;
			return;
		}
		if (!stdoutBuffer.includes("\n")) return;
		const lines = stdoutBuffer.split(/\r?\n/);
		stdoutBuffer = lines.pop() || "";
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (discardingOversizedLine) {
				discardingOversizedLine = false;
				continue;
			}
			processLine(line);
		}
	}
	function flush() {
		if (stdoutBuffer && !discardingOversizedLine) {
			processLine(stdoutBuffer);
			stdoutBuffer = "";
		}
	}
	function getFormattedOutput(exitCode = 0, signal = null) {
		const agentMessages = Array.from(messageMap.values());
		if (agentMessages.length > 0) return agentMessages.join("\n\n").trim();
		if (rawFallbackLines.length > 0) return rawFallbackLines.join("\n").trim();
		if (exitCode === 0 && !signal) return "Task completed cleanly with no textual output.";
		return "";
	}
	return {
		pushChunk,
		flush,
		getCapturedThreadId: () => capturedThreadId,
		getFormattedOutput,
		getMessageMap: () => messageMap,
		getJsonErrors: () => [...jsonErrorLines],
		getRawFallbackLines: () => [...rawFallbackLines],
		hasOversizedLine: () => hasDiscardedOversizedLine
	};
}
function executeCodex(args, stdinInput = null, cwd = process.cwd(), abortSignal = null, onProgress = null, options = {}) {
	return new Promise((resolve, reject) => {
		const tmpFile = path.default.join(os.default.tmpdir(), `codex-out-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.txt`);
		let cleanArgs = args[0] === "exec" ? args.slice(1) : args;
		const isResume = !!options.threadId;
		let fullArgs;
		if (isResume) {
			let sandboxMode = "read-only";
			const resumeArgs = [];
			for (let i = 0; i < cleanArgs.length; i++) {
				if (cleanArgs[i] === "--sandbox" || cleanArgs[i] === "-s") {
					if (cleanArgs[i + 1] && !cleanArgs[i + 1].startsWith("-")) {
						sandboxMode = cleanArgs[i + 1];
						i++;
					}
					continue;
				}
				resumeArgs.push(cleanArgs[i]);
			}
			fullArgs = [
				"exec",
				"--sandbox",
				sandboxMode,
				"resume",
				"--skip-git-repo-check",
				"--json",
				"-o",
				tmpFile,
				options.threadId,
				...resumeArgs
			];
		} else fullArgs = [
			"exec",
			"--skip-git-repo-check",
			"--json",
			"-o",
			tmpFile,
			...cleanArgs
		];
		const child = (0, child_process.spawn)(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, ...fullArgs], {
			cwd,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true,
			shell: false,
			detached: process.platform !== "win32"
		});
		activeProcesses.add(child);
		let elapsed = 0;
		let lastActivityTime = Date.now();
		let capturedThreadId = options.threadId || null;
		if (onProgress) onProgress(isResume ? "[Codex] Resuming conversation session..." : "[Codex] Initializing agent environment...");
		const progressTimer = setInterval(() => {
			elapsed += 3;
			if (Date.now() - lastActivityTime > 8e3 && onProgress) onProgress(`[Codex] Deep reasoning in progress... (${elapsed}s elapsed)`);
		}, 3e3);
		function cleanup() {
			clearInterval(progressTimer);
			try {
				if (fs.default.existsSync(tmpFile)) fs.default.unlinkSync(tmpFile);
			} catch (_) {}
		}
		if (abortSignal) {
			if (abortSignal.aborted) killProcessSafely(child);
			else abortSignal.addEventListener("abort", () => {
				killProcessSafely(child);
			});
		}
		if (child.stdin) {
			child.stdin.on("error", () => {});
			if (stdinInput) child.stdin.write(stdinInput);
			child.stdin.end();
		}
		let stderr = "";
		const MAX_STDERR_BYTES = 65536;
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		const collector = createCodexStreamCollector({ onProgress: (p) => {
			lastActivityTime = Date.now();
			onProgress?.(p);
		} });
		child.stdout?.on("data", (d) => {
			collector.pushChunk(d);
		});
		child.stderr?.on("data", (d) => {
			if (stderr.length < MAX_STDERR_BYTES) stderr += d;
			const lines = d.trim().split(/\r?\n/).filter(Boolean);
			for (const line of lines) {
				const clean = line.trim();
				if (clean.startsWith("mcp:") || clean.startsWith("exec") || clean.startsWith("warning:")) onProgress?.(`[Codex] ${clean.slice(0, 80)}`);
			}
		});
		child.on("error", (err) => {
			activeProcesses.delete(child);
			cleanup();
			if (err.code === "ENOENT") reject(/* @__PURE__ */ new Error(`[CODEX_CLI_NOT_FOUND] Could not find executable '${CODEX_EXE}'. Please install OpenAI Codex CLI ('npm install -g @openai/codex') and ensure 'codex' is in your PATH.`));
			else reject(err);
		});
		child.on("close", (code, signal) => {
			activeProcesses.delete(child);
			if (onProgress) onProgress("Completed! Formatting output...", 100, 100);
			collector.flush();
			if (collector.getCapturedThreadId()) capturedThreadId = collector.getCapturedThreadId();
			let result = "";
			if (fs.default.existsSync(tmpFile)) try {
				result = fs.default.readFileSync(tmpFile, "utf-8").trim();
			} catch (_) {}
			cleanup();
			if (!result) {
				result = collector.getFormattedOutput(code || 0, signal);
				if (collector.hasOversizedLine()) result += "\n\n[Warning: Stream output contained an oversized record (> 1MB) that was truncated.]";
			}
			if (code !== 0 || signal) {
				const errorLines = [];
				if (stderr.trim()) errorLines.push(stderr.trim());
				for (const errLine of collector.getJsonErrors()) errorLines.push(errLine);
				if (errorLines.length === 0 && collector.getRawFallbackLines().length > 0) errorLines.push(collector.getRawFallbackLines().join("\n"));
				const errorDetail = errorLines.join("\n").trim() || `Process exited with code ${code || signal}`;
				resolve({
					isError: true,
					errorDetail,
					output: `Codex execution error (${code || signal}):\n${errorDetail}${result && result !== errorDetail ? "\nPartial output:\n" + result : ""}`.trim(),
					exitCode: code,
					threadId: capturedThreadId
				});
			} else resolve({
				isError: false,
				output: result,
				exitCode: 0,
				threadId: capturedThreadId
			});
		});
	});
}
function executeCodexReview(args, cwd = process.cwd(), abortSignal = null, onProgress = null) {
	return new Promise((resolve, reject) => {
		const fullArgs = [
			"review",
			"--config",
			"sandbox_mode=\"read-only\"",
			...args
		];
		const child = (0, child_process.spawn)(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, ...fullArgs], {
			cwd,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true,
			shell: false,
			detached: process.platform !== "win32"
		});
		activeProcesses.add(child);
		let elapsed = 0;
		if (onProgress) onProgress(getProgressStage(0, "review", "Codex"));
		const progressTimer = setInterval(() => {
			elapsed += 3;
			if (onProgress) onProgress(getProgressStage(elapsed, "review", "Codex"));
		}, 3e3);
		const cleanup = () => {
			clearInterval(progressTimer);
		};
		if (abortSignal) {
			if (abortSignal.aborted) killProcessSafely(child);
			else abortSignal.addEventListener("abort", () => {
				killProcessSafely(child);
			});
		}
		if (child.stdin) {
			child.stdin.on("error", () => {});
			child.stdin.end();
		}
		let stdout = "";
		let stderr = "";
		let stdoutBytes = 0;
		let stderrBytes = 0;
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (d) => {
			const chunkBytes = Buffer.byteLength(d, "utf8");
			if (stdoutBytes + chunkBytes <= 524288) {
				stdout += d;
				stdoutBytes += chunkBytes;
			} else if (stdoutBytes < 524288) {
				const remaining = MAX_BUFFER_BYTES - stdoutBytes;
				stdout += Buffer.from(d, "utf8").subarray(0, remaining).toString("utf8") + "\n...[stdout truncated]";
				stdoutBytes = MAX_BUFFER_BYTES;
			}
		});
		child.stderr?.on("data", (d) => {
			const chunkBytes = Buffer.byteLength(d, "utf8");
			if (stderrBytes + chunkBytes <= 524288) {
				stderr += d;
				stderrBytes += chunkBytes;
			} else if (stderrBytes < 524288) {
				const remaining = MAX_BUFFER_BYTES - stderrBytes;
				stderr += Buffer.from(d, "utf8").subarray(0, remaining).toString("utf8") + "\n...[stderr truncated]";
				stderrBytes = MAX_BUFFER_BYTES;
			}
			const lines = d.trim().split(/\r?\n/).filter(Boolean);
			for (const line of lines) {
				const clean = line.trim();
				if (clean.startsWith("mcp:") || clean.startsWith("exec") || clean.startsWith("warning:")) onProgress?.(`[Codex Review] ${clean.slice(0, 80)}`);
			}
		});
		child.on("error", (err) => {
			activeProcesses.delete(child);
			cleanup();
			if (err.code === "ENOENT") reject(/* @__PURE__ */ new Error(`[CODEX_CLI_NOT_FOUND] Could not find executable '${CODEX_EXE}'. Please install OpenAI Codex CLI ('npm install -g @openai/codex') and ensure 'codex' is in your PATH.`));
			else reject(err);
		});
		child.on("close", (code, signal) => {
			activeProcesses.delete(child);
			cleanup();
			if (onProgress) onProgress("Review complete! Formatting findings...", 100, 100);
			const output = stdout.trim();
			if (code !== 0 || signal) {
				const errorDetail = stderr.trim() || `Review process exited with code ${code || signal}`;
				resolve({
					isError: true,
					errorDetail,
					output: `Codex review error (${code || signal}):\n${errorDetail}${output ? "\nPartial review:\n" + output : ""}`.trim(),
					exitCode: code
				});
			} else resolve({
				isError: false,
				output: output || "Codex review reported no changes or clean status.",
				exitCode: 0
			});
		});
	});
}
async function execute$1(prompt, options = {}) {
	const config = readCodexConfig();
	const args = [
		"--sandbox",
		"read-only",
		"-m",
		options.model || config.defaultModel,
		"-c",
		`model_reasoning_effort=${normalizeReasoningEffort(options.reasoningEffort, config.defaultReasoningEffort)}`,
		"-"
	];
	const progressAdapter = options.onProgress ? (msg, percent) => {
		options.onProgress?.({
			message: msg,
			percent
		});
	} : null;
	return executeCodex(args, prompt, options.cwd || process.cwd(), options.abortSignal || null, progressAdapter, { threadId: options.threadId });
}
const codexAdapter = {
	id: id$1,
	name: name$1,
	probe: probe$2,
	execute: execute$1
};
//#endregion
//#region src/adapters/claude.adapter.ts
const id = "claude";
const name = "Claude Code CLI";
const CLAUDE_EXE = process.env.CLAUDE_PATH || "claude";
const CLAUDE_CONFIG_DIR = path.default.join(os.default.homedir(), ".claude");
async function probe$1() {
	let installed = false;
	let version = "unknown";
	let authType = "unavailable";
	try {
		const res = await runCommand(CLAUDE_EXE, ["--version"], { timeoutMs: 5e3 });
		if (res.exitCode === 0) {
			installed = true;
			version = res.stdout.trim() || "installed";
		}
	} catch (_) {}
	if (process.env.ANTHROPIC_API_KEY) authType = "api_key";
	else if (fs.default.existsSync(CLAUDE_CONFIG_DIR)) authType = "subscription_config_present";
	return {
		id: "claude",
		name: "Claude Code CLI",
		installed,
		version,
		command: CLAUDE_EXE,
		authStatus: authType,
		availableModels: [
			"claude-3-7-sonnet",
			"claude-3-5-sonnet",
			"claude-3-opus"
		],
		supportedReasoningEfforts: [
			"low",
			"medium",
			"high",
			"max"
		]
	};
}
/**
* Executes Claude Code CLI in headless, read-only mode.
* Strictly restricts tools to Read, Glob, Grep to enforce the Maker-Checker read-only guarantee.
*/
function executeClaude(prompt, options = {}) {
	const { cwd = process.cwd(), model = null, reasoningEffort = null, abortSignal = null, onProgress = null } = options;
	return new Promise((resolve, reject) => {
		const args = [
			"-p",
			"--permission-mode",
			"dontAsk",
			"--tools",
			"Read,Glob,Grep"
		];
		if (model && typeof model === "string") args.push("--model", model.trim());
		const env = { ...process.env };
		if (reasoningEffort) {
			const effortMap = {
				low: "2048",
				medium: "8192",
				high: "16384",
				max: "32000"
			};
			if (effortMap[reasoningEffort.toLowerCase()]) env.MAX_THINKING_TOKENS = effortMap[reasoningEffort.toLowerCase()];
		}
		let child;
		try {
			child = (0, child_process.spawn)(CLAUDE_EXE, args, {
				cwd,
				env,
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: true,
				shell: false,
				detached: process.platform !== "win32"
			});
		} catch (err) {
			return reject(err);
		}
		activeProcesses.add(child);
		let elapsed = 0;
		if (onProgress) onProgress(getProgressStage(0, "general", "Claude"));
		const progressTimer = setInterval(() => {
			elapsed += 3;
			if (onProgress) onProgress(getProgressStage(elapsed, "general", "Claude"));
		}, 3e3);
		const cleanup = () => {
			clearInterval(progressTimer);
			activeProcesses.delete(child);
		};
		if (abortSignal) {
			if (abortSignal.aborted) {
				killProcessSafely(child);
				cleanup();
				return reject(/* @__PURE__ */ new Error("Operation aborted"));
			}
			abortSignal.addEventListener("abort", () => {
				killProcessSafely(child);
			});
		}
		if (child.stdin) {
			child.stdin.on("error", () => {});
			if (prompt) child.stdin.write(prompt);
			child.stdin.end();
		}
		let stdout = "";
		let stderr = "";
		let stdoutBytes = 0;
		let stderrBytes = 0;
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (d) => {
			const chunkBytes = Buffer.byteLength(d, "utf8");
			if (stdoutBytes + chunkBytes <= 524288) {
				stdout += d;
				stdoutBytes += chunkBytes;
			} else if (stdoutBytes < 524288) {
				const remaining = MAX_BUFFER_BYTES - stdoutBytes;
				stdout += Buffer.from(d, "utf8").subarray(0, remaining).toString("utf8") + "\n...[stdout truncated]";
				stdoutBytes = MAX_BUFFER_BYTES;
			}
		});
		child.stderr.on("data", (d) => {
			const chunkBytes = Buffer.byteLength(d, "utf8");
			if (stderrBytes + chunkBytes <= 524288) {
				stderr += d;
				stderrBytes += chunkBytes;
			} else if (stderrBytes < 524288) {
				const remaining = MAX_BUFFER_BYTES - stderrBytes;
				stderr += Buffer.from(d, "utf8").subarray(0, remaining).toString("utf8") + "\n...[stderr truncated]";
				stderrBytes = MAX_BUFFER_BYTES;
			}
			const lines = d.trim().split(/\r?\n/).filter(Boolean);
			for (const line of lines) {
				const clean = line.trim();
				if (clean.length > 0 && clean.length < 80) onProgress?.(`[Claude] ${clean}`);
			}
		});
		child.on("error", (err) => {
			cleanup();
			if (err.code === "ENOENT") reject(/* @__PURE__ */ new Error(`[CLAUDE_CLI_NOT_FOUND] Could not find executable '${CLAUDE_EXE}'. Please install Claude Code CLI ('npm install -g @anthropic-ai/claude-code') and ensure 'claude' is in your PATH.`));
			else reject(err);
		});
		child.on("close", (code, signal) => {
			cleanup();
			if (onProgress) onProgress("Completed! Formatting output...");
			const output = stdout.trim();
			if (code !== 0 || signal) {
				const errorDetail = stderr.trim() || `Claude process exited with code ${code || signal}`;
				resolve({
					isError: true,
					errorDetail,
					output: `Claude execution error (${code || signal}):\n${errorDetail}${output ? "\nPartial output:\n" + output : ""}`.trim(),
					exitCode: code
				});
			} else resolve({
				isError: false,
				output: output || "Claude returned clean output.",
				exitCode: 0
			});
		});
	});
}
function execute(prompt, options = {}) {
	return executeClaude(prompt, options);
}
const claudeAdapter = {
	id,
	name,
	probe: probe$1,
	execute
};
//#endregion
//#region src/adapters/gemini.adapter.ts
const GEMINI_EXE = process.env.GEMINI_PATH || "gemini";
const GEMINI_CONFIG_DIR = path.default.join(os.default.homedir(), ".gemini");
async function probe() {
	let installed = false;
	let version = "unknown";
	let authType = "unavailable";
	try {
		const res = await runCommand(GEMINI_EXE, ["--version"], { timeoutMs: 5e3 });
		if (res.exitCode === 0) {
			installed = true;
			version = res.stdout.trim() || "installed";
		}
	} catch (_) {}
	if (process.env.GEMINI_API_KEY) authType = "api_key";
	else if (fs.default.existsSync(GEMINI_CONFIG_DIR)) authType = "config_present";
	return {
		id: "gemini",
		name: "Google Gemini CLI",
		installed,
		version,
		command: GEMINI_EXE,
		authStatus: authType,
		availableModels: ["gemini-2.5-flash", "gemini-2.5-pro"]
	};
}
//#endregion
//#region src/services/doctor.service.ts
async function runDoctor() {
	const [codex, claude, gemini] = await Promise.all([
		probe$2(),
		probe$1(),
		probe()
	]);
	const activeBackends = [];
	if (codex.installed) activeBackends.push("codex");
	if (claude.installed) activeBackends.push("claude");
	let overallStatus = "operational";
	if (activeBackends.length === 0) overallStatus = "degraded_no_active_backends";
	else if (!codex.installed || !claude.installed) overallStatus = "partially_configured";
	const recommendations = [];
	if (!codex.installed) recommendations.push(`OpenAI Codex CLI is missing. Install via terminal: 'npm install -g @openai/codex' and run 'codex login'.`);
	if (!claude.installed) recommendations.push(`Claude Code CLI is missing. Install via terminal: 'npm install -g @anthropic-ai/claude-code' and run 'claude auth login'.`);
	if (!gemini.installed) recommendations.push(`Gemini CLI is missing. Install via terminal: 'npm install -g @google/gemini-cli' and run 'gemini'.`);
	return {
		status: overallStatus,
		active_backends: activeBackends,
		default_backend: codex.installed ? "codex" : claude.installed ? "claude" : "none",
		security_policy: {
			zero_silent_downloads: true,
			read_only_sandbox_guard: true,
			governed_models_require_confirmation: ["astra", "claude-3-opus"]
		},
		backends: {
			codex,
			claude,
			gemini
		},
		recommendations
	};
}
//#endregion
//#region src/tools/doctor.tool.ts
const doctorToolDefinition = {
	name: TOOL_NAMES.DOCTOR,
	description: "Comprehensive cross-agent diagnostic tool. Audits installations, paths, versions, and auth status of OpenAI Codex CLI, Claude Code CLI, and Gemini CLI without running silent background downloads.",
	inputSchema: {
		type: "object",
		properties: {}
	}
};
const legacyDoctorToolDefinition = {
	...doctorToolDefinition,
	name: TOOL_NAMES.LEGACY_DOCTOR,
	description: getLegacyAliasDescription(TOOL_NAMES.DOCTOR)
};
const codexStatusToolDefinition = {
	name: TOOL_NAMES.CODEX_STATUS,
	description: "Diagnostic check: returns the OpenAI Codex CLI installation status, configuration, available models, reasoning efforts, and active policies.",
	inputSchema: {
		type: "object",
		properties: {}
	}
};
async function handleDoctor() {
	const report = await runDoctor();
	return { content: [{
		type: "text",
		text: JSON.stringify(report, null, 2)
	}] };
}
async function handleCodexStatus() {
	const probe = await probe$2();
	return { content: [{
		type: "text",
		text: JSON.stringify({
			status: probe.installed ? "operational" : "degraded_cli_missing",
			executable_path: probe.command,
			active_config: {
				model: probe.config?.defaultModel,
				reasoning_effort: probe.config?.defaultReasoningEffort,
				config_path: probe.configPath
			},
			available_models: probe.availableModels,
			reasoning_effort_levels: probe.supportedReasoningEfforts,
			governance_policy: {
				astra_requires_survey_confirmation: true,
				default_sandbox: "read-only"
			}
		}, null, 2)
	}] };
}
//#endregion
//#region src/services/config.service.ts
const DEFAULT_CONFIG_DIR = process.env[CONFIG_CONSTANTS.ENV_DIR] || process.env[CONFIG_CONSTANTS.LEGACY_ENV_DIR] || path.default.join(os.default.homedir(), CONFIG_CONSTANTS.DIR_NAME);
const LEGACY_CONFIG_FILE = path.default.join(os.default.homedir(), CONFIG_CONSTANTS.LEGACY_DIR_NAME, CONFIG_CONSTANTS.FILE_NAME);
const CONFIG_FILE = process.env[CONFIG_CONSTANTS.ENV_CONFIG] || process.env[CONFIG_CONSTANTS.LEGACY_ENV_CONFIG] || path.default.join(DEFAULT_CONFIG_DIR, CONFIG_CONSTANTS.FILE_NAME);
const VALID_BACKENDS = [
	"codex",
	"claude",
	"gemini",
	"smart_quota"
];
const VALID_STRATEGIES = ["fixed", "smart_quota"];
const DEFAULT_CONFIG = {
	schemaVersion: 1,
	defaultBackend: null,
	routing: {
		strategy: "fixed",
		allowedBackends: ["codex", "claude"]
	}
};
function ensureConfigDir() {
	const dir = path.default.dirname(CONFIG_FILE);
	if (!fs.default.existsSync(dir)) try {
		fs.default.mkdirSync(dir, { recursive: true });
	} catch (_) {}
}
function validateConfig(config) {
	if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Configuration Error: configuration must be a valid JSON object.");
	const schemaVersion = config.schemaVersion ?? DEFAULT_CONFIG.schemaVersion;
	if (typeof schemaVersion !== "number" || schemaVersion < 1) throw new Error(`Configuration Error: Invalid schemaVersion: expected positive number, got ${schemaVersion}`);
	let defaultBackend = config.defaultBackend;
	if (defaultBackend !== null && defaultBackend !== void 0) {
		if (typeof defaultBackend !== "string" || !VALID_BACKENDS.includes(defaultBackend.toLowerCase())) throw new Error(`Configuration Error: Invalid defaultBackend: '${defaultBackend}'. Supported: ${VALID_BACKENDS.join(", ")} or null.`);
		defaultBackend = defaultBackend.toLowerCase();
	} else defaultBackend = null;
	const routing = config.routing;
	let strategy = DEFAULT_CONFIG.routing.strategy;
	let allowedBackends = [...DEFAULT_CONFIG.routing.allowedBackends];
	if (routing !== void 0 && routing !== null) {
		if (typeof routing !== "object" || Array.isArray(routing)) throw new Error("Configuration Error: routing must be a valid object.");
		if (routing.strategy !== void 0) {
			if (!VALID_STRATEGIES.includes(routing.strategy)) throw new Error(`Configuration Error: Invalid routing strategy: '${routing.strategy}'. Supported: ${VALID_STRATEGIES.join(", ")}`);
			strategy = routing.strategy;
		}
		if (routing.allowedBackends !== void 0) {
			if (!Array.isArray(routing.allowedBackends)) throw new Error(`Configuration Error: Invalid allowedBackends: expected an array of strings, got ${typeof routing.allowedBackends}`);
			for (const b of routing.allowedBackends) if (typeof b !== "string" || ![
				"codex",
				"claude",
				"gemini"
			].includes(b.toLowerCase())) throw new Error(`Configuration Error: Invalid entry in allowedBackends: '${b}'. Supported: 'codex', 'claude', 'gemini'.`);
			allowedBackends = routing.allowedBackends.map((b) => b.toLowerCase());
		}
	}
	return {
		schemaVersion,
		defaultBackend,
		routing: {
			strategy,
			allowedBackends
		}
	};
}
function loadConfig() {
	const targetFile = fs.default.existsSync(CONFIG_FILE) ? CONFIG_FILE : !process.env.SYNAGENT_CONFIG && !process.env.OMNIAGENT_CONFIG && fs.default.existsSync(LEGACY_CONFIG_FILE) ? LEGACY_CONFIG_FILE : null;
	if (!targetFile) return {
		...DEFAULT_CONFIG,
		routing: {
			...DEFAULT_CONFIG.routing,
			allowedBackends: [...DEFAULT_CONFIG.routing.allowedBackends]
		}
	};
	let raw;
	try {
		raw = fs.default.readFileSync(targetFile, "utf8");
	} catch (err) {
		throw new Error(`Configuration Error: Failed to read '${targetFile}': ${err.message}`);
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(`Configuration Error: Malformed JSON in '${CONFIG_FILE}': ${err.message}`);
	}
	return validateConfig(parsed);
}
function saveConfig(updates) {
	ensureConfigDir();
	const current = fs.default.existsSync(CONFIG_FILE) ? loadConfig() : { ...DEFAULT_CONFIG };
	const merged = validateConfig({
		...current,
		...updates,
		routing: {
			...current.routing,
			...updates.routing || {}
		}
	});
	const tmpPath = `${CONFIG_FILE}.tmp.${Date.now()}`;
	fs.default.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf8");
	fs.default.renameSync(tmpPath, CONFIG_FILE);
	return merged;
}
function setDefaultBackend(backend) {
	if (typeof backend !== "string" || !VALID_BACKENDS.includes(backend.toLowerCase())) throw new Error(`Validation Error: backend must be one of: ${VALID_BACKENDS.join(", ")}. Received: '${backend}'`);
	return saveConfig({ defaultBackend: backend.toLowerCase() });
}
//#endregion
//#region src/tools/config.tool.ts
const setDefaultToolDefinition = {
	name: TOOL_NAMES.SET_DEFAULT,
	description: `Set and persist your preferred default CLI agent backend in ~/${CONFIG_CONSTANTS.DIR_NAME}/${CONFIG_CONSTANTS.FILE_NAME}.`,
	inputSchema: {
		type: "object",
		properties: { backend: {
			type: "string",
			enum: [
				"codex",
				"claude",
				"smart_quota"
			],
			description: "The preferred default backend: \"codex\", \"claude\", or \"smart_quota\" (routes dynamically based on 5h rolling window headroom)."
		} },
		required: ["backend"]
	}
};
const legacySetDefaultToolDefinition = {
	...setDefaultToolDefinition,
	name: TOOL_NAMES.LEGACY_SET_DEFAULT,
	description: getLegacyAliasDescription(TOOL_NAMES.SET_DEFAULT)
};
async function handleSetDefault(args) {
	setDefaultBackend(args.backend);
	return { content: [{
		type: "text",
		text: `Successfully set default backend to '${args.backend}'. Saved to ${CONFIG_FILE}`
	}] };
}
//#endregion
//#region src/services/quota.service.ts
function getQuotaCacheFile() {
	return process.env.OMNIAGENT_QUOTA_CACHE || path.default.join(os.default.homedir(), ".omniagent", "quota-cache.json");
}
/**
* Sanitizes cached entries by immediately clearing expired rate-limiting cooldowns.
*/
function sanitizeCacheData(data) {
	if (!data || typeof data !== "object") return {};
	const now = Date.now();
	for (const id of Object.keys(data)) {
		const entry = data[id];
		if (entry && entry.status === "rate_limited") {
			const expiry = entry.cooldownUntil || entry.resetsAt;
			if (!expiry || now >= new Date(expiry).getTime()) {
				entry.status = "operational";
				entry.cooldownUntil = null;
				entry.resetsAt = null;
				entry.cooldownReason = null;
			}
		}
	}
	return data;
}
/**
* Reads cached quota records from disk with active cooldown validation.
*/
function readQuotaCache() {
	const cacheFile = getQuotaCacheFile();
	if (fs.default.existsSync(cacheFile)) try {
		const cached = JSON.parse(fs.default.readFileSync(cacheFile, "utf8"));
		if (cached && cached.data) cached.data = sanitizeCacheData(cached.data);
		return cached;
	} catch (_) {}
	return null;
}
/**
* Writes quota records to disk.
*/
function writeQuotaCache(data) {
	const cacheFile = getQuotaCacheFile();
	try {
		const dir = path.default.dirname(cacheFile);
		if (!fs.default.existsSync(dir)) fs.default.mkdirSync(dir, { recursive: true });
		fs.default.writeFileSync(cacheFile, JSON.stringify({
			timestamp: Date.now(),
			data
		}, null, 2), "utf8");
	} catch (_) {}
}
/**
* Inspects rate limits for active backends without burning generation tokens.
* Quotas remain null unless recorded via real telemetry or runtime rate-limit events.
*/
async function inspectQuotas(forceRefresh = false, probesOverride = null) {
	const rawCache = readQuotaCache();
	const cachedData = rawCache?.data || {};
	const hasAllBackends = !!(cachedData.codex && cachedData.claude);
	const isFresh = rawCache && hasAllBackends && Date.now() - rawCache.timestamp < 6e4;
	if (!forceRefresh && isFresh) return cachedData;
	const [codexProbe, claudeProbe] = probesOverride ? [probesOverride.codex, probesOverride.claude] : await Promise.all([probe$2(), probe$1()]);
	const result = {
		codex: {
			installed: !!codexProbe?.installed,
			status: codexProbe?.installed ? "operational" : "uninstalled",
			window: "5h",
			usedPercent: null,
			resetsAt: null,
			cooldownUntil: null,
			headroomPercent: null,
			measured: false
		},
		claude: {
			installed: !!claudeProbe?.installed,
			status: claudeProbe?.installed ? "operational" : "uninstalled",
			window: "5h",
			usedPercent: null,
			resetsAt: null,
			cooldownUntil: null,
			headroomPercent: null,
			measured: false
		}
	};
	const latestCache = readQuotaCache()?.data || {};
	const now = Date.now();
	for (const id of ["codex", "claude"]) {
		const prior = latestCache[id] || cachedData[id];
		if (prior && prior.status === "rate_limited") {
			const expiry = prior.cooldownUntil || prior.resetsAt;
			if (expiry && now < new Date(expiry).getTime()) {
				result[id].status = "rate_limited";
				result[id].cooldownUntil = expiry;
				result[id].cooldownReason = prior.cooldownReason || "Rate limit active";
			}
		}
	}
	writeQuotaCache(result);
	return result;
}
/**
* Checks if an error output string indicates a rate limit or quota exhaustion.
*/
function isRateLimitError(text) {
	if (!text || typeof text !== "string") return false;
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("Partial output:") || trimmed.startsWith("Partial review:")) break;
		if (/["'](?:status|code|statusCode)["']\s*:\s*(?:429(?!\d)|["']rate_limit_exceeded["'])/i.test(trimmed)) return true;
		if (/\b(?:http\s*status\s*[:=]?\s*|status\s*(?:code)?\s*[:=]?\s*|api\s*error\s*[:=]?\s*|http[\s/]+(?:1\.[01]|2(?:\.0)?)?\s*)429(?!\.[a-zA-Z0-9])(?:\s|$|[:,\r\n"]|too\s+many\s+requests)/i.test(trimmed)) return true;
		if (/\b429\s+too\s+many\s+requests\b/i.test(trimmed)) return true;
		if (/\b(?:rate[\s_-]?limit\s*(?:exceeded|reached)|usage\s*limit\s*reached|hit\s*(?:your\s*)?usage\s*limit)\b/i.test(trimmed)) return true;
		if (/\b(?:exceeded\s*your\s*(?:current\s*)?quota|insufficient_quota)\b/i.test(trimmed)) return true;
		if (/\b(?:credit\s*balance\s*is\s*too\s*low|organization\s*has\s*run\s*out\s*of\s*credits)\b/i.test(trimmed)) return true;
		if (/\brate_limit_error\b/i.test(trimmed)) return true;
	}
	return false;
}
/**
* Records a rate-limiting cooldown (e.g. after receiving a 429 response or usage limit error).
*/
function recordQuotaCooldown(backendId, cooldownMs = 9e5, reason = "Rate limit detected") {
	const current = readQuotaCache()?.data || {};
	const backend = current[backendId] || {
		installed: true,
		window: "5h",
		measured: false
	};
	backend.status = "rate_limited";
	backend.cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
	backend.cooldownReason = reason;
	backend.usedPercent = null;
	backend.headroomPercent = null;
	backend.resetsAt = null;
	backend.measured = false;
	current[backendId] = backend;
	writeQuotaCache(current);
}
/**
* Automatically inspects process execution output and records rate-limit cooldown if detected.
*/
function checkAndRecordRateLimit(backendId, output) {
	if (isRateLimitError(output)) {
		recordQuotaCooldown(backendId, 9e5, "Rate limit detected in execution output");
		return true;
	}
	return false;
}
/**
* Chooses the backend with the highest headroom or earliest reset in the 5h window.
*/
async function selectSmartQuotaBackend(candidates = null, options = {}) {
	const config = options.config || loadConfig();
	const allowed = new Set(config.routing?.allowedBackends || ["codex", "claude"]);
	const baseCandidates = (candidates || ["codex", "claude"]).filter((id) => allowed.has(id));
	if (baseCandidates.length === 0) throw new Error(`No allowed backends available for smart_quota routing. Allowed: [${Array.from(allowed).join(", ")}]`);
	const quotas = options.quotasOverride || await inspectQuotas(false, options.probesOverride);
	const installed = baseCandidates.filter((id) => quotas[id] && quotas[id].installed);
	if (installed.length === 0) throw new Error("No active CLI backends installed for smart_quota routing.");
	const unblocked = installed.filter((id) => {
		const q = quotas[id];
		if (q.status === "rate_limited") return false;
		if (q.usedPercent !== null && q.usedPercent >= 100) return false;
		return true;
	});
	if (unblocked.length === 0) {
		const expiries = installed.map((id) => quotas[id]?.cooldownUntil || quotas[id]?.resetsAt).filter(Boolean).sort();
		const earliestMsg = expiries.length > 0 ? ` Earliest recovery cooldown resets at: ${expiries[0]}` : "";
		throw new Error(`All supported backends have currently exhausted their 5-hour limit windows.${earliestMsg}`);
	}
	if (unblocked.length === 1) return unblocked[0];
	const [first, second] = unblocked;
	const headroomA = quotas[first].headroomPercent;
	const headroomB = quotas[second].headroomPercent;
	if (headroomA !== null && headroomB !== null) {
		if (Math.abs(headroomA - headroomB) >= 10) return headroomA > headroomB ? first : second;
		return (quotas[first].resetsAt ? new Date(quotas[first].resetsAt).getTime() : Infinity) <= (quotas[second].resetsAt ? new Date(quotas[second].resetsAt).getTime() : Infinity) ? first : second;
	}
	if (headroomA !== null && headroomB === null) return first;
	if (headroomB !== null && headroomA === null) return second;
	return unblocked[0];
}
//#endregion
//#region src/tools/quota.tool.ts
const quotaToolDefinition = {
	name: TOOL_NAMES.QUOTA_STATUS,
	description: "Check current 5-hour rolling limit headroom, usage percentages, and reset timestamps across active CLI backends without consuming generation tokens.",
	inputSchema: {
		type: "object",
		properties: { refresh: {
			type: "boolean",
			description: "Force live refresh instead of reading cached telemetry."
		} }
	}
};
const legacyQuotaToolDefinition = {
	...quotaToolDefinition,
	name: TOOL_NAMES.LEGACY_QUOTA_STATUS,
	description: getLegacyAliasDescription(TOOL_NAMES.QUOTA_STATUS)
};
async function handleQuotaStatus(args) {
	const quotas = await inspectQuotas(args.refresh === true);
	return { content: [{
		type: "text",
		text: JSON.stringify(quotas, null, 2)
	}] };
}
//#endregion
//#region src/tools/issue.tool.ts
const reportBugToolDefinition = {
	name: TOOL_NAMES.REPORT_BUG,
	description: "Prepare a privacy-sanitized bug report and pre-filled GitHub issue URL to submit feedback or report issues to the maintainers.",
	inputSchema: {
		type: "object",
		properties: {
			error_message: {
				type: "string",
				description: "Optional error description or stack trace to include in the bug report."
			},
			context: {
				type: "string",
				description: "Optional description of what you were doing when the issue occurred."
			}
		}
	}
};
const legacyReportBugToolDefinition = {
	...reportBugToolDefinition,
	name: TOOL_NAMES.LEGACY_REPORT_BUG,
	description: getLegacyAliasDescription(TOOL_NAMES.REPORT_BUG)
};
async function handleReportBug(args) {
	const doctorReport = await runDoctor().catch(() => null);
	return { content: [{
		type: "text",
		text: generateBugReport({
			errorMessage: args.error_message,
			context: args.context,
			doctorReport
		}).prompt
	}] };
}
//#endregion
//#region src/services/session.service.ts
function getSessionsDir() {
	if (process.env[CONFIG_CONSTANTS.ENV_SESSIONS_DIR]) return process.env[CONFIG_CONSTANTS.ENV_SESSIONS_DIR];
	if (process.env[CONFIG_CONSTANTS.LEGACY_ENV_SESSIONS_DIR]) return process.env[CONFIG_CONSTANTS.LEGACY_ENV_SESSIONS_DIR];
	if (process.env.SYNAGENT_SESSIONS) {
		const p = process.env.SYNAGENT_SESSIONS;
		return p.endsWith(".json") ? path.default.join(path.default.dirname(p), "sessions") : p;
	}
	if (process.env.OMNIAGENT_SESSIONS) {
		const p = process.env.OMNIAGENT_SESSIONS;
		return p.endsWith(".json") ? path.default.join(path.default.dirname(p), "sessions") : p;
	}
	return path.default.join(os.default.homedir(), CONFIG_CONSTANTS.DIR_NAME, "sessions");
}
function isProcessAlive(pid) {
	if (!pid || typeof pid !== "number") return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err.code === "EPERM";
	}
}
function canonicalPath(p) {
	if (!p) return "";
	const resolved = path.default.resolve(p);
	try {
		if (fs.default.existsSync(resolved)) return fs.default.realpathSync.native ? fs.default.realpathSync.native(resolved) : fs.default.realpathSync(resolved);
	} catch (_) {}
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function sanitizeHandle(handle) {
	if (!handle || typeof handle !== "string") return null;
	return handle.replace(/[^a-zA-Z0-9_-]/g, "");
}
function getSessionFilePath(handle) {
	const cleanHandle = sanitizeHandle(handle);
	if (!cleanHandle) return null;
	return path.default.join(getSessionsDir(), `${cleanHandle}.json`);
}
function saveSessionFile(filePath, record) {
	const dir = path.default.dirname(filePath);
	if (!fs.default.existsSync(dir)) fs.default.mkdirSync(dir, { recursive: true });
	const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
	try {
		fs.default.writeFileSync(tmp, JSON.stringify(record, null, 2), "utf8");
		fs.default.renameSync(tmp, filePath);
	} catch (err) {
		try {
			fs.default.unlinkSync(tmp);
		} catch (_) {}
		throw new Error(`Failed to persist session to disk at '${filePath}': ${err.message}`);
	}
}
function sleepSync(ms) {
	try {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
	} catch (_) {
		const end = Date.now() + ms;
		while (Date.now() < end);
	}
}
function getBackoffDelay(attempt) {
	return Math.min(80, 10 + attempt * 5) + Math.floor(Math.random() * 10);
}
function withSessionLock(handle, fn) {
	const cleanHandle = sanitizeHandle(handle);
	if (!cleanHandle) return {
		ok: false,
		error: "Invalid session handle format"
	};
	const filePath = getSessionFilePath(cleanHandle);
	if (!filePath) return {
		ok: false,
		error: "Invalid session path"
	};
	const dir = path.default.dirname(filePath);
	if (!fs.default.existsSync(dir)) fs.default.mkdirSync(dir, { recursive: true });
	const lockFile = `${filePath}.lock`;
	const reclaimMutex = `${lockFile}.reclaim`;
	const myToken = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
	const lockData = JSON.stringify({
		token: myToken,
		pid: process.pid,
		time: Date.now()
	});
	const maxAttempts = 150;
	let acquired = false;
	for (let attempt = 0; attempt < maxAttempts; attempt++) try {
		fs.default.writeFileSync(lockFile, lockData, { flag: "wx" });
		acquired = true;
		break;
	} catch (err) {
		if (err.code === "EEXIST") {
			let isStale = false;
			try {
				const raw = fs.default.readFileSync(lockFile, "utf8");
				const data = JSON.parse(raw);
				const hasPid = data && typeof data.pid === "number";
				const isDead = hasPid && !isProcessAlive(data.pid);
				const stat = fs.default.statSync(lockFile);
				const isAbandoned = Date.now() - stat.mtimeMs > 5e3;
				if (isDead || isAbandoned && !hasPid) isStale = true;
			} catch (_) {
				try {
					const stat = fs.default.statSync(lockFile);
					if (Date.now() - stat.mtimeMs > 5e3) isStale = true;
				} catch (_) {}
			}
			if (isStale) {
				let wonReclaimMutex = false;
				try {
					fs.default.writeFileSync(reclaimMutex, JSON.stringify({
						pid: process.pid,
						time: Date.now()
					}), { flag: "wx" });
					wonReclaimMutex = true;
				} catch (_) {}
				if (wonReclaimMutex) try {
					let staleToken = null;
					try {
						const raw = fs.default.readFileSync(lockFile, "utf8");
						const data = JSON.parse(raw);
						if (data && data.token) staleToken = data.token;
					} catch (_) {}
					if (staleToken) {
						const reapPath = `${lockFile}.reap.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
						try {
							fs.default.renameSync(lockFile, reapPath);
							let wonReap = false;
							try {
								const reaped = JSON.parse(fs.default.readFileSync(reapPath, "utf8"));
								if (reaped && reaped.token === staleToken) wonReap = true;
							} catch (_) {}
							try {
								fs.default.unlinkSync(reapPath);
							} catch (_) {}
							if (wonReap) {
								fs.default.writeFileSync(lockFile, lockData, { flag: "wx" });
								acquired = true;
								break;
							}
						} catch (_) {}
					}
				} finally {
					try {
						fs.default.unlinkSync(reclaimMutex);
					} catch (_) {}
				}
			}
			sleepSync(getBackoffDelay(attempt));
			if (attempt === 149) return {
				ok: false,
				error: `Session '${cleanHandle}' is temporarily locked. Please retry in a moment.`
			};
			continue;
		}
		return {
			ok: false,
			error: err.message
		};
	}
	if (!acquired) return {
		ok: false,
		error: `Failed to acquire lock for session '${cleanHandle}'`
	};
	try {
		return {
			ok: true,
			data: fn(filePath)
		};
	} finally {
		try {
			if (fs.default.existsSync(lockFile)) {
				const raw = fs.default.readFileSync(lockFile, "utf8");
				const data = JSON.parse(raw);
				if (data && data.token === myToken) fs.default.unlinkSync(lockFile);
			}
		} catch (_) {}
	}
}
function acquireSessionTurn(handle) {
	const cleanHandle = sanitizeHandle(handle);
	if (!cleanHandle) return {
		ok: false,
		error: "Invalid session handle"
	};
	const res = withSessionLock(cleanHandle, (filePath) => {
		if (!fs.default.existsSync(filePath)) return {
			ok: false,
			error: `Session '${cleanHandle}' does not exist.`
		};
		let session;
		try {
			session = JSON.parse(fs.default.readFileSync(filePath, "utf8"));
		} catch (e) {
			return {
				ok: false,
				error: `Session file corrupted: ${e.message}`
			};
		}
		if (session.activePid && isProcessAlive(session.activePid)) return {
			ok: false,
			error: `Session '${cleanHandle}' is currently busy executing another turn${session.activePid === process.pid ? "" : ` in process ${session.activePid}`}. Please wait for it to finish or omit 'session_handle'.`
		};
		const lastUsed = new Date(session.lastUsedAt).getTime();
		if (Date.now() - lastUsed > 72e5) {
			try {
				fs.default.unlinkSync(filePath);
			} catch (_) {}
			return {
				ok: false,
				error: `Session '${cleanHandle}' has expired (2-hour TTL). Please start a new session.`
			};
		}
		session.activePid = process.pid;
		session.activeTurnAt = Date.now();
		session.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
		saveSessionFile(filePath, session);
		return { ok: true };
	});
	return res.data || res;
}
function releaseSessionTurn(handle) {
	const cleanHandle = sanitizeHandle(handle);
	if (!cleanHandle) return {
		ok: false,
		error: "Invalid session handle"
	};
	const result = withSessionLock(cleanHandle, (filePath) => {
		if (!fs.default.existsSync(filePath)) return { ok: true };
		try {
			const session = JSON.parse(fs.default.readFileSync(filePath, "utf8"));
			if (session.activePid === process.pid) {
				session.activePid = null;
				session.activeTurnAt = null;
				session.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveSessionFile(filePath, session);
			}
			return { ok: true };
		} catch (e) {
			return {
				ok: false,
				error: `Failed to persist released turn: ${e.message}`
			};
		}
	});
	return result.data || result;
}
let lastPruneTime = 0;
let pruneCursor = 0;
const PRUNE_INTERVAL_MS = 3e5;
const PRUNE_BATCH_SIZE = 100;
function pruneExpiredSessions(force = false) {
	const now = Date.now();
	if (!force && now - lastPruneTime < PRUNE_INTERVAL_MS) return;
	lastPruneTime = now;
	try {
		const dir = getSessionsDir();
		if (!fs.default.existsSync(dir)) return;
		const allFiles = fs.default.readdirSync(dir);
		if (!allFiles || allFiles.length === 0) return;
		const totalFiles = allFiles.length;
		const startIdx = pruneCursor % totalFiles;
		pruneCursor = (startIdx + PRUNE_BATCH_SIZE) % totalFiles;
		const batchCount = Math.min(totalFiles, PRUNE_BATCH_SIZE);
		for (let i = 0; i < batchCount; i++) {
			const file = allFiles[(startIdx + i) % totalFiles];
			const fullPath = path.default.join(dir, file);
			if (file.endsWith(".lock") || file.includes(".lock.") || file.includes(".reclaim") || file.includes(".busy")) {
				try {
					let isStale = false;
					try {
						const raw = fs.default.readFileSync(fullPath, "utf8");
						const data = JSON.parse(raw);
						const hasPid = data && typeof data.pid === "number";
						if (hasPid && isProcessAlive(data.pid)) continue;
						if (hasPid && !isProcessAlive(data.pid)) isStale = true;
						else if (now - fs.default.statSync(fullPath).mtimeMs > 6e4) isStale = true;
					} catch (_) {
						try {
							if (now - fs.default.statSync(fullPath).mtimeMs > 6e4) isStale = true;
						} catch (_) {}
					}
					if (isStale) try {
						fs.default.unlinkSync(fullPath);
					} catch (_) {}
				} catch (_) {}
				continue;
			}
			if (!file.startsWith("omni_sess_") || !file.endsWith(".json")) continue;
			withSessionLock(file.replace(/\.json$/, ""), (fPath) => {
				if (!fs.default.existsSync(fPath)) return;
				try {
					const raw = fs.default.readFileSync(fPath, "utf8");
					const session = JSON.parse(raw);
					if (session && session.lastUsedAt) {
						if (session.activePid && isProcessAlive(session.activePid)) return;
						const lastUsed = new Date(session.lastUsedAt).getTime();
						if (now - lastUsed > 72e5) fs.default.unlinkSync(fPath);
					}
				} catch (_) {
					try {
						const st = fs.default.statSync(fPath);
						if (now - st.mtimeMs > 6e4) fs.default.unlinkSync(fPath);
					} catch (_) {}
				}
			});
		}
	} catch (_) {}
}
function createSession(backend, workspace = process.cwd(), threadId = null) {
	pruneExpiredSessions();
	const handle = `omni_sess_${crypto.default.randomBytes(6).toString("hex")}`;
	const record = {
		sessionHandle: handle,
		backend: backend.toLowerCase(),
		threadId: threadId || null,
		workspace: canonicalPath(workspace),
		activePid: null,
		activeTurnAt: null,
		createdAt: (/* @__PURE__ */ new Date()).toISOString(),
		lastUsedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	const filePath = getSessionFilePath(handle);
	if (filePath) saveSessionFile(filePath, record);
	return record;
}
function getSession(sessionHandle, options = {}) {
	const filePath = getSessionFilePath(sessionHandle);
	if (!filePath || !fs.default.existsSync(filePath)) return null;
	let session;
	try {
		session = JSON.parse(fs.default.readFileSync(filePath, "utf8"));
	} catch (_) {
		return null;
	}
	if (!session || typeof session !== "object") return null;
	if (!(session.activePid && isProcessAlive(session.activePid))) {
		const lastUsed = new Date(session.lastUsedAt).getTime();
		if (Date.now() - lastUsed > 72e5) {
			try {
				fs.default.unlinkSync(filePath);
			} catch (_) {}
			return null;
		}
	}
	if (options.backend && session.backend !== options.backend.toLowerCase()) return null;
	if (options.workspace) {
		if (canonicalPath(options.workspace) !== canonicalPath(session.workspace)) return null;
	}
	return session;
}
function updateSession(sessionHandle, updates = {}) {
	const filePath = getSessionFilePath(sessionHandle);
	if (!filePath || !fs.default.existsSync(filePath)) return null;
	let session;
	try {
		session = JSON.parse(fs.default.readFileSync(filePath, "utf8"));
	} catch (_) {
		return null;
	}
	const updatedRecord = {
		...session,
		...updates,
		lastUsedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	saveSessionFile(filePath, updatedRecord);
	return updatedRecord;
}
function closeSession(sessionHandle) {
	const cleanHandle = sanitizeHandle(sessionHandle);
	if (!cleanHandle) return false;
	const turnLock = acquireSessionTurn(cleanHandle);
	if (!turnLock.ok) throw new Error(`Cannot close session '${cleanHandle}': ${turnLock.error}`);
	try {
		const filePath = getSessionFilePath(cleanHandle);
		let closed = false;
		if (filePath && fs.default.existsSync(filePath)) try {
			fs.default.unlinkSync(filePath);
			closed = true;
		} catch (err) {
			throw new Error(`Failed to close session at '${filePath}': ${err.message}`);
		}
		return closed;
	} finally {
		releaseSessionTurn(cleanHandle);
	}
}
function acquireAndResolveSession(sessionHandle, backendId = "codex", workspaceCwd = process.cwd()) {
	if (sessionHandle) {
		const cleanHandle = sanitizeHandle(sessionHandle);
		if (!cleanHandle) return { error: `Invalid session handle format: '${sessionHandle}'` };
		const turnLock = acquireSessionTurn(cleanHandle);
		if (!turnLock.ok) return { error: turnLock.error };
		const existing = getSession(cleanHandle, {
			backend: backendId,
			workspace: workspaceCwd
		});
		if (!existing) {
			releaseSessionTurn(cleanHandle);
			return { error: `Invalid or expired session handle: '${sessionHandle}'. The session may have expired (2-hour TTL), been closed, or was opened in another workspace or backend. Please omit 'session_handle' to start a new session.` };
		}
		return { session: existing };
	}
	const session = createSession(backendId, workspaceCwd);
	const turnLock = acquireSessionTurn(session.sessionHandle);
	if (!turnLock.ok) return { error: turnLock.error };
	return { session };
}
//#endregion
//#region src/tools/session.tool.ts
const closeSessionToolDefinition = {
	name: TOOL_NAMES.CLOSE_SESSION,
	description: "Close and clean up an active multi-turn conversation session.",
	inputSchema: {
		type: "object",
		properties: { session_handle: {
			type: "string",
			description: "The opaque session handle to close."
		} },
		required: ["session_handle"]
	}
};
const legacyCloseSessionToolDefinition = {
	...closeSessionToolDefinition,
	name: TOOL_NAMES.LEGACY_CLOSE_SESSION,
	description: getLegacyAliasDescription(TOOL_NAMES.CLOSE_SESSION)
};
async function handleCloseSession(args) {
	return { content: [{
		type: "text",
		text: closeSession(args.session_handle) ? `Session '${args.session_handle}' closed successfully.` : `Session '${args.session_handle}' not found or already closed.`
	}] };
}
//#endregion
//#region src/services/router.service.ts
/**
* Resolves the appropriate CLI adapter based on caller request, user configuration,
* installation state, and quota availability.
*
* @param requestedBackend - Optional target ('auto', 'codex', 'claude', 'smart_quota')
* @returns Resolved backend structure with adapter and probe
* @throws Error if requested backend is invalid, uninstalled, or forbidden by policy
*/
async function resolveBackend(requestedBackend) {
	const config = loadConfig();
	const allowed = new Set(config.routing?.allowedBackends || ["codex", "claude"]);
	const [codexProbe, claudeProbe] = await Promise.all([probe$2(), probe$1()]);
	const candidates = ["codex", "claude"].filter((b) => allowed.has(b));
	async function resolveSmartQuota() {
		if (candidates.length === 0) throw new Error(`No permitted backends available for smart_quota (routing.allowedBackends: [${Array.from(allowed).join(", ")}]).`);
		const selectedId = await selectSmartQuotaBackend(candidates);
		const adapter = selectedId === "codex" ? codexAdapter : claudeAdapter;
		const probe = selectedId === "codex" ? codexProbe : claudeProbe;
		if (!probe.installed) throw new Error(`Selected smart_quota backend '${selectedId}' is not installed or operational. Run 'omniagent_doctor' for diagnostic details.`);
		return {
			id: selectedId,
			adapter,
			probe,
			isSmartQuota: true
		};
	}
	const rawTarget = typeof requestedBackend === "string" && requestedBackend.trim() ? requestedBackend.trim().toLowerCase() : "auto";
	if (rawTarget === "codex") {
		if (!allowed.has("codex")) throw new Error(`Backend 'codex' is not permitted by configuration (routing.allowedBackends: [${Array.from(allowed).join(", ")}]).`);
		if (!codexProbe.installed) throw new Error(`OpenAI Codex CLI is not installed. Run 'npm install -g @openai/codex' in your terminal.`);
		return {
			id: "codex",
			adapter: codexAdapter,
			probe: codexProbe
		};
	}
	if (rawTarget === "claude") {
		if (!allowed.has("claude")) throw new Error(`Backend 'claude' is not permitted by configuration (routing.allowedBackends: [${Array.from(allowed).join(", ")}]).`);
		if (!claudeProbe.installed) throw new Error(`Claude Code CLI is not installed. Run 'npm install -g @anthropic-ai/claude-code' in your terminal.`);
		return {
			id: "claude",
			adapter: claudeAdapter,
			probe: claudeProbe
		};
	}
	if (rawTarget === "smart_quota") return await resolveSmartQuota();
	if (rawTarget !== "auto") throw new Error(`Invalid backend '${requestedBackend}'. Supported options are: 'auto', 'codex', 'claude', 'smart_quota'.`);
	if (config.defaultBackend) {
		const configuredTarget = config.defaultBackend.toLowerCase();
		if (configuredTarget === "smart_quota") return await resolveSmartQuota();
		if (configuredTarget === "codex") {
			if (!allowed.has("codex")) throw new Error(`Configured default backend 'codex' is disabled by routing.allowedBackends: [${Array.from(allowed).join(", ")}].`);
			if (!codexProbe.installed) throw new Error("Configured default backend 'codex' is not installed or operational. Run 'npm install -g @openai/codex' or update your preferred backend using tool 'omniagent_set_default'. To preserve privacy and prevent unauthorized cross-provider code transmission, OmniAgent will not silently reroute to another provider.");
			return {
				id: "codex",
				adapter: codexAdapter,
				probe: codexProbe
			};
		}
		if (configuredTarget === "claude") {
			if (!allowed.has("claude")) throw new Error(`Configured default backend 'claude' is disabled by routing.allowedBackends: [${Array.from(allowed).join(", ")}].`);
			if (!claudeProbe.installed) throw new Error("Configured default backend 'claude' is not installed or operational. Run 'npm install -g @anthropic-ai/claude-code' or update your preferred backend using tool 'omniagent_set_default'. To preserve privacy and prevent unauthorized cross-provider code transmission, OmniAgent will not silently reroute to another provider.");
			return {
				id: "claude",
				adapter: claudeAdapter,
				probe: claudeProbe
			};
		}
		throw new Error(`Unknown configured default backend: '${config.defaultBackend}'.`);
	}
	const installedAllowed = [];
	if (codexProbe.installed && allowed.has("codex")) installedAllowed.push("codex");
	if (claudeProbe.installed && allowed.has("claude")) installedAllowed.push("claude");
	if (installedAllowed.length === 0) throw new Error("No active permitted CLI backends found. Please install either OpenAI Codex CLI ('npm install -g @openai/codex') or Claude Code CLI ('npm install -g @anthropic-ai/claude-code'). Use tool 'omniagent_doctor' for detailed diagnostics.");
	if (installedAllowed.length === 1) {
		const single = installedAllowed[0];
		try {
			setDefaultBackend(single);
		} catch (err) {
			throw new Error(`Failed to persist default backend configuration: ${err.message}`);
		}
		return {
			id: single,
			adapter: single === "codex" ? codexAdapter : claudeAdapter,
			probe: single === "codex" ? codexProbe : claudeProbe
		};
	}
	throw new Error("[ONBOARDING_REQUIRED] Multiple active coding agent CLIs detected: OpenAI Codex CLI and Claude Code CLI.\nPlease set your preferred default backend by invoking tool 'omniagent_set_default' with backend: \"codex\" | \"claude\" | \"smart_quota\", or supply the 'backend' parameter explicitly for this request.");
}
//#endregion
//#region src/services/git.service.ts
async function runGit(args, cwd = process.cwd(), abortSignal = null, timeoutMs = 15e3) {
	const result = await runCommand("git", args, {
		cwd,
		abortSignal,
		timeoutMs,
		maxBufferBytes: 4194304
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Git exited with code ${result.exitCode}`);
	if (result.isTruncated || result.stdout.includes("...[stdout truncated: buffer limit reached]")) return result.stdout + "\n\n[Warning: Git diff exceeded buffer limit (4MB) and was truncated.]";
	return result.stdout;
}
function sanitizeGitRef(ref) {
	if (typeof ref !== "string") throw new Error("Validation Error: Git ref must be a string.");
	const clean = ref.trim();
	if (!clean || clean.startsWith("-")) throw new Error(`Validation Error: Git ref cannot be empty or start with a dash ('${ref}').`);
	if (/[\s;`$|<>&"'\0]/.test(clean)) throw new Error(`Validation Error: invalid characters in Git ref '${ref}'.`);
	return clean;
}
async function collectGitScope(rawScope, workspaceCwd = process.cwd(), abortSignal = null) {
	const scope = typeof rawScope === "string" && rawScope.trim() ? rawScope.trim() : "uncommitted";
	if (scope !== "uncommitted" && scope.startsWith("-")) throw new Error("Validation Error: scope cannot start with a dash or flag.");
	if (scope === "uncommitted" || scope === "working" || scope === "all") {
		let hasHead = true;
		try {
			await runGit([
				"rev-parse",
				"--verify",
				"HEAD"
			], workspaceCwd, abortSignal);
		} catch (_) {
			hasHead = false;
		}
		const unstaged = await runGit([
			"diff",
			"--no-ext-diff",
			"--no-textconv",
			"--"
		], workspaceCwd, abortSignal);
		let diff = [(hasHead ? await runGit([
			"diff",
			"--no-ext-diff",
			"--no-textconv",
			"--cached",
			"HEAD",
			"--"
		], workspaceCwd, abortSignal) : await runGit([
			"diff",
			"--no-ext-diff",
			"--no-textconv",
			"--cached",
			"--"
		], workspaceCwd, abortSignal)).trim(), unstaged.trim()].filter(Boolean).join("\n\n");
		if (!diff && hasHead) diff = (await runGit([
			"diff",
			"--no-ext-diff",
			"--no-textconv",
			"HEAD",
			"--"
		], workspaceCwd, abortSignal)).trim();
		let repoRoot = workspaceCwd;
		try {
			repoRoot = (await runGit(["rev-parse", "--show-toplevel"], workspaceCwd, abortSignal)).trim() || workspaceCwd;
		} catch (_) {}
		const untracked = (await runGit([
			"ls-files",
			"--others",
			"--exclude-standard"
		], repoRoot, abortSignal)).trim();
		if (untracked) diff += `\n\n--- UNTRACKED FILES ---\n${untracked}\n`;
		return {
			type: "uncommitted",
			label: "Uncommitted working changes (staged, unstaged, untracked)",
			diff: diff.trim(),
			nativeArgs: ["--uncommitted"]
		};
	}
	if (scope === "staged" || scope === "cached" || scope === "index") return {
		type: "staged",
		label: "Staged index changes",
		diff: (await runGit([
			"diff",
			"--no-ext-diff",
			"--no-textconv",
			"--cached",
			"--"
		], workspaceCwd, abortSignal)).trim(),
		nativeArgs: null
	};
	if (scope.includes("..")) {
		const cleanRange = scope.replace(/^(range|compare):/i, "").trim();
		if (cleanRange.startsWith("-")) throw new Error(`Validation Error: range cannot start with a dash ('${scope}').`);
		const parts = cleanRange.split("..").filter(Boolean);
		if (parts.length === 0 || parts.length > 2) throw new Error(`Validation Error: invalid revision range '${scope}'.`);
		for (const p of parts) sanitizeGitRef(p);
		const diff = await runGit([
			"diff",
			"--no-ext-diff",
			"--no-textconv",
			cleanRange,
			"--"
		], workspaceCwd, abortSignal);
		return {
			type: "range",
			label: `Revision range (${cleanRange})`,
			diff: diff.trim(),
			nativeArgs: null
		};
	}
	const commitMatch = scope.match(/^commit:([0-9a-f]{7,40})$/i) || scope.match(/^([0-9a-f]{7,40})$/i);
	if (commitMatch) {
		const sha = commitMatch[1];
		const diff = await runGit([
			"show",
			"--no-ext-diff",
			"--no-textconv",
			sha,
			"--"
		], workspaceCwd, abortSignal);
		return {
			type: "commit",
			label: `Commit ${sha}`,
			diff: diff.trim(),
			nativeArgs: ["--commit", sha]
		};
	}
	if (scope.startsWith("commit:") || /^HEAD([~^]\d*)*$/i.test(scope)) {
		const rev = sanitizeGitRef(scope.replace(/^commit:/i, ""));
		const diff = await runGit([
			"show",
			"--no-ext-diff",
			"--no-textconv",
			rev,
			"--"
		], workspaceCwd, abortSignal);
		return {
			type: "commit",
			label: `Revision ${rev}`,
			diff: diff.trim(),
			nativeArgs: null
		};
	}
	const branchName = sanitizeGitRef(scope.replace(/^(base|branch):/i, ""));
	const diff = await runGit([
		"diff",
		"--no-ext-diff",
		"--no-textconv",
		`${branchName}...HEAD`,
		"--"
	], workspaceCwd, abortSignal);
	return {
		type: "branch",
		label: `Branch comparison against ${branchName} (${branchName}...HEAD)`,
		diff: diff.trim(),
		nativeArgs: null
	};
}
//#endregion
//#region src/tools/common.ts
function formatExecutionResult(backendId, res, defaultText = "No output received.", sessionHandle = null) {
	if (res.isError) {
		const diagnostic = res.errorDetail || res.output;
		if (diagnostic) checkAndRecordRateLimit(backendId, diagnostic);
	}
	let text = res.output || defaultText;
	if (sessionHandle && res.threadId && !res.isError) text += `\n\n[Session: ${sessionHandle}]`;
	return {
		isError: res.isError,
		content: [{
			type: "text",
			text
		}]
	};
}
//#endregion
//#region src/tools/review.tool.ts
function getReviewToolDefinitions(codexConfig) {
	const baseReviewSchema = {
		type: "object",
		properties: {
			scope: {
				type: "string",
				description: "Target changes to review. Formats: \"uncommitted\" (default), \"staged\", commit SHA (\"a1b2c3d\"), revision (\"HEAD~1\"), base branch (\"main\"), or revision range (\"main...feature\")."
			},
			instructions: {
				type: "string",
				description: "Review focus guidelines, constraints, conventions, or security/performance checks."
			},
			backend: {
				type: "string",
				enum: [
					"auto",
					"codex",
					"claude",
					"smart_quota"
				],
				description: "CLI agent backend to execute the review (default: \"auto\", respecting configured default or smart_quota)."
			},
			workspace_path: {
				type: "string",
				description: "Optional absolute path to workspace root."
			},
			model: {
				type: "string",
				description: "Optional model override for the selected backend."
			},
			reasoning_effort: {
				type: "string",
				description: "Reasoning depth level (e.g. \"low\", \"medium\", \"high\", \"xhigh\", \"max\")."
			},
			user_confirmed: {
				type: "boolean",
				description: "Mandatory true confirmation if invoking top-tier models (e.g. \"astra\", \"claude-3-opus\")."
			},
			session_handle: {
				type: "string",
				description: "Optional persistent session handle from a previous turn to preserve full multi-turn context."
			}
		}
	};
	return [
		{
			name: TOOL_NAMES.REVIEW,
			description: "Perform an automated code review on uncommitted changes, staged index, branches, or commits using local reasoning agents (Codex or Claude Code) in read-only sandbox mode.",
			inputSchema: baseReviewSchema
		},
		{
			name: TOOL_NAMES.LEGACY_REVIEW,
			description: getLegacyAliasDescription(TOOL_NAMES.REVIEW),
			inputSchema: baseReviewSchema
		},
		{
			name: TOOL_NAMES.CODEX_REVIEW,
			description: "Run an automated code review on uncommitted changes, staged index, branches, or commits using OpenAI Codex in read-only mode.",
			inputSchema: {
				type: "object",
				properties: {
					scope: {
						type: "string",
						description: "Target changes to review. Formats: \"uncommitted\" (default), \"staged\", commit SHA (\"a1b2c3d\"), revision (\"HEAD~1\"), base branch (\"main\"), or revision range (\"main...feature\")."
					},
					instructions: {
						type: "string",
						description: "Review focus guidelines, constraints, conventions, or security/performance checks."
					},
					workspace_path: {
						type: "string",
						description: "Optional absolute path to workspace root."
					},
					model: {
						type: "string",
						description: `Model to use (default: "${codexConfig.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`
					},
					reasoning_effort: {
						type: "string",
						enum: VALID_REASONING_EFFORTS,
						description: `Reasoning effort depth (default: "${codexConfig.defaultReasoningEffort}").`
					},
					user_confirmed: {
						type: "boolean",
						description: "Mandatory true confirmation if using the top-tier \"astra\" model."
					}
				}
			}
		}
	];
}
async function handleReview(toolName, args, workspaceCwd, abortSignal = null, onProgress = null) {
	const backend = await resolveBackend(toolName === TOOL_NAMES.CODEX_REVIEW ? "codex" : args.backend || "auto");
	const codexConfig = readCodexConfig();
	const requestedModel = typeof args.model === "string" && args.model.trim() ? args.model.trim() : backend.id === "codex" ? codexConfig.defaultModel : "claude-3-7-sonnet";
	const approval = checkModelGovernance(requestedModel, args.user_confirmed);
	if (approval) return approval;
	if (backend.id === "claude" && args.session_handle) return {
		isError: true,
		content: [{
			type: "text",
			text: "Multi-turn session continuation is currently supported on the Codex backend. Session continuation for Claude Code CLI is planned for a subsequent update."
		}]
	};
	const scopeInfo = await collectGitScope(args.scope, workspaceCwd, abortSignal);
	const hasInstructions = typeof args.instructions === "string" && args.instructions.trim();
	if (!scopeInfo.diff) return {
		isError: false,
		content: [{
			type: "text",
			text: `Review reported clean: No changes detected in target scope (${scopeInfo.label}).`
		}]
	};
	if (backend.id === "claude") return formatExecutionResult("claude", await executeClaude(`[TASK: CODE REVIEW & AUDIT]
Scope: ${scopeInfo.label}
Review Guidelines & Constraints:
${hasInstructions ? args.instructions : "Perform a comprehensive code review focusing on correctness, security, edge cases, and architectural best practices."}

DIFF / CHANGES:
${scopeInfo.diff}`, {
		cwd: workspaceCwd,
		model: requestedModel,
		reasoningEffort: args.reasoning_effort || "high",
		abortSignal: abortSignal || void 0,
		onProgress
	}));
	const cliModelArgs = [
		"-m",
		requestedModel,
		"-c",
		`model_reasoning_effort=${normalizeReasoningEffort(args.reasoning_effort, codexConfig.defaultReasoningEffort)}`
	];
	if (toolName === TOOL_NAMES.REVIEW || toolName === TOOL_NAMES.LEGACY_REVIEW || args.session_handle || hasInstructions || !scopeInfo.nativeArgs) {
		const sessionRes = acquireAndResolveSession(args.session_handle, backend.id, workspaceCwd);
		if (sessionRes.error) return {
			isError: true,
			content: [{
				type: "text",
				text: sessionRes.error
			}]
		};
		const session = sessionRes.session;
		const sessionOptions = session.threadId ? { threadId: session.threadId } : {};
		const prompt = `[TASK: CODE REVIEW & AUDIT]
Scope: ${scopeInfo.label}
Review Guidelines & Constraints:
${hasInstructions ? args.instructions : "Perform a comprehensive code review focusing on correctness, security, edge cases, and architectural best practices."}

DIFF / CHANGES:
${scopeInfo.diff}`;
		let execResult;
		let caughtErr = null;
		try {
			const res = await executeCodex([
				"--sandbox",
				"read-only",
				...cliModelArgs,
				"-"
			], prompt, workspaceCwd, abortSignal, onProgress, sessionOptions);
			if (res.threadId && session) updateSession(session.sessionHandle, { threadId: res.threadId });
			execResult = formatExecutionResult("codex", res, "Codex review reported clean status.", session.sessionHandle);
		} catch (err) {
			caughtErr = err;
		} finally {
			const rel = releaseSessionTurn(session.sessionHandle);
			if (rel && !rel.ok) {
				console.error(`[OmniAgent] Failed to release session '${session.sessionHandle}': ${rel.error}`);
				if (caughtErr) caughtErr.message += ` (Additionally, failed to release session lock: ${rel.error})`;
				else if (execResult && execResult.content) {
					const textEntry = execResult.content.find((c) => c.type === "text");
					if (textEntry) textEntry.text += `\n\n[Warning] Failed to release session lock: ${rel.error}`;
				}
			}
		}
		if (caughtErr) throw caughtErr;
		return execResult;
	}
	return formatExecutionResult("codex", await executeCodexReview([...cliModelArgs, ...scopeInfo.nativeArgs], workspaceCwd, abortSignal, onProgress), "Codex review reported clean status.");
}
//#endregion
//#region src/tools/consult.tool.ts
function getConsultToolDefinitions(codexConfig) {
	const baseConsultSchema = {
		type: "object",
		properties: {
			proposal: {
				type: "string",
				description: "The proposed plan, architecture, or refactoring strategy to evaluate."
			},
			specific_questions: {
				type: "string",
				description: "Specific concerns, trade-offs, or questions to address."
			},
			backend: {
				type: "string",
				enum: [
					"auto",
					"codex",
					"claude",
					"smart_quota"
				],
				description: "CLI agent backend to consult (default: \"auto\")."
			},
			workspace_path: {
				type: "string",
				description: "Optional absolute path to workspace root."
			},
			model: {
				type: "string",
				description: "Optional model override."
			},
			reasoning_effort: {
				type: "string",
				description: "Reasoning depth level (default: \"medium\")."
			},
			user_confirmed: {
				type: "boolean",
				description: "Mandatory true confirmation if using top-tier models (\"astra\", \"claude-3-opus\")."
			},
			session_handle: {
				type: "string",
				description: "Optional persistent session handle from a previous turn to preserve full multi-turn context."
			}
		},
		required: ["proposal"]
	};
	return [
		{
			name: TOOL_NAMES.CONSULT,
			description: "Consult local reasoning agents (Codex or Claude Code) for a second opinion on architecture plans, refactoring strategies, or technical trade-offs.",
			inputSchema: baseConsultSchema
		},
		{
			name: TOOL_NAMES.LEGACY_CONSULT,
			description: getLegacyAliasDescription(TOOL_NAMES.CONSULT),
			inputSchema: baseConsultSchema
		},
		{
			name: TOOL_NAMES.CODEX_CONSULT,
			description: "Consult OpenAI Codex for a second opinion on an architecture plan, refactoring strategy, or technical trade-offs.",
			inputSchema: {
				type: "object",
				properties: {
					proposal: {
						type: "string",
						description: "The proposed plan, architecture, or refactoring strategy to evaluate."
					},
					specific_questions: {
						type: "string",
						description: "Specific concerns, trade-offs, or questions to address."
					},
					workspace_path: {
						type: "string",
						description: "Optional absolute path to workspace root."
					},
					model: {
						type: "string",
						description: `Model to use (default: "${codexConfig.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`
					},
					reasoning_effort: {
						type: "string",
						enum: VALID_REASONING_EFFORTS,
						description: "Reasoning effort depth (default: \"medium\")."
					},
					user_confirmed: {
						type: "boolean",
						description: "Mandatory true confirmation if using the top-tier \"astra\" model."
					}
				},
				required: ["proposal"]
			}
		}
	];
}
async function handleConsult(toolName, args, workspaceCwd, abortSignal = null, onProgress = null) {
	if (typeof args.proposal !== "string" || !args.proposal.trim()) return {
		isError: true,
		content: [{
			type: "text",
			text: "Validation Error: proposal must be a non-empty string."
		}]
	};
	const backend = await resolveBackend(toolName === TOOL_NAMES.CODEX_CONSULT ? "codex" : args.backend || "auto");
	const codexConfig = readCodexConfig();
	const requestedModel = typeof args.model === "string" && args.model.trim() ? args.model.trim() : backend.id === "codex" ? codexConfig.defaultModel : "claude-3-7-sonnet";
	const approval = checkModelGovernance(requestedModel, args.user_confirmed);
	if (approval) return approval;
	const prompt = `[TASK: SECOND OPINION & DESIGN CONSULTATION]
Please evaluate the following proposal and provide a technical critique, potential pitfalls, and alternative approaches:

PROPOSAL:
${args.proposal}

QUESTIONS:
${args.specific_questions || "General review and risk assessment"}`;
	if (backend.id === "claude") {
		if (args.session_handle) return {
			isError: true,
			content: [{
				type: "text",
				text: "Multi-turn session continuation is currently supported on the Codex backend. Session continuation for Claude Code CLI is planned for a subsequent update."
			}]
		};
		return formatExecutionResult("claude", await executeClaude(prompt, {
			cwd: workspaceCwd,
			model: requestedModel,
			reasoningEffort: args.reasoning_effort || "medium",
			abortSignal: abortSignal || void 0,
			onProgress
		}));
	}
	const cliModelArgs = [
		"-m",
		requestedModel,
		"-c",
		`model_reasoning_effort=${normalizeReasoningEffort(args.reasoning_effort, "medium")}`
	];
	const sessionRes = acquireAndResolveSession(args.session_handle, backend.id, workspaceCwd);
	if (sessionRes.error) return {
		isError: true,
		content: [{
			type: "text",
			text: sessionRes.error
		}]
	};
	const session = sessionRes.session;
	const sessionOptions = session.threadId ? { threadId: session.threadId } : {};
	let execResult;
	let caughtErr = null;
	try {
		const res = await executeCodex([
			"--sandbox",
			"read-only",
			...cliModelArgs,
			"-"
		], prompt, workspaceCwd, abortSignal, onProgress, sessionOptions);
		if (res.threadId && session) updateSession(session.sessionHandle, { threadId: res.threadId });
		execResult = formatExecutionResult("codex", res, "No output received.", session.sessionHandle);
	} catch (err) {
		caughtErr = err;
	} finally {
		const rel = releaseSessionTurn(session.sessionHandle);
		if (rel && !rel.ok) {
			console.error(`[OmniAgent] Failed to release session '${session.sessionHandle}': ${rel.error}`);
			if (caughtErr) caughtErr.message += ` (Additionally, failed to release session lock: ${rel.error})`;
			else if (execResult && execResult.content) {
				const textEntry = execResult.content.find((c) => c.type === "text");
				if (textEntry) textEntry.text += `\n\n[Warning] Failed to release session lock: ${rel.error}`;
			}
		}
	}
	if (caughtErr) throw caughtErr;
	return execResult;
}
//#endregion
//#region src/tools/analyze.tool.ts
function getAnalyzeToolDefinitions(codexConfig) {
	const baseAnalyzeSchema = {
		type: "object",
		properties: {
			task: {
				type: "string",
				description: "The specific question, architectural aspect, or focus area to analyze."
			},
			file_paths: {
				type: "array",
				items: { type: "string" },
				description: "Optional list of files or directories to inspect."
			},
			backend: {
				type: "string",
				enum: [
					"auto",
					"codex",
					"claude",
					"smart_quota"
				],
				description: "CLI agent backend to analyze with (default: \"auto\")."
			},
			workspace_path: {
				type: "string",
				description: "Optional absolute path to workspace root."
			},
			model: {
				type: "string",
				description: "Optional model override."
			},
			reasoning_effort: {
				type: "string",
				description: "Reasoning depth level (default: \"high\")."
			},
			user_confirmed: {
				type: "boolean",
				description: "Mandatory true confirmation if using top-tier models (\"astra\", \"claude-3-opus\")."
			},
			session_handle: {
				type: "string",
				description: "Optional persistent session handle from a previous turn to preserve full multi-turn context."
			}
		},
		required: ["task"]
	};
	return [
		{
			name: TOOL_NAMES.ANALYZE,
			description: "Perform deep architectural, dependency, and structural code analysis in read-only mode using local CLI reasoning agents.",
			inputSchema: baseAnalyzeSchema
		},
		{
			name: TOOL_NAMES.LEGACY_ANALYZE,
			description: getLegacyAliasDescription(TOOL_NAMES.ANALYZE),
			inputSchema: baseAnalyzeSchema
		},
		{
			name: TOOL_NAMES.CODEX_ANALYZE,
			description: "Perform deep architectural, dependency, and structural code analysis in read-only sandbox mode using OpenAI Codex.",
			inputSchema: {
				type: "object",
				properties: {
					task: {
						type: "string",
						description: "The specific question, architectural aspect, or focus area to analyze."
					},
					file_paths: {
						type: "array",
						items: { type: "string" },
						description: "Optional list of files or directories to inspect."
					},
					workspace_path: {
						type: "string",
						description: "Optional absolute path to workspace root."
					},
					model: {
						type: "string",
						description: `Model to use (default: "${codexConfig.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`
					},
					reasoning_effort: {
						type: "string",
						enum: VALID_REASONING_EFFORTS,
						description: "Reasoning effort depth (default: \"high\")."
					},
					user_confirmed: {
						type: "boolean",
						description: "Mandatory true confirmation if using the top-tier \"astra\" model."
					}
				},
				required: ["task"]
			}
		}
	];
}
async function handleAnalyze(toolName, args, workspaceCwd, abortSignal = null, onProgress = null) {
	if (typeof args.task !== "string" || !args.task.trim()) return {
		isError: true,
		content: [{
			type: "text",
			text: "Validation Error: task must be a non-empty string."
		}]
	};
	const backend = await resolveBackend(toolName === TOOL_NAMES.CODEX_ANALYZE ? "codex" : args.backend || "auto");
	const codexConfig = readCodexConfig();
	const requestedModel = typeof args.model === "string" && args.model.trim() ? args.model.trim() : backend.id === "codex" ? codexConfig.defaultModel : "claude-3-7-sonnet";
	const approval = checkModelGovernance(requestedModel, args.user_confirmed);
	if (approval) return approval;
	const filesContext = Array.isArray(args.file_paths) && args.file_paths.length > 0 ? `\nTarget files:\n${args.file_paths.join("\n")}` : "";
	const prompt = `[TASK: ARCHITECTURAL & CODE ANALYSIS]
Please perform a detailed code and architectural analysis for the following request:

OBJECTIVE:
${args.task}
${filesContext}`;
	if (backend.id === "claude") {
		if (args.session_handle) return {
			isError: true,
			content: [{
				type: "text",
				text: "Multi-turn session continuation is currently supported on the Codex backend. Session continuation for Claude Code CLI is planned for a subsequent update."
			}]
		};
		return formatExecutionResult("claude", await executeClaude(prompt, {
			cwd: workspaceCwd,
			model: requestedModel,
			reasoningEffort: args.reasoning_effort || "high",
			abortSignal: abortSignal || void 0,
			onProgress
		}));
	}
	const cliModelArgs = [
		"-m",
		requestedModel,
		"-c",
		`model_reasoning_effort=${normalizeReasoningEffort(args.reasoning_effort, "high")}`
	];
	const sessionRes = acquireAndResolveSession(args.session_handle, backend.id, workspaceCwd);
	if (sessionRes.error) return {
		isError: true,
		content: [{
			type: "text",
			text: sessionRes.error
		}]
	};
	const session = sessionRes.session;
	const sessionOptions = session.threadId ? { threadId: session.threadId } : {};
	let execResult;
	let caughtErr = null;
	try {
		const res = await executeCodex([
			"--sandbox",
			"read-only",
			...cliModelArgs,
			"-"
		], prompt, workspaceCwd, abortSignal, onProgress, sessionOptions);
		if (res.threadId && session) updateSession(session.sessionHandle, { threadId: res.threadId });
		execResult = formatExecutionResult("codex", res, "No output received.", session.sessionHandle);
	} catch (err) {
		caughtErr = err;
	} finally {
		const rel = releaseSessionTurn(session.sessionHandle);
		if (rel && !rel.ok) {
			console.error(`[OmniAgent] Failed to release session '${session.sessionHandle}': ${rel.error}`);
			if (caughtErr) caughtErr.message += ` (Additionally, failed to release session lock: ${rel.error})`;
			else if (execResult && execResult.content) {
				const textEntry = execResult.content.find((c) => c.type === "text");
				if (textEntry) textEntry.text += `\n\n[Warning] Failed to release session lock: ${rel.error}`;
			}
		}
	}
	if (caughtErr) throw caughtErr;
	return execResult;
}
//#endregion
//#region src/tools/debug.tool.ts
function getDebugToolDefinition(codexConfig) {
	return {
		name: TOOL_NAMES.CODEX_DEBUG,
		description: "Diagnose an error or stack trace using OpenAI Codex in read-only sandbox mode. Returns root cause analysis and a step-by-step fix recommendation.",
		inputSchema: {
			type: "object",
			properties: {
				error_message: {
					type: "string",
					description: "The complete error message or stack trace to diagnose."
				},
				context: {
					type: "string",
					description: "What you were doing when the error occurred, relevant inputs, or recent changes."
				},
				file_paths: {
					type: "array",
					items: { type: "string" },
					description: "Optional list of relevant source files to provide context."
				},
				workspace_path: {
					type: "string",
					description: "Optional absolute path to workspace root."
				},
				model: {
					type: "string",
					description: `Model to use (default: "${codexConfig.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`
				},
				reasoning_effort: {
					type: "string",
					enum: VALID_REASONING_EFFORTS,
					description: "Reasoning effort depth (default: \"xhigh\" for debugging)."
				},
				user_confirmed: {
					type: "boolean",
					description: "Mandatory true confirmation if using the top-tier \"astra\" model."
				}
			},
			required: ["error_message"]
		}
	};
}
async function handleDebugError(args, workspaceCwd, abortSignal = null, onProgress = null) {
	if (typeof args.error_message !== "string" || !args.error_message.trim()) return {
		isError: true,
		content: [{
			type: "text",
			text: "Validation Error: error_message must be a non-empty string."
		}]
	};
	const codexConfig = readCodexConfig();
	const requestedModel = typeof args.model === "string" && args.model.trim() ? args.model.trim() : codexConfig.defaultModel;
	const approval = checkModelGovernance(requestedModel, args.user_confirmed);
	if (approval) return approval;
	const filesContext = Array.isArray(args.file_paths) && args.file_paths.length > 0 ? `\nRelevant files:\n${args.file_paths.join("\n")}` : "";
	const prompt = `[TASK: ROOT CAUSE ANALYSIS & DEBUGGING]
Please diagnose the following error and provide concrete root cause analysis and a step-by-step fix recommendation:

ERROR MESSAGE:
${args.error_message}

CONTEXT & DESCRIPTION:
${args.context || "Not provided"}
${filesContext}`;
	return formatExecutionResult("codex", await executeCodex([
		"--sandbox",
		"read-only",
		...[
			"-m",
			requestedModel,
			"-c",
			`model_reasoning_effort=${normalizeReasoningEffort(args.reasoning_effort, "xhigh")}`
		],
		"-"
	], prompt, workspaceCwd, abortSignal, onProgress));
}
//#endregion
//#region src/tools/implement.tool.ts
function getImplementToolDefinition(codexConfig) {
	return {
		name: TOOL_NAMES.CODEX_IMPLEMENT,
		description: "Implement a well-specified component, complex algorithm, or class in read-only sandbox mode. Codex outputs code without writing to disk.",
		inputSchema: {
			type: "object",
			properties: {
				specification: {
					type: "string",
					description: "Detailed description of what to implement, including interface requirements."
				},
				context_files: {
					type: "array",
					items: { type: "string" },
					description: "Optional list of files that provide relevant types, interfaces, or context."
				},
				workspace_path: {
					type: "string",
					description: "Optional absolute path to workspace root."
				},
				model: {
					type: "string",
					description: `Model to use (default: "${codexConfig.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`
				},
				reasoning_effort: {
					type: "string",
					enum: VALID_REASONING_EFFORTS,
					description: "Reasoning effort depth (default: \"high\")."
				},
				user_confirmed: {
					type: "boolean",
					description: "Mandatory true confirmation if using the top-tier \"astra\" model."
				}
			},
			required: ["specification"]
		}
	};
}
async function handleImplement(args, workspaceCwd, abortSignal = null, onProgress = null) {
	if (typeof args.specification !== "string" || !args.specification.trim()) return {
		isError: true,
		content: [{
			type: "text",
			text: "Validation Error: specification must be a non-empty string."
		}]
	};
	const codexConfig = readCodexConfig();
	const requestedModel = typeof args.model === "string" && args.model.trim() ? args.model.trim() : codexConfig.defaultModel;
	const approval = checkModelGovernance(requestedModel, args.user_confirmed);
	if (approval) return approval;
	const filesContext = Array.isArray(args.context_files) && args.context_files.length > 0 ? `\nContext files:\n${args.context_files.join("\n")}` : "";
	const prompt = `[TASK: CODE IMPLEMENTATION]
Please provide the implementation / code solution for the following specification.
Provide clean, idiomatic code with clear explanations of non-trivial logic.

SPECIFICATION:
${args.specification}
${filesContext}`;
	return formatExecutionResult("codex", await executeCodex([
		"--sandbox",
		"read-only",
		...[
			"-m",
			requestedModel,
			"-c",
			`model_reasoning_effort=${normalizeReasoningEffort(args.reasoning_effort, "high")}`
		],
		"-"
	], prompt, workspaceCwd, abortSignal, onProgress));
}
//#endregion
//#region src/server.ts
const VALID_COMMON_BACKENDS = /* @__PURE__ */ new Set([
	"auto",
	"codex",
	"claude",
	"smart_quota"
]);
function validateToolArguments(args) {
	if (args === void 0 || args === null) return {};
	if (typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be a valid key-value object.");
	const obj = args;
	if (obj.backend !== void 0) {
		if (typeof obj.backend !== "string" || !VALID_COMMON_BACKENDS.has(obj.backend.toLowerCase())) throw new Error(`Invalid argument 'backend': '${obj.backend}'. Supported options: 'auto', 'codex', 'claude', 'smart_quota'.`);
	}
	if (obj.workspace_path !== void 0 && typeof obj.workspace_path !== "string") throw new Error(`Invalid argument 'workspace_path': expected string, received ${typeof obj.workspace_path}.`);
	if (obj.scope !== void 0 && typeof obj.scope !== "string") throw new Error(`Invalid argument 'scope': expected string, received ${typeof obj.scope}.`);
	if (obj.instructions !== void 0 && typeof obj.instructions !== "string") throw new Error(`Invalid argument 'instructions': expected string, received ${typeof obj.instructions}.`);
	if (obj.proposal !== void 0 && typeof obj.proposal !== "string") throw new Error(`Invalid argument 'proposal': expected string, received ${typeof obj.proposal}.`);
	if (obj.specific_questions !== void 0 && typeof obj.specific_questions !== "string") throw new Error(`Invalid argument 'specific_questions': expected string, received ${typeof obj.specific_questions}.`);
	if (obj.model !== void 0 && typeof obj.model !== "string") throw new Error(`Invalid argument 'model': expected string, received ${typeof obj.model}.`);
	if (obj.reasoning_effort !== void 0 && typeof obj.reasoning_effort !== "string") throw new Error(`Invalid argument 'reasoning_effort': expected string, received ${typeof obj.reasoning_effort}.`);
	if (obj.user_confirmed !== void 0 && typeof obj.user_confirmed !== "boolean") throw new Error(`Invalid argument 'user_confirmed': expected boolean, received ${typeof obj.user_confirmed}.`);
	if (obj.session_handle !== void 0 && typeof obj.session_handle !== "string") throw new Error(`Invalid argument 'session_handle': expected string, received ${typeof obj.session_handle}.`);
	return obj;
}
function createServer() {
	const server = new _modelcontextprotocol_sdk_server_index_js.Server({
		name: BRAND.SERVER_NAME,
		version: BRAND.SERVER_VERSION
	}, { capabilities: { tools: {} } });
	server.setRequestHandler(_modelcontextprotocol_sdk_types_js.ListToolsRequestSchema, async () => {
		const codexConfig = readCodexConfig();
		return { tools: [
			doctorToolDefinition,
			setDefaultToolDefinition,
			quotaToolDefinition,
			reportBugToolDefinition,
			closeSessionToolDefinition,
			...getReviewToolDefinitions(codexConfig).slice(0, 1),
			...getConsultToolDefinitions(codexConfig).slice(0, 1),
			...getAnalyzeToolDefinitions(codexConfig).slice(0, 1),
			legacyDoctorToolDefinition,
			legacySetDefaultToolDefinition,
			legacyQuotaToolDefinition,
			legacyReportBugToolDefinition,
			legacyCloseSessionToolDefinition,
			...getReviewToolDefinitions(codexConfig).slice(1, 2),
			...getConsultToolDefinitions(codexConfig).slice(1, 2),
			...getAnalyzeToolDefinitions(codexConfig).slice(1, 2),
			codexStatusToolDefinition,
			getDebugToolDefinition(codexConfig),
			...getAnalyzeToolDefinitions(codexConfig).slice(2),
			...getReviewToolDefinitions(codexConfig).slice(2),
			getImplementToolDefinition(codexConfig),
			...getConsultToolDefinitions(codexConfig).slice(2)
		] };
	});
	server.setRequestHandler(_modelcontextprotocol_sdk_types_js.CallToolRequestSchema, async (request, extra) => {
		if (!request.params || typeof request.params !== "object") throw new Error("Invalid CallTool request: params must be an object.");
		const { name } = request.params;
		if (typeof name !== "string" || !name.trim()) throw new Error("Invalid CallTool request: tool name must be a non-empty string.");
		const args = validateToolArguments(request.params.arguments);
		const abortSignal = extra?.signal;
		const progressToken = request.params._meta?.progressToken;
		const onProgress = createProgressReporter(server, progressToken);
		try {
			switch (name) {
				case TOOL_NAMES.DOCTOR:
				case TOOL_NAMES.LEGACY_DOCTOR: return await handleDoctor();
				case TOOL_NAMES.SET_DEFAULT:
				case TOOL_NAMES.LEGACY_SET_DEFAULT: return await handleSetDefault(args);
				case TOOL_NAMES.QUOTA_STATUS:
				case TOOL_NAMES.LEGACY_QUOTA_STATUS: return await handleQuotaStatus(args);
				case TOOL_NAMES.REPORT_BUG:
				case TOOL_NAMES.LEGACY_REPORT_BUG: return await handleReportBug(args);
				case TOOL_NAMES.CLOSE_SESSION:
				case TOOL_NAMES.LEGACY_CLOSE_SESSION: return await handleCloseSession(args);
				case TOOL_NAMES.CODEX_STATUS: return await handleCodexStatus();
				default: {
					const workspaceCwd = resolveWorkspacePath(args.workspace_path);
					if (name === TOOL_NAMES.REVIEW || name === TOOL_NAMES.LEGACY_REVIEW || name === TOOL_NAMES.CODEX_REVIEW) return await handleReview(name, args, workspaceCwd, abortSignal, onProgress);
					if (name === TOOL_NAMES.CONSULT || name === TOOL_NAMES.LEGACY_CONSULT || name === TOOL_NAMES.CODEX_CONSULT) return await handleConsult(name, args, workspaceCwd, abortSignal, onProgress);
					if (name === TOOL_NAMES.ANALYZE || name === TOOL_NAMES.LEGACY_ANALYZE || name === TOOL_NAMES.CODEX_ANALYZE) return await handleAnalyze(name, args, workspaceCwd, abortSignal, onProgress);
					if (name === TOOL_NAMES.CODEX_DEBUG) return await handleDebugError(args, workspaceCwd, abortSignal, onProgress);
					if (name === TOOL_NAMES.CODEX_IMPLEMENT) return await handleImplement(args, workspaceCwd, abortSignal, onProgress);
					throw new Error(`Unknown tool: ${name}`);
				}
			}
		} catch (error) {
			let bugPrompt = "";
			try {
				const bugReport = generateBugReport({
					errorMessage: error.message,
					context: `Tool execution: ${name}`
				});
				if (bugReport?.prompt) bugPrompt = `\n\n${bugReport.prompt}`;
			} catch (_) {}
			return {
				isError: true,
				content: [{
					type: "text",
					text: `${BRAND.NAME} Execution Error: ${error.message}${bugPrompt}`
				}]
			};
		}
	});
	return server;
}
//#endregion
//#region src/index.ts
async function run() {
	const server = createServer();
	const transport = new _modelcontextprotocol_sdk_server_stdio_js.StdioServerTransport();
	await server.connect(transport);
	process.stderr.write(`${BRAND.NAME} MCP Server (${BRAND.TAGLINE}) running on stdio\n`);
}
run().catch((error) => {
	process.stderr.write(`Fatal error in main(): ${error?.stack || error}\n`);
	process.exit(1);
});
//#endregion

//# sourceMappingURL=index.cjs.map