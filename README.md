# 护知音 HZY

本科室护理重要消息与任务闭环管理平台。

项目面向 10～30 人的单科室护理团队，核心目标是实现通知发布、阅读确认、任务反馈、审核催办和操作留痕。

## 技术架构

- 小程序与 H5：uni-app、Vue 3、TypeScript、Pinia
- 服务端：Node.js、NestJS、TypeScript
- 数据库：PostgreSQL、Prisma ORM
- 缓存与任务：Redis、BullMQ
- 部署：Docker、Nginx、Linux

## 目录说明

```text
.
├─ apps
│  ├─ client          # 微信小程序与 H5
│  ├─ api             # NestJS 后端服务
│  └─ admin-web       # 电脑管理端
├─ packages
│  ├─ contracts       # 共享接口类型
│  ├─ validation      # 共享校验规则
│  └─ constants       # 共享常量与枚举
├─ docs
│  ├─ architecture    # 架构设计与决策记录
│  ├─ api             # 接口约定与联调文档
│  ├─ operations      # 云端测试环境与运维规范
│  ├─ product         # V1.0 产品执行基线
│  └─ prototype       # 可点击关键页面原型
├─ infra
│  ├─ docker          # 容器配置
│  └─ nginx           # 网关配置
├─ scripts            # 工程与运维脚本
├─ PROJECT.md         # 项目执行入口与交付清单
├─ AGENTS.md          # 后续开发协作约束
└─ HZY-V1.0-系统建设方案.md
```

## 当前状态

当前仓库已完成 V1.0 建设方案、需求清单、登录绑定流程、权限矩阵、业务状态机、验收基线、关键页面可点击原型、数据模型初稿和 OpenAPI 初稿。应用代码、数据库首次迁移和云端测试环境将在开发阶段初始化。

## 项目文档

- [HZY V1.0 系统建设方案](./HZY-V1.0-系统建设方案.md)
- [项目执行清单](./PROJECT.md)
- [V1.0 产品基线](./docs/product/README.md)
- [关键页面可点击原型](./docs/prototype/index.html)
- [架构文档说明](./docs/architecture/README.md)
- [接口文档说明](./docs/api/README.md)
- [云端测试环境规范](./docs/operations/cloud-test-environment.md)

