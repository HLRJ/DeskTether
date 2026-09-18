# DeskTether

[English](README.md) | **简体中文**

**安全地把 AI Agent 连接到你的本地电脑。**

DeskTether 是一个开源、Windows 优先的 MCP 本机桥接项目，用于向 ChatGPT、MCP Client 或其他 AI Agent 提供经过权限约束的本地计算机能力。

当前 V0.2.4 在 V0.2.3 基础能力之上，新增了 ChatGPT Web 集成元数据、保守的 MCP 工具安全注解、原生调用文案、App 就绪检查以及公开隐私/接入文档。

> **当前状态：V0.2.4 开发版本。** 本地 MCP 通过 stdio 运行，项目附带的 Windows 脚本可以通过 OpenAI Secure MCP Tunnel 将本机 DeskTether 连接到远程 MCP 客户端，而无需暴露公网入站端口。DeskTether 现在会发布适合 ChatGPT 识别的工具元数据，但完整 write/modify 能力仍取决于当前套餐和工作区资格。

## 为什么做 DeskTether

AI 编程工具真正有价值的场景，是它不仅能回答问题，还能读取项目、修改文件、执行命令、运行测试并观察结果。

但如果直接把完整 Shell 权限交给 AI，也会带来明显风险。

DeskTether 的目标不是简单提供一个“远程 PowerShell”，而是在 MCP 接口和本地计算机能力之间加入路径边界、命令权限、高风险确认、Session 生命周期、输出限制和审计。

```text
ChatGPT Web / MCP Client
          |
          | Secure MCP Tunnel 或本地 stdio
          v
DeskTether MCP Server
          |
          +-- Policy / Audit
          +-- Filesystem
          +-- PowerShell / Terminal Sessions
          +-- Process Tools
          +-- Streaming Search
          +-- Git Inspection
```

## 当前能力

- Allowed Root 文件系统边界
- realpath / junction / symlink 越界防护
- 三态命令权限：`ALLOW` / `CONFIRM` / `DENY`
- 与“命令 + 工作目录”绑定的一次性确认 Token
- 自动轮转的 JSONL 审计日志
- Confirmation Token 审计脱敏
- 文件读取、批量读取、分页读取、追加写入
- 递归目录树、目录创建、文件/目录移动、文件元数据
- 精确文本块替换 `edit_block`
- 长时间运行的 Terminal / PowerShell Session
- stdout / stderr 分离、增量 offset 读取
- PID、开始时间、结束时间、exitCode
- 系统进程查看和按 PID 终止
- 可取消、可分页的文件/内容/正则搜索
- include / exclude glob 过滤
- 只读 Git `status` / `diff` / `log`
- 本机设备和运行时信息
- OpenAI Secure MCP Tunnel 安装、诊断、启动和状态检查
- ChatGPT App Profile、Tool title、MCP 安全注解、原生调用文案、Server instructions 和 readiness doctor

## MCP 工具

| 分类 | 工具 |
|---|---|
| Device | `device_info` |
| Files | `list_directory`, `read_text_file`, `read_multiple_files`, `write_text_file`, `create_directory`, `move_file`, `get_file_info`, `edit_block` |
| Terminal | `start_process`, `read_process_output`, `write_process_input`, `terminate_process`, `list_sessions` |
| PowerShell | `powershell_start`, `powershell_read`, `powershell_input`, `powershell_terminate`, `powershell_list` |
| Processes | `list_processes`, `kill_process` |
| Search | `start_search`, `search_code`, `get_search_results`, `stop_search`, `list_searches` |
| Audit | `get_recent_activity` |
| Git | `git_status`, `git_diff`, `git_log` |

目前共 **30 个 MCP 工具**。

## 环境要求

- Windows 10 / Windows 11 / Windows Server
- Node.js 24+
- pnpm 11+
- Git

## 快速开始

