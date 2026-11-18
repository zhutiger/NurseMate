<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { dateTime } from '../format';

const items = ref<any[]>([]); const action = ref(''); const targetType = ref(''); const loading = ref(false); const error = ref('');
async function load() { loading.value = true; error.value = ''; try { const params = new URLSearchParams({ pageSize: '100' }); if (action.value) params.set('action', action.value); if (targetType.value) params.set('targetType', targetType.value); const result = await api(`/audit-logs?${params}`); items.value = result.items; } catch (cause: any) { error.value = cause.message; } finally { loading.value = false; } }
onMounted(load);
</script>

<template>
  <div class="page-head"><div><h3>审计日志</h3><span class="muted">关键业务操作只读留痕，不提供修改和删除</span></div><button class="secondary" @click="load">刷新</button></div>
  <section class="panel"><div class="toolbar"><input v-model="action" placeholder="操作代码，如 notice.publish" /><input v-model="targetType" placeholder="对象类型，如 notice" /><button class="primary" @click="load">查询</button></div><p v-if="error" class="form-error">{{ error }}</p><div v-if="loading" class="empty">正在加载…</div><div v-else class="table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>对象</th><th>结果</th><th>原因</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{ dateTime(item.createdAt) }}</td><td>{{ item.actor?.name ?? '系统' }}<small v-if="item.actor" style="display:block;color:#698087">{{ item.actor.employeeNo }}</small></td><td><code>{{ item.action }}</code></td><td>{{ item.targetType }}<small style="display:block;color:#698087">{{ item.targetId }}</small></td><td><span :class="['tag', item.result === 'SUCCESS' ? 'success' : 'urgent']">{{ item.result }}</span></td><td>{{ item.reason ?? '—' }}</td></tr></tbody></table><div v-if="!items.length" class="empty">没有符合条件的日志</div></div></section>
</template>
