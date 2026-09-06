/**
 * Clodds - AI Assistant for Prediction Markets
 * Claude + Odds
 *
 * Entry point - starts the gateway and all services
 */

import { config as dotenvConfig } from 'dotenv';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { homedir, networkInterfaces } from 'os';
import { join } from 'path';

// Load .env from ~/.clodds/.env first (where onboard writes), then CWD fallback
dotenvConfig({ path: join(homedir(), '.clodds', '.env') });
dotenvConfig();

import { createGateway } from './gateway/index';
import { loadConfig, resolveConfigPath, resolveStateDir, resolveWorkspaceDir } from './utils/config';
import { logger } from './utils/logger';
import { installHttpClient, configureHttpClient } from './utils/http';

// =============================================================================
// STARTUP PROGRESS INDICATOR
// =============================================================================

interface StartupStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  detail?: string;
}

const startupSteps: StartupStep[] = [];
let spinnerInterval: NodeJS.Timeout | null = null;
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerFrame = 0;

function addStep(name: string): number {
  const idx = startupSteps.push({ name, status: 'pending' }) - 1;
  return idx;
}

function updateStep(idx: number, status: StartupStep['status'], detail?: string): void {
  if (startupSteps[idx]) {
    startupSteps[idx].status = status;
    if (detail) startupSteps[idx].detail = detail;
  }
  renderProgress();
}

function renderProgress(): void {
  // Only render in TTY mode
  if (!process.stdout.isTTY) return;

  // Clear previous lines
  const linesToClear = startupSteps.length + 2;
  process.stdout.write(`\x1b[${linesToClear}A\x1b[0J`);

  console.log('\n\x1b[1m🚀 Starting Clodds...\x1b[0m\n');

  for (const step of startupSteps) {
    let icon: string;
    let color: string;
    switch (step.status) {
      case 'done':
        icon = '✓';
        color = '\x1b[32m'; // green
        break;
      case 'failed':
        icon = '✗';
        color = '\x1b[31m'; // red
        break;
      case 'skipped':
        icon = '○';
        color = '\x1b[90m'; // gray
        break;
      case 'running':
        icon = spinnerFrames[spinnerFrame % spinnerFrames.length];
        color = '\x1b[36m'; // cyan
        break;
      default:
        icon = '○';
        color = '\x1b[90m'; // gray
    }
    const detail = step.detail ? ` \x1b[90m(${step.detail})\x1b[0m` : '';
    console.log(`  ${color}${icon}\x1b[0m ${step.name}${detail}`);
  }
}

function startSpinner(): void {
  if (!process.stdout.isTTY) return;
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % spinnerFrames.length;
    renderProgress();
  }, 80);
}

function stopSpinner(): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate required environment variables and configuration
 * Provides clear error messages for common setup issues
 */
function validateStartupRequirements(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for Anthropic API key (required for AI functionality)
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push(
      'ANTHROPIC_API_KEY is not set. The AI agent will not function.\n' +
      '  Fix: Add ANTHROPIC_API_KEY=sk-ant-... to your .env file\n' +
      '  Or run: clodds onboard'
    );
  }

  // Auto-generate credential encryption key if not set
  if (!process.env.CLODDS_CREDENTIAL_KEY) {
    const generated = randomBytes(32).toString('hex');
    process.env.CLODDS_CREDENTIAL_KEY = generated;

    // Persist to ~/.clodds/.env so it survives restarts
    const cloddsDir = join(homedir(), '.clodds');
    const envPath = join(cloddsDir, '.env');
    try {
      if (!existsSync(cloddsDir)) {
        mkdirSync(cloddsDir, { recursive: true });
      }
      if (existsSync(envPath)) {
        // Append if file exists and doesn't already contain the key
        const existing = readFileSync(envPath, 'utf-8');
        if (!existing.includes('CLODDS_CREDENTIAL_KEY=')) {
          appendFileSync(envPath, `\nCLODDS_CREDENTIAL_KEY=${generated}\n`);
        }
      } else {
        writeFileSync(envPath, `CLODDS_CREDENTIAL_KEY=${generated}\n`, { mode: 0o600 });
      }
      logger.info('Auto-generated CLODDS_CREDENTIAL_KEY for credential encryption');
    } catch (err) {
      logger.warn({ err }, 'Could not persist CLODDS_CREDENTIAL_KEY to .env file — key is set for this session only');
    }
  }

  // Check for common channel configurations (warnings only)
  if (!process.env.TELEGRAM_BOT_TOKEN && !process.env.DISCORD_BOT_TOKEN) {
    warnings.push(
      'No messaging channel configured (TELEGRAM_BOT_TOKEN or DISCORD_BOT_TOKEN).\n' +
      '  WebChat at http://localhost:18789/webchat will still work.'
    );
  }

  // Log warnings
  for (const warning of warnings) {
    logger.warn(warning);
  }

  // Exit with errors if critical requirements missing
  if (errors.length > 0) {
    logger.error('Clodds Startup Failed');
    for (const error of errors) {
      logger.error(error);
    }
    logger.error('Run "clodds doctor" for full diagnostics.');
    process.exit(1);
  }
}

