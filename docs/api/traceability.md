# V1.0 需求追踪矩阵

> 用途：开发和验收时从需求编号追踪到接口、数据和验证重点。具体字段与响应以 `openapi.yaml` 为准。

| 需求 | 主要接口 | 主要数据 | 首要验证 |
| --- | --- | --- | --- |
| AUTH-01～02 | `POST /users`、`POST /users/{userId}/activation-codes`、`POST /auth/activate` | `users`、`activation_codes`、`audit_logs` | 未预建不可激活、码单次使用、并发激活 |
| AUTH-03 | `POST /auth/login`、`GET /me` | `users`、`refresh_sessions` | 小程序与 H5 返回同一内部用户 |
| AUTH-04 | `POST /auth/wechat/associate` | `wechat_identities`、`audit_logs` | 唯一关联、微信失败不影响密码会话 |
| AUTH-05～07 | `POST /auth/logout`、`POST /auth/reset-password`、`PATCH /users/{userId}`、`DELETE /users/{userId}/sessions` | `users`、`refresh_sessions`、`audit_logs` | 退出、重置、停用后旧会话失效 |
| AUTH-08 | `PATCH /users/{userId}`、`POST /users/{userId}/activation-codes`、`POST /auth/activate` | `users.disabled_at/disabled_reason`、激活码、会话、审计 | 重新启用须再激活，旧会话失效，停用历史可查 |
| USER-01～02 | `GET/POST /users`、`POST /users/import` | `users` | 重复工号、逐行失败原因、科室范围 |
| USER-03 | `GET/POST /groups`、`PATCH /groups/{groupId}` | `nursing_groups`、`users.primary_group_id` | 分组变化不改变历史接收名单 |
| USER-04～06 | `PATCH /users/{userId}`、`PUT /users/{userId}/permissions` | `users`、`permissions`、`user_permissions` | 最后一名护士长、越权、权限立即失效 |
| USER-07～08 | `GET/PUT /users/{userId}/permissions`、`PATCH /users/{userId}`、`GET /users` | 人员、权限、审计 | 工号唯一、账号状态筛选、停用原因和时间 |
| NOTICE-01～04 | `POST/PATCH /notices`、`GET /notices/{noticeId}` | `notices`、`notice_versions`、附件表 | 草稿权限、字段校验、预览实际人数 |
| NOTICE-05 | `POST /notices/{noticeId}/publish` | `notice_recipients`、`audit_logs` | 发布事务、固定名单、重复发布 |
| NOTICE-06～07 | `GET /me/notices/{noticeId}`、`POST /me/notices/{noticeId}/confirm` | `notice_views`、`notice_confirmations` | 首次查看、按版本唯一确认、他人数据 |
| NOTICE-08 | `GET /notices/{noticeId}/recipients` | 接收、查看、确认事实表 | 汇总与明细一致、逾期派生 |
| NOTICE-09～11 | `PATCH /notices/{noticeId}`、关闭/撤回、追加/排除接口 | 版本、接收人、审计表 | 旧版本保留、重新确认、排除不删除 |
| NOTICE-12 | `GET /notices?status=&level=` | `notices` | 五种状态、三级重要程度交叉筛选 |
| TASK-01～02 | `POST/PATCH /tasks`、`POST /tasks/{taskId}/publish` | `tasks`、`task_records` | 模式发布后固定、负责人快照 |
| TASK-03 | `POST /me/tasks/{taskId}/complete` | `task_records`、`audit_logs` | 仅简单模式、幂等完成、服务端时间 |
| TASK-04～06 | 提交接口、`POST /tasks/{taskId}/records/{recordId}/review` | `task_submissions`、附件表、`task_records` | 多次提交不覆盖、并发审核、退回意见 |
| TASK-07～08 | 明细、查看统计和提前结束接口 | `tasks`、`task_records`、`task_views`、提交与审计表 | 查看与完成统计一致、结束后拒绝新执行、历史保留 |
| TASK-10～11 | 文件上传/下载接口、`POST /tasks` | `file_objects`、`task_attachments`、`tasks.deadline` | 图片/PDF/Word 校验、接收人授权下载、分钟精度及过去时间拒绝 |
| TASK-12 | `POST /tasks/{taskId}/close`、`POST /tasks/{taskId}/delete` | `tasks.status/deleted_at`、`audit_logs` | 先选择批量动作再勾选、生命周期限制、混选跳过、逐项权限和审计、部分失败反馈 |
| TASK-13 | `GET /tasks`、`GET /tasks/{taskId}/records` | `tasks.published_at/deadline`、有效 `task_records/task_views` | 正常列表仅两种生命周期，查看与完成数和明细一致，到期自动结束及倒计时归零 |
| TASK-14 | `PATCH /tasks/{taskId}` | `tasks.current_version`、`task_versions`、`task_views` | 内容变化增加版本并重算查看；只改期限不重置查看；完成模式和负责人不可变 |
| TASK-15 | `POST /tasks/{taskId}/relaunch` | `tasks.source_task_id`、新任务版本与负责人记录 | 新旧任务 ID 不同，内容和在岗负责人复制，旧任务统计不变 |
| TASK-16 | `POST /tasks/{taskId}/delete` | `tasks.deleted_at/deleted_by_id`、全部关联历史 | 仅已结束可删、正常列表隐藏、历史与审计仍存在 |
| REMIND-01 | `GET /me/notices`、`GET /me/tasks` | 接收人与任务记录 | 只返回本人有效未完成事项 |
| REMIND-02～05 | 通知/任务提醒接口 | `reminders`、BullMQ 作业 | 频率、重试、渠道结果与业务状态分离 |
| REPORT-01～02 | 本人列表、`GET /dashboard/management` | 业务事实表 | 数据范围、指标可下钻追溯 |
| REPORT-03～04 | `POST /exports` | 导出任务、业务事实、审计表 | 权限、字段完整、每次导出审计 |
| AUDIT-01～02 | `GET /audit-logs` | `audit_logs` | 关键操作覆盖、业务接口不可改删 |
| CLIENT-05、NFR-08 | H5、小程序与管理端 API 客户端 | 会话、枚举映射 | 中文状态和错误、并发刷新单次执行、失败可重试 |
| CLIENT-08 | 管理端任务与人员列表 | 任务等级、两种任务生命周期、账号状态 | 中文标签和不同颜色并存，筛选与变化后颜色正确 |
| NFR-01～07 | 全部接口、健康检查 | 事务、索引、幂等、日志、备份 | 性能、并发、权限、恢复、脱敏与告警 |

开发提交应在说明中列出所实现的需求编号和对应验收用例编号；没有需求编号的新增功能不得直接进入 V1.0。
