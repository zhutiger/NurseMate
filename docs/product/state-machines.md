# 业务状态机

> 本文是业务状态流转的唯一基线。逾期状态根据截止时间与完成时间计算，不通过人工直接写入。

## 1. 通用规则

- 状态变更只能通过明确的业务动作发生。
- 已发布业务记录不物理删除。
- 状态变更由服务端校验并生成时间。
- 发布、撤回、关闭、确认、提交、审核和退回必须记录审计日志。
- 重复请求通过幂等键或唯一约束返回同一业务结果。

## 2. 账号状态机

```mermaid
stateDiagram-v2
    [*] --> PENDING_ACTIVATION: 管理员预建
    PENDING_ACTIVATION --> ACTIVE: 激活成功
    PENDING_ACTIVATION --> DISABLED: 管理员停用
    ACTIVE --> LOCKED: 风险锁定或连续失败
    LOCKED --> ACTIVE: 管理员解锁或锁定到期
    ACTIVE --> DISABLED: 离科或停用
    LOCKED --> DISABLED: 管理员停用
    DISABLED --> PENDING_ACTIVATION: 护士长重新启用并发放激活码
```

`DISABLED` 不允许自行恢复。护士长执行重新启用时必须填写原因，账号进入 `PENDING_ACTIVATION`；旧会话保持失效、旧密码清除、未使用验证码作废，重新激活后进入 `ACTIVE`。最近一次停用时间与原因保留在人员记录和审计日志中。

## 3. 通知主状态

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PUBLISHED: 发布并生成接收名单
    DRAFT --> CANCELLED: 删除未发布草稿
    PUBLISHED --> CLOSED: 管理员关闭
    PUBLISHED --> WITHDRAWN: 管理员撤回
    CLOSED --> [*]
    WITHDRAWN --> [*]
    CANCELLED --> [*]
```

| 当前状态 | 动作 | 目标状态 | 前置条件 |
| --- | --- | --- | --- |
| `DRAFT` | 发布 | `PUBLISHED` | 字段有效、至少一名接收人、发布人有权限 |
| `DRAFT` | 删除草稿 | `CANCELLED` | 尚未发布，无接收记录 |
| `PUBLISHED` | 关闭 | `CLOSED` | 关闭原因可选，停止新增提醒 |
| `PUBLISHED` | 撤回 | `WITHDRAWN` | 撤回原因必填，通知仍可在历史中查看 |

关闭表示事项正常结束，撤回表示发布内容不再有效。两者均不删除历史确认记录。

## 4. 通知接收人状态

存储状态：

```mermaid
stateDiagram-v2
    [*] --> UNSEEN: 发布生成接收记录
    UNSEEN --> VIEWED: 首次打开详情
    VIEWED --> CONFIRMED: 主动确认当前版本
    UNSEEN --> EXCLUDED: 管理员排除
    VIEWED --> EXCLUDED: 管理员排除
```

派生状态：

| 派生状态 | 判断条件 |
| --- | --- |
| `OVERDUE_UNSEEN` | 当前时间超过截止时间且未查看、未确认、未排除 |
| `OVERDUE_UNCONFIRMED` | 当前时间超过截止时间且已查看但未确认、未排除 |
| `RECONFIRM_REQUIRED` | 通知当前版本高于接收人的已确认版本且本次更新要求重新确认 |

规则：

- `viewed_at` 只记录首次查看时间。
- `confirmed_at` 和 `confirmed_version` 由服务端原子写入。
- `EXCLUDED` 必须填写原因，从有效接收人数中排除，但保留原记录。
- 发布后可以追加接收人，新接收人从当前通知版本开始处理。
- 已确认人员不能自行取消确认。

## 5. 通知版本规则

| 修改内容 | 是否生成新版本 | 是否要求重新确认 |
| --- | :---: | :---: |
| 标题、正文、重要等级 | 是 | 是，默认对全部有效接收人 |
| 通知附件增删或替换 | 是 | 是，默认对全部有效接收人 |
| 延长确认期限 | 是 | 否，保留已有确认 |
| 缩短确认期限 | 是 | 否，保留已有确认并产生变更提醒 |
| 追加接收人 | 否 | 仅新增人员确认当前版本 |
| 排除误选接收人 | 否 | 被排除人员不再需要确认 |
| 修正不影响含义的格式 | 是 | 发布人可选择不重新确认，并填写原因 |

服务端保存每个版本的完整快照、修改人、修改时间、修改原因和重新确认规则。

## 6. 任务生命周期与内部主状态

```mermaid
stateDiagram-v2
    [*] --> ONGOING: 发布并生成负责人记录
    ONGOING --> ENDED: 到达截止时间
    ONGOING --> ENDED: 管理员提前结束
    ENDED --> ONGOING: 再次发起为新任务
    ENDED --> HIDDEN: 业务删除