// =============================================================================
// STARTUP INFO PANEL
// =============================================================================

/**
 * 启动成功后打印一份完整的信息面板：访问地址、端口、常用接口、关键配置。
 * 为什么必须有：以前成功后只打一行 WebChat 地址，想知道"后端有哪些接口、数据库在哪、
 * 用的哪个模型"都得翻代码，这里启动时一次性全部说清楚，方便维护者直接照着用。
 * 注意：按项目规范（AGENTS.md「API Key 管理」），Key 明文打印，不做任何脱敏。
 * TTY（yarn dev 前台）和非 TTY（后台/容器）两条启动路径都要调用它，别只加一边。
 */
function printStartupInfo(config: Awaited<ReturnType<typeof loadConfig>>): void {
  const port = config.gateway.port;
  const base = `http://localhost:${port}`;

  // 网关默认监听 0.0.0.0（见 src/gateway/index.ts 第 141 行），局域网内其他设备也能访问，
  // 所以这里把本机局域网 IP 列出来，方便手机 / 其他机器直接连。
  const lanIps: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const addr of addresses || []) {
      if (addr.family === 'IPv4' && !addr.internal) lanIps.push(addr.address);
    }
  }

  const aiKey = process.env.ANTHROPIC_API_KEY || '(未配置)';
  const aiBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com（官方直连）';
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '(未配置，外部行情接口可能连不上)';
  const channels = [
    'WebChat（内置）',
    process.env.TELEGRAM_BOT_TOKEN ? 'Telegram ✅' : 'Telegram（未配置）',
    process.env.DISCORD_BOT_TOKEN ? 'Discord ✅' : 'Discord（未配置）',
  ].join('  |  ');

  const line = '\x1b[90m' + '─'.repeat(64) + '\x1b[0m';
  // 终端里中文占 2 列、英文占 1 列，padEnd 只按字符个数补空格，混排必然对不齐，
  // 所以自己按"显示宽度"补：codePoint > 0xff 的一律算 2 列。
  const displayWidth = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
  const pad = (label: string) => label + ' '.repeat(Math.max(1, 26 - displayWidth(label)));
  const kv = (label: string, value: string) => console.log(`  ${pad(label)}${value}`);

  console.log(`\n${line}`);
  console.log('\x1b[32m\x1b[1m  ✓ Clodds is running!\x1b[0m');
  console.log(line);

  console.log('\n  \x1b[1m【访问入口】\x1b[0m');
  kv('WebChat 对话', `\x1b[36m${base}/webchat\x1b[0m`);
  kv('控制台', `${base}/dashboard`);
  if (lanIps.length > 0) {
    kv('局域网访问', `http://${lanIps[0]}:${port}/webchat  （手机/其他电脑用这个）`);
  }
  kv('监听范围', `0.0.0.0:${port}（所有网卡，局域网可达，别暴露到公网）`);
  kv('进程 PID', `${process.pid}（停止：kill ${process.pid}）`);

  console.log('\n  \x1b[1m【常用接口】\x1b[0m');
  kv('GET /health', '健康检查（含数据库、内存状态）');
  kv('GET /api/commands', '可用指令列表');
  kv('POST /hooks/agent', '直接驱动 AI，body: {"message":"你好"}');
  kv('GET /api/chat/sessions', '聊天会话列表');
  kv('GET /market-index/search', '跨平台市场搜索，如 ?q=bitcoin');
  kv('GET /api/performance', '绩效统计');
  kv('GET /api/config/env', '环境变量查看/修改');
  kv('GET /metrics', '运行指标');

  console.log('\n  \x1b[1m【关键配置】\x1b[0m');
  kv('AI 模型', String(config.agents.defaults.model.primary));
  kv('AI 中转站', aiBaseUrl);
  kv('AI Key', aiKey);
  kv('本机代理', proxy);
  kv('数据库文件', join(resolveStateDir(), 'clodds.db'));
  kv('配置文件', resolveConfigPath());
  kv('工作目录', resolveWorkspaceDir());
  kv('消息通道', channels);

  console.log(line);
  console.log('\n  Press Ctrl+C to stop\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  installHttpClient();

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
  });

  // Initialize progress display
  const isTTY = process.stdout.isTTY;
  if (isTTY) {
    // Pre-populate steps for visual display
    const idxValidate = addStep('Validating configuration');
    const idxConfig = addStep('Loading config');
    const idxDatabase = addStep('Connecting to database');
    const idxFeeds = addStep('Starting market feeds');
    const idxChannels = addStep('Connecting channels');
    const idxGateway = addStep('Starting HTTP gateway');

    // Print initial state
    console.log('\n\x1b[1m🚀 Starting Clodds...\x1b[0m\n');
    for (const step of startupSteps) {
      console.log(`  \x1b[90m○\x1b[0m ${step.name}`);
    }

    startSpinner();

    // Step 1: Validate
    updateStep(idxValidate, 'running');
    try {
      validateStartupRequirements();
      updateStep(idxValidate, 'done');
    } catch (e) {
      updateStep(idxValidate, 'failed');
      stopSpinner();
      throw e;
    }

    // Step 2: Load config
    updateStep(idxConfig, 'running');
    let config;
    try {
      config = await loadConfig();
      configureHttpClient(config.http);
      updateStep(idxConfig, 'done', `port ${config.gateway.port}`);
    } catch (e) {
      updateStep(idxConfig, 'failed');
      stopSpinner();
      throw e;
    }

    // Step 3-6: Gateway handles DB, feeds, channels internally
    // We mark them as running since createGateway does the work
    updateStep(idxDatabase, 'running');
    updateStep(idxFeeds, 'running');
    updateStep(idxChannels, 'running');
    updateStep(idxGateway, 'running');

    // 必须显式标类型：不标的话 TS 推导成隐式 any，`npm run build` 的 tsc 会直接报错中止。
    // 这里不加 | undefined 是因为下面注册 SIGINT/SIGTERM 的位置一定在 createGateway 成功之后，
    // 走到 shutdown 时它必然已经赋值；加了 undefined 反而要在闭包里到处做无意义的判空。
    let gateway: Awaited<ReturnType<typeof createGateway>>;
    try {
      gateway = await createGateway(config);
      updateStep(idxDatabase, 'done');
      updateStep(idxFeeds, 'done');
      updateStep(idxChannels, 'done');
    } catch (e) {
      updateStep(idxDatabase, 'failed');
      stopSpinner();
      // 这里没有 gateway.stop()：createGateway 只要抛错就说明它压根没返回实例，
      // 没有东西需要清理，原来那句 `if (gateway) await gateway.stop()` 是永远走不到的死代码。
      throw e;
    }

    try {
      await gateway.start();
      updateStep(idxGateway, 'done', `http://localhost:${config.gateway.port}`);
    } catch (e) {
      updateStep(idxGateway, 'failed');
      stopSpinner();
      if (gateway) {
        try { await gateway.stop(); } catch { /* ignore cleanup errors */ }
      }
      throw e;
    }

    stopSpinner();
    renderProgress();

    // Final success message
    printStartupInfo(config);

    let shuttingDown = false;
    const SHUTDOWN_TIMEOUT_MS = 15000;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      stopSpinner(); // Clear spinner if still running
      console.log('\n\x1b[33mShutting down...\x1b[0m');
      try {
        await Promise.race([
          gateway.stop(),
          new Promise<void>((resolve) => setTimeout(() => {
            logger.warn('Shutdown timed out after 15s, forcing exit');
            resolve();
          }, SHUTDOWN_TIMEOUT_MS)),
        ]);
      } catch (e) {
        logger.error({ err: e }, 'Error during shutdown');
      }
      console.log('\x1b[32mGoodbye!\x1b[0m\n');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } else {
    // Non-TTY mode: simple logging
    logger.info('Starting Clodds...');

    validateStartupRequirements();

    const config = await loadConfig();
    configureHttpClient(config.http);
    logger.info({ port: config.gateway.port }, 'Config loaded');

    const gateway = await createGateway(config);
    await gateway.start();

    logger.info('Clodds is running!');
    // 非 TTY（后台/容器）也要把信息面板打出来，否则日志里只有一行 "Clodds is running!"，
    // 想知道端口和接口还是得翻代码。面板走 console.log，pino 日志走 logger，互不影响。
    printStartupInfo(config);

    let shuttingDown = false;
    const SHUTDOWN_TIMEOUT_MS = 15000;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      stopSpinner(); // Clear spinner if still running
      logger.info('Shutting down...');
      try {
        await Promise.race([
          gateway.stop(),
          new Promise<void>((resolve) => setTimeout(() => {
            logger.warn('Shutdown timed out after 15s, forcing exit');
            resolve();
          }, SHUTDOWN_TIMEOUT_MS)),
        ]);
      } catch (e) {
        logger.error({ err: e }, 'Error during shutdown');
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

main().catch((err) => {
  stopSpinner();
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
