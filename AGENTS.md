# NurseMate 项目协作说明

## 项目目标

护知音 HZY 是单科室护理重要消息与任务闭环管理平台。V1.0 服务 10～30 人团队，核心是通知确认、任务执行、审核催办和可靠留痕。

## 开始工作前

按顺序阅读：

1. `PROJECT.md`
2. `docs/product/v1-scope.md`
3. 与任务相关的登录、权限、状态机或页面原型文档
4. `docs/product/acceptance.md`
5. 涉及服务端、客户端联调或数据变更时阅读 `docs/api/openapi.yaml`、`docs/api/conventions.md` 和 `docs/architecture/data-model.md`
6. `HZY-V1.0-系统建设方案.md`

## 产品约束

- 通知确认和任务完成是两个独立业务概念。
- 推送成功、已查看、已确认和已完成不得合并为同一状态。
- 普通护士只能访问本人接收的通知和本人负责的任务。
- 已发布内容、接收名单、提交和审核记录不得物理覆盖历史记录。
- 关键业务时间由服务端生成。
- 逾期仅表示需要管理跟进，不自动判定为违规。
- V1.0 不保存患者病历、身份证、具体病情等敏感资料。
- 不在 `docs/product/v1-scope.md` 中的功能不得自行加入 V1.0。

## 工程约束

- 使用 pnpm workspace 管理 monorepo。
- 应用放在 `apps`，跨应用共享代码放在 `packages`。
- 前端使用 uni-app、Vue 3 和 TypeScript，服务端使用 NestJS 和 TypeScript。
- 数据库使用 PostgreSQL，数据模型和迁移归属 `apps/api/prisma`。
- Redis 和 BullMQ 用于提醒、异步任务和必要的短期状态。
- 微信平台差异集中在 `apps/client` 的平台适配层。
- 前端校验用于体验，服务端校验和权限判断是最终依据。
- 环境密钥只能放在未提交的环境变量文件或密钥管理服务中。
- 本地工作区只用于编辑、静态检查和版本控制；构建、迁移、联调和部署测试在云端测试环境执行。
- 云端部署根目录固定为 `/apps/NurseMate`，具体遵循 `docs/operations/cloud-test-environment.md`。

## 变更同步

- 权限变化同步修改 `permission-matrix.md`。
- 状态变化同步修改 `state-machines.md`。
- 范围变化同步修改 `v1-scope.md` 和 `acceptance.md`。
- 页面流程变化同步修改 `page-prototypes.md` 和可点击原型。
- API 路径、字段、响应、错误码或权限变化同步修改 `docs/api/openapi.yaml` 和相关 API 文档。
- 数据表、字段、约束或索引变化同步修改 Prisma schema、迁移和 `docs/architecture/data-model.md`。
- 重大架构选择写入 `docs/architecture/decisions`。

## 验证要求

- 优先验证正常入口、越权访问、重复请求、并发写入和历史数据兼容。
- 发布、确认、提交、审核、催办和导出必须验证审计记录。
- 完成任务前核对对应需求编号和验收用例，不以页面可操作作为唯一完成依据。