```powershell
git clone https://github.com/HLRJ/DeskTether.git
cd DeskTether

pnpm install
pnpm test
pnpm test:tunnel
pnpm build
```

启动前建议显式设置允许访问的目录：

```powershell
$env:DESKTETHER_ALLOWED_ROOTS=(Get-Location).Path
$env:DESKTETHER_BLOCKED_COMMANDS="format,diskpart,shutdown,shutdown.exe,restart-computer"
$env:DESKTETHER_CONFIRM_COMMANDS="remove-item -recurse,git push,npm publish,pnpm publish"
$env:DESKTETHER_ALLOW_COMMANDS="git status,pnpm test"
pnpm mcp
```

如果不设置 `DESKTETHER_ALLOWED_ROOTS`，DeskTether 默认只允许访问当前工作目录树。
## PowerShell 与命令权限

DeskTether 并不是简单把任意 PowerShell 命令全部放行。

当前 Permission Engine 的决策顺序：

```text
DENY
  ↓
显式 ALLOW
  ↓
CONFIRM
  ↓
默认 ALLOW
```

例如：

```text
shutdown              → DENY
git status            → ALLOW
git push              → CONFIRM
Get-Location          → 默认 ALLOW
```

对于 `CONFIRM` 命令：

1. 第一次请求不会启动进程。
2. DeskTether 返回一次性 confirmation token。
3. Token 与精确 command + cwd 绑定。
4. 默认 5 分钟过期。
5. 只能使用一次。
6. Token 只保存在内存中，不写入 Audit。
7. 第二次带回有效 Token 后才真正执行。

显式 ALLOW 规则也不会允许通过简单 Shell 拼接绕过更宽的 CONFIRM。例如：

```powershell
git status && git push
git status > status.txt
git status $(git push)
```

这些命令不会因为前半段是 ALLOW 就直接执行。

## 文件系统能力

### Allowed Root 与真实路径保护

所有文件能力都受到 `DESKTETHER_ALLOWED_ROOTS` 约束。

V0.2.3 不只检查路径字符串，还会解析真实路径，防止类似下面的 junction / symlink 越界：

```text
allowed-root/
└─ link -> 外部目录
```

### 分页读取大文件

普通调用：

```text
read_text_file(path)
```

适用于小文本文件。大文件可以通过 `offset` / `length` 分页读取：

```text
read_text_file(
  path,
  offset = 1048576,
  length = 65536
)
```

负 offset 可以从文件尾部开始读取，适合查看日志末尾。

当前限制：

- 未分页读取：最大 1 MiB
- 单次分页读取：最大 1 MiB
- `read_multiple_files`：单文件最大 1 MiB
- `read_multiple_files`：整批最大 2 MiB

这些限制用于避免一次工具调用向模型上下文塞入过量文本。

### 递归目录浏览

`list_directory` 支持：

```text
depth
maxEntries
```

当前限制：

- depth 最大 20
- maxEntries 最大 5000
- 达到限制时返回 `truncated=true`
- 递归浏览不会跟随 junction / symlink 进入其他目录

### 文件写入

`write_text_file` 支持：

```text
mode = "rewrite"
mode = "append"
```

默认保持兼容，仍使用 `rewrite`。

### 安全移动

`move_file` 同时支持文件和目录。默认禁止覆盖目标，只有显式 `overwrite=true` 才允许覆盖。

同时会拒绝可能造成数据损坏的重叠路径，例如 source 与 destination 相同、把目录移动到自己的子目录、或用 source 覆盖自己的父目录。
## 搜索能力

DeskTether 的搜索采用 Session 模型：

```text
start_search
     ↓
get_search_results
     ↓
stop_search
```

还可以使用 `list_searches` 查看当前和已完成的搜索任务。

V0.2.3 新增专用代码搜索工具 `search_code`，支持：

- Regex
- include glob
- exclude glob
- caseSensitive
- maxResults

示例：

