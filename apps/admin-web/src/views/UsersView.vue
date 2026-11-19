<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, patch, post } from '../api';
import { dateTime, label } from '../format';

const items = ref<any[]>([]);
const groups = ref<any[]>([]);
const statusFilter = ref('');
const loading = ref(false);
const error = ref('');
const showCreate = ref(false);
const editing = ref<any>(null);
const editingGroup = ref<any>(null);
const groupForm = ref({ code: '', name: '', enabled: true });
const activationCode = ref('');
const createdEmployeeNo = ref('');
const form = ref({ employeeNo: '', name: '', role: 'NURSE', primaryGroupId: '' });
const bulk = ref('');
const showBulk = ref(false);
const permissionTarget = ref<any>(null);
const selectedPermissions = ref<string[]>([]);
const permissionOptions = [
  { code: 'notice.publish', name: '发布通知' }, { code: 'notice.stats', name: '通知统计' },
  { code: 'notice.remind', name: '通知催办' }, { code: 'notice.manage', name: '管理通知' },
  { code: 'task.publish', name: '发布任务' }, { code: 'task.stats', name: '任务统计' },
  { code: 'task.remind', name: '任务催办' }, { code: 'task.review', name: '审核任务' },
  { code: 'task.manage', name: '管理任务' }, { code: 'report.export', name: '导出记录' },
  { code: 'audit.view', name: '查看日志' },
];

async function load() {
  loading.value = true; error.value = '';
  try {
    const query = statusFilter.value ? `&status=${statusFilter.value}` : '';
    const [users, result] = await Promise.all([api(`/users?pageSize=100${query}`), api('/groups')]);
    items.value = users.items ?? []; groups.value = result.items ?? result;
  } catch (cause: any) { error.value = cause.message; }
  finally { loading.value = false; }
}

function showCode(employeeNo: string, code: string) { createdEmployeeNo.value = employeeNo; activationCode.value = code; }

async function create() {
  try {
    const user = await post('/users', { ...form.value, primaryGroupId: form.value.primaryGroupId || null });
    const code = await post(`/users/${user.id}/activation-codes`, { purpose: 'ACTIVATE_ACCOUNT', reason: '新增人员首次激活' });
    showCode(user.employeeNo, code.activationCode); showCreate.value = false;
    form.value = { employeeNo: '', name: '', role: 'NURSE', primaryGroupId: '' };
    await load();
  } catch (cause: any) { alert(cause.message); }
}

function startEdit(user: any) {
  editing.value = user;
  form.value = { employeeNo: user.employeeNo, name: user.name, role: user.role, primaryGroupId: user.primaryGroupId ?? '' };
}

async function saveEdit() {
  if (!editing.value) return;
  try {
    await patch(`/users/${editing.value.id}`, { ...form.value, primaryGroupId: form.value.primaryGroupId || null, reason: '管理员编辑人员账号' });
    editing.value = null; await load();
  } catch (cause: any) { alert(cause.message); }
}

async function disable(user: any) {
  const reason = prompt(`请输入停用 ${user.name} 的原因`);
  if (!reason?.trim()) return;
  try { await patch(`/users/${user.id}`, { status: 'DISABLED', reason: reason.trim() }); await load(); }
  catch (cause: any) { alert(cause.message); }
}

async function reactivate(user: any) {
  const reason = prompt(`请输入重新启用 ${user.name} 的原因。重新启用后本人需再次激活账号。`);
  if (!reason?.trim()) return;
  try {
    await patch(`/users/${user.id}`, { status: 'PENDING_ACTIVATION', reason: reason.trim() });
    const code = await post(`/users/${user.id}/activation-codes`, { purpose: 'ACTIVATE_ACCOUNT', reason: reason.trim() });
    showCode(user.employeeNo, code.activationCode); await load();
  } catch (cause: any) { alert(cause.message); await load(); }
}

async function reset(user: any) {
  const reason = prompt(`请输入重置 ${user.name} 密码的原因`);
  if (!reason?.trim()) return;
  try {
    const code = await post(`/users/${user.id}/activation-codes`, { purpose: 'RESET_PASSWORD', reason: reason.trim() });
    showCode(user.employeeNo, code.activationCode);
  } catch (cause: any) { alert(cause.message); }
}

async function activation(user: any) {
  try {
    const code = await post(`/users/${user.id}/activation-codes`, { purpose: 'ACTIVATE_ACCOUNT', reason: '管理员重新生成激活码' });
    showCode(user.employeeNo, code.activationCode);
  } catch (cause: any) { alert(cause.message); }
}

