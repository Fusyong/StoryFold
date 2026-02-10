# StoryFold 技术架构

本文档描述 StoryFold 作为 **VS Code 扩展**的技术架构设计，与 [initial-idea-v2.md](./initial-idea-v2.md) 中的业务设想与分阶段实现一致，并参考了 [ai-proofread-vscode-extension](../ai-proofread-vscode-extension) 的架构模式。

---

## 一、架构概览

### 1.1 形态与约束

- **形态**：VS Code 扩展（Extension），与编辑器深度集成，直接操作工作区与多步骤创作流程。
- **存储**：见下节「界面与数据策略」。
- **LLM**：支持多平台（如 DeepSeek、阿里云百炼、Google Gemini、Ollama 等），可选多模型分工（提纲/备注版大纲用一模型，最终润色用另一模型）。

### 1.2 界面与数据策略（核心约定）

用户在整个创作流程中**尽量在一个连续的 Webview 界面里完成操作**；流程与结构化数据单独存贮，展示与编辑在编辑器中（或与 Webview 联动）。具体约定如下：

- **流程数据存贮**：创作流程中产生的**结构化数据**（写作要点、提纲结构、备注版大纲节点（含设定与场景备注）、样段索引、最终稿版本与元数据、对话历史、档案元数据等）统一存放在 **JSON 文件**（推荐，见 3.5）或 **SQLite** 中（工作区项目目录内或扩展全局存储）。不依赖「一个环节一个散落文件」的编辑方式，便于查询、版本与联动。
- **展示与编辑**：**展示**（含比较差异、多版本对比）与**编辑**主要在 **VS Code 编辑器**中完成：打开对应文档/节点即可查看与修改。必要时可在 Webview 内提供输入框或简版编辑器，与当前打开的编辑器文档**双向联动**（例如 Webview 中改一句话，扩展侧同步到编辑器；或编辑器保存后，Webview 内预览/输入框更新）。
- **Webview 的职责**：同一个 **StoryFold 主 Webview** 作为流程入口与操作台——步骤导航（需求 → 提纲与备注版大纲 → 样段 → 最终作品）、人机对话输入、LLM 结果摘要与「在编辑器中打开」入口、进度与状态提示。用户无需在多个面板或命令之间跳转，流程的推进与回溯都在该 Webview 内完成；具体长文的阅读与修改则在编辑器中完成（或通过 Webview 内嵌输入框与编辑器联动）。

**小结**：数据在 JSON/SQLite，展示与编辑在编辑器（或编辑器 + Webview 输入联动）；一个连续 Webview 承载流程与对话，编辑器承载内容查看与编辑（含 diff）。这样既保证流程连贯、数据可查可版本化，又发挥 VS Code 编辑器在长文与 diff 上的优势。

### 1.3 参考项目的架构要点（ai-proofread-vscode-extension）

| 方面 | 参考做法 | StoryFold 对应 |
|------|----------|----------------|
| 入口 | `extension.ts` 中激活时创建单例、注册命令与视图 | 同：单例管理器 + 命令/视图注册 |
| 命令 | 每类功能一个 `*CommandHandler`，在 extension 中注册命令并委托 | 按业务环节拆分为多个 CommandHandler（需求、提纲、背景、最终作品等） |
| LLM | `proofreader.ts` 内多平台 ApiClient（Deepseek/Google/Ollama 等），统一 `proofread()` 接口；ConfigManager 读平台/模型/API Key | 抽象 `LlmClient`，按阶段使用不同 system prompt 与模型配置 |
| 提示词 | `PromptManager` 管理配置中的提示词列表，`globalState` 存当前选中；TreeView 展示 | 扩展为「按阶段」的提示词（写作要点模板、提纲、背景、最终稿、多角色审读等） |
| 配置 | `package.json` 的 `contributes.configuration`，`ConfigManager` 单例读取并监听变化 | 同：`storyfold.*` 配置项（平台、模型、API Key、各阶段模型/温度等） |
| UI | `WebviewManager` 管理结果面板（HTML）；TreeView 用于提示词、引文、字词检查等 | **一个连续主 Webview** 承载全流程与对话；展示/编辑在编辑器或编辑器与 Webview 联动；TreeView 可选 |
| 工具 | `utils.ts`：TempFileManager、ConfigManager、Logger、FilePathUtils、ErrorUtils | 同层工具类；增加 ProjectPaths、ArchiveManager 等与创作项目相关的工具 |
| 数据 | 部分用 sql.js（引文索引）、JSON/配置文件、工作区文件 | **流程数据**：JSON 或 SQLite；**可打开编辑的正文**：编辑器文档（由扩展按需从数据中生成或同步）；档案与知识库可为 JSON 或 sql.js |