```text
pattern: "TODO|FIXME"
include: ["**/*.ts", "**/*.tsx"]
exclude: ["**/*.test.ts", "dist/**"]
caseSensitive: false
```

## Process / PowerShell Session

DeskTether 支持长时间运行任务，例如：

```text
pnpm dev
python app.py
uvicorn
node server.js
```

Session 支持：

- stdin 输入
- stdout / stderr 分离
- 增量 offset 读取
- PID
- startedAt
- endedAt
- exitCode
- 终止 Session
- Session 列表

默认保护：

- stdout 最大 1 MiB
- stderr 最大 1 MiB
- 最多 32 个 Session
- 结束后的 Session 默认保留 30 分钟

这样可以避免长期运行的开发服务器无限占用 DeskTether 内存。

## 通过 Secure MCP Tunnel 连接 ChatGPT Web

DeskTether 本身不要求暴露公网 HTTP 服务。

推荐远程链路：

```text
ChatGPT Web
     ↓
OpenAI Secure MCP Tunnel
     ↓
tunnel-client
     ↓
DeskTether stdio MCP
     ↓
Windows 本机
```

安装并验证 Tunnel Client：

```powershell
pnpm test:tunnel

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\tunnel\Install-TunnelClient.ps1
```

配置：

```powershell
$env:CONTROL_PLANE_TUNNEL_ID="..."
$env:CONTROL_PLANE_API_KEY="..."
```

请不要把真实凭据提交到 Git 仓库。

诊断：

```powershell
pnpm tunnel:doctor
```

启动：

```powershell
pnpm tunnel:start
```

另开一个终端查看状态：

```powershell
pnpm tunnel:status
```

在 ChatGPT 中创建 App 之前，先运行：

```powershell
pnpm chatgpt:doctor
```

健康状态会返回 `"status": "ready"`，并汇总当前 30 个工具及其安全注解。

ChatGPT Developer Mode / App 配置参见 [`docs/chatgpt-app.md`](docs/chatgpt-app.md)，Tunnel 配置参见 [`docs/secure-mcp-tunnel.md`](docs/secure-mcp-tunnel.md)，隐私说明参见 [`PRIVACY.md`](PRIVACY.md)。

## 配置项

| 环境变量 | 含义 | 默认值 |
|---|---|---|
| `DESKTETHER_ALLOWED_ROOTS` | 允许访问的文件系统根目录；Windows 多目录使用 `;` 分隔 | 当前工作目录 |
| `DESKTETHER_BLOCKED_COMMANDS` | 旧版拒绝规则，兼容映射为 `DENY` | 系统破坏性命令 |
| `DESKTETHER_DENY_COMMANDS` | 始终拒绝的命令前缀 | 空 |
| `DESKTETHER_CONFIRM_COMMANDS` | 需要一次性确认的命令前缀 | 部分删除/发布/Push 命令 |
| `DESKTETHER_ALLOW_COMMANDS` | 显式安全命令前缀 | `git status,pnpm test` |
| `DESKTETHER_AUDIT_PATH` | JSONL 审计日志位置 | `%USERPROFILE%\.desktether\audit.jsonl` |
| `CONTROL_PLANE_TUNNEL_ID` | OpenAI Secure MCP Tunnel ID | 无 |
| `CONTROL_PLANE_API_KEY` | tunnel-client 使用的 Runtime Key | 无 |
| `TUNNEL_CLIENT_BIN` | 自定义 tunnel-client 路径 | 仓库内 `.tools` |

Windows 配置多个 allowed roots：

```powershell
$root1 = (Resolve-Path .).Path
$root2 = (Resolve-Path ..\another-project).Path

$env:DESKTETHER_ALLOWED_ROOTS="$root1;$root2"
```

## Audit 审计

DeskTether 会将工具调用记录为本地 JSONL。

当前 Audit 可记录：

- tool
- args
- status
- duration
- policy decision
- confirmationRequired
- confirmationConsumed
- sessionId
- exitCode
- timestamp

