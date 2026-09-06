/**
 * Clodds - 预测市场 AI 助手 / AI 交易终端（Claude + Odds）
 *
 * 程序入口：启动网关和全部服务
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
// 启动进度显示
// =============================================================================

interface StartupStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  detail?: string;
}

const startupSteps: StartupStep[] = [];

/**
 * 登记一个启动步骤（只登记不打印，等有结果再打）。
 * ⚠️ 为什么不做"转圈动画 + 整屏重绘"：启动期间 pino 日志会不停往终端插行，
 * 重绘是按"我们自己打了几行"来倒着擦屏的，日志一插队行数就对不上，
 * 擦错位置就会留下一大片空白（2026-09-06 实际踩过，用户截图里全是空行）。
 * 所以这里一律"只追加、不擦屏"：每个步骤完成/失败时打一行，永不回头改。
 */
function addStep(name: string): number {
  const idx = startupSteps.push({ name, status: 'pending' }) - 1;
  return idx;
}

/**
 * 更新步骤状态。只有 done / failed / skipped 会真正打印一行，
 * running 状态不打印（否则每个步骤会出现"转圈一行 + 完成一行"两行）。
 * 非 TTY（后台 / 容器跑日志收集）也照样打印，日志里能看到每一步结果。
 */
function updateStep(idx: number, status: StartupStep['status'], detail?: string): void {
  const step = startupSteps[idx];
  if (!step) return;
  step.status = status;
  if (detail) step.detail = detail;

  let icon = '';
  let color = '';
  switch (status) {
    case 'done':
      icon = '✓';
      color = '\x1b[32m'; // 绿
      break;
    case 'failed':
      icon = '✗';
      color = '\x1b[31m'; // 红
      break;
    case 'skipped':
      icon = '○';
      color = '\x1b[90m'; // 灰
      break;
    default:
      return; // pending / running 不打印
  }
  // 局部变量不能也叫 detail：函数参数里已经有 detail（新传入的补充说明），
  // 重名会报 TS2300 重复声明，这里展示的是 step 上存的那份，改名 detailText 区分。
  const detailText = step.detail ? ` \x1b[90m(${step.detail})\x1b[0m` : '';
  console.log(`  ${color}${icon}\x1b[0m ${step.name}${detailText}`);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * 校验启动必需的环境变量和配置
 * 对常见的配置问题给出能直接照做的中文提示
 */
function validateStartupRequirements(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // AI 大模型的 Key 是启动硬性要求，缺了 AI 完全没法用
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push(
      '没有配置 ANTHROPIC_API_KEY，AI 智能体没法工作。\n' +
      '  修法：在 .env 文件里加一行 ANTHROPIC_API_KEY=sk-...\n' +
      '  或者运行：clodds onboard'
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
      logger.info('已自动生成凭证加密密钥 CLODDS_CREDENTIAL_KEY');
    } catch (err) {
      logger.warn({ err }, 'CLODDS_CREDENTIAL_KEY 没能写进 .env 文件——这把密钥只在本次运行有效');
    }
  }

  // 检查消息通道配置（只提醒，不拦启动）
  if (!process.env.TELEGRAM_BOT_TOKEN && !process.env.DISCORD_BOT_TOKEN) {
    warnings.push(
      '没有配置任何消息通道（TELEGRAM_BOT_TOKEN 或 DISCORD_BOT_TOKEN）。\n' +
      '  网页版对话仍然可用：http://localhost:18789/webchat'
    );
  }

  // 打印警告
  for (const warning of warnings) {
    logger.warn(warning);
  }

  // 有关键配置缺失就退出
  if (errors.length > 0) {
    logger.error('Clodds 启动失败');
    for (const error of errors) {
      logger.error(error);
    }
    logger.error('想看完整诊断请运行：clodds doctor');
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
  console.log('\x1b[32m\x1b[1m  ✓ Clodds 启动成功！\x1b[0m');
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
  console.log('\n  按 Ctrl+C 停止\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  installHttpClient();

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '未捕获的 Promise 异常');
  });
  process.on('uncaughtException', (error) => {
    logger.error({ error }, '未捕获的异常');
    process.exit(1);
  });

  // 初始化进度显示
  const isTTY = process.stdout.isTTY;
  if (isTTY) {
    // 登记六个启动步骤（只有完成/失败时才打印一行，原因见 updateStep 的注释）
    const idxValidate = addStep('校验配置');
    const idxConfig = addStep('加载配置');
    const idxDatabase = addStep('连接数据库');
    const idxFeeds = addStep('启动行情源');
    const idxChannels = addStep('连接消息通道');
    const idxGateway = addStep('启动 HTTP 网关');

    console.log('\n\x1b[1m🚀 正在启动 Clodds...\x1b[0m\n');

    // 第 1 步：校验
    updateStep(idxValidate, 'running');
    try {
      validateStartupRequirements();
      updateStep(idxValidate, 'done');
    } catch (e) {
      updateStep(idxValidate, 'failed');
      throw e;
    }

    // 第 2 步：加载配置
    updateStep(idxConfig, 'running');
    let config;
    try {
      config = await loadConfig();
      configureHttpClient(config.http);
      updateStep(idxConfig, 'done', `端口 ${config.gateway.port}`);
    } catch (e) {
      updateStep(idxConfig, 'failed');
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
      // 这里没有 gateway.stop()：createGateway 只要抛错就说明它压根没返回实例，
      // 没有东西需要清理，原来那句 `if (gateway) await gateway.stop()` 是永远走不到的死代码。
      throw e;
    }

    try {
      await gateway.start();
      updateStep(idxGateway, 'done', `http://localhost:${config.gateway.port}`);
    } catch (e) {
      updateStep(idxGateway, 'failed');
      if (gateway) {
        try { await gateway.stop(); } catch { /* 清理失败不影响主流程 */ }
      }
      throw e;
    }

    // 启动成功，打印信息面板
    printStartupInfo(config);

    let shuttingDown = false;
    const SHUTDOWN_TIMEOUT_MS = 15000;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n\x1b[33m正在关闭...\x1b[0m');
      try {
        await Promise.race([
          gateway.stop(),
          new Promise<void>((resolve) => setTimeout(() => {
            logger.warn('关闭超过 15 秒还没完成，强制退出');
            resolve();
          }, SHUTDOWN_TIMEOUT_MS)),
        ]);
      } catch (e) {
        logger.error({ err: e }, '关闭过程出错');
      }
      console.log('\x1b[32m再见！\x1b[0m\n');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } else {
    // 非 TTY 模式（后台 / 容器）：简单打日志
    logger.info('正在启动 Clodds...');

    validateStartupRequirements();

    const config = await loadConfig();
    configureHttpClient(config.http);
    logger.info({ port: config.gateway.port }, '配置加载完成');

    const gateway = await createGateway(config);
    await gateway.start();

    logger.info('Clodds 启动成功！');
    // 非 TTY（后台/容器）也要把信息面板打出来，否则日志里只有一行启动成功，
    // 想知道端口和接口还是得翻代码。面板走 console.log，pino 日志走 logger，互不影响。
    printStartupInfo(config);

    let shuttingDown = false;
    const SHUTDOWN_TIMEOUT_MS = 15000;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('正在关闭...');
      try {
        await Promise.race([
          gateway.stop(),
          new Promise<void>((resolve) => setTimeout(() => {
            logger.warn('关闭超过 15 秒还没完成，强制退出');
            resolve();
          }, SHUTDOWN_TIMEOUT_MS)),
        ]);
      } catch (e) {
        logger.error({ err: e }, '关闭过程出错');
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

main().catch((err) => {
  logger.error({ err }, '启动失败（致命错误）');
  process.exit(1);
});
