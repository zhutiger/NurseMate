<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

defineEmits<{ navigate: [value: 'notices' | 'tasks'] }>();
const data = ref<any>({ counts: {}, notices: [], tasks: [] });
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try { data.value = await api('/dashboard/management'); }
  catch (cause: any) { error.value = cause.message; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <p v-if="error" class="form-error">{{ error }} <button class="ghost small-button" @click="load">重试</button></p>
  <div class="metrics">
    <div class="metric"><small>待确认消息</small><strong>{{ data.counts.pendingNotices ?? 0 }}</strong></div>
    <div class="metric"><small>待完成任务</small><strong>{{ data.counts.pendingTasks ?? 0 }}</strong></div>
    <div class="metric"><small>待审核反馈</small><strong>{{ data.counts.pendingReviews ?? 0 }}</strong></div>
    <div class="metric warning"><small>逾期需跟进</small><strong>{{ data.counts.overdue ?? 0 }}</strong></div>
  </div>
  <div class="two-column">
    <section class="panel">
      <div class="panel-title"><h3>待跟进通知</h3><button class="ghost" @click="$emit('navigate', 'notices')">全部通知 →</button></div>
      <div v-if="loading" class="empty">正在加载…</div>
      <div v-else-if="!data.notices.length" class="empty">暂无待跟进通知</div>
      <div v-else class="list"><div v-for="item in data.notices" :key="item.id" class="list-row"><div><strong>{{ item.title }}</strong><small>等待护士阅读确认</small></div><span :class="['tag', item.overdue ? 'overdue' : '']">待确认 {{ item.pending }} 人</span></div></div>
    </section>
    <section class="panel">
      <div class="panel-title"><h3>待跟进任务</h3><button class="ghost" @click="$emit('navigate', 'tasks')">全部任务 →</button></div>
      <div v-if="loading" class="empty">正在加载…</div>
      <div v-else-if="!data.tasks.length" class="empty">暂无待跟进任务</div>
      <div v-else class="list"><div v-for="item in data.tasks" :key="item.id" class="list-row"><div><strong>{{ item.title }}</strong><small>待完成 {{ item.pending }} · 待审核 {{ item.pendingReview }}</small></div><span :class="['tag', item.overdue ? 'overdue' : '']">{{ item.overdue ? `逾期 ${item.overdue}` : '进行中' }}</span></div></div>
    </section>
  </div>
</template>
