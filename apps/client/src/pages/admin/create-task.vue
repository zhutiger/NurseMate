<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../services/api';
import '../../styles/publish-form.css';

const title = ref('');
const content = ref('');
const mode = ref<'REVIEW' | 'SIMPLE'>('REVIEW');
const deadlineHours = ref('48');
const working = ref(false);
const modeOptions = [
  { value: 'REVIEW', label: '提交后审核', description: '护士提交反馈后，由管理员审核通过才算完成。' },
  { value: 'SIMPLE', label: '点击即完成', description: '护士点击“已完成”后，系统直接记录完成时间。' },
] as const;
const modeLabels = modeOptions.map((option) => option.label);
const selectedMode = computed(() => modeOptions.findIndex((option) => option.value === mode.value));
const modeDescription = computed(() => modeOptions[selectedMode.value]?.description ?? '');
const quickHours = [24, 48, 72];
const parsedHours = computed(() => Number(deadlineHours.value));

const inputValue = (event: any) => String(event?.detail?.value ?? event?.target?.value ?? '');
const onTitleInput = (event: any) => { title.value = inputValue(event); };
const onContentInput = (event: any) => { content.value = inputValue(event); };
const onHoursInput = (event: any) => { deadlineHours.value = inputValue(event).replace(/[^0-9]/g, ''); };
const onModeChange = (event: any) => { mode.value = modeOptions[Number(event.detail.value)]?.value ?? 'REVIEW'; };

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
  <view class="page publish-page">
    <view class="publish-intro">
      <text class="publish-eyebrow">发布中心 · 工作任务</text>
      <text class="publish-title">发布新任务</text>
      <text class="publish-subtitle">说明要做什么、怎样算完成，再核对发布范围。</text>
    </view>

    <view class="publish-card">
      <view class="section-heading"><text class="section-number">01</text><view class="section-text"><text class="section-name">任务内容</text><text class="section-caption">让接收人清楚了解执行要求</text></view></view>
      <view class="form-field">
        <text class="field-label">任务标题 <text class="required">*</text></text>
        <input class="field-control" type="text" :value="title" maxlength="200" placeholder="例如：本周护理质控整改" @input="onTitleInput" />
      </view>
      <view class="form-field">
        <text class="field-label">任务要求 <text class="required">*</text></text>
        <textarea class="field-control textarea" :value="content" maxlength="20000" placeholder="写明需要完成的事项与反馈要求" @input="onContentInput" />
      </view>
    </view>

    <view class="publish-card">
      <view class="section-heading"><text class="section-number">02</text><view class="section-text"><text class="section-name">完成规则</text><text class="section-caption">设置完成方式和截止时间</text></view></view>
      <view class="form-field">
        <text class="field-label">完成方式 <text class="required">*</text></text>
        <picker class="select-field" :range="modeLabels" :value="selectedMode" @change="onModeChange">
          <view class="field-control select-control"><text>{{ modeLabels[selectedMode] }}</text><text class="select-chevron"></text></view>
        </picker>
        <text class="field-tip">{{ modeDescription }}</text>
      </view>
      <view class="form-field">
        <text class="field-label">完成时限 <text class="required">*</text></text>
        <view class="quick-hours"><button v-for="value in quickHours" :key="value" type="button" :class="{ active: deadlineHours === String(value) }" @tap="deadlineHours = String(value)">{{ value }} 小时</button></view>
        <view class="hours-field"><input class="field-control" type="number" :value="deadlineHours" placeholder="请输入 1～720" @input="onHoursInput" /><text class="hours-unit">小时</text></view>
        <text class="field-tip">发布后 {{ deadlineHours || '—' }} 小时内完成</text>
      </view>
    </view>

    <view class="publish-summary"><text class="summary-label">接收范围</text><text class="summary-value">全体在岗护士</text></view>
    <view class="publish-actions"><button class="primary-btn publish-button" :loading="working" :disabled="working" @tap="publish">预览并发布</button><text class="actions-tip">发布前将显示实际接收人数，需再次确认</text></view>
  </view>
</template>
