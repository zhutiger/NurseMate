# 呼吸通客户端

使用 uni-app、Vue 3、TypeScript 和 Pinia 构建微信小程序与 H5。平台差异集中在 `src/platform`，业务页面不直接调用微信专属 API。

```bash
pnpm --filter @hzy/client build:h5
pnpm --filter @hzy/client build:mp-weixin
```

