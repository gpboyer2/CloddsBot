# AGENT.md — AI 编码助手工作规范

每次对话开始时必须阅读并严格遵守。

## 项目背景

代码主要由 AI 编写，你在本地维护一个 Clodds 的 fork / clone（`alsk1992/CloddsBot` 的上游派生）。你本人也会直接改代码，可能和多个 AI 会话同时在同一个分支上操作。维护者的操作系统不确定（macOS / Windows 均可能）。

项目是什么：Clodds —— 开源 AI 交易终端（Claude + Odds）。后端 TypeScript（tsx 运行、tsc 编译），接入 21 个消息通道（Telegram / Discord / Slack / WhatsApp / Matrix / WebChat 等）、10 个预测市场 + 7 个期货交易所（含 Solana 链上 perps），内置 4 个 AI 智能体 与 119 个 skills，统一策略与风控层，多平台执行（Polymarket / Kalshi / Betfair / Binance / Bybit / Hyperliquid / Solana DEX / EVM DEX），另有 Bittensor 挖矿、x402 支付、Agent 论坛 / 市场、Token 发射等。数据持久化：本地 SQLite（sql.js / better-sqlite3）、语义记忆 LanceDB、分析用 PostgreSQL。还包含一段 Rust 组件（`rust/fast-broadcast`）做高频广播。

所有地址、合约、代币、平台接入点的细节，先查 `docs/` 下对应文档（`ARCHITECTURE.md` / `TRADING.md` / `RISK_MANAGEMENT.md` / `SECURITY_AUDIT.md` / `SKILLS.md` 等），不要凭记忆编。

## 开发流程（强制）

1. 查看当前 Git 用户身份
   - 命令：`git config user.name && git config user.email`
   - 确认"我是谁"，并把该身份带入后续所有上下文。多人 / 多会话协作时用于判断：我的改动会不会影响别人负责的模块？是否和别人的提交冲突？我该怎么改才不破坏别人功能？

2. 拉取远程最新代码
   - 命令：`git pull origin <当前分支>`
   - 把远程最新代码合进当前分支。若拉取时报冲突，进入第 3 步。

3. 解决冲突（仅在出现冲突时执行）
   - 先 `git status` 查看是否存在 `Unmerged paths` / `both modified` 的冲突文件。
   - 必须主动告知用户"存在冲突 + 我的处理方案"，不得擅自覆盖他人代码。
   - 冲突全部解决后，立即完成这次合并提交。

4. 提交并推送到远程
   - 提交前必须先跑 `npm run ci`（即 `typecheck` + `test` + `build` 三连），确保类型检查、测试、构建全过，再提交推送。工作区干净（没有未提交改动）则跳过此步。
   - 不要靠"看起来没改坏"就提交——`npm run ci` 是底线。

5. 开发前准备（进入正式开发前必做，不可跳过）
   - 1. 理解上下文：先阅读相关代码和文档，理解当前改动所在的业务场景和技术架构。
   - 2. 查看近期提交：先查阅近 10 天的 git commit 消息（`git log --oneline -10`），了解项目当前开发进度和历史决策。
   - 3. 查看暂存区和工作区：理解需求后，先 review git 暂存区（`git diff --cached`）和工作区（`git diff`），了解当前实现进度，避免重复工作或冲突。
   - 4. 理解用户意图：用户在共同修改代码时，如果发现有变动，必须先理解用户的改动目的，不要擅自覆盖或否定。

### 对话结束前（必做）

1. 自测验证：跑 `npm run ci`，确认 typecheck / test / build 全过，修改没有引入新问题。
2. 提交推送：为 Git 暂存区和工作区所有的代码执行提交并推送到远程（可以按功能分批执行）。工作区干净则跳过。

## 用户情绪识别

当用户表现出生气、不满、愤怒、失望、抱怨等负面情绪时（无论是通过措辞激烈程度、标点符号、重复追问、还是直接表达），必须立即进入排查与修复动作，用多子代理 / 深度调研工作流把问题修好。此时不要在当前对话里继续打转，也不要试图用解释或安抚代替行动——用户需求未解决是情绪根源，只有把问题修好才能平息。

## 先搜后问

