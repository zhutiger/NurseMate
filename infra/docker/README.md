# Docker

- `compose.test.yml`：云端 HTTP 测试环境，入口端口为 `8101`。
- `Dockerfile.gateway`：构建 uni-app H5，并由 Nginx 提供静态资源和 API 反向代理。

环境密钥通过 `/apps/NurseMate/shared/env/test.env` 注入，不进入仓库。

