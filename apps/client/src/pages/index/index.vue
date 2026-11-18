<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, hasSession } from '../../services/api';

const loading = ref(true);
const me = ref<any>(null);
const dashboard = ref<any>({ counts: {}, notices: [], tasks: [] });
const greeting = computed(() => new Date().getHours() < 12 ? '上午好' : new Date().getHours() < 18 ? '下午好' : '晚上好');

async function load() {
  if (!hasSession()) return uni.reLaunch({ url: '/pages/login/login' });
  loading.value = true;
  try {
    [me.value, dashboard.value] = await Promise.all([api('/me'), api('/me/dashboard')]);
  } catch (error: any) {
    uni.showToast({ title: error.message ?? '加载失败', icon: 'none' });
  } finally { loading.value = false; }
}

onShow(load);
</script>

<template>
  <view class="page home">
    <view class="hero">
      <view class="logo">HZY</view>
      <view class="hero-copy">
        <text class="brand">护知音</text>
        <text class="slogan">每条重要消息，都有回应。</text>
      </view>
    </view>
    <text class="welcome">{{ greeting }}，{{ me?.user?.name || '护理同事' }}</text>
    <text class="muted">今天有以下事项需要关注</text>

    <view class="metrics">
      <view class="metric" @tap="uni.switchTab({ url: '/pages/notices/notices' })">
        <text class="number">{{ dashboard.counts?.pendingNotices ?? 0 }}</text><text>待确认消息</text>
      </view>
      <view class="metric" @tap="uni.switchTab({ url: '/pages/tasks/tasks' })">
        <text class="number">{{ dashboard.counts?.pendingTasks ?? 0 }}</text><text>待完成任务</text>
      </view>
      <view class="metric warn"><text class="number">{{ dashboard.counts?.overdue ?? 0 }}</text><text>已逾期</text></view>
    </view>

    <text class="section-title">重要提醒</text>
    <view v-if="loading" class="empty">正在加载…</view>
    <view v-else-if="!dashboard.notices?.length && !dashboard.tasks?.length" class="card empty">当前没有待办事项</view>
    <view v-for="item in dashboard.notices" :key="`n-${item.id}`" class="card item" @tap="uni.navigateTo({ url: `/pages/notices/detail?id=${item.id}` })">
      <view class="tag notice">通知</view><view class="item-main"><text class="item-title">{{ item.title }}</text><text class="muted">{{ item.status }}</text></view><text class="arrow">›</text>
    </view>
    <view v-for="item in dashboard.tasks" :key="`t-${item.id}`" class="card item" @tap="uni.navigateTo({ url: `/pages/tasks/detail?id=${item.id}` })">
      <view class="tag task">任务</view><view class="item-main"><text class="item-title">{{ item.title }}</text><text class="muted">{{ item.status }}</text></view><text class="arrow">›</text>
    </view>
  </view>
</template>

<style scoped>
.home { padding-top: 38rpx; }
.hero { display: flex; align-items: center; margin-bottom: 50rpx; }
.logo { display:flex; align-items:center; justify-content:center; width:92rpx; height:92rpx; color:#fff; font-weight:800; border-radius:26rpx; background:linear-gradient(135deg,#007f95,#00a6b2); }
.hero-copy { margin-left:20rpx; }
.brand,.slogan,.welcome,.metric text,.item-title,.muted { display:block; }
.brand { color:#006e83; font-size:42rpx; font-weight:800; }
.slogan { color:#668288; font-size:24rpx; }
.welcome { font-size:38rpx; font-weight:700; }
.metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:16rpx; margin:32rpx 0; }
.metric { padding:26rpx 12rpx; color:#3e6168; text-align:center; border-radius:22rpx; background:#fff; }
.metric.warn .number { color:#e47742; }
.number { margin-bottom:6rpx; color:#007f95; font-size:44rpx; font-weight:800; }
.item { display:flex; align-items:center; }
.tag { padding:9rpx 14rpx; color:#fff; font-size:22rpx; border-radius:12rpx; }
.tag.notice { background:#008fa1; }.tag.task { background:#ef8c4b; }
.item-main { flex:1; margin-left:20rpx; }.item-title { margin-bottom:8rpx; font-weight:700; }.arrow { color:#90a5a9; font-size:44rpx; }
</style>
