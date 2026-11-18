# 云端测试环境规范

## 1. 环境定位

- 本项目不使用本地运行环境进行开发测试。
- 本地工作区用于代码与文档编辑、静态检查和版本控制。
- 构建、数据库迁移、接口联调、小程序/H5 联调和验收统一在云端测试服务器执行。
- 服务器部署根目录固定为 `/apps/NurseMate`。

服务器地址、初始登录密码、SSH 私钥和微信测试凭据由项目负责人通过仓库外渠道提供，严禁写入本文档、提交记录、脚本参数或日志。

## 2. 首次引导

初始密码登录只用于服务器引导，完成后应：

1. 在开发工作站生成项目专用 SSH 密钥，私钥设置口令。
2. 把公钥加入服务器账号的 `authorized_keys`。
3. 新开连接验证密钥登录成功。
4. 禁止项目成员继续共享初始密码；具备管理条件时关闭 SSH 密码登录。
5. 设置最小化 sudo 权限，不使用 root 直接运行应用容器。

私钥不得复制到项目目录。若需要 CI/CD，使用独立部署密钥，不复用个人密钥。

## 3. 服务器目录

```text
/apps/NurseMate
├─ current/              # 当前发布版本或工作副本
├─ shared/
│  ├─ env/               # 服务器环境变量文件，权限 600
│  ├─ uploads/           # 测试附件持久卷
│  ├─ backups/           # 数据库备份
│  └─ logs/              # 必要的持久日志
└─ releases/             # 可选的版本化发布目录
```

实际目录由部署脚本创建。任何清理脚本必须解析并校验绝对路径位于 `/apps/NurseMate` 后才允许执行。

## 4. 环境变量

服务器至少配置：

```dotenv
NODE_ENV=test
APP_BASE_URL=https://test.example.invalid
DATABASE_URL=postgresql://<user>:<password>@postgres:5432/nursemate
REDIS_URL=redis://redis:6379/0
JWT_ACCESS_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-secret>
WECHAT_APP_ID=<test-app-id>
WECHAT_APP_SECRET=<test-app-secret>
OBJECT_STORAGE_ENDPOINT=<endpoint>
OBJECT_STORAGE_BUCKET=<bucket>
OBJECT_STORAGE_ACCESS_KEY=<access-key>
OBJECT_STORAGE_SECRET_KEY=<secret-key>
```

- 实际值只保存在服务器 `shared/env` 下或密钥管理服务中。
- 环境文件权限设为仅运行账号可读。
- AppSecret 变更后滚动重启 API，并验证旧值已经失效。
- 日志输出必须对上述值进行脱敏。

## 5. 部署门禁

每次部署按顺序执行：

1. 拉取指定提交并记录提交哈希。
2. 使用锁文件安装依赖。
3. 执行格式、类型、单元测试和构建检查。
4. 备份测试数据库。
5. 执行 `prisma migrate deploy`。
6. 启动或滚动更新 API、任务 Worker、客户端静态资源和 Nginx。
7. 执行健康检查、登录、通知确认和任务闭环冒烟测试。
8. 失败时停止发布并回滚应用版本；数据库回滚采用经过评审的前向修复迁移。

## 6. 环境健康检查

- `/health/live`：进程存活，不访问外部依赖。
- `/health/ready`：检查数据库、Redis 和必要对象存储依赖。
- 微信接口不可用不应让核心账号密码登录整体失效，但应在管理监控中告警。
- 测试环境只使用虚构人员和演示业务内容，不录入患者资料。

## 7. 待执行事项

- [x] 当前开发工作站已确认测试服务器 SSH 端口可达（2026-11-19，只读连通性检查）。
- [ ] 项目专用 SSH 公钥已安装并验证。
- [ ] 部署目录和最小权限运行账号已配置。
- [ ] Docker、Compose、Nginx、Node/pnpm 构建条件已验证。
- [ ] PostgreSQL、Redis 和对象存储已配置。
- [ ] 测试域名和 HTTPS 证书已配置。
- [ ] 微信测试 AppID/AppSecret 已通过服务器环境变量注入。
- [ ] 数据库备份与恢复演练已完成。
- [ ] 首次部署和跨端冒烟测试已通过。

这些事项需要在服务器实际操作并验证后才能勾选，文档完成不代表环境已就绪。
