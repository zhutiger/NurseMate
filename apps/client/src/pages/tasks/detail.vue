<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api } from '../../services/api';
import { label } from '../../services/display';
import { downloadAttachment } from '../../services/files';

const id = ref(''); const item = ref<any>(null); const feedback = ref(''); const working = ref(false);
const loading = ref(true); const error = ref('');
async function load() {
  loading.value = true; error.value = '';
  try { item.value = await api(`/me/tasks/${id.value}`); }
  catch (cause: any) { error.value = cause.message; }
  finally { loading.value = false; }
}
async function act() {
  if (working.value) return; working.value = true;
  try {
    if (item.value.completionMode === 'SIMPLE') await api(`/me/tasks/${id.value}/complete`, 'POST');
    else await api(`/me/tasks/${id.value}/submissions`, 'POST', { feedback: feedback.value });
    uni.showToast({ title: '提交成功', icon: 'success' }); feedback.value = ''; await load();
  } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
  finally { working.value = false; }
}
async function download(file: any) {
  try { await downloadAttachment(file); }
  catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
}
onLoad((query) => { id.value = String(query?.id ?? ''); load(); });
</script>

<template><view class="page">
  <view v-if="loading && !item" class="empty">正在加载…</view>
  <view v-else-if="error && !item" class="empty">{{ error }}<button class="secondary-btn" @tap="load">重新加载</button></view>
  <template v-if="item"><view class="card"><view class="meta"><text class="badge">{{ label(item.completionMode) }}</text><text :class="item.derivedStatus?.startsWith('OVERDUE')?'danger':'muted'">{{ label(item.derivedStatus) }}</text></view><text class="title">{{ item.title }}</text><text class="deadline">截止：{{ new Date(item.deadlineAt).toLocaleString('zh-CN') }}</text><view class="divider"/><text class="body">{{ item.content }}</text></view>
    <view v-if="item.attachments?.length" class="card"><text class="section-title">任务附件</text><view v-for="file in item.attachments" :key="file.id" class="attachment" @tap="download(file)"><text>{{ file.originalName }}</text><text class="download">下载 ›</text></view></view>
    <view v-if="item.submissions?.length" class="card"><text class="section-title">提交记录</text><view v-for="submission in item.submissions" :key="submission.id" class="history"><text>第 {{ submission.submissionNo }} 次 · {{ submission.reviewStatus === 'PENDING' ? '待审核' : label(submission.reviewStatus) }}</text><text class="muted">{{ submission.feedback || '无文字反馈' }}</text><text v-if="submission.reviewComment" class="comment">审核意见：{{ submission.reviewComment }}</text><view v-for="file in submission.attachments ?? []" :key="file.id" class="attachment" @tap="download(file)"><text>{{ file.originalName }}</text><text class="download">下载 ›</text></view></view></view>
    <view v-if="item.completionMode === 'REVIEW' && ['PENDING','RETURNED'].includes(item.recordStatus)" class="card"><text class="section-title">完成反馈</text><textarea v-model="feedback" class="textarea" placeholder="请填写完成情况" maxlength="5000" /></view>
    <button v-if="item.completionMode === 'SIMPLE' && item.recordStatus === 'PENDING'" class="primary-btn" :loading="working" :disabled="working" @tap="act">标记已完成</button>
    <button v-if="item.completionMode === 'REVIEW' && ['PENDING','RETURNED'].includes(item.recordStatus)" class="primary-btn" :loading="working" :disabled="working" @tap="act">提交审核</button>
    <view v-if="['APPROVED','COMPLETED'].includes(item.recordStatus)" class="done">✓ 任务已完成</view><view v-if="item.recordStatus === 'SUBMITTED'" class="waiting">已提交，等待管理员审核</view>
  </template>
</view></template>

<style scoped>
.meta{display:flex;justify-content:space-between}.badge{padding:8rpx 14rpx;color:#fff;font-size:21rpx;border-radius:10rpx;background:#e58648}.title{display:block;margin:28rpx 0 14rpx;font-size:38rpx;font-weight:800}.deadline{color:#e07a42;font-size:24rpx}.divider{height:1px;margin:28rpx 0;background:#edf1f1}.body{white-space:pre-wrap;line-height:1.8}.history{padding:20rpx 0;border-top:1px solid #edf1f1}.history text{display:block;margin-top:8rpx}.comment{color:#bd6737}.textarea{min-height:220rpx;padding:20rpx;border:1px solid #dbe7e8;border-radius:16rpx;background:#f8fbfb}.done,.waiting{padding:25rpx;text-align:center;border-radius:18rpx}.done{color:#19866f;background:#e9f8f3}.waiting{color:#9b6c26;background:#fff6df}.attachment{display:flex;align-items:center;justify-content:space-between;gap:12rpx;padding:17rpx 0;border-top:1px solid #edf1f1}.attachment text:first-child{flex:1;overflow-wrap:anywhere}.download{color:#007f95;font-size:23rpx}
</style>
