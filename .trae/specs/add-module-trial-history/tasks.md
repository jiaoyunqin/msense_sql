# 模块内试跑记录任务

状态：已批准，任务 1 至 4 完成，25／25 项验收通过。用户随后明确要求“更新至vercel”，按该授权提交并推送当前工程。

- [x] 任务 1：同步规格并统一记录读取契约。
  - 将获批行为合入 `docs/spec.md`，与现有渐进展示、载入复用及发布门禁保持一致。
  - 读取当前完整能力的 `runs`，统一次数、顺序、实验、时间、状态与唯一运行定位；保留旧记录及缺失值。
  - 共享契约：新增 `src/composer-trial-records.js`，导出 `trialRuns(obj)`、`findTrialRun(obj, runId)`、`trialRecordStatus(run)`、`trialRecordTime(run)`、`trialExperiment(run)`，只读原数组及记录，不查找其他模块、不回退或补造快照。
  - 约定记录视图与当前验证模式的切换，记录快照读取与当前输入隔离，不增加报告对象或新的流程状态。
  - 验证：同实验多次及轮内多任务计数正确；查询／核对签名不因读取变化，旧快照不被补造。
  - 验证证据（2026-10-22）：`TZ=Asia/Shanghai node --input-type=module` 内联契约检查 9／9 组通过，覆盖五个导出及参数个数、原数组和顺序、同实验两轮计 2 次而非 5 个子任务、模块内严格定位及无回退、7 种状态及缺失值、实验字符串、含秒及午夜时间、缺失／无效时间不取当前时间、深冻结对象读取前后完全一致且不补造旧快照。
  - 实际快照证据：Vite SSR 加载现有签名函数及 `presetItems()` 依赖，对深冻结的 `composer-demo.json` 工作区读取后，两项检查通过；能力查询签名 `3c81900d`、核对签名 `f42d9bde`、各 SQL 查询／核对签名及当前运行 `abilityrun_mvhrd3w6_3ssql` 均不变，完整历史、发布、分析和报告集合 JSON 不变。
  - 工程证据：`node --check src/composer-trial-records.js`、`npm run build`、`git diff --check` 通过。验收清单 SHA-256 与开始时一致且仍全部未勾选；本任务不编辑 UI／CSS／引擎，`docs/spec.md` 仅插入本变更，保留期间其他任务对 UI、CSS 及相邻 SQL 规格的并发修改。
  - 收尾复核（2026-10-22）：固定 API 再验 9／9 组及实际快照签名／集合检查通过，语法及差异检查通过；未修改 helper 内容或参数签名，验收清单保持原样，任务 2、3 的实现代码及任务条目未改动。

- [x] 任务 2：增加能力配置页的折叠记录区。
  - 在验证摘要之后、发布记录之前接入“试跑记录 · N 次”，零记录隐藏，首次出现默认收起。
  - 展开提供模块范围说明及记录行；实际实验、开始时间、执行状态、唯一查看入口按规格展示。
  - 保持同一对象展开状态、列表滚动及输入焦点；切换对象、重载默认收起，运行状态即时更新。
  - 沿用现有样式，长列表局部滚动，窄屏换行，折叠和查看入口支持键盘及可访问名称。
  - 验证：新建、首次失败、多轮、同实验重复、缺失字段、编辑保存和只读／归档查看均符合规格。
  - 实施契约：`createTrialHistory(outlet)` 返回 `render(obj)`、`refresh(obj)`、`reset()`；复用任务 1 元信息读取，按完整能力 ID 刷新，查看按钮为 `view-trial-record` 并保留 `data-run-id`，未修改浮层或点击处理区域。
  - 定向证据（2026-10-22）：`python3 /tmp/task2-trial-history-check.py` 使用系统 Chrome 通过 24／24 项，覆盖零记录无占位、首次失败收起、位置与次数／稳定顺序、重复实验、多子任务不重复计数、缺失信息／全部状态、Enter／Space 与 ARIA、同模块重绘及新增记录保持列表滚动／行焦点、配置输入 DOM／值／光标保持、跨对象刷新隔离及切换收起、375px 长实验无溢出或重叠。`node --check` 两个相关 JS 及 `git diff --check` 通过；未修改验收清单，真实执行和只读／归档端到端验证交由任务 4。