遇到任何不确定、模棱两可、或者你心里有点怀疑的事情，先自己搜一搜；搜索互联网最新资料，多轮搜索多轮对比。搜完仍不确定的，问用户。不要把"可以问"的范围限定在某几类问题上——凡是拿不准的，哪怕觉得可能没必要问，也可以问。能问则问，宁可多确认一句，也不要基于猜测往下做。

遇到需要实现的功能，优先搜索互联网上的公开仓库或模块，直接复用已有成熟方案，禁止手搓复杂代码。可以在 GitHub 搜索相关实现，或者通过多轮网络搜索找到合适的开源方案。

## 代码复用与架构原则

1. 优先复用现有正确逻辑：不新增多余抽象，不向旧代码兼容，统一入口与边界，不把原本清晰的路径拆得更碎。
2. 更少路径：这个项目偏好"更少路径"，不喜欢兼容旧代码。禁止存在"兼容逻辑"、"兜底逻辑"、"保留旧路径"、"退回"等写法。
3. 可改范围：可以改数据库、可以改配置、可以改前后端代码、可以重构，就是不要迁就旧有的。最讨厌迁就、最讨厌 backups、最讨厌向旧代码或旧业务兼容。
4. 搜索复用优先：禁止手搓复杂代码。互联网上有很多公开的仓库或模块，可以直接搜索、拉取、复用。能搜索到就用搜索到的，不要自己从头写。
5. 批量替换优先：需要批量修改时，先用搜索工具定位目标，然后用编辑工具批量替换。禁止用正则表达式一个个匹配替换的低效方式。能用工具就直接用工具，不要人工逐个处理。

## 注释规范

1. 文件头和函数注释：禁止缺失文件头注释或 JSDoc 函数注释。每个文件保留文件头（说明这个文件是干什么的、属于哪一层），每个导出函数有且只有一个 JSDoc 格式的函数头注释。
2. 详细注释保留：不要把原来的详细的注释改成简述，不要丢失注释或简化注释。原有详细注释是为了保留上下文和决策原因。
3. 清理无意义注释：如果还有旧的注释或者没有意义的注释，应该合并或删除。禁止有无用代码、无用注释、旧注释没删干净。
4. 强注释防改错：根据当前的需求、上下文、经验和用户要求，写强注释——要在注释里说明这段代码为什么这样做、不能怎样改，目的是避免别人或下次又改错。

## 代码清理

1. 无用代码删除：如果还有旧的代码、没有被使用的函数或变量，应该通过 grep 查找确认无误后删除。禁止存在无用代码。
2. 命名直接：命名尽量直接，减少 if/else 和假兼容。变量名和函数名要让读代码的人一眼看懂在做什么。
3. 常量 / 导出引用前必须 grep 确认存在：删除 / 重命名常量或导出时 grep 全项目所有引用点；新增引用前要确认导出真的存在，不要靠"我记得有这个"就直接用。

## 读写与交互规范

1. 读写分离：查询不要有副作用。读操作只读不改，写操作只写不读（除非业务需要）。
2. 字段语义稳定：前后端 / 模块间交互里，字段语义必须稳定，不允许模糊 fallback 链。字段含义一旦确定就不能随意扩展或漂移。
3. 接口设计稳定：新增 HTTP / WebSocket 接口遵循项目现有路由约定（见 `src/gateway/` 与各 `routes/`），不要随意引入破坏兼容的新风格；对外暴露的 skill 命令、消息格式一旦定下不要悄悄改字段名。

## 错误处理

禁止用"兼容逻辑"或"兜底逻辑"代替正常错误处理。出现业务问题时：

1. 延迟重试，最多重试 3 次。
2. 多次重试后放弃重试。
3. 在日志体系中报错，记录完整上下文（用项目现有的 pino logger，不要自造日志通道）。
4. 给调用方的返回值中返回相关报错信息，让上层提示给用户。
5. 服务 / 网关重启后避免历史事件重放：重启后要识别"已处理过"的事件，避免重复推送通知；积压消息要主动清空，不要无脑补发。
6. 外部系统故障要退避，不要刷屏重试：某平台 API / WebSocket 故障期要降级静默 + 限流，不要把同一条告警反复推给用户或日志刷屏。

## 搜索与调研