`confirmationToken` 会在落盘前被移除。

V0.2.3 默认：

- 单个 Audit 文件最大 10 MiB
- 自动轮转
- 保留 3 份备份

可以通过 `get_recent_activity` 读取最近调用记录。

注意：如果你把 API Key、密码等长期秘密直接写进 PowerShell 命令文本，这些命令文本仍可能进入 Audit，并可能被 `get_recent_activity` 返回。因此不要把长期密钥直接写进命令参数。

## 安全模型

DeskTether 应被理解为：

> **带安全边界和审计能力的本机 AI 执行桥接层，而不是完整的操作系统沙箱。**

它通过以下方式降低风险：

- Allowed Root
- realpath / junction / symlink 检查
- ALLOW / CONFIRM / DENY
- 一次性确认 Token
- 有界 Session Buffer
- 文件 Context 限制
- Audit
- Secure MCP Tunnel

但一旦一个 PowerShell 命令被策略允许，它仍然拥有当前 Windows 用户对应的真实系统权限。

因此：

**不要直接通过端口转发或公网反向代理暴露 DeskTether。**

远程 ChatGPT 场景应优先使用项目支持的 Secure MCP Tunnel 链路。

## 开发与测试

```powershell
pnpm test
pnpm test:tunnel
pnpm typecheck
pnpm build
pnpm chatgpt:doctor
pnpm tunnel:status
```

项目结构上：

- `packages/core`：本机能力、安全策略、Session、文件系统、搜索、Audit
- `apps/mcp-server`：MCP Adapter 和工具 Schema
- `scripts/tunnel`：Secure MCP Tunnel 安装、诊断和启动脚本

这样可以把“本机能力”与“远程连接方式”解耦。

## GitHub CI

仓库目前使用 GitHub Actions 自动运行：

```text
Linux core / Node 24
Windows / Node 24
```

Windows CI 执行全量 Tests、Tunnel integration tests、Typecheck、Build 和 ChatGPT readiness doctor；Linux CI 执行 Core tests、Typecheck 和 Build。

`main` 已设置 Required Status Checks，CI 未通过时不能正常合并 PR。
## Roadmap

- **V0.1** — 文件系统、Policy、Audit、Terminal/Process Session、流式搜索、Git Inspection、stdio MCP
- **V0.2** — 显式 PowerShell 工具 + OpenAI Secure MCP Tunnel
- **V0.2.1** — 三态权限、一次性确认、Session 增量输出、Audit 2.0、Tunnel doctor/start/status
- **V0.2.2** — 多文件读取、目录创建、文件移动/元数据、精确文本块编辑、搜索 Session 列表
- **V0.2.3** — realpath/symlink 防护、分页文件读取、递归目录树、append、目录移动、regex/glob 搜索、Audit 轮转、Context 限制
- **V0.2.4** — ChatGPT Web App 元数据、MCP 安全注解、原生调用文案、Server instructions、readiness doctor、隐私/接入文档
- **V0.3** — Chrome DevTools / Browser Automation
- **V0.4** — Windows Screenshot、Window Discovery、Keyboard/Mouse、UI Automation
- **V0.5** — Multi-device、Permission Profile、Local Approval UX
- **V1.0** — 面向多个 AI Client 的稳定远程 MCP 本机桥接

## 项目目录

```text
DeskTether/
├─ apps/
│  └─ mcp-server/
├─ packages/
│  └─ core/
├─ scripts/
│  └─ tunnel/
├─ docs/
│  ├─ chatgpt-app.md
│  ├─ secure-mcp-tunnel.md
│  └─ superpowers/
├─ PRIVACY.md
├─ .env.example
├─ package.json
└─ pnpm-workspace.yaml
```

## License

Apache-2.0，详见 [`LICENSE`](LICENSE)。

---

如果你希望参与开发、提交 Issue 或补充新的 MCP 能力，欢迎通过 GitHub PR 参与 DeskTether。
