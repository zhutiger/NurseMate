export const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

const labels: Record<string, string> = {
  DRAFT: '草稿', PUBLISHED: '已发布', CLOSED: '已关闭', WITHDRAWN: '已撤回', CANCELLED: '已取消',
  NORMAL: '普通', IMPORTANT: '重要', URGENT: '紧急', ACTIVE: '在岗', DISABLED: '已停用',
  PENDING_ACTIVATION: '待激活', LOCKED: '已锁定', HEAD_NURSE: '护士长', COORDINATOR: '协管员', NURSE: '护士',
  PENDING: '待完成', SUBMITTED: '待审核', RETURNED: '退回补充', APPROVED: '已通过', COMPLETED: '已完成',
  CONFIRMED: '已确认', VIEWED: '已查看', UNSEEN: '未查看', SIMPLE: '简单完成', REVIEW: '审核完成',
  EXCLUDED: '已排除', OVERDUE_PENDING: '逾期待完成', OVERDUE_RETURNED: '逾期待补充',
  OVERDUE_UNSEEN: '逾期未查看', OVERDUE_UNCONFIRMED: '逾期未确认', RECONFIRM_REQUIRED: '需要重新确认',
};

export const label = (value?: string | null) => value ? labels[value] ?? '未知状态' : '—';

const errors: Record<string, string> = {
  AUTH_REQUIRED: '登录已失效，请重新登录', SESSION_REVOKED: '登录已失效，请重新登录',
  INVALID_CREDENTIALS: '工号或密码不正确', CREDENTIALS_INVALID: '工号或密码不正确',
  ACTIVATION_CODE_INVALID: '验证码无效或已过期', ACTIVATION_CODE_USED: '验证码已使用',
  ACCOUNT_LOCKED: '账号暂时锁定，请稍后重试', ACCOUNT_ALREADY_ACTIVATED: '账号已激活',
  PERMISSION_DENIED: '没有操作权限',
  RESOURCE_NOT_FOUND: '记录不存在或无权查看', VALIDATION_FAILED: '填写内容不符合要求，请检查后重试',
  STATE_CONFLICT: '当前状态已变化，请刷新后重试', INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
  EMPLOYEE_NO_CONFLICT: '工号已存在', GROUP_CONFLICT: '分组代码或名称已存在',
  LAST_HEAD_NURSE_REQUIRED: '必须保留一名在岗护士长', REASON_REQUIRED: '请填写操作原因',
  DEADLINE_MUST_BE_FUTURE: '截止时间必须晚于当前时间',
  FILE_TYPE_NOT_ALLOWED: '仅支持图片、PDF 和 Word 文件', FILE_VERIFICATION_FAILED: '附件校验失败，请重新上传',
  FILE_UPLOAD_INCOMPLETE: '附件上传未完成', SENSITIVE_CONTENT_PROHIBITED: '请勿上传患者敏感资料',
  TASK_ASSIGNEES_EMPTY: '请选择至少一名负责人', NOTICE_RECIPIENTS_EMPTY: '请选择至少一名接收人',
};
export const errorText = (code?: string | null) => code ? errors[code] ?? (/^[A-Z][A-Z0-9_]+$/.test(code) ? '操作未完成，请检查后重试' : code) : '请求失败，请稍后重试';

const auditActions: Record<string, string> = {
  'auth.activate': '账号激活', 'auth.activate_retry': '重复激活', 'auth.login': '账号登录', 'auth.logout': '退出登录',
  'auth.password_reset': '密码重置', 'auth.wechat_associate': '关联微信', 'user.create': '新增人员',
  'user.update': '编辑人员', 'user.activation_code_create': '生成激活码', 'user.reset_code_create': '生成重置码',
  'user.permissions_replace': '修改权限', 'user.sessions_revoke': '撤销会话', 'user.wechat_unbind': '解除微信关联',
  'group.create': '新增分组', 'group.update': '编辑分组', 'notice.create': '创建通知',
  'notice.draft_update': '编辑通知草稿', 'notice.publish': '发布通知', 'notice.confirm': '确认通知',
  'notice.cancel': '取消通知草稿', 'notice.version_create': '更新通知版本',
  'notice.recipients_add': '追加接收人', 'notice.recipient_exclude': '排除接收人',
  'task.create': '创建任务', 'task.draft_update': '编辑任务草稿', 'task.publish': '发布任务',
  'task.submit': '提交任务', 'task.complete': '完成任务', 'task.cancel': '取消任务草稿',
  'task.assignees_add': '追加负责人', 'task.assignee_exclude': '排除负责人',
  'task.review': '审核任务', 'task.remind': '任务催办', 'notice.remind': '通知催办',
  'file.intent_create': '准备上传附件', 'file.ready': '附件上传完成', 'file.blocked': '附件已拦截',
  'report.export': '导出记录',
};
export const auditAction = (value?: string) => value ? auditActions[value] ?? (value.endsWith('.close') ? '关闭事项' : value.endsWith('.withdraw') ? '撤回事项' : '其他操作') : '其他操作';
export const auditResult = (value?: string) => value === 'SUCCESS' ? '成功' : value === 'FAILURE' ? '失败' : '处理中';
export const targetLabel = (value?: string) => ({ user: '人员', nursing_group: '护理分组', notice: '通知', task: '任务', file: '附件', session: '会话', task_record: '任务记录', notice_recipient: '通知接收记录' } as Record<string, string>)[value ?? ''] ?? '业务记录';
