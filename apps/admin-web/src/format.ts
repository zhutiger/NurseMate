export const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

const labels: Record<string, string> = {
  DRAFT: '草稿', PUBLISHED: '已发布', CLOSED: '已关闭', WITHDRAWN: '已撤回', CANCELLED: '已取消',
  NORMAL: '普通', IMPORTANT: '重要', URGENT: '紧急', ACTIVE: '在岗', DISABLED: '已停用',
  PENDING_ACTIVATION: '待激活', LOCKED: '已锁定', HEAD_NURSE: '护士长', COORDINATOR: '协管员', NURSE: '护士',
  PENDING: '待完成', SUBMITTED: '待审核', RETURNED: '退回补充', APPROVED: '已通过', COMPLETED: '已完成',
  CONFIRMED: '已确认', VIEWED: '已查看', UNSEEN: '未查看', SIMPLE: '简单完成', REVIEW: '审核完成',
};

export const label = (value?: string | null) => value ? labels[value] ?? value : '—';