搜索互联网时优先查找最新的资料，多轮搜索多轮对比。不要只看一轮结果就下结论，要交叉验证不同来源的信息。

## 凭据与敏感信息管理

Clodds 的凭据安全基线是 AES-256-GCM 加密存储（密钥 `CLODDS_CREDENTIAL_KEY`，Escrow 密钥对用 `CLODDS_ESCROW_KEY`），这是项目的安全模型，必须遵守。具体要求：

1. 不要为了"调试方便"擅自把凭据改成明文存储、去掉加密、或回退到明文列。存储层 (`src/credentials/`) 的加密是项目红线，排查凭据问题时通过运行时解密后的日志 / 调试接口查看，而不是改存储层。
2. 不要把 apiKey / 私钥 / passphrase / 签名 / webhook 密钥等敏感值明文打印到会被用户看到的消息通道（Telegram / Discord / WebChat 等）——这些是可被他人读取的地方。服务端日志里也要避免把完整密钥原样落盘。
3. 需要定位凭据相关问题时，优先依赖结构化日志（带脱敏后的标识，如前缀 / 后四位）和运行时解密接口，而不是全文回显。

> 说明：这条与 ppll-polymarket 模板里的"明文存储、禁止加密"约定是相反的。clodds 本身是带安全审计文档的开源项目，明文存储会直接破坏它的安全模型，因此这里按 clodds 的真实设计适配。如果你确实想在本地调试环境临时明文，告诉我，我再单独处理。

## Git 操作限制

1. 本分支开发：在当前分支上进行开发，不要切分支，不要 backup 备份。
2. 只读历史：有问题去阅读 git 的历史代码。总结来说就是只能执行 git 的 read 操作，禁止执行 git edit 操作（如 rebase、reset、amend、push --force 等会改写历史的命令）。
3. 绝对禁止 `git reset --hard` 和 `git push --force`：这两条命令会抹除他人提交、破坏协作历史，无论任何理由都不得执行。

## 问题修复策略

遇到 bug 或问题时，不要只修单个问题。要：

1. 定位同类实现：搜索项目中是否有类似写法的代码。
2. 分析影响范围：这个改动会影响哪些调用方、哪些模块。
3. 梳理调用链：当前代码的上游和下游分别是什么。
4. 分析职责边界：这个逻辑应该属于哪个模块 / 层。
5. 找出设计层根因：这是局部 bug 还是系统性架构问题？如果是系统性问题，要从架构层面解决，不要只打个补丁。
6. 全局重命名后必须全量排查：如果 bug 根因是某次全局重命名遗漏，不能只修找到的那一处。必须用 grep 搜索全项目所有同类写法，逐一对照类型 / 接口定义确认。遗漏一处就是一个定时炸弹，早晚会炸。排查时特别注意三类位置：where / 查询键名、函数内部读取的 input 字段名、调用方传参的字段名。

## 核心铁律：不改已有代码

能不动就不动。需要变体就复制新文件，不要在原文件上改。宁可代码重复，也不要改坏别人的功能。

用户明确要求改的除外。但即使用户要求改，也要遵循上述代码复用与架构原则——能复用的就复用，能统一入口的就统一入口，不要新增多余的抽象层。

额外要注意的：我们这是多人开发和多会话开发的场景，不要管别的会话的改动，只专注自己的任务！
我也正在改代码。如果你发现有其他的增、删、改等变动，那是我在操作！别破坏我的操作，要理解我的目的！

## 调试日志强制要求

解决 bug 时必须通过调试日志定位问题根因，禁止靠猜来判断问题。
日志统一走项目现有的 pino logger（`src/utils/logger.ts` 导出的 `logger`，或各模块 `src/logging/` 下的带标签 logger），内容须包含函数名、关键变量值、决策分支走向。
关键调试日志可以选择性的加前缀（如 `[DBG]`），排查时用正则匹配标记日志，不被海量日志淹没。
在关键路径加日志后再改代码，用日志回溯问题根因，而不是先改代码再看结果。问题解决后临时调试日志可酌情保留或清理，但排查过程中必须有日志支撑。
禁止引入 vConsole、eruda 等外部前端调试工具，项目已有自己的日志 / 会话排查手段。

### 禁止无故删除别人的调试日志

