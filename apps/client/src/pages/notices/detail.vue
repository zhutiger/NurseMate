<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api } from '../../services/api';
import { label } from '../../services/display';
import { downloadAttachment } from '../../services/files';

const id = ref(''); const item = ref<any>(null); const working = ref(false); const loading = ref(true); const error = ref('');
async function load() {
  loading.value = true; error.value = '';
  try { item.value = await api(`/me/notices/${id.value}`); }
  catch (cause: any) { error.value = cause.message; }
  finally { loading.value = false; }
}
async function confirm() {
  working.value = true;
  try { await api(`/me/notices/${id.value}/confirm`, 'POST', { versionNo: item.value.currentVersionNo }); uni.showToast({ title: '已确认', icon: 'success' }); await load(); }
  catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
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
  <template v-if="item"><view class="card"><view class="meta"><text class="badge">{{ label(item.level) }}</text><text class="muted">版本 {{ item.currentVersionNo }}</text></view><text class="title">{{ item.title }}</text><text class="deadline">截止：{{ item.deadlineAt ? new Date(item.deadlineAt).toLocaleString('zh-CN') : '无' }}</text><view class="divider"/><text class="body">{{ item.content }}</text></view>
    <view v-if="item.attachments?.length" class="card"><text class="section-title">通知附件</text><view v-for="file in item.attachments" :key="file.id" class="attachment" @tap="download(file)"><text>{{ file.originalName || file.fileName }}</text><text class="download">下载 ›</text></view></view>
    <button v-if="!item.confirmedAt" class="primary-btn fixed" :loading="working" :disabled="working" @tap="confirm">我已阅读并知晓</button><view v-else class="confirmed">✓ 已于 {{ new Date(item.confirmedAt).toLocaleString('zh-CN') }} 确认</view>
  </template>
</view></template>

<style scoped>
.meta{display:flex;justify-content:space-between}.badge{padding:8rpx 14rpx;color:#fff;font-size:21rpx;border-radius:10rpx;background:#008da1}.title{display:block;margin:28rpx 0 14rpx;font-size:38rpx;font-weight:800}.deadline{color:#e07a42;font-size:24rpx}.divider{height:1px;margin:28rpx 0;background:#edf1f1}.body{white-space:pre-wrap;line-height:1.8}.attachment{display:flex;align-items:center;justify-content:space-between;gap:12rpx;padding:18rpx 0;border-top:1px solid #edf1f1}.attachment text:first-child{flex:1;overflow-wrap:anywhere}.download{color:#007f95;font-size:23rpx}.fixed{margin-top:30rpx}.confirmed{padding:25rpx;color:#19866f;text-align:center;border-radius:18rpx;background:#e9f8f3}
</style>