```

面向用户只展示 `ONGOING`（进行中）和 `ENDED`（已结束）。再次发起必须创建新任务 ID，图中的 `ENDED --> ONGOING` 表示从旧任务复制生成新任务，不是把旧记录改回进行中。

数据库继续保留 `DRAFT/PUBLISHED/CLOSED/WITHDRAWN/CANCELLED` 作为兼容历史和审计的内部状态，但正常列表不直接展示。`PUBLISHED` 且截止时间未到为进行中；截止时间已到或内部状态为 `CLOSED` 为已结束。业务删除仅填写 `deleted_at/deleted_by/delete_reason`，不得物理删除。

任务发布后不得切换简单完成和审核完成模式，也不得更换负责人快照。进行中可修改标题、正文、级别、附件和截止时间：

- 只调整截止时间，不增加内容版本，也不重置查看状态。
- 标题、正文、级别或附件变化时，`current_version` 递增并保存完整版本快照；负责人需要查看新版本。
- 每名负责人按任务记录与版本唯一记录首次查看时间。
- 已结束后首次查看标记为“结束后查看”，不计入任务有效期内已查看人数。

## 7. 简单任务执行状态

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> COMPLETED: 负责人点击已完成
    PENDING --> EXCLUDED: 管理员排除负责人
```

截止时间到达后任务结束，不再接受新的简单完成操作；保留 `PENDING` 作为历史执行结果，不派生任务逾期状态。

## 8. 审核任务执行状态

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> SUBMITTED: 负责人提交反馈
    SUBMITTED --> APPROVED: 管理员审核通过
    SUBMITTED --> RETURNED: 管理员退回补充
    RETURNED --> SUBMITTED: 负责人重新提交
    PENDING --> EXCLUDED: 管理员排除负责人
    RETURNED --> EXCLUDED: 管理员排除负责人
```

| 当前状态 | 动作 | 目标状态 | 规则 |
| --- | --- | --- | --- |
| `PENDING` | 提交 | `SUBMITTED` | 反馈满足任务要求，生成第 1 次提交 |
| `SUBMITTED` | 审核通过 | `APPROVED` | 审核人具有 `task.review` 权限 |
| `SUBMITTED` | 退回补充 | `RETURNED` | 审核意见必填 |
| `RETURNED` | 重新提交 | `SUBMITTED` | 仅任务进行中可操作；生成新的提交序号，旧提交不可覆盖 |
| `PENDING/RETURNED` | 排除负责人 | `EXCLUDED` | 原因必填，从有效负责人统计中排除 |

截止时间到达后不再接受新的提交或重新提交。截止前已经形成的 `SUBMITTED` 允许有审核权限的管理员在任务结束后完成通过或退回处理；退回后因任务已结束不能再次提交，状态作为结束结果保留。

## 9. 提醒状态

| 状态 | 说明 |
| --- | --- |
| `PLANNED` | 已生成提醒计划 |
| `PROCESSING` | 队列正在执行 |
| `SENT` | 渠道返回成功 |
| `FAILED_RETRYABLE` | 暂时失败，可按策略重试 |
| `FAILED_FINAL` | 达到重试上限或不可重试 |
| `CANCELLED` | 事项完成、撤回或用户被排除后取消 |

提醒发送成功不得修改通知查看、通知确认或任务完成状态。

## 10. 并发与一致性

- 发布事务同时创建主记录、版本、接收人或负责人快照和审计日志。
- 确认使用通知 ID、用户 ID 和版本号唯一约束。
- 任务提交序号在同一执行记录内唯一并递增。
- 任务查看按 `task_record_id + version_no` 唯一，重复打开不会改写首次查看时间。
- 业务删除只写删除标记；所有版本、查看、执行和提交记录仍可供审计追溯。
- 审核使用当前状态条件更新，避免两名管理员重复审核。
- 状态冲突返回当前服务端状态，客户端刷新详情后继续处理。

