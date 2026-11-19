<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { auditAction, auditResult, dateTime, targetLabel } from '../format';

const items = ref<any[]>([]); const action = ref(''); const targetType = ref(''); const loading = ref(false); const error = ref('');
async function load() { loading.value = true; error.value = ''; try { const params = new URLSearchParams({ pageSize: '100' }); if (action.value) params.set('action', action.value); if (targetType.value) params.set('targetType', targetType.value); const result = await api(`/audit-logs?${params}`); items.value = result.items; } catch (cause: any) { error.value = cause.message; } finally { loading.value = false; } }
onMounted(load);
</script>

<template>
  <div class="page-head"><div><h3>审计日志</h3><span class="muted">关键业务操作只读留痕，不提供修改和删除</span></div><button class="secondary" @click="load">刷新</button></div>
  <section class="panel"><div class="toolbar"><select v-model="action" @change="load"><option value="">全部操作</option><option value="user.update">编辑人员</option><option value="user.permissions_replace">修改权限</option><option value="notice.publish">发布通知</option><option value="task.publish">发布任务</option><option value="report.export">导出记录</option></select><select v-model="targetType" @change="load"><option value="">全部对象</option><option value="user">人员</option><option value="notice">通知</option><option value="task">任务</option><option value="file">附件</option></select><button class="primary" @click="load">查询</button></div><p v-if="error" class="form-error">{{ error }} <button class="ghost small-button" @click="load">重试</button></p><div v-if="loading" class="empty">正在加载…</div><div v-else class="table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>对象</th><th>结果</th><th>原因</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{ dateTime(item.createdAt) }}</td><td>{{ item.actor?.name ?? '系统' }}<small v-if="item.actor" style="display:block;color:#698087">工号：{{ item.actor.employeeNo }}</small></td><td>{{ auditAction(item.action) }}</td><td>{{ targetLabel(item.targetType) }}<small style="display:block;color:#698087">{{ item.targetId }}</small></td><td><span :class="['tag', item.result === 'SUCCESS' ? 'success' : 'urgent']">{{ auditResult(item.result) }}</span></td><td>{{ item.reason ?? '—' }}</td></tr></tbody></table><div v-if="!items.length" class="empty">没有符合条件的日志</div></div></section>
</template>