每一条调试日志都是排查问题的线索来源。即使日志看起来"多余"或"太详细"，也必须保留，除非满足以下条件：

1. 该日志确实是无效代码（如引用了已删除的变量）。
2. 用户已在对话中明确告知"删除哪些日志"。
3. 用户未表示异议。

违反此约束等同于破坏他人的排查工具，是严重的协作事故。

## 输出语言规范

用中文输出，禁止程序员黑话。和用户沟通时必须使用自然人语言，不要满嘴框架名词、设计模式缩写、技术黑话。要让非开发背景的用户能听懂你在说什么。

## 禁止删除 docs 文件

禁止删除 `./docs` 目录中的任何文件，无论其内容看起来是否为临时文件或无意义文件。

## 自测要求

要求自测自改、自查自纠、自己执行、自己启动，一步到位，不要怕麻烦，一次完成。每次修改后要启动服务 / 跑测试验证，确保改动没有引入新问题。实现最好、最大、最全的效果，不要把半成品留给用户。

测试与验证命令（在仓库根目录执行）：

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | `tsc --noEmit` 类型检查 |
| `npm test` | 跑 `tests//*.test.ts`（`node --test` + tsx） |
| `npm run build` | `tsc` 编译 + 拷贝 `src/skills/bundled` 的 `SKILL.md` 到 `dist` |
| `npm run ci` | 以上三连（typecheck + test + build），提交前必跑 |

测试目录约定：`tests/unit/`（纯单元测试）、`tests/integration/`（集成测试）、`tests/mocks/`（mock 数据）、`tests/helpers/`（测试脚手架）。无凭证 / 无网络时测试要 `t.skip()` 自动跳过，不报错。

需要原生模块支持：`postinstall` 会跑 `scripts/fix-native-bindings.js` 与 `scripts/fix-anchor-bn-export.js`，首次 `npm install` 后若原生绑定异常，重跑这两个脚本。但注意 `.npmrc` 里 `ignore-scripts=true` 会把所有安装脚本拦掉：sharp / better-sqlite3 等原生库不编译、transformers 向量模型不下载，启动时报 "Failed to load transformers.js model" 和 "bigint bindings" 属已知现象（有 ERROR 日志，不算静默降级）；要放开 ignore-scripts 会执行一批第三方安装脚本，必须先问用户拍板，不要自作主张改 `.npmrc`。

## 本地开发启动

- 开发热重载：`npm run dev`（等价 `tsx watch src/index.ts`，启动 gateway + 全部服务）
- 启动约需 1 分钟（行情源初始化），spinner 停在中间不是卡死。启动成功后 `printStartupInfo()`（`src/index.ts`）会打印完整信息面板：WebChat / 控制台 / 局域网地址 / 常用接口 / AI 模型 / 代理 / 数据库路径，别删这个面板；给面板补行时注意中文在终端占 2 列宽，`padEnd` 按字符数补必然错位，要按显示宽度补（项目里已有现成写法）。
- 网关默认监听 `0.0.0.0`（见 `src/gateway/index.ts`，局域网可达），要仅本机访问就改那里的默认 host。
- 单独起网关：`npm run gateway`
- 单独起 worker：`npm run worker`
- 交互式配置向导：`npm run onboard`（首次配置凭据 / 通道）
- REPL：`npm run repl`
- 系统诊断：`npm run doctor`
- 一键部署脚本：`scripts/install.sh`

数据与环境：配置优先读 `~/.clodds/.env`（onboard 写入处），再回退当前目录 `.env`（`src/index.ts` 顶部已处理）。数据默认落在 `~/.clodds/`（SQLite 数据库，首次运行自动创建）。

## 配置与环境

