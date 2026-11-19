<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api } from '../../services/api';
import { auditAction, auditResult, targetLabel } from '../../services/display';
const items = ref<any[]>([]); const loading = ref(false); const error = ref('');
async function load() { loading.value = true; error.value = ''; try { const result: any = await api('/audit-logs?pageSize=100'); items.value = result.items ?? []; } catch (cause: any) { error.value = cause.message; } finally { loading.value = false; } }
onShow(load);
</script>
<template><view class="page"><view v-if="error" class="card error">{{ error }}<button class="secondary-btn" @tap="load">重新加载</button></view><view v-if="loading" class="empty">正在加载…</view><view v-else-if="!items.length" class="empty">暂无日志或没有查看权限</view><view v-for="item in items" :key="item.id" class="card"><view class="row"><text class="action">{{ auditAction(item.action) }}</text><text :class="item.result === 'SUCCESS' ? 'ok' : 'danger'">{{ auditResult(item.result) }}</text></view><text class="muted">{{ item.actor?.name || '系统' }} · {{ new Date(item.createdAt).toLocaleString('zh-CN') }}</text><text class="muted">{{ targetLabel(item.targetType) }} / {{ item.targetId || '—' }}</text><text v-if="item.reason" class="reason">原因：{{ item.reason }}</text></view></view></template>
<style scoped>.row{display:flex;justify-content:space-between}.action{font-weight:800}.ok{color:#168269}.muted,.reason{display:block;margin-top:9rpx}.reason{color:#9b673e}.error{color:#b25242}</style>