- [x] 任务 3：在原取数验证浮层接入只读记录详情。
  - 从配置页记录行或浮层历史选择按当前模块及运行 ID 打开指定快照，找不到时明确提示。
  - 使用当次上下文、取数定义、字段、任务、结果和 SQL；不将当前实验或展示定义用于填充历史。
  - 记录模式隐藏执行、核对及发布，支持任务查看；按既有权限提供返回当前验证，并保留进入前的当前配置和输入。
  - 运行中状态刷新仍定位同一运行；失败、空数据、缺少部分快照和重载中断可查看。
  - 关闭、返回及 Esc 恢复记录行焦点、原滚动和折叠状态；当前验证原有核对、最新展示及发布流程保持。
  - 验证：实验 A 历史与当前实验 B、修改名称／格式后的旧快照、过期记录、同签名最新失败均不会误改当前验证。
  - Implementation contract: `recordView` isolates historical UI state; `trialSnapshot` in `src/composer-trial-snapshot.js` uses the shared exact owned-run lookup and only stored snapshots. Both `view-trial-record` and floating history selection enter the same read-only detail view. Returning uses the same overlay session and existing current context without copying historical parameters or running queries.
  - Focused evidence (2026-10-22): `node --loader /tmp/sql-creator-task3-loader.mjs /tmp/module-trial-history-task3-check.mjs` passed 10/10 groups against actual helpers, extracted current UI functions and `composer-demo.json`. Covered frozen A snapshot with throwing live-metadata getters; missing/partial definitions, child-mode field fallback and raw-only rows; saved field names/format versus latest current-valid fields and reapproval; latest same-signature failure; snapshot-only history refresh without sample experiment metadata and stable selected run after newer runs; same-session return restoring selection/issues/scroll; missing requested run before session mutation; archived/config/read-only/running return gates; inert forged run/publish/environment/input/approval actions; exact run-ID focus and background scroll restoration.
  - Engineering evidence: `node --check src/composer-ui.js`, `node --check src/composer-trial-snapshot.js` and `git diff --check` passed. Configuration list module/regions, data signatures, engine and analysis were not edited by Task3. Browser/build acceptance and checklist updates remain Task4; no push, deployment or export performed.

- [x] 任务 4：独立验收并打开本地预览。
  - 由验收子代理逐项验证 `checklist.md`，只勾选实际通过项；失败项追加任务，由实现子代理修复并定向复验。
  - 浏览器实际执行两轮取数，并检查计数、结果定位、核对发布、修改后失效、历史只读及刷新保留。
  - 检查桌面和窄屏、键盘和焦点、模块隔离、旧记录兼容、载入／复制边界与报告集合未增加。
  - 运行 `npm run build` 及差异检查，必要时补针对快照和状态隔离的验证，不编写与 UI 渲染逐项对应的镜像测试。
  - 实施及验收通过后更新并打开本地预览；不自动推送或部署，不生成离线 HTML 或源码压缩包。
  - 最终验收证据（2026-10-22）：此前独立验收因用户中断终止；恢复后复用其脚本，修正临时 fixture 的未发布 SQL、能力快照 ID 及与当前 UI 不符的测试选择器，没有修改应用源码。`deployment-qa/browser-results.json` 的 10 个分支通过，剩余 2 个分支在 `deployment-fixes/browser-results.json` 定向复验通过，合计 12／12。两轮真实 worker 各执行 4 个任务，分别生成不同运行 ID，核对并发布 v1 成功。
  - 覆盖证据：A 历史与 B 当前输入、只读字段／SQL、整个工作区查看前后相等；当前指标名称及小数 4 位修改要求重新核对，合法查询修改要求重新试跑，旧行保持已完成；36 条记录稳定顺序及局部滚动，390px Enter／Space／Tab／Esc 焦点与滚动恢复；归档／只读、目标载入历史保留、复制空历史、RPC 无补造、最新失败及重载中断保持身份。运行中实际 12 次 worker 请求，完成后配置焦点、光标和滚动保持。
  - 工程及边界：原独立验收基线至最终源码 SHA-256 无变化；Task3 的 10／10 组快照／权限／缺失身份检查再次通过。`npm run build`、`git diff --check` 通过，只有既有 sql.js Node 模块浏览器外部化及大包提示。已打开本地能力预览，未生成离线包。最终验证后才执行用户明确授权的 GitHub／Vercel 更新。

## 依赖与协作

- 任务 1 先确定共享契约；任务 2、3 之后可由不同实现子代理并行，配置页记录渲染与浮层详情各自负责。
- `src/composer-ui.js` 为共享文件，按函数区域协调或在隔离工作区整合，不覆盖正在进行的目录、维度及复用修改。
- 任务 4 依赖任务 2、3，由独立验收子代理承担；实施及修复均交给具备读取和编辑权限的子代理。
- 实施开始时重新读取最新源码及相邻规格，保留已有用户改动。
- 实施阶段调用 `update_plan` 同步任务；若搜索后工具仍不可用，以本文件维护状态，不预先勾选。
- 本文件勾选表示任务完成；验收清单勾选须依据实际代码、行为或验证证据。