- 环境变量：复制 `.env.example` 为 `.env`（或放到 `~/.clodds/.env`）。必填只有 `ANTHROPIC_API_KEY`，缺了启动直接 `process.exit(1)`（`src/index.ts` 硬校验，一票否决）；至少一个消息通道（推荐 Telegram）才能交互。注意 dotenv 不覆盖已存在的变量，`~/.clodds/.env` 先加载、优先级更高。
- AI 中转站：`ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` 一律写根地址、不带 `/v1`——Anthropic SDK 自己拼 `/v1/messages`，`src/providers/index.ts` 的 OpenAIProvider 自己拼 `/v1/chat/completions`，带了就变成 `/v1/v1/...` 直接 404。程序默认模型 `claude-opus-4-6` 在中转站上不一定存在，实际模型在 `~/.clodds/clodds.json` 的 `agents.defaults.model.primary` 里配（改 .env 没用，模型名不走环境变量）。
- 中转站报 403 `无权访问 X 分组` ≠ key 坏：只是被请求的那个模型不在 key 允许的分组里。判断 key 可用性之前必须先 `GET /v1/models` 拉全模型列表逐个验证，禁止凭几个常见模型名 403 就下结论（踩过：claude-*/gpt-* 全 403 就认定 key 废了，实际 grok 分组是通的）。
- 代理：Node 原生 fetch 不认 `HTTPS_PROXY`；`NODE_USE_ENV_PROXY` 又只在进程启动瞬间读一次（在 dotenv 加载 .env 之前），对 .env 里配的代理值永远无效。代理唯一生效点是 `src/utils/http.ts` 的 `installHttpClient()` 里装的 undici `EnvHttpProxyAgent`，别在别处再造第二套。注意 `ws` 库的 WebSocket 不走这个代理（全项目 22 处 `new WebSocket` 没有统一工厂），行情 WS 连不上先想到这一层。
- 网关：`CLODDS_TOKEN`（API 访问令牌）、默认端口 `18789`、WebChat 在 `http://localhost:18789/webchat`。
- 日志级别：`LOG_LEVEL=debug|info|warn|error`。
- 凭据加密：`CLODDS_CREDENTIAL_KEY`（openssl rand -hex 32 生成）、`CLODDS_ESCROW_KEY`（ACP escrow 用，缺失时回退前者）。
- 语言：`CLODDS_LOCALE=en|zh|...`（共 10 种）。
- 安全开关（生产）：`CLODDS_FORCE_HTTPS` / `CLODDS_HSTS_ENABLED` / `CLODDS_IP_RATE_LIMIT` / `CANVAS_ALLOW_JS_EVAL`（默认 false）。
- 可选模块：Bittensor 挖矿 `BITTENSOR_ENABLED=true`；Solana 链上 perps `PERCOLATOR_ENABLED=true` + `PERCOLATOR_SLAB` + `PERCOLATOR_ORACLE`。

## 项目全貌与技术栈

| 层 | 技术 | 关键文件 |
|---|---|---|
| 入口 | TypeScript + tsx 运行 / tsc 编译 | `src/index.ts` → `src/gateway/index.ts` |
| 网关 | Express + WebSocket + 限流 + Auth | `src/gateway/{index.ts,server.ts,control-ui.ts}` |
| 通道 | 21 个消息平台适配器（抽象基类 `BaseAdapter`） | `src/channels/{base-adapter.ts,index.ts,telegram/,discord/,webchat/,...}` |
| 智能体 | 4 个：Main / Trading / Research / Alerts | `src/agents/{main-agent,trading-agent,research-agent,alert-agent}.ts` |
| Skills | 119 个：SKILL.md（提示注入）+ TS handler（懒加载） | `src/skills/{loader.ts,executor.ts,registry.ts,bundled/}` |
| 行情 | 20+ 个 Feed（Polymarket / Kalshi / Betfair / 加密 / 新闻…） | `src/feeds/{index.ts,freshness.ts,polymarket/,kalshi/,crypto/,...}` |
| 执行 | 下单引擎 / 组合 / 风控 / 智能路由 / MEV 保护 | `src/execution/{executor.ts,portfolio.ts,risk.ts,smart-router.ts,mev-protection.ts}` |
| 交易 | 跟单 / 鲸鱼追踪 / 机器人策略 | `src/trading/{copy-trading.ts,whale-tracker.ts,bots/}` |
| 风控 | 统一 RiskEngine：VaR / CVaR / 波动率区间 / 压力测试 / 熔断 / 安全（日亏、回撤、kill switch）/ Kelly | `src/risk/{engine.ts,var.ts,volatility.ts,stress.ts,dashboard.ts,circuit-breaker.ts}` + `src/trading/{safety.ts,kelly.ts}` |
| 策略 | 4 类内置机器人（均值回归 / 动量 / 套利 / 做市）+ 118+ skills 策略 | `src/strategies/`、`src/trading/bots/` |
| 链上 | Solana DeFi（Jupiter/Raydium/Orca/Meteora/Kamino…）、EVM DEX、Percolator 链上 perps、Bittensor 挖矿 | `src/solana/`、`src/evm/`、`src/percolator/`、`src/bittensor/` |
| 数据 | SQLite（sql.js / better-sqlite3）本地 + LanceDB 语义记忆 + PostgreSQL 分析 | `src/db/`、`src/memory/`、`src/embeddings/` |
| 凭据 | AES-256-GCM 加密存储 | `src/credentials/` |
| 安全 | 代码扫描 /  scam DB / 交易前校验 | `src/security/`、`src/token-security/` |
| Rust | 高频广播组件（编译为原生，供 TS 调用） | `rust/fast-broadcast/{src,Cargo.toml,tests}` |
| CLI | commander 子命令 | `src/cli/`（onboard/start/repl/doctor/secure/mcp…）、`src/bin/worker.ts` |
| 前端 | 内置 WebChat（浏览器界面） | `src/web/`、`public/` |
| 部署 | npm 包 + Docker（docker-compose）+ systemd | `Dockerfile`、`docker-compose.yml`、`docs/DEPLOYMENT.md` |

