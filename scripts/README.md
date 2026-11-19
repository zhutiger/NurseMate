# 工程脚本

脚本必须支持非交互执行，并避免在代码中保存密钥。

- `seed-demo-users.mjs`：幂等创建并激活 10 名虚构演示护士，按两个演示护理分组分配。
- `smoke*.mjs`：覆盖身份、权限、通知、任务、提醒、报表和文件的云端回归。
- `smoke-management-update.mjs`：覆盖人员编辑与重新启用、分组、权限、任务附件下载、分钟截止时间和通知筛选。
- `browser-h5-smoke.py`：在云端使用 Chrome 实际登录 H5 并确认个人看板加载；依赖服务器上的 `google-chrome` 与 `websocket-client`。
- `performance-smoke.mjs`：采集主要管理接口的响应时间基线。

