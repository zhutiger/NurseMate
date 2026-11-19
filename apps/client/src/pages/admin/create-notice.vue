<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../services/api';

const title = ref('');
const content = ref('');
const level = ref<'NORMAL' | 'IMPORTANT' | 'URGENT'>('IMPORTANT');
const deadlineHours = ref('24');
const working = ref(false);
const levels = ['NORMAL', 'IMPORTANT', 'URGENT'] as const;
const quickHours = [2, 24, 48];
const parsedHours = computed(() => Number(deadlineHours.value));

function inputValue(event: any): string {
  return String(event?.detail?.value ?? event?.target?.value ?? '');
}

function onTitleInput(event: any) {
  title.value = inputValue(event);
}

function onContentInput(event: any) {
  content.value = inputValue(event);
}

function onHoursInput(event: any) {
  deadlineHours.value = inputValue(event).replace(/[^0-9]/g, '');
}

function chooseHours(value: number) {
  deadlineHours.value = String(value);
}

function onLevelChange(event: any) {
  level.value = levels[Number(event.detail.value)] ?? 'IMPORTANT';
}

async function publish() {
  const normalizedTitle = title.value.trim();
  const normalizedContent = content.value.trim();
  if (!normalizedTitle) return uni.showToast({ title: '请填写通知标题', icon: 'none' });
  if (!normalizedContent) return uni.showToast({ title: '请填写通知正文', icon: 'none' });
  if (!Number.isInteger(parsedHours.value) || parsedHours.value < 1 || parsedHours.value > 720) {
    return uni.showToast({ title: '确认时限须为1～720小时', icon: 'none' });
  }

  working.value = true;
  try {
    const deadlineAt = new Date(Date.now() + parsedHours.value * 3600000).toISOString();
    const dto = {
      title: normalizedTitle,
      content: normalizedContent,
      level: level.value,
      requiresConfirmation: true,
      deadlineAt,
      recipientSelection: { mode: 'ALL_ACTIVE' },
    };
    const preview: any = await api('/notices/recipient-preview', 'POST', dto.recipientSelection);
    const accepted = await new Promise<boolean>((resolve) => uni.showModal({
      title: '确认发布',
      content: `将向 ${preview.recipientCount} 人发布，要求在 ${parsedHours.value} 小时内确认。`,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!accepted) return;
    const draft: any = await api('/notices', 'POST', dto);
    await api(`/notices/${draft.id}/publish`, 'POST');
    uni.showToast({ title: '发布成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 500);
  } catch (error: any) {
    uni.showToast({ title: error.message, icon: 'none' });
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <view class="page">
    <view class="card form">
      <text class="field-label">通知标题</text>
      <input class="field-control" type="text" :value="title" maxlength="200" placeholder="请输入通知标题" @input="onTitleInput" />

      <text class="field-label">通知正文</text>
      <textarea class="field-control textarea" :value="content" maxlength="20000" placeholder="请输入通知内容" @input="onContentInput" />

      <text class="field-label">重要程度</text>
      <picker :range="levels" @change="onLevelChange">
        <view class="field-control picker">{{ level }}</view>
      </picker>

      <text class="field-label">确认时限（小时）</text>
      <view class="quick-hours">
        <button v-for="value in quickHours" :key="value" type="button" :class="{ active: deadlineHours === String(value) }" @tap="chooseHours(value)">{{ value }}小时</button>
      </view>
      <input class="field-control" type="number" :value="deadlineHours" placeholder="请输入1～720" @input="onHoursInput" />
      <text class="field-tip">当前设置：发布后 {{ deadlineHours || '—' }} 小时内确认</text>
    </view>
    <button class="primary-btn publish-button" :loading="working" :disabled="working" @tap="publish">预览并发布</button>
  </view>
</template>

<style scoped>
.field-label { display:block;margin:24rpx 0 10rpx;color:#36575e;font-weight:700; }
.field-control { display:block;width:100%;min-height:84rpx;padding:20rpx 22rpx;border:1px solid #cddfe1;border-radius:14rpx;background:#f8fbfb;color:#173a42; }
.textarea { min-height:280rpx; }
.picker { line-height:44rpx; }
.quick-hours { display:grid;grid-template-columns:repeat(3,1fr);gap:12rpx;margin-bottom:14rpx; }
.quick-hours button { margin:0;padding:8rpx 10rpx;color:#36717b;font-size:24rpx;line-height:2;border:1px solid #b9d8dc;background:#f5fbfb; }
.quick-hours button.active { color:#fff;border-color:#0088a0;background:#0088a0; }
.field-tip { display:block;margin-top:10rpx;color:#71868a;font-size:22rpx; }
.publish-button { margin-top:24rpx; }
</style>
