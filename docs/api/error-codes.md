# API 错误码

## 通用

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | 参数格式、必填项或业务输入校验失败 |
| 401 | `AUTH_REQUIRED` | 未登录或访问令牌无效 |
| 403 | `ACCOUNT_DISABLED` | 账号已停用 |
| 403 | `PERMISSION_DENIED` | 缺少所需权限；不涉及数据泄露时使用 |
| 404 | `RESOURCE_NOT_FOUND` | 资源不存在或当前用户不可见 |
| 409 | `STATE_CONFLICT` | 资源状态不允许当前操作 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 同一幂等键被用于不同请求 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL_ERROR` | 未预期服务端错误 |
| 503 | `DEPENDENCY_UNAVAILABLE` | 数据库、Redis、对象存储或微信依赖暂不可用 |

## 账号与认证

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| 400 | `ACTIVATION_CODE_INVALID` | 激活码错误 |
| 410 | `ACTIVATION_CODE_EXPIRED` | 激活码已过期 |
| 409 | `ACTIVATION_CODE_USED` | 激活码已使用 |
| 409 | `ACCOUNT_ALREADY_ACTIVATED` | 账号已激活 |
| 401 | `CREDENTIALS_INVALID` | 工号或密码错误，响应不区分具体字段 |
| 423 | `ACCOUNT_LOCKED` | 账号临时锁定 |
| 401 | `SESSION_REVOKED` | 会话已撤销或刷新令牌已轮换 |
| 409 | `WECHAT_IDENTITY_CONFLICT` | 微信身份已关联其他内部账号 |
| 502 | `WECHAT_CODE_EXCHANGE_FAILED` | 微信登录凭证交换失败；不影响密码登录 |

## 通知

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| 409 | `NOTICE_STATE_CONFLICT` | 通知当前状态不允许操作 |
| 409 | `NOTICE_ALREADY_CONFIRMED` | 当前版本已经确认；幂等请求可返回原结果 |
| 409 | `NOTICE_VERSION_CHANGED` | 提交确认时通知版本已经变化 |
| 409 | `NOTICE_RECIPIENT_EXCLUDED` | 当前用户已从接收名单排除 |
| 400 | `NOTICE_RECIPIENTS_EMPTY` | 发布时没有有效接收人 |

## 任务

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| 409 | `TASK_STATE_CONFLICT` | 任务或个人任务记录状态不允许操作 |
| 409 | `TASK_MODE_MISMATCH` | 操作与任务完成模式不匹配 |
| 409 | `TASK_ALREADY_COMPLETED` | 简单任务已经完成；幂等请求可返回原结果 |
| 409 | `TASK_SUBMISSION_CHANGED` | 审核时提交版本或状态已变化 |
| 409 | `TASK_ASSIGNEE_EXCLUDED` | 当前负责人已被排除 |
| 400 | `TASK_ASSIGNEES_EMPTY` | 发布时没有有效负责人 |

## 文件、提醒与导出

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| 400 | `FILE_TYPE_NOT_ALLOWED` | 文件类型不允许 |
| 413 | `FILE_TOO_LARGE` | 文件超过大小限制 |
| 409 | `FILE_NOT_READY` | 文件尚未完成校验 |
| 400 | `FILE_CONTENT_PROHIBITED` | 文件违反附件禁区规则 |
| 429 | `REMINDER_LIMIT_REACHED` | 提醒间隔或次数达到上限 |
| 409 | `EXPORT_NOT_READY` | 导出任务尚未完成 |