## 目录结构与文件索引

### 顶层目录

```
ppll-clodds-bot/
├── AGENTS.md              # 本文件 — AI 工作规范（唯一事实来源）
├── src/                   # TypeScript 源码（100+ 模块目录，见下）
├── rust/                  # Rust 原生组件（fast-broadcast）
├── scripts/               # 顶层脚本（原生绑定修复、安装、截图等）
├── tests/                 # 测试（unit / integration / mocks / helpers）
├── docs/                  # 全部文档（禁止删除）
├── public/                # WebChat 前端静态资源
├── docker-compose.yml     # Docker 部署
└── package.json           # 依赖与脚本
```

### src/ — 核心代码（按层索引，常用目录）

| 目录 | 职责 | 关键文件 |
|---|---|---|
| `gateway/` | 网关入口：HTTP + WebSocket + 限流 + 鉴权 + 控制面板 | `index.ts`、`server.ts`、`control-ui.ts` |
| `channels/` | 21 个消息通道适配器；新增通道继承 `BaseAdapter` | `base-adapter.ts`、`index.ts`、`telegram/`、`discord/`、`webchat/`… |
| `agents/` | 4 个 AI 智能体 | `main-agent.ts`、`trading-agent.ts`、`research-agent.ts`、`alert-agent.ts` |
| `skills/` | Skills 系统：加载器 + 执行器 + 119 个 bundled | `loader.ts`、`executor.ts`、`registry.ts`、`index.ts`、`bundled/<name>/{index.ts,SKILL.md}` |
| `feeds/` | 行情 Feed 管理器与各平台实现 | `index.ts`、`freshness.ts`、`polymarket/`、`kalshi/`、`crypto/`… |
| `execution/` | 下单执行引擎、组合、风控、智能路由、MEV 保护 | `executor.ts`、`portfolio.ts`、`risk.ts`、`smart-router.ts`、`mev-protection.ts`、`feature-engine.ts` |
| `trading/` | 跟单、鲸鱼追踪、机器人、安全（kill switch）、Kelly | `copy-trading.ts`、`whale-tracker.ts`、`bots/`、`safety.ts`、`kelly.ts` |
| `risk/` | 统一风控引擎与子系统 | `engine.ts`、`var.ts`、`volatility.ts`、`stress.ts`、`dashboard.ts`、`circuit-breaker.ts` |
| `strategies/` | 策略相关模块 | 各策略目录 |
| `solana/` / `evm/` | Solana / EVM 链上交易与 DEX | 各协议子目录 |
| `percolator/` | Solana 链上 perps（slab 解析、CPI、keeper） | `slab.ts`、`instructions.ts`、`execution.ts`、`keeper.ts` |
| `bittensor/` | TAO 子网挖矿（TS 链查询 + Python btcli sidecar） | `wallet.ts`、`python-runner.ts`、`service.ts`、`server.ts` |
| `memory/` / `embeddings/` | 语义记忆（LanceDB）、向量嵌入 | 各模块 |
| `db/` | 数据库连接与表定义（SQLite / PostgreSQL） | 各 repository |
| `credentials/` | 加密凭据存储（AES-256-GCM） | 各模块 |
| `security/` / `token-security/` | 安全盾：代码扫描、scam DB、交易前校验 | 各模块 |
| `config/` | 配置定义 | 各模块 |
| `utils/` | 通用工具：`config.ts`（loadConfig）、`logger.ts`（pino）、`http.ts` | 各工具 |
| `cli/` / `bin/` | CLI 子命令、worker 入口 | `onboard.ts`、`bin/worker.ts` |
| `web/` | WebChat 前端逻辑 | 各模块 |
| `mcp/` | MCP server（把 skills 暴露给 Claude Desktop / Code） | 各模块 |

