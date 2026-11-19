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
async function download(file: any) { try { await downloadAttachment(file); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
onLoad((query) => { id.value = String(query?.id ?? ''); load(); });
</script>

<template><view class="page"><view v-if="error" class="card error">{{ error }}<button class="secondary-btn" @tap="load">重新加载</button></view><view v-if="loading && !task" class="empty">正在加载…</view>
  <view v-if="task" class="card"><text class="title">{{ task.title }}</text><text class="muted">{{ label(task.status) }} · {{ label(task.completionMode) }}</text><text class="muted">截止：{{ new Date(task.deadline).toLocaleString('zh-CN') }}</text><view class="metrics"><view><b>{{ records.summary.total || 0 }}</b><text>负责人</text></view><view><b>{{ (records.summary.counts?.APPROVED || 0) + (records.summary.counts?.COMPLETED || 0) }}</b><text>已完成</text></view><view><b class="danger">{{ pendingIds.length }}</b><text>待完成</text></view></view><button v-if="pendingIds.length" class="primary-btn" @tap="remind">催办待完成人员</button></view>
  <view v-if="task?.attachments?.length" class="card"><text class="section-title">任务附件</text><view v-for="attachment in task.attachments" :key="attachment.file.id" class="attachment" @tap="download(attachment.file)"><text>{{ attachment.file.originalName }}</text><text>下载 ›</text></view></view>
  <text class="section-title">执行明细</text><view v-for="record in records.items" :key="record.id" class="card"><view class="row"><view><text class="name">{{ record.assignee.name }}</text><text class="muted">工号：{{ record.assignee.employeeNo }}</text></view><text :class="record.derivedStatus?.startsWith('OVERDUE') ? 'danger' : 'status'">{{ label(record.derivedStatus) }}</text></view><view v-if="record.recordStatus === 'SUBMITTED'" class="review"><text class="feedback">{{ record.submissions.at(-1)?.feedback || '无文字反馈' }}</text><view class="review-buttons"><button class="secondary-btn" @tap="review(record,'RETURN')">退回</button><button class="primary-btn" @tap="review(record,'APPROVE')">通过</button></view></view></view>
</view></template>

<style scoped>
.title,.muted,.name{display:block}.title{margin-bottom:10rpx;font-size:34rpx;font-weight:800}.muted{margin-top:7rpx}.metrics{display:grid;grid-template-columns:repeat(3,1fr);margin:28rpx 0}.metrics view{text-align:center}.metrics b,.metrics text{display:block}.metrics b{color:#007f95;font-size:38rpx}.metrics text{color:#71868a;font-size:22rpx}.row{display:flex;justify-content:space-between}.name{font-weight:700}.status{color:#2c746e}.review{margin-top:22rpx;padding-top:20rpx;border-top:1px solid #edf1f1}.feedback{display:block;margin-bottom:18rpx}.review-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12rpx}.review-buttons button{font-size:24rpx}.attachment{display:flex;justify-content:space-between;gap:10rpx;padding:16rpx 0;border-top:1px solid #edf1f1}.attachment text:first-child{flex:1;overflow-wrap:anywhere}.attachment text:last-child{color:#007f95}.error{color:#b25242}
</style>
