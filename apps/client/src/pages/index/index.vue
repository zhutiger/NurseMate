<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { healthReady } from '../../services/api';

const status = ref('正在连接服务…');

onMounted(async () => {
  try {
    const result = await healthReady();
    status.value = result.status === 'ready' ? '云端服务运行正常' : '服务正在准备';
  } catch {
    status.value = '暂时无法连接服务';
  }
});
</script>

<template>
  <view class="page">
    <view class="brand">
      <view class="mark">HZY</view>
      <view>
        <text class="title">护知音</text>
        <text class="subtitle">每条重要消息，都有回应。</text>
      </view>
    </view>
    <view class="card">
      <text class="eyebrow">云端测试环境</text>
      <text class="status">{{ status }}</text>
      <text class="hint">通知确认与任务闭环功能正在按 V1.0 基线建设。</text>
    </view>
  </view>
</template>

<style scoped>
.page { min-height: 100vh; padding: 64rpx 36rpx; box-sizing: border-box; background: linear-gradient(180deg, #e9f6f4 0%, #f7faf9 48%); }
.brand { display: flex; align-items: center; gap: 24rpx; margin: 52rpx 0; }
.mark { width: 112rpx; height: 112rpx; border-radius: 32rpx; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; background: linear-gradient(135deg, #005870, #0088a0); }
.title, .subtitle, .eyebrow, .status, .hint { display: block; }
.title { color: #005870; font-size: 48rpx; font-weight: 800; }
.subtitle { margin-top: 8rpx; color: #58767c; font-size: 25rpx; }
.card { padding: 40rpx; border: 1px solid rgba(0,88,112,.08); border-radius: 32rpx; background: rgba(255,255,255,.92); box-shadow: 0 20rpx 60rpx rgba(0,88,112,.1); }
.eyebrow { color: #0088a0; font-size: 24rpx; font-weight: 700; }
.status { margin: 18rpx 0; color: #173a42; font-size: 36rpx; font-weight: 700; }
.hint { color: #6a8287; font-size: 26rpx; line-height: 1.7; }
</style>