---

## 二、分层与目录结构

### 2.1 分层示意

```
┌─────────────────────────────────────────────────────────────────┐
│  VS Code 扩展入口 (extension.ts)                                  │
│  注册命令、视图、菜单；创建并持有各管理器与 CommandHandler          │
├─────────────────────────────────────────────────────────────────┤
│  命令层 (commands/)                                               │
│  RequirementsHandler | OutlineHandler | BackgroundHandler |      │
│  FinalWorkHandler | ArchiveHandler | ...                         │
├─────────────────────────────────────────────────────────────────┤
│  业务/流程层 (workflow/ 或 各 handler 内)                           │
│  写作要点生成与编辑、提纲与备注版大纲生成与迭代、样章样段、最终稿、   │
│  多角色审读、档案克隆与版本                                       │
├─────────────────────────────────────────────────────────────────┤
│  LLM 与提示层 (llm/ + prompts/)                                   │
│  LlmClient 多平台实现、RateLimiter、PromptManager、各阶段 prompt  │
├─────────────────────────────────────────────────────────────────┤
│  数据与存储层 (storage/ 或 data/)                                 │
│  创作项目结构、创作档案、知识库、类型库（MVP 后可逐步加入）         │
├─────────────────────────────────────────────────────────────────┤
│  UI 层 (ui/)                                                      │
│  WebviewManager（对话/结果面板）、TreeView（项目/档案/提示词）      │
├─────────────────────────────────────────────────────────────────┤
│  工具与基础 (utils.ts, types.ts)                                  │
│  ConfigManager, Logger, TempFileManager, FilePathUtils,           │
│  ProjectPaths, 错误处理等                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 建议的源码目录结构

```
StoryFold/
├── package.json                 # 扩展元数据、commands、configuration、views、menus
├── tsconfig.json
├── src/
│   ├── extension.ts             # 激活/停用，注册命令与视图，创建单例与 Handler
│   ├── utils.ts                 # Logger, ConfigManager, TempFileManager, FilePathUtils, ErrorUtils 等
│   ├── types.ts                 # 写作要点、提纲与备注版大纲/背景类 schema、创作项目等公共类型
│   │
│   ├── commands/
│   │   ├── requirementsCommandHandler.ts   # 梳理需求 → 写作要点
│   │   ├── outlineCommandHandler.ts        # 提纲生成与修改、样张样段
│   │   ├── backgroundCommandHandler.ts     # 可选：背景类数据/设定扩展（第二版或之后）
│   │   ├── finalWorkCommandHandler.ts      # 最终作品、多角色审读
│   │   └── archiveCommandHandler.ts        # 创作档案、克隆项目（第二版可强化）
│   │
│   ├── llm/
│   │   ├── llmClient.ts         # 抽象接口 LlmClient (chat/completion)
│   │   ├── deepseekClient.ts    # DeepSeek 实现
│   │   ├── aliyunClient.ts      # 阿里云百炼（若参考项目有则可复用思路）
│   │   ├── googleClient.ts      # Google Gemini
│   │   ├── ollamaClient.ts      # Ollama 本地
│   │   └── rateLimiter.ts       # RPM/并发限制
│   │
│   ├── prompts/
│   │   ├── promptManager.ts     # 按阶段管理提示词（配置 + globalState 当前选中）
│   │   ├── promptsView.ts       # 提示词 TreeView（可选，与参考项目类似）
│   │   └── templates/           # 内置各阶段 system/user 模板（写作要点、提纲与备注版大纲、样段、最终稿、适龄检查等）
│   │
│   ├── workflow/
│   │   ├── requirementsWorkflow.ts  # 从用户输入到结构化写作要点
│   │   ├── outlineWorkflow.ts       # 提纲与备注版大纲生成、样章样段、一致性检查
│   │   ├── backgroundWorkflow.ts    # 按备注版大纲与章节/场景生成（第二版）
│   │   ├── finalWorkflow.ts         # 从备注版大纲到最终稿、多角色审读
│   │   └── refinementLoop.ts       # 可选：状态—判断—决策—循环 的通用调度，供各阶段复用
│   │
│   ├── storage/
│   │   ├── projectLayout.ts     # 创作项目目录与文件约定（写作要点/提纲与备注版大纲/样段/背景类数据/最终稿路径）
│   │   ├── archiveManager.ts    # 创作档案的保存、版本、克隆
│   │   └── knowledgeStore.ts   # 创作知识库、类型库、知识库（第三版可扩展）
│   │
│   └── ui/
│       ├── webviewManager.ts   # 人机对话面板、结果展示（写作要点/提纲与备注版大纲/样段/最终稿预览）
│       ├── projectTreeView.ts  # 当前创作项目文件/节点树（可选）
│       └── archiveTreeView.ts  # 创作档案列表/克隆（可选）
│
├── docs/
│   ├── initial-idea-v2.md
│   └── architecture.md         # 本文档
└── resources/                  # 可选：内置提示词模板、图标等
```

MVP 阶段可先实现 `extension.ts`、`utils`、`types`、`commands/requirementsCommandHandler`、`commands/outlineCommandHandler`、`commands/finalWorkCommandHandler`、`llm/`、`prompts/promptManager` 与基础 `workflow`、简单 `storage/projectLayout` 与 `ui/webviewManager`，暂不实现 `backgroundCommandHandler`、完整 `archiveManager` 和 TreeView。

---

## 三、核心模块说明

### 3.1 扩展入口 (extension.ts)

- **激活时**：创建 `Logger`、`ConfigManager`、`TempFileManager`、`LlmClient`（根据配置选平台）、`PromptManager`、`WebviewManager`；实例化各 `*CommandHandler`；注册 `contributes` 中声明的所有命令与视图。
- **主入口命令**：提供「StoryFold: 打开创作工作台」类命令，打开**单一连续主 Webview**，用户在此完成需求 → 提纲与备注版大纲 → 样段 → 最终作品的全流程；各环节的展示与编辑通过「在编辑器中打开」或编辑器与 Webview 输入框联动完成。其余命令可为辅助（如从资源管理器右键「用 StoryFold 打开」、TreeView 档案克隆等）。
- **deactivate**：释放 Logger、ConfigManager 等单例，清理临时资源。

### 3.2 配置 (package.json contributes.configuration)

建议配置命名空间 `storyfold`，与参考项目 `ai-proofread` 类似，包含：

- **LLM 平台与密钥**：`storyfold.llm.platform`（deepseek | aliyun | google | ollama）、各平台 `apiKeys.*`、各平台 `models.*`。
- **可选多模型分工**：如 `storyfold.llm.modelForOutline`、`storyfold.llm.modelForFinal`，不填则共用默认模型。
- **请求行为**：超时、重试次数、RPM、最大并发、temperature（可按阶段再细分配置）。
- **提示词**：`storyfold.prompts` 数组（name + content）或按阶段分组的提示词；当前选中的阶段/提示词可存 `globalState`。
- **项目与档案**：默认创作项目目录名（如 `.storyfold` 或用户指定）、档案存放位置等。

### 3.3 LLM 层 (llm/)

- **LlmClient 接口**：统一方法如 `chat(messages: Message[], options?: { model?, temperature?, ... }): Promise<string>`，由各平台实现（DeepSeek/阿里云/Google/Ollama）通过 ConfigManager 读取 API Key 与模型。
- **RateLimiter**：与参考项目一致，按 RPM 与 maxConcurrent 限流，避免请求过快。
- **使用方式**：由 `workflow` 或 `*CommandHandler` 调用 LlmClient，并传入由 `PromptManager` 或内置模板拼装好的 system/user 消息；长文本可拆分为多轮或按章节/场景分片（尤其备注版大纲中的长节点或背景类数据）。

### 3.4 提示词与模板 (prompts/)

- **PromptManager**：读写工作区/用户配置中的提示词列表；`globalState` 记录当前选中的提示词或按阶段选中的模板；提供「按阶段」获取 system/user 模板的 API（需求、提纲与备注版大纲、样段、最终稿、适龄检查等）。
- **模板内容**：可在代码中内置默认模板（写作要点字段说明、提纲与备注版大纲格式与 schema 说明、最终稿与多角色审读说明、适龄与安全要求等），用户配置可覆盖或扩展。

### 3.5 创作项目与存储 (storage/)

遵循 **1.2 界面与数据策略**：流程与结构化数据以 **JSON 或 SQLite** 存贮；需要展示、比较差异或编辑的正文，由扩展在编辑器中打开（或与 Webview 输入框联动）。

#### JSON 与 SQLite 选型建议（就目前考虑的问题）

| 维度 | JSON | SQLite |
|------|------|--------|
| **实现与依赖** | 无额外依赖，读写简单，易调试；项目目录即一组文件，结构一目了然 | 需 sql.js 或原生模块，打包与兼容略复杂；参考项目 ai-proofread 已用 sql.js 做引文索引 |
| **与「在编辑器中打开」的契合度** | 可直接打开工作区内的 `brief.json`、`outline.json` 等，或由扩展生成 .md 再打开；编辑器即文件，保存即写回 | 必须先从库中取出内容生成临时/工作区文档再打开，保存时再写回库；多一层「物化」逻辑 |
| **MVP / 第二版数据量** | 写作要点、提纲、样段、最终稿、少量对话历史——单次创作内规模有限，每类一两个或数个 JSON 即可；版本可用 `versions: []` 或单文件多版本 | 同样胜任；查询「某一章背景」「某次对话」更自然，但 MVP 阶段查询需求简单，收益不明显 |
| **档案与克隆** | 档案 = 复制项目目录或打包；克隆 = 解包或复制目录；与现有「项目即文件夹」一致 | 档案 = 复制单库文件；克隆同理；也简单 |
| **第三版（知识库/类型库）** | 大量条目、按标签/类型检索、关联查询时，需自建索引或扫文件，扩展性一般 | 更适合：表结构、索引、简单 SQL 即可做检索与关联；若第三版确定做复杂知识库，再引入 SQLite 更合适 |

**结论（就目前考虑到的问题）**：**优先采用 JSON**。理由：(1) MVP 与第二版无需引入 sql.js，实现和排错更轻量；(2) 每个环节天然对应少量文件（`brief.json`、`outline.json`、按章节的 `background/` 下 JSON、`final.json` 等），与「在编辑器中打开」一致，用户也可直接在工作区中看到、备份或版本控制；(3) 对话历史、多版本用 JSON 内数组或单文件多版本即可满足；(4) 若第三版明确要做知识库/类型库的检索与关联，再引入 SQLite（或混合：项目数据仍用 JSON，知识库单独用 SQLite）更划算。  
若希望**从一开始就统一用一种存储、避免日后迁移**，也可以选 SQLite，代价是 MVP 要维护 schema 和「从 DB 物化到编辑器再写回」的路径。

- **projectLayout.ts / flowStore**：约定「当前创作项目」的数据存放方式；**默认采用 JSON 方案**，后续若有复杂检索与关系再考虑 SQLite 或混合。
- **JSON 方案（推荐）**：项目目录下如 `brief.json`（写作要点）、`outline.json`（提纲结构，可含 `versions` 数组与备注版大纲节点）、`samples/` 下 JSON 或单文件（样段）、`background/` 下按章节的 JSON（可选的背景类块，如需）、`final.json`（最终稿及版本）、`conversation.json` 或按步骤的对话文件等；扩展提供「在编辑器中打开」时可直接打开某 JSON 或由其内容生成的 .md，保存时写回对应 JSON。
- **SQLite 方案（可选）**：单库内表区分写作要点、提纲/备注版大纲节点、样段、背景类块、最终稿版本、对话历史等；扩展从库中取出内容生成工作区/临时文档再打开，保存时写回库。
- **archiveManager.ts**：一次创作的快照保存为档案；**推荐**以 JSON 实现（复制项目目录或打包为单归档）；支持按时间戳或名称列出、克隆为新项目；后续可加版本 diff、元数据检索。
- **knowledgeStore.ts**：第三版再细化（创作知识库、类型库、知识库）；届时若需检索与关联，可单独采用 SQLite 或与项目 JSON 并存。

### 3.6 工作流 (workflow/)

- **requirementsWorkflow**：接收用户自然语言或当前文档内容，调用 LLM 生成/补全结构化写作要点（目标读者、体裁、主题、禁忌、篇幅、风格等）；支持多轮对话完善，输出写入 `写作要点.json`。
- **outlineWorkflow**：读取写作要点，生成提纲与备注版大纲；支持多轮修改；可生成样章样段并写回项目；按「先粗后细、远粗近细」可拆为多步调用。
- **backgroundWorkflow**（第二版）：根据备注版大纲与写作要点，按章节/场景生成背景类数据并写入存储；人机交互完善（编辑、追加、重跑某段）。
- **finalWorkflow**：根据备注版大纲（与提纲、写作要点、样段）生成最终稿；支持多角色审读（读者/批评家/教师/儿童权利专家等），以多视角提示或多次调用方式生成反馈与修订建议。

各 workflow 可返回「下一步建议」或状态，供 CommandHandler 与**细化循环控制**（见下）决定是否继续循环、是否打开 Webview 对话、是否刷新 TreeView、是否保存档案等。

#### 3.6.1 创作流程原则与循环控制（状态—判断—决策—循环）

业务设想中强调的创作流程原则——**视作品篇幅安排循环，先粗后细、远粗近细，先整体后局部、由近到远，整体与局部兼顾，多重修改、完善、渲染，并检查调整后的一致性**——在架构上通过「**状态检测/判断 → 决策 → 执行 → 再检测**」的闭环体现，并可复用到提纲、备注版大纲、样段、最终稿等各阶段。

**1. 状态模型（供检测与决策使用）**

- **篇幅/粒度层级**：根据作品篇幅（短篇/中篇/长篇等）约定层级结构，例如：**整体** → **部分/卷** → **章** → **节/场景**。层级决定「粗/细」的尺度：先整体（粗），再逐步下钻到局部（细）。
- **当前焦点与远近**：在某一层级内，维护「当前焦点」位置（如当前章、当前场景）。**由近到远**：优先处理当前焦点及邻近单元，远处单元保持较粗或待处理；焦点可随用户或自动策略平移。
- **细化/渲染遍数**：对当前焦点或当前层级，记录已完成的「修改/完善/渲染」轮数，用于判断是否需再跑一轮或是否可收束。
- **阶段**：当前处于哪一业务阶段（需求 / 提纲与备注版大纲 / 样段 / 最终稿），以及该阶段内子步骤（如「提纲粗稿」「插入设定」「插入场景备注」等）。

上述状态可持久化在项目 JSON 的元数据中（如 `currentScope`、`currentFocus`、`refinementPass`、`phase`），供每次循环读取与更新。

**2. 状态检测/判断**

- **一致性检查**：在每次生成或修改后，对当前范围做一致性检查（事实、人物、时间线、风格等）。可由 LLM 做一次「一致性审阅」或规则/关键词扫描，输出「通过 / 存在问题列表」。
- **完整性/细化程度判断**：当前层级或焦点是否已满足「本阶段可接受」的完整度与细度；远处是否仍过粗需后续补细。
- **是否可结束或需继续**：结合用户意图（如「先到这里」）、一致性结果、完整性结果，判断本步/本阶段是否结束，或应进入下一轮细化/下一焦点/下一层级。

**3. 决策**

根据「状态检测/判断」的结果与配置的策略，决定下一步动作，例如：

- **加深细化**：在当前焦点或当前层级再执行一轮生成/修改/渲染（如对当前章再细化场景备注）。
- **平移焦点**：保持当前层级，将焦点移到相邻单元（由近到远，如下一章、下一场景）。
- **回到更粗层级**：若发现整体不一致或需整体调整，回到上一层级（如从「章」回到「部分」）再做一轮粗调。
- **进入下一阶段**：当前阶段已满足一致性且用户或策略决定收束，则进入下一业务阶段（如从提纲与备注版大纲进入样段）。
- **结束或暂停**：用户结束、或达到最大轮数/满足完成条件。

**4. 循环的落点**

- **循环粒度**：可在**单阶段内**循环（例如仅在「提纲与备注版大纲」内多轮：粗提纲 → 插入设定 → 一致性检查 → 细化某章备注 → 再检查 → …），也可在**跨阶段**时体现（需求 → 提纲与备注 → 样段 → 最终稿，每个阶段内部又可多轮）。
- **实现落点**：
  - **workflow 层**：各 workflow（如 `outlineWorkflow`、`finalWorkflow`）在实现时接受「当前状态」与「决策结果」作为输入，执行一步生成/修改/渲染，并返回更新后的状态与建议的「下一步」。
  - **RefinementController / 循环调度**（可选独立模块）：位于 workflow 之上，负责在单阶段内或多阶段间执行「读取状态 → 调用一致性检查与完整性判断 → 根据策略与用户输入做决策 → 调用对应 workflow 一步 → 写回状态 → 再判断…」；可放在 `workflow/refinementLoop.ts` 或由各 CommandHandler 内嵌调用。
  - **UI**：主 Webview 在展示当前阶段与进度时，可展示「当前层级/焦点」「一致性检查结果」「建议下一步」（如「建议先完善第 3 章备注再继续」），便于用户理解并参与决策（继续自动循环 vs 手动干预）。

**5. 小结**

| 原则表述           | 架构体现                                                                 |
|--------------------|--------------------------------------------------------------------------|
| 视篇幅安排循环     | 篇幅 → 粒度层级与循环次数/策略配置；状态中的层级与遍数                   |
| 先粗后细、远粗近细 | 状态中的层级（整体→局部）与焦点（近处先细、远处暂粗）；决策中的「加深/平移/回粗」 |
| 先整体后局部、由近到远 | 决策顺序与焦点平移策略；workflow 按层级与焦点加载上下文                 |
| 整体与局部兼顾     | 一致性检查覆盖当前范围及与整体的关系；必要时「回到更粗层级」决策          |
| 多重修改、完善、渲染 | 细化/渲染遍数状态；循环内多次调用 workflow 与 LLM                        |
| 检查调整后的一致性 | 每次执行后的一致性检查作为「判断」输入，驱动决策与下一轮循环             |

由此，**状态检测/判断 → 决策 → 执行（workflow 一步）→ 再检测** 形成闭环，各阶段均可按需复用同一套循环控制逻辑，实现与业务原则名实相副的创作流程。

### 3.7 UI (ui/)

遵循 **1.2 界面与数据策略**：用户尽量在**一个连续的 Webview** 内完成流程操作；展示与编辑在编辑器中（或编辑器与 Webview 输入框联动）。

- **WebviewManager（主 Webview）**：维护**单一连续**的 StoryFold 主面板，作为全流程入口与操作台：
  - **步骤导航**：需求 → 提纲与备注版大纲 → 样段 → 最终作品（含多角色审读），当前步骤与历史步骤在同一界面内可切换或回溯。
  - **人机对话**：每步内的用户输入、LLM 回复、结构化结果摘要（写作要点/提纲与备注版大纲/样段/最终稿）在 Webview 内展示；提供「在编辑器中打开」按钮，将对应内容从 JSON/SQLite 取出并在编辑器中打开，供查看、编辑与 **diff 比较**。
  - **联动**：若在 Webview 内提供短文本输入框或简版编辑（如单段修改），通过 postMessage 与扩展侧同步到 JSON/SQLite，并可选「同步到已打开的编辑器文档」或「在编辑器中打开」以做长文编辑与 diff。
- **编辑器**：承担长文阅读、编辑与**差异比较**（例如提纲/备注版大纲版本 diff、最终稿与设定/备注的对比、多角色审读意见与正文对照）；文档可由扩展从 JSON/SQLite 生成或与 Webview 内输入联动更新。
- **TreeView**：可选「当前创作项目」树（写作要点、提纲与备注版大纲、样段、背景类数据、最终稿节点，点击在编辑器中打开对应内容）；可选「创作档案」树（历史项目、克隆入口）。实现方式参考 ai-proofread 的 promptsView、citation 等 TreeView。

### 3.8 工具 (utils.ts, types.ts)

- **Logger**：统一日志出口，可选输出到 VS Code 输出通道或控制台（调试）。
- **ConfigManager**：单例，`vscode.workspace.getConfiguration('storyfold')`，监听 `onDidChangeConfiguration`；提供 getPlatform、getModel、getApiKey、getTemperature 等封装。
- **TempFileManager**：扩展 `globalStorageUri` 下临时文件创建与清理（与参考项目一致）。
- **FilePathUtils**：时间戳、输出路径后缀、备份文件等（可扩展为 ProjectPaths 封装项目内路径）。
- **ErrorUtils**：统一错误提示与可选日志。
- **types.ts**：写作要点（Brief）、提纲节点、背景块类型、创作项目元数据、档案元数据等 TypeScript 类型定义，供 workflow 与 storage 使用。

---

## 四、数据流与典型调用链

### 4.1 MVP：从需求到最终作品

1. 用户通过命令（如「StoryFold: 打开创作工作台」）打开**主 Webview**；在 Webview 内选择或初始化「当前创作项目」（数据落在工作区目录的 JSON 或 SQLite）。
2. **需求**：在 Webview 内输入或粘贴初步需求 → 主 Webview 调用 RequirementsWorkflow（LlmClient + 写作要点模板）→ 生成/补全写作要点 → 写入 JSON/SQLite；Webview 展示摘要，提供「在编辑器中打开」可查看/编辑全文；继续在 Webview 内多轮对话完善，数据始终写回 JSON/SQLite。
3. **提纲与备注版大纲**：在 Webview 内进入「提纲与备注版大纲」步骤 → OutlineWorkflow 读取写作要点、调用 LlmClient 生成提纲并插入设定与场景备注，形成备注版大纲 → 写入 JSON/SQLite；Webview 展示结构化摘要；用户可「在编辑器中打开」提纲/备注版大纲全文进行编辑与版本 diff，或继续在 Webview 内对话修改。
4. **样段**（可选）：Webview 内「生成样段」→ OutlineWorkflow 基于写作要点与备注版大纲生成样段并写入 JSON/SQLite；Webview 展示样段列表/摘要；「在编辑器中打开」某一样段进行编辑或比较。
5. **最终作品**：Webview 内「生成最终作品」→ FinalWorkflow 读取写作要点、备注版大纲（及样段）、调用 LlmClient → 结果写入 JSON/SQLite；Webview 展示摘要与「在编辑器中打开」；用户在编辑器中做长文编辑与 diff。
6. **多角色审读**：Webview 内触发「多角色审读」→ FinalWorkflow 按角色调用 LlmClient，审读结果写入 JSON/SQLite 或在 Webview 展示；用户可在编辑器中打开最终稿与审读意见做对照与修改。
7. **档案**：Webview 内「保存为创作档案」将当前项目快照写入 archive（JSON/SQLite）；「从档案克隆」在 Webview 或 TreeView 中选择档案并克隆为新项目。

全流程以**主 Webview 为连续操作面**，**流程数据在 JSON/SQLite**，**展示与比较差异、编辑在编辑器中**（或通过 Webview 输入框与编辑器联动）。

### 4.2 第二版：强化备注版大纲与细化循环（可扩展背景类数据）

- 在主 Webview 中，第二版重点是：在「提纲与备注版大纲」步骤内，引入更细粒度的层级与状态（如卷/章/场景）、一致性检查与**细化循环控制**（见 3.6.1），让用户可按「先粗后细、远粗近细」在不同层级和范围内多轮迭代。  
- 若后续需要更复杂的世界观/背景类数据（如设定集中未放入备注版大纲的长篇背景资料），可通过 `backgroundWorkflow` 等可选模块，按章节/场景生成并存储「背景类块」，在最终稿生成时按需加载，控制 token 与上下文长度。

---

## 五、与 initial-idea-v2 的对应关系

| 文档章节 | 架构对应 |
|----------|----------|
| 一、业务环节 1 人机交互梳理需求 | `RequirementsCommandHandler` + `RequirementsWorkflow` + 写作要点模板与 `brief.json` |
| 一、2 梳理提纲与写作备注版大纲 | `OutlineCommandHandler` + `outlineWorkflow` + `outline.json`（提纲结构）与备注版大纲相关数据，支持一致性检查与细化循环 |
| 一、3 试写样张样段 | 仍由 `OutlineCommandHandler` / `outlineWorkflow` 承担样段生成与回写（如 `samples/` 下 JSON 或文件） |
| 一、4 最终作品与多角色审读 | `FinalWorkCommandHandler` + `finalWorkflow` + 多角色 prompt 与可选模型，输出最终稿与审读结果 |
| 二、创作档案 | `ArchiveManager` + `ArchiveCommandHandler`，负责项目快照、版本与克隆 |
| 二、创作知识库 / 类型库 / 知识库 | `storage/knowledgeStore.ts` 及后续类型库、知识库模块（第三版） |
| 三、技术选型（VSCode、多文件、多模型） | 本文档 1.1、2、3.2、3.3 |
| 四、核对清单 | 实现时可在各模块完成对应项（写作要点 schema → `types.ts` + 模板；备注版大纲 schema → `types.ts` + `outlineWorkflow`；档案/知识库等） |

---

## 六、实现阶段建议

- **第一阶段（MVP）**：extension、utils、types、LlmClient（至少 1～2 个平台）、PromptManager 与基础模板、Requirements + Outline + Final 的 Workflow、**单一主 Webview**（步骤导航 + 人机对话 + 「在编辑器中打开」）、流程数据存 JSON（或 SQLite）；此时提纲与备注版大纲可以只实现基础形态（结构清晰的提纲 + 简单备注），档案与细化循环可简单或暂不实现。
- **第二阶段**：强化备注版大纲及其细化循环（3.6.1）、样段生成、创作档案的保存与克隆；可选编辑器与 Webview 输入框联动、projectTreeView；如有需要，可开始接入 `backgroundWorkflow` 处理更复杂的背景类数据。
- **第三阶段**：创作知识库、作品类型库、知识库（含来源追溯与检索策略）、适龄与内容安全策略的显式配置与适龄自检步骤。

---

*本文档在 initial-idea-v2.md 与 ai-proofread-vscode-extension 技术结构基础上整理，供开发实现与迭代参考。*
