# 护知音云端部署运行手册

## 当前测试环境

- 部署目录：`/apps/NurseMate/current`
- 环境文件：`/apps/NurseMate/shared/env/test.env`
- Compose 文件：`infra/docker/compose.test.yml`
- HTTP 测试端口：`8101`
- 服务：Nginx、NestJS API、PostgreSQL 16、Redis 7

环境文件权限应为 `600`，不得写入 Git。当前测试环境按项目决定使用 HTTP，正式上线前必须切换 HTTPS。

## 部署顺序

```bash
git -C /apps/NurseMate/current fetch origin main
git -C /apps/NurseMate/current reset --hard origin/main
cd /apps/NurseMate/current

docker compose --env-file /apps/NurseMate/shared/env/test.env \
  -f infra/docker/compose.test.yml build api gateway

docker compose --env-file /apps/NurseMate/shared/env/test.env \
  -f infra/docker/compose.test.yml run --rm api pnpm prisma:migrate:deploy

docker compose --env-file /apps/NurseMate/shared/env/test.env \
  -f infra/docker/compose.test.yml up -d
```

先完成镜像构建和 OpenAPI 校验，再执行 Prisma 迁移，最后滚动替换容器。迁移失败时不得启动依赖新结构的 API。

## 上线检查

```bash
docker compose --env-file /apps/NurseMate/shared/env/test.env \
  -f infra/docker/compose.test.yml ps

curl -fsS http://127.0.0.1:8101/api/v1/health/ready
docker exec nursemate-redis-1 redis-cli CONFIG GET maxmemory-policy
```

预期 API、PostgreSQL、Redis 均为 healthy，Redis 策略为 `noeviction`。

## 回归检查

依次执行 `scripts/smoke.mjs`、`smoke-auth-users.mjs`、`smoke-notices.mjs`、`smoke-tasks.mjs`、`smoke-reminders.mjs`、`smoke-reports.mjs`、`smoke-files.mjs`。运行时从环境变量读取测试账号密码，不在命令历史或日志打印密码。

## 备份与回退

- 数据库变更前执行 PostgreSQL 备份并验证文件非空。
- 代码回退只切换到已验证提交并重新构建镜像，不使用破坏性 Git 重置处理用户工作区。
- 已执行的数据库迁移不直接删除；需要回退时编写兼容迁移并先在临时恢复库验证。
- 附件卷和数据库必须保持一致备份，避免业务引用存在但文件丢失。
