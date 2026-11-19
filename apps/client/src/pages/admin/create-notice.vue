<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../../services/api';
import '../../styles/publish-form.css';

const title = ref('');
const content = ref('');
const level = ref<'NORMAL' | 'IMPORTANT' | 'URGENT'>('IMPORTANT');
const deadlineHours = ref('24');
const working = ref(false);
const levelOptions = [
  { value: 'NORMAL', label: '普通', description: '适用于一般工作信息。' },
  { value: 'IMPORTANT', label: '重要', description: '适用于质控整改、业务学习等需及时确认的通知。' },
  { value: 'URGENT', label: '紧急', description: '涉及当班安全风险时，还需通过电话或交接班确认。' },
] as const;
const levelLabels = levelOptions.map((option) => option.label);
const selectedLevel = computed(() => levelOptions.findIndex((option) => option.value === level.value));
const levelDescription = computed(() => levelOptions[selectedLevel.value]?.description ?? '');
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
  level.value = levelOptions[Number(event.detail.value)]?.value ?? 'IMPORTANT';
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
  <view class="page publish-page">
    <view class="publish-intro">
      <text class="publish-eyebrow">发布中心 · 阅读确认</text>
      <text class="publish-title">发布新通知</text>
      <text class="publish-subtitle">写明需要知晓的内容，并设置合理的确认时间。</text>
    </view>

    <view class="publish-card">
      <view class="section-heading"><text class="section-number">01</text><view class="section-text"><text class="section-name">通知内容</text><text class="section-caption">标题简洁明确，正文说明具体要求</text></view></view>
      <view class="form-field">
        <text class="field-label">通知标题 <text class="required">*</text></text>
        <input class="field-control" type="text" :value="title" maxlength="200" placeholder="例如：本周护理质量重点" @input="onTitleInput" />
      </view>
      <view class="form-field">
        <text class="field-label">通知正文 <text class="required">*</text></text>
        <textarea class="field-control textarea" :value="content" maxlength="20000" placeholder="请输入通知内容和需要知晓的事项" @input="onContentInput" />
      </view>
    </view>

    <view class="publish-card">
      <view class="section-heading"><text class="section-number">02</text><view class="section-text"><text class="section-name">确认规则</text><text class="section-caption">设置重要程度和确认时限</text></view></view>
      <view class="form-field">
        <text class="field-label">重要程度 <text class="required">*</text></text>
        <picker class="select-field" :range="levelLabels" :value="selectedLevel" @change="onLevelChange">
          <view class="field-control select-control"><text>{{ levelLabels[selectedLevel] }}</text><text class="select-chevron"></text></view>
        </picker>
        <text class="field-tip">{{ levelDescription }}</text>
      </view>
      <view class="form-field">
        <text class="field-label">确认时限 <text class="required">*</text></text>
        <view class="quick-hours">
          <button v-for="value in quickHours" :key="value" type="button" :class="{ active: deadlineHours === String(value) }" @tap="chooseHours(value)">{{ value }} 小时</button>
        </view>
        <view class="hours-field"><input class="field-control" type="number" :value="deadlineHours" placeholder="请输入 1～720" @input="onHoursInput" /><text class="hours-unit">小时</text></view>
        <text class="field-tip">发布后 {{ deadlineHours || '—' }} 小时内确认</text>
      </view>
    </view>

    <view class="publish-summary"><text class="summary-label">接收范围</text><text class="summary-value">全体在岗护士</text></view>
    <view class="publish-actions"><button class="primary-btn publish-button" :loading="working" :disabled="working" @tap="publish">预览并发布</button><text class="actions-tip">发布前将显示实际接收人数，需再次确认</text></view>
  </view>
</template>
