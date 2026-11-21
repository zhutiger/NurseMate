# 呼吸通 API

NestJS 模块化单体服务。当前工程骨架提供健康检查、账号密码登录、通知确认和审核任务闭环，作为云端部署与冒烟验证入口。

```bash
pnpm --filter @hzy/api build
pnpm --filter @hzy/api prisma:validate
pnpm --filter @hzy/api prisma:migrate:deploy
pnpm --filter @hzy/api seed
```

完整 V1.0 接口以 `docs/api/openapi.yaml` 为契约；当前首个可运行版本不表示所有 V1.0 接口均已实现。

