# M-Sense SQL 取数项与能力组合原型

在原 M-Sense 工程中增量实现：SQL 指标与维度独立运行、发布并加入已有能力；已有 / SQL 指标与维度组合、交叉下钻、能力整体试跑与发布；分析模块引用能力固定版本。SQL 由浏览器内 SQLite 实际执行，数据为固定生成的示例。

停止修改 SQL 后自动解析，DS 直接编辑字段与维度枚举，重解析保留人工设置。SQL 可关联已有取数能力组，也可直接新建并保存能力组；独立试跑与能力整体试跑共用 M-Sense 风格的取数验证页。

当前功能规格统一维护在 [docs/spec.md](docs/spec.md)。迭代只更新工程与在线预览，用户要求最终交付时再统一导出。

## 运行

推荐 Node.js 22.12+ 或 Node.js 24。

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

打开终端返回的地址，进入 `/#/capabilities`。默认端口是 5173，被占用时以终端显示为准。

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

配置流程：`/#/guide`。SQL 复用管理：`/#/items`。SQL 独立试跑：`/#/trial/item/<id>`。能力整体试跑：`/#/trial/ability/<id>`。分析配置：`/#/modules`。

已发布完整示例：`/#/ability/demo-sql-ability`；直接查看解析字段 `/#/item/demo-sql-metric`，试跑结果 `/#/trial/ability/demo-sql-ability`，分析输出 `/#/analysis/demo-sql-analysis`。示例已经从生成的底表实际执行并发布，不用先手工配置。

## 操作路径

1. 在取数能力列表编辑已有能力，或新建能力并填写基础信息。
2. 在能力的“指标”或“下钻维度”中选择已有定义，或新建 SQL；确认自动解析与人工配置。
3. 点击“保存并返回能力组”，SQL 已自动关联。按需配置独立下钻与交叉组。
4. 保存能力并整体试跑，输入实验 ID 和观测日期，获取并核对全部结果。
5. 发布能力，进入分析模块，引用固定版本，配置思路并分析试跑。

SQL 复用库是可选入口。只有跨组复用需要独立 SQL 试跑、核对和发布；能力内 SQL 可随能力组直接整体发布。

能力基础信息只需填写名称和说明，业务目标固定为“平台老客提频”，不再填写负责人。能力与 SQL 取数项的系统 Key 在首次保存时自动生成，保存前不展示、保存后只读；改名及发布新版本不改变 Key。

默认示例：实验 `4823214`，日期 `2026-10-01` 至 `2026-10-03`，券模板 `101,102`。支付 GMV 对照组 `7098`、实验组 `8286`。

## GitHub 与 Vercel

源码仓库：`https://github.com/jiaoyunqin/msense_sql`。Vercel 读取 main 分支，使用 `npm ci`、`npm run build`，部署 `dist`。配置见 `vercel.json`，本机绑定信息位于被忽略的 `.vercel/`。

代码和功能规格纳入 Git；node_modules、构建产物、本机认证、历史离线文件、源码压缩包和内部参考截图不提交。

旧版交付保留在 `deliverables/msense-sql-prototype/` 与 `deliverables/msense-sql-prototype-v2/`；旧浏览器数据 `msense-sql-prototype-v1` 不会被覆盖。本轮继续使用 `msense-composer-v2`，保留已有草稿、版本与历史。

最终需要离线导出时运行 `npm run export:offline`，输出 `deliverables/msense-sql-prototype-v3/msense-sql-composer.html`。不会在每次迭代后自动导出。

此工程尚未连接生产取数、权限、发布注册或模型服务。页面的发布是本地版本发布，不会部署到 M-Sense 线上。
