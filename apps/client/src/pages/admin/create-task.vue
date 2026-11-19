<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../services/api';

const title = ref('');
const content = ref('');
const mode = ref<'REVIEW' | 'SIMPLE'>('REVIEW');
const deadlineHours = ref('48');
const working = ref(false);
const modes = ['REVIEW', 'SIMPLE'] as const;
const quickHours = [24, 48, 72];
const parsedHours = computed(() => Number(deadlineHours.value));

const inputValue = (event: any) => String(event?.detail?.value ?? event?.target?.value ?? '');
const onTitleInput = (event: any) => { title.value = inputValue(event); };
const onContentInput = (event: any) => { content.value = inputValue(event); };
const onHoursInput = (event: any) => { deadlineHours.value = inputValue(event).replace(/[^0-9]/g, ''); };
const onModeChange = (event: any) => { mode.value = modes[Number(event.detail.value)] ?? 'REVIEW'; };

async function publish() {
  const normalizedTitle = title.value.trim();
  const normalizedContent = content.value.trim();
  if (!normalizedTitle) return uni.showToast({ title: '请填写任务标题', icon: 'none' });
  if (!normalizedContent) return uni.showToast({ title: '请填写任务要求', icon: 'none' });
  if (!Number.isInteger(parsedHours.value) || parsedHours.value < 1 || parsedHours.value > 720) {
    return uni.showToast({ title: '完成时限须为1～720小时', icon: 'none' });
  }
  working.value = true;
  try {
    const dto = {
      title: normalizedTitle,
      content: normalizedContent,
      level: 'IMPORTANT',
      completionMode: mode.value,
      feedbackRequired: mode.value === 'REVIEW',
      attachmentRequired: false,
      deadlineAt: new Date(Date.now() + parsedHours.value * 3600000).toISOString(),
      assigneeSelection: { mode: 'ALL_ACTIVE' },
    };
    const preview: any = await api('/tasks/assignee-preview', 'POST', dto.assigneeSelection);
    const accepted = await new Promise<boolean>((resolve) => uni.showModal({
      title: '确认发布',
      content: `将向 ${preview.assigneeCount} 人发布任务，要求在 ${parsedHours.value} 小时内完成。`,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!accepted) return;
    const draft: any = await api('/tasks', 'POST', dto);
    await api(`/tasks/${draft.id}/publish`, 'POST');
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
      <text class="field-label">任务标题</text>
      <input class="field-control" type="text" :value="title" maxlength="200" placeholder="请输入任务标题" @input="onTitleInput" />
      <text class="field-label">任务要求</text>
      <textarea class="field-control textarea" :value="content" maxlength="20000" placeholder="请输入执行要求" @input="onContentInput" />
      <text class="field-label">完成方式</text>
      <picker :range="modes" @change="onModeChange">
        <view class="field-control picker">{{ mode === 'REVIEW' ? '提交后审核' : '点击即完成' }}</view>
      </picker>
      <text class="field-label">完成时限（小时）</text>
      <view class="quick-hours"><button v-for="value in quickHours" :key="value" type="button" :class="{ active: deadlineHours === String(value) }" @tap="deadlineHours = String(value)">{{ value }}小时</button></view>
      <input class="field-control" type="number" :value="deadlineHours" placeholder="请输入1～720" @input="onHoursInput" />
      <text class="field-tip">当前设置：发布后 {{ deadlineHours || '—' }} 小时内完成</text>
    </view>
    <button class="primary-btn publish-button" :loading="working" :disabled="working" @tap="publish">预览并发布</button>
  </view>
</template>

<style scoped>
.field-label { display:block;margin:24rpx 0 10rpx;color:#36575e;font-weight:700; }
.field-control { display:block;width:100%;min-height:84rpx;padding:20rpx 22rpx;border:1px solid #cddfe1;border-radius:14rpx;background:#f8fbfb;color:#173a42; }
.textarea { min-height:280rpx; }.picker { line-height:44rpx; }
.quick-hours { display:grid;grid-template-columns:repeat(3,1fr);gap:12rpx;margin-bottom:14rpx; }
.quick-hours button { margin:0;padding:8rpx 10rpx;color:#36717b;font-size:24rpx;line-height:2;border:1px solid #b9d8dc;background:#f5fbfb; }
.quick-hours button.active { color:#fff;border-color:#0088a0;background:#0088a0; }
.field-tip { display:block;margin-top:10rpx;color:#71868a;font-size:22rpx; }.publish-button { margin-top:24rpx; }
</style>
