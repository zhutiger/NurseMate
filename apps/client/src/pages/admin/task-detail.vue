<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api } from '../../services/api';
import { label } from '../../services/display';
import { downloadAttachment } from '../../services/files';

const id = ref(''); const task = ref<any>(null); const records = ref<any>({ items: [], summary: { counts: {} } });
const error = ref(''); const loading = ref(false);
const pendingIds = computed(() => records.value.items.filter((record: any) => ['PENDING', 'RETURNED'].includes(record.recordStatus)).map((record: any) => record.assignee.id));
async function load() { loading.value = true; error.value = ''; try { [task.value, records.value] = await Promise.all([api(`/tasks/${id.value}`), api(`/tasks/${id.value}/records?pageSize=100`)]); } catch (cause: any) { error.value = cause.message; } finally { loading.value = false; } }
async function review(record: any, action: 'APPROVE' | 'RETURN') {
  const latest = record.submissions.at(-1); if (!latest) return;
  let comment = action === 'APPROVE' ? '审核通过' : '';
  if (action === 'RETURN') { const result: any = await new Promise((resolve) => uni.showModal({ title: '退回补充', editable: true, placeholderText: '请输入退回意见', success: resolve })); if (!result.confirm) return; comment = result.content; if (!comment) return uni.showToast({ title: '退回意见必填', icon: 'none' }); }
  try { await api(`/tasks/${id.value}/records/${record.id}/review`, 'POST', { submissionId: latest.id, action, comment }); uni.showToast({ title: action === 'APPROVE' ? '已通过' : '已退回' }); await load(); }
  catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
}
async function remind() { try { await api(`/tasks/${id.value}/reminders`, 'POST', { targetUserIds: pendingIds.value, channels: ['IN_APP'], note: '移动管理端人工催办' }); uni.showToast({ title: '催办已发送' }); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
async function closeTask() {
  const result: any = await new Promise((resolve) => uni.showModal({ title: '提前结束任务', content: '结束后不再接受新的完成反馈，确定继续？', success: resolve }));
  if (!result.confirm) return;
  try { await api(`/tasks/${id.value}/close`, 'POST', { reason: '移动管理端提前结束' }); await load(); }
  catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
}
async function relaunch() {
  const suggested = new Date(Date.now() + 48 * 3600000);
  const result: any = await new Promise((resolve) => uni.showModal({ title: '再次发起任务', editable: true, placeholderText: `输入新截止时间，如 ${suggested.toLocaleString('zh-CN', { hour12: false })}`, success: resolve }));
  if (!result.confirm) return;
  const deadline = result.content?.trim() ? new Date(result.content.trim().replace(' ', 'T')) : suggested;
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) return uni.showToast({ title: '截止时间格式不正确', icon: 'none' });
  try { const created = await api(`/tasks/${id.value}/relaunch`, 'POST', { deadlineAt: deadline.toISOString() }); uni.redirectTo({ url: `/pages/admin/task-detail?id=${created.id}` }); }
  catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
}
async function deleteTask() {
  const result: any = await new Promise((resolve) => uni.showModal({ title: '删除已结束任务', content: '任务会从正常列表隐藏，历史和审计记录仍保留。', success: resolve }));
  if (!result.confirm) return;
  try { await api(`/tasks/${id.value}/delete`, 'POST', { reason: '移动管理端删除已结束任务' }); uni.navigateBack(); }
  catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
}
async function download(file: any) { try { await downloadAttachment(file); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
onLoad((query) => { id.value = String(query?.id ?? ''); load(); });
</script>

<template><view class="page"><view v-if="error" class="card error">{{ error }}<button class="secondary-btn" @tap="load">重新加载</button></view><view v-if="loading && !task" class="empty">正在加载…</view>
  <view v-if="task" class="card"><text class="title">{{ task.title }}</text><text class="muted">{{ label(task.lifecycle) }} · {{ label(task.completionMode) }}</text><text class="muted">截止：{{ new Date(task.deadline).toLocaleString('zh-CN') }}</text><view class="metrics"><view><b>{{ records.summary.total || 0 }}</b><text>负责人</text></view><view><b>{{ records.summary.viewed || 0 }}</b><text>已查看</text></view><view><b class="danger">{{ records.summary.unviewed || 0 }}</b><text>未查看</text></view><view><b>{{ (records.summary.counts?.APPROVED || 0) + (records.summary.counts?.COMPLETED || 0) }}</b><text>已完成</text></view><view><b class="danger">{{ pendingIds.length }}</b><text>待完成</text></view></view><button v-if="pendingIds.length && task.lifecycle === 'ONGOING'" class="primary-btn" @tap="remind">催办待完成人员</button><view class="task-actions"><button v-if="task.lifecycle === 'ONGOING'" class="secondary-btn" @tap="closeTask">提前结束</button><button v-if="task.lifecycle === 'ENDED'" class="secondary-btn" @tap="relaunch">再次发起</button><button v-if="task.lifecycle === 'ENDED'" class="danger-btn" @tap="deleteTask">删除任务</button></view></view>
  <view v-if="task?.attachments?.length" class="card"><text class="section-title">任务附件</text><view v-for="attachment in task.attachments" :key="attachment.file.id" class="attachment" @tap="download(attachment.file)"><text>{{ attachment.file.originalName }}</text><text>下载 ›</text></view></view>
  <text class="section-title">执行明细</text><view v-for="record in records.items" :key="record.id" class="card"><view class="row"><view><text class="name">{{ record.assignee.name }}</text><text class="muted">工号：{{ record.assignee.employeeNo }}</text><text class="muted">{{ label(record.viewStatus) }}{{ record.viewedAt ? ` · ${new Date(record.viewedAt).toLocaleString('zh-CN')}` : '' }}</text></view><text class="status">{{ label(record.recordStatus) }}</text></view><view v-if="record.recordStatus === 'SUBMITTED'" class="review"><text class="feedback">{{ record.submissions.at(-1)?.feedback || '无文字反馈' }}</text><view class="review-buttons"><button class="secondary-btn" @tap="review(record,'RETURN')">退回</button><button class="primary-btn" @tap="review(record,'APPROVE')">通过</button></view></view></view>
</view></template>

<style scoped>
.title,.muted,.name{display:block}.title{margin-bottom:10rpx;font-size:34rpx;font-weight:800}.muted{margin-top:7rpx}.metrics{display:grid;grid-template-columns:repeat(5,1fr);margin:28rpx 0}.metrics view{text-align:center}.metrics b,.metrics text{display:block}.metrics b{color:#007f95;font-size:34rpx}.metrics text{color:#71868a;font-size:21rpx}.row{display:flex;justify-content:space-between}.name{font-weight:700}.status{color:#2c746e}.task-actions{display:flex;gap:12rpx;margin-top:16rpx}.task-actions button{flex:1;font-size:24rpx}.danger-btn{color:#b8494e;background:#fff0f0}.review{margin-top:22rpx;padding-top:20rpx;border-top:1px solid #edf1f1}.feedback{display:block;margin-bottom:18rpx}.review-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12rpx}.review-buttons button{font-size:24rpx}.attachment{display:flex;justify-content:space-between;gap:10rpx;padding:16rpx 0;border-top:1px solid #edf1f1}.attachment text:first-child{flex:1;overflow-wrap:anywhere}.attachment text:last-child{color:#007f95}.error{color:#b25242}
</style>