async function editPermissions(user: any) {
  try {
    const result = await api(`/users/${user.id}/permissions`);
    selectedPermissions.value = result.permissions ?? [];
    permissionTarget.value = user;
  } catch (cause: any) { alert(cause.message); }
}

async function savePermissions() {
  if (!permissionTarget.value) return;
  try {
    await api(`/users/${permissionTarget.value.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: selectedPermissions.value }) });
    permissionTarget.value = null; await load();
  } catch (cause: any) { alert(cause.message); }
}

async function importRows() {
  const roleNames: Record<string, string> = { 护士: 'NURSE', 协管员: 'COORDINATOR', 护士长: 'HEAD_NURSE' };
  const rows = bulk.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [employeeNo, name, role = '护士'] = line.split(',').map((part) => part.trim());
    return { employeeNo, name, role: roleNames[role] ?? role };
  });
  if (!rows.length) return;
  try {
    const result = await post('/users/import', { rows });
    alert(`导入完成：成功 ${result.succeeded ?? 0} 条，失败 ${result.failed ?? 0} 条`);
    showBulk.value = false; bulk.value = ''; await load();
  } catch (cause: any) { alert(cause.message); }
}

function openGroup(group?: any) {
  editingGroup.value = group ?? { id: '' };
  groupForm.value = group ? { code: group.code, name: group.name, enabled: group.enabled } : { code: '', name: '', enabled: true };
}

async function saveGroup() {
  try {
    if (editingGroup.value?.id) await patch(`/groups/${editingGroup.value.id}`, groupForm.value);
    else await post('/groups', groupForm.value);
    editingGroup.value = null; await load();
  } catch (cause: any) { alert(cause.message); }
}

onMounted(load);
</script>

<template>
  <div class="page-head"><div><h3>人员与账号</h3><span class="muted">编辑账号、授权、停用记录和护理分组</span></div><div class="page-actions"><button class="secondary" @click="openGroup()">新增分组</button><button class="secondary" @click="showBulk = true">批量导入</button><button class="primary" @click="showCreate = true">＋ 新增人员</button></div></div>
  <section class="panel"><div class="toolbar"><select v-model="statusFilter" @change="load"><option value="">全部账号状态</option><option value="ACTIVE">在岗</option><option value="PENDING_ACTIVATION">待激活</option><option value="LOCKED">已锁定</option><option value="DISABLED">已停用</option></select><span class="grow"></span><button class="ghost" @click="load">刷新</button></div>
    <p v-if="error" class="form-error">{{ error }} <button class="ghost small-button" @click="load">重试</button></p>
    <div v-if="loading" class="empty">正在加载…</div><div v-else class="table-wrap"><table class="data-table"><thead><tr><th>姓名 / 工号</th><th>角色</th><th>账号状态</th><th>护理分组</th><th>停用时间 / 原因</th><th>操作</th></tr></thead><tbody><tr v-for="user in items" :key="user.id"><td><strong>{{ user.name }}</strong><small style="display:block;color:#698087">工号：{{ user.employeeNo }}</small></td><td>{{ label(user.role) }}</td><td><span :class="['tag', user.status === 'ACTIVE' ? 'success' : 'neutral']">{{ label(user.status) }}</span></td><td>{{ groups.find((group:any) => group.id === user.primaryGroupId)?.name ?? '—' }}</td><td><template v-if="user.disabledAt"><span>{{ dateTime(user.disabledAt) }}</span><small style="display:block;color:#698087">{{ user.disabledReason || '未记录原因' }}</small></template><span v-else>—</span></td><td><div class="inline-actions"><button class="ghost small-button" @click="startEdit(user)">编辑</button><button v-if="user.role === 'COORDINATOR'" class="ghost small-button" @click="editPermissions(user)">权限</button><button v-if="['ACTIVE','LOCKED'].includes(user.status)" class="ghost small-button" @click="reset(user)">重置密码</button><button v-if="user.status === 'PENDING_ACTIVATION'" class="ghost small-button" @click="activation(user)">生成激活码</button><button v-if="user.status === 'DISABLED'" class="secondary small-button" @click="reactivate(user)">重新启用</button><button v-else class="danger small-button" @click="disable(user)">停用</button></div></td></tr></tbody></table><div v-if="!items.length" class="empty">当前筛选下没有人员</div></div>
  </section>
  <section class="panel" style="margin-top:18px"><div class="panel-title"><h3>护理分组</h3><span class="muted">{{ groups.length }} 个分组</span></div><div class="inline-actions" style="padding:0 20px 20px"><button v-for="group in groups" :key="group.id" class="secondary small-button" @click="openGroup(group)">{{ group.name }} · {{ group._count?.users ?? 0 }} 人 · 编辑</button></div></section>

  <div v-if="showCreate || editing" class="modal-backdrop"><form class="modal" @submit.prevent="editing ? saveEdit() : create()"><div class="modal-head"><h3>{{ editing ? '编辑人员账号' : '新增人员' }}</h3><button type="button" @click="showCreate = false; editing = null">×</button></div><div class="form-grid"><label class="field">工号<input v-model="form.employeeNo" required maxlength="64" /></label><label class="field">姓名<input v-model="form.name" required maxlength="64" /></label><label class="field">角色<select v-model="form.role"><option value="NURSE">护士</option><option value="COORDINATOR">协管员</option><option value="HEAD_NURSE">护士长</option></select></label><label class="field">护理分组<select v-model="form.primaryGroupId"><option value="">暂不分组</option><option v-for="group in groups.filter((item:any) => item.enabled)" :key="group.id" :value="group.id">{{ group.name }}</option></select></label></div><div class="page-actions" style="margin-top:20px;justify-content:flex-end"><button type="button" class="secondary" @click="showCreate = false; editing = null">取消</button><button class="primary">{{ editing ? '保存修改' : '创建并生成激活码' }}</button></div></form></div>
  <div v-if="permissionTarget" class="modal-backdrop"><form class="modal" @submit.prevent="savePermissions"><div class="modal-head"><h3>编辑 {{ permissionTarget.name }} 的权限</h3><button type="button" @click="permissionTarget = null">×</button></div><p class="muted">仅协管员可配置管理权限。</p><div class="permission-grid"><label v-for="option in permissionOptions" :key="option.code"><input v-model="selectedPermissions" type="checkbox" :value="option.code" /> {{ option.name }}</label></div><div class="page-actions" style="margin-top:20px;justify-content:flex-end"><button type="button" class="secondary" @click="permissionTarget = null">取消</button><button class="primary">保存权限</button></div></form></div>
  <div v-if="editingGroup" class="modal-backdrop"><form class="modal" @submit.prevent="saveGroup"><div class="modal-head"><h3>{{ editingGroup.id ? '编辑护理分组' : '新增护理分组' }}</h3><button type="button" @click="editingGroup = null">×</button></div><div class="form-grid"><label class="field">分组代码<input v-model="groupForm.code" required maxlength="32" /></label><label class="field">分组名称<input v-model="groupForm.name" required maxlength="64" /></label><label class="field full"><input v-model="groupForm.enabled" type="checkbox" /> 启用该分组</label></div><div class="page-actions" style="margin-top:20px;justify-content:flex-end"><button type="button" class="secondary" @click="editingGroup = null">取消</button><button class="primary">保存分组</button></div></form></div>
  <div v-if="showBulk" class="modal-backdrop"><form class="modal" @submit.prevent="importRows"><div class="modal-head"><h3>批量导入人员</h3><button type="button" @click="showBulk = false">×</button></div><p class="muted">每行格式：工号,姓名,角色。角色填写护士、协管员或护士长。</p><textarea v-model="bulk" style="width:100%;min-height:240px" placeholder="001,张护士,护士"></textarea><div class="page-actions" style="margin-top:20px;justify-content:flex-end"><button type="button" class="secondary" @click="showBulk = false">取消</button><button class="primary">开始导入</button></div></form></div>
  <div v-if="activationCode" class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>一次性验证码</h3><button @click="activationCode = ''">×</button></div><p>工号：<b>{{ createdEmployeeNo }}</b></p><div class="code-box">{{ activationCode }}</div><p class="muted">验证码仅展示一次，有效期 24 小时，请通过安全方式转交本人。</p><button class="primary wide" @click="activationCode = ''">我已妥善记录</button></div></div>
</template>

<style scoped>
.permission-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:18px; }
.permission-grid label { display:flex; align-items:center; gap:7px; padding:10px; border:1px solid #dce9e9; border-radius:10px; }
@media (max-width:600px) { .permission-grid { grid-template-columns:1fr; } }
</style>