> 模块极多，上面是高频目录。改具体功能前先在该层目录里 grep 定位文件，再动手；不确定归属时查 `docs/ARCHITECTURE.md`。

## Skills 开发规范

Skills 是 Clodds 扩展能力的核心，分两套互补机制：

1. SKILL.md（提示技能） — 带 YAML frontmatter 的 Markdown，注入到 AI system prompt。由 `src/skills/loader.ts` 加载。
2. TypeScript handler — 带 `handle(args)` 的代码模块，由 `src/skills/executor.ts` 通过动态 `import()` 懒加载。

两者都向后兼容 OpenClaw 格式的 SKILL.md。

### 新增一个 skill

- 提示型：在 `.clodds/skills/<my-skill>/SKILL.md` 写 frontmatter（`name` / `description` / `emoji` / `gates.envs` 等）+ 正文指令。
- 代码型：在 `src/skills/bundled/<my-skill>/index.ts` 默认导出 `{ name, description, commands, async handle(args) }`，配套 `SKILL.md`。
- 如果 handler 需要被 `SKILL_MANIFEST` 静态列出（见 `src/skills/executor.ts`），按现有写法追加；纯动态 `import()` 的可以不进 manifest。
- 依赖门控用 `gates`（env / 二进制 / OS / config），缺失时 skill 标记为 `needs-config` 而不崩溃（懒加载是项目硬性要求，禁止因为某个 skill 缺依赖就让整个 app 挂掉）。

### 新增一个行情 Feed

1. 在 `src/feeds/<platform>/index.ts` 实现 `Feed` 接口（`connect` / `getMarkets` / `getOrderbook` / `subscribe` …）。
2. 在 `src/feeds/index.ts` 的 `createFeeds(config)` 里按 `config.feeds.<platform>.enabled` 条件注册。

### 新增一个工具 / 通道适配器

- 工具：在 `src/tools/` 下按 `Tool` 接口实现（`name` / `description` / `parameters` / `execute`）。
- 通道：在 `src/channels/<mychannel>/index.ts` 继承 `BaseAdapter`（`connect` / `sendMessage` / `editMessage` / `deleteMessage` + `onMessage` / `onError` 钩子）。

## 前端（WebChat）开发规范

- WebChat 在 `src/web/` + `public/`，是内置浏览器界面，无独立前端构建链（随 `npm run build` 一起）。
- 用项目现有的 UI / 样式方案，禁止随意引入新的 CSS 框架或与原结构冲突的写法；新增组件先确认放在 `src/web/` 下哪个子目录。
- 调试走项目现有日志 / 会话排查手段，禁止引入 vConsole、eruda 等外部调试工具。

## 后端 / 通用开发规范

### 模块系统

统一 TypeScript（tsx 运行、tsc 编译）。所有模块用 `import` / `export`。不要混用 CommonJS `require` 与 ESM（个别原生 / Rust 桥接处例外，按现有写法）。

### 日志

- 统一用 pino：`src/utils/logger.ts` 导出的 `logger`，或各模块 `src/logging/` 下的带标签 logger（`createLogger(tag)` 风格）。
- 禁止 `console.log` 到处打、自造日志通道；需要结构化排查信息时带 tag + 关键变量。
- 日志文案一律用中文（用户是中文用户，启动面板、INFO/WARN/ERROR 都要让中文用户直接看懂）：新增日志禁止写英文句子；改到老代码里 existing 英文日志时顺手翻译成中文。技术名词（Polymarket、WebSocket、skill 等专有名词）保留英文。

### 配置

- 配置入口 `src/utils/config` 的 `loadConfig()`；环境变量经 dotenv 加载（`~/.clodds/.env` 优先于 CWD `.env`）。
- 新增可配置项要在 `.env.example` 里补一行说明，并在 `Config` 类型里登记。

### 数据库

- 本地 SQLite 经 `sql.js` / `better-sqlite3`，分析用 PostgreSQL（`pg`）。表定义集中在 `src/db/`。
- 改表结构时同步更新 `src/db/` 下的模型 / migration，并 grep 全项目确认所有引用点；不要只改一处。
- 原生模块（better-sqlite3 等）在 `postinstall` 由 `scripts/fix-native-bindings.js` 修复绑定，装完若异常重跑。

### 风控红线

交易相关代码改动必须过 `RiskEngine.validateTrade()` 的既有校验链（kill switch、熔断、仓位 / 敞口、日亏 / 回撤、VaR、波动率区间、Kelly）。不要为"方便"绕过风控直接下单。

## 部署规范

### 本地 / 自托管

- 构建：`npm run build`（tsc 编译到 `dist/` + 拷贝 bundled SKILL.md）。
- 容器：`docker compose up --build`（见 `docker-compose.yml`）。
- 进程管理：生产用 systemd / Docker，不要靠 `tsx watch` 长期跑（那是开发用）。
- 发布到 npm：`npm publish --registry https://registry.npmjs.org`（prepublishOnly 会自动 build）。

### 禁止事项

- 禁止通过 `git reset --hard` 或 `git push --force` 修改远程历史。
- 禁止为调试便利去掉凭据加密（`src/credentials/` 的 AES-256-GCM 是红线）。
- 修改后端 / skill 代码后，必须重新 `npm run build`（或重启对应进程）才能让改动生效，改了源码不重新构建等于没改——排查时要先确认跑的是不是新构建。

## 排障方法论

当本地 / 线上出现"功能不工作"时，按以下路径逐步排查（别靠猜）：

1. 看日志：按 `LOG_LEVEL` 调整级别后，grep 关键错误（`grep -i error` / 关键 tag），定位是数据库、网络、还是逻辑异常。
2. 看服务 / 网关是否起来：`npm run dev` 启动期的 spinner 步骤若某步 `failed`，先解决那一步；WebChat 打不开先确认 18789 端口与 `CLODDS_TOKEN`。
3. 看构建是否生效：改了 TS 源码必须 `npm run build`；线上 / 常驻进程跑的是 `dist/`，改了源码不重新构建，修复不生效（最容易误判"修复没效果"）。
4. 看 skill / feed 加载：用 `/skills` 看 loaded / failed / needs-config；某个 skill 失败先看它的 `gates`（env / 二进制 / 配置）是否满足，不要默认是代码 bug。
5. 看外部连通性：某平台行情 / 下单没反应，先 grep 该平台客户端 / WebSocket 的断连、限流、429/418 日志；频繁请求会被权重 / IP 限制，需要节流与退避。
6. 看 AI / 供应商：`health check failing` 反复刷先查 `src/providers/index.ts`——探活只准 `GET /v1/models`，禁止用真实模型名发请求（写死已停用 / 不存在的模型会永远失败还白花钱）；Provider 必须认 `*_BASE_URL` 环境变量。大坑：agents 走 `@anthropic-ai/sdk`（自动读 `ANTHROPIC_BASE_URL`），providers 是手写 fetch（要显式读环境变量），同一个进程两条路打到不同地址，表现为"AI 能用但健康检查一直失败"。
7. 看类型错误：src 内隐式 any（如 `let gateway;` 没标类型）会直接挂 `npm run build`，必须修；`node_modules/ox` 的类型错是上游遗留，别去修也别为它改 tsconfig。
8. 看改的代码是否真的进了运行态：多会话 / 多进程场景下，确认你改的文件就是正在跑的进程加载的那份，避免"改了 A 进程、查的是 B 进程"。
