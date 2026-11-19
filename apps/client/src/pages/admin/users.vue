<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api } from '../../services/api';
import { label } from '../../services/display';

const users = ref<any[]>([]); const groups = ref<any[]>([]); const loading = ref(false); const error = ref('');
const statuses = ['', 'ACTIVE', 'PENDING_ACTIVATION', 'LOCKED', 'DISABLED'];
const statusLabels = ['全部账号状态', '在岗', '待激活', '已锁定', '已停用'];
const statusIndex = ref(0);
const roles = ['NURSE', 'COORDINATOR', 'HEAD_NURSE'];
const roleLabels = ['护士', '协管员', '护士长'];
const showForm = ref(false); const editingId = ref('');
const employeeNo = ref(''); const name = ref(''); const role = ref('NURSE'); const groupId = ref('');
const roleIndex = computed(() => Math.max(0, roles.indexOf(role.value)));
const groupIndex = computed(() => Math.max(0, groups.value.findIndex((group) => group.id === groupId.value) + 1));
const groupNames = computed(() => ['暂不分组', ...groups.value.map((group) => group.name)]);
const permissionTarget = ref<any>(null); const selectedPermissions = ref<string[]>([]);
const permissionOptions = [
  { code: 'notice.publish', name: '发布通知' }, { code: 'notice.stats', name: '通知统计' },
  { code: 'notice.remind', name: '通知催办' }, { code: 'notice.manage', name: '管理通知' },
  { code: 'task.publish', name: '发布任务' }, { code: 'task.stats', name: '任务统计' },
  { code: 'task.remind', name: '任务催办' }, { code: 'task.review', name: '审核任务' },
  { code: 'task.manage', name: '管理任务' }, { code: 'report.export', name: '导出记录' },
  { code: 'audit.view', name: '查看日志' },
];
const showGroupForm = ref(false); const editingGroupId = ref('');
const groupCode = ref(''); const groupName = ref(''); const groupEnabled = ref(true);

async function load() {
  loading.value = true; error.value = '';
  try {
    const query = statuses[statusIndex.value] ? `&status=${statuses[statusIndex.value]}` : '';
    const [result, groupResult]: any[] = await Promise.all([api(`/users?pageSize=100${query}`), api('/groups')]);
    users.value = result.items ?? []; groups.value = groupResult.items ?? groupResult;
  } catch (cause: any) { error.value = cause.message; }
  finally { loading.value = false; }
}
onShow(load);

function startCreate() { editingId.value = ''; employeeNo.value = ''; name.value = ''; role.value = 'NURSE'; groupId.value = ''; showForm.value = true; }
function startEdit(user: any) { editingId.value = user.id; employeeNo.value = user.employeeNo; name.value = user.name; role.value = user.role; groupId.value = user.primaryGroupId ?? ''; showForm.value = true; }
function chooseStatus(event: any) { statusIndex.value = Number(event.detail.value); load(); }
function chooseRole(event: any) { role.value = roles[Number(event.detail.value)] ?? 'NURSE'; }
function chooseGroup(event: any) { groupId.value = groups.value[Number(event.detail.value) - 1]?.id ?? ''; }
function onEmployeeInput(event: any) { employeeNo.value = String(event.detail.value ?? ''); }
function onNameInput(event: any) { name.value = String(event.detail.value ?? ''); }
function onPermissionChange(event: any) { selectedPermissions.value = event.detail.value ?? []; }
function onGroupCodeInput(event: any) { groupCode.value = String(event.detail.value ?? ''); }
function onGroupNameInput(event: any) { groupName.value = String(event.detail.value ?? ''); }
function onGroupEnabledChange(event: any) { groupEnabled.value = Boolean(event.detail.value); }
function showCode(employee: string, code: string) { uni.showModal({ title: '一次性验证码', content: `工号：${employee}\n验证码：${code}\n仅展示一次，有效期24小时，请安全转交本人。`, showCancel: false }); }

async function save() {
  if (!employeeNo.value.trim() || !name.value.trim()) return uni.showToast({ title: '请填写工号和姓名', icon: 'none' });
  try {
    const payload = { employeeNo: employeeNo.value.trim(), name: name.value.trim(), role: role.value, primaryGroupId: groupId.value || null };
    if (editingId.value) await api(`/users/${editingId.value}`, 'PUT', { ...payload, reason: '移动端编辑人员账号' });
    else {
      const user: any = await api('/users', 'POST', payload);
      const code: any = await api(`/users/${user.id}/activation-codes`, 'POST', { purpose: 'ACTIVATE_ACCOUNT', reason: '新增人员首次激活' });
      showCode(user.employeeNo, code.activationCode);
    }
    showForm.value = false; await load();
  } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); }
}

async function reasonPrompt(title: string): Promise<string | null> {
  const result: any = await new Promise((resolve) => uni.showModal({ title, editable: true, placeholderText: '请输入操作原因', success: resolve }));
  return result.confirm && result.content?.trim() ? result.content.trim() : null;
}
async function disable(user: any) { const reason = await reasonPrompt('停用账号'); if (!reason) return; try { await api(`/users/${user.id}`, 'PUT', { status: 'DISABLED', reason }); await load(); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
async function reactivate(user: any) {
  const reason = await reasonPrompt('重新启用并要求再次激活'); if (!reason) return;
  try {
    await api(`/users/${user.id}`, 'PUT', { status: 'PENDING_ACTIVATION', reason });
    const code: any = await api(`/users/${user.id}/activation-codes`, 'POST', { purpose: 'ACTIVATE_ACCOUNT', reason });
    showCode(user.employeeNo, code.activationCode); await load();
  } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); await load(); }
}
async function reset(user: any) { const reason = await reasonPrompt('重置密码'); if (!reason) return; try { const code: any = await api(`/users/${user.id}/activation-codes`, 'POST', { purpose: 'RESET_PASSWORD', reason }); showCode(user.employeeNo, code.activationCode); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
async function activation(user: any) { try { const code: any = await api(`/users/${user.id}/activation-codes`, 'POST', { purpose: 'ACTIVATE_ACCOUNT', reason: '重新生成激活码' }); showCode(user.employeeNo, code.activationCode); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
async function editPermissions(user: any) { try { const result: any = await api(`/users/${user.id}/permissions`); selectedPermissions.value = result.permissions ?? []; permissionTarget.value = user; } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
async function savePermissions() { try { await api(`/users/${permissionTarget.value.id}/permissions`, 'PUT', { permissions: selectedPermissions.value }); permissionTarget.value = null; uni.showToast({ title: '权限已保存', icon: 'success' }); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
function editGroup(group?: any) { editingGroupId.value = group?.id ?? ''; groupCode.value = group?.code ?? ''; groupName.value = group?.name ?? ''; groupEnabled.value = group?.enabled ?? true; showGroupForm.value = true; }
async function saveGroup() { try { const payload = { code: groupCode.value.trim(), name: groupName.value.trim(), enabled: groupEnabled.value }; await api(editingGroupId.value ? `/groups/${editingGroupId.value}` : '/groups', editingGroupId.value ? 'PUT' : 'POST', payload); showGroupForm.value = false; await load(); } catch (cause: any) { uni.showToast({ title: cause.message, icon: 'none' }); } }
</script>

<template><view class="page users-page">
  <view class="toolbar"><button class="primary-btn" @tap="startCreate">新增人员</button><button class="secondary-btn" @tap="editGroup()">新增分组</button></view>
  <picker :range="statusLabels" :value="statusIndex" @change="chooseStatus"><view class="status-picker">{{ statusLabels[statusIndex] }} ▾</view></picker>
  <view v-if="error" class="card error">{{ error }}<button class="secondary-btn" @tap="load">重新加载</button></view><view v-if="loading" class="empty">正在加载…</view>
  <view v-for="user in users" :key="user.id" class="card person"><view class="person-head"><view><text class="name">{{ user.name }}</text><text class="muted">工号：{{ user.employeeNo }} · {{ label(user.role) }}</text></view><text :class="user.status === 'ACTIVE' ? 'ok' : 'muted'">{{ label(user.status) }}</text></view><text class="muted">分组：{{ groups.find((group) => group.id === user.primaryGroupId)?.name ?? '未分组' }}</text><text v-if="user.disabledAt" class="disabled">最近停用：{{ new Date(user.disabledAt).toLocaleString('zh-CN') }} · {{ user.disabledReason || '未记录原因' }}</text><view class="actions"><button @tap="startEdit(user)">编辑</button><button v-if="user.role === 'COORDINATOR'" @tap="editPermissions(user)">权限</button><button v-if="['ACTIVE','LOCKED'].includes(user.status)" @tap="reset(user)">重置密码</button><button v-if="user.status === 'PENDING_ACTIVATION'" @tap="activation(user)">激活码</button><button v-if="user.status === 'DISABLED'" @tap="reactivate(user)">重新启用</button><button v-else class="danger" @tap="disable(user)">停用</button></view></view>
  <view v-if="!loading && !users.length" class="empty">当前筛选下没有人员</view>
  <view v-if="showForm" class="overlay"><view class="sheet"><view class="sheet-head"><text>{{ editingId ? '编辑人员账号' : '新增人员' }}</text><text @tap="showForm = false">关闭</text></view><text class="field-label">工号</text><input :value="employeeNo" @input="onEmployeeInput" /><text class="field-label">姓名</text><input :value="name" @input="onNameInput" /><text class="field-label">角色</text><picker :range="roleLabels" :value="roleIndex" @change="chooseRole"><view class="select">{{ roleLabels[roleIndex] }} ▾</view></picker><text class="field-label">护理分组</text><picker :range="groupNames" :value="groupIndex" @change="chooseGroup"><view class="select">{{ groupNames[groupIndex] }} ▾</view></picker><button class="primary-btn save" @tap="save">{{ editingId ? '保存修改' : '创建并生成激活码' }}</button></view></view>
  <view v-if="permissionTarget" class="overlay"><view class="sheet"><view class="sheet-head"><text>编辑 {{ permissionTarget.name }} 的权限</text><text @tap="permissionTarget = null">关闭</text></view><checkbox-group @change="onPermissionChange"><label v-for="option in permissionOptions" :key="option.code" class="permission"><checkbox :value="option.code" :checked="selectedPermissions.includes(option.code)" color="#00879c" />{{ option.name }}</label></checkbox-group><button class="primary-btn save" @tap="savePermissions">保存权限</button></view></view>
  <view class="card"><text class="section-title">护理分组</text><view v-for="group in groups" :key="group.id" class="group-row" @tap="editGroup(group)"><text>{{ group.name }} · {{ group._count?.users ?? 0 }} 人</text><text>编辑 ›</text></view></view>
  <view v-if="showGroupForm" class="overlay"><view class="sheet"><view class="sheet-head"><text>{{ editingGroupId ? '编辑护理分组' : '新增护理分组' }}</text><text @tap="showGroupForm = false">关闭</text></view><text class="field-label">分组代码</text><input :value="groupCode" @input="onGroupCodeInput" /><text class="field-label">分组名称</text><input :value="groupName" @input="onGroupNameInput" /><view class="group-row"><text>启用该分组</text><switch :checked="groupEnabled" @change="onGroupEnabledChange" color="#00879c" /></view><button class="primary-btn save" @tap="saveGroup">保存分组</button></view></view>
</view></template>

<style scoped>
.toolbar{display:grid;grid-template-columns:1fr 1fr;gap:12rpx}.toolbar button{font-size:25rpx}.status-picker{margin:22rpx 0;padding:20rpx;border:1px solid #c9dfe0;border-radius:14rpx;background:#fff;color:#225660}.person-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12rpx}.name,.muted,.disabled{display:block}.name{font-size:31rpx;font-weight:700}.muted{margin-top:8rpx;color:#71868a;font-size:23rpx}.ok{color:#168269}.disabled{margin-top:12rpx;color:#a66742;font-size:22rpx}.actions{display:flex;flex-wrap:wrap;gap:8rpx;margin-top:20rpx}.actions button{margin:0;padding:4rpx 14rpx;border:1px solid #cee2e3;border-radius:10rpx;background:#f6fbfb;color:#007f95;font-size:21rpx;line-height:2}.actions button.danger{color:#b95b43}.error{color:#a44d37}.overlay{position:fixed;inset:0;z-index:20;display:flex;align-items:flex-end;background:rgba(7,35,43,.45)}.sheet{box-sizing:border-box;width:100%;max-height:88vh;overflow:auto;padding:30rpx;border-radius:28rpx 28rpx 0 0;background:#fff}.sheet-head{display:flex;justify-content:space-between;margin-bottom:20rpx;font-size:30rpx;font-weight:700}.sheet-head text:last-child{font-size:24rpx;color:#007f95}.field-label{display:block;margin:18rpx 0 8rpx;color:#36575e}.sheet input,.select{box-sizing:border-box;width:100%;padding:20rpx;border:1px solid #c9dfe0;border-radius:12rpx;background:#fbfdfd}.save{margin-top:28rpx}.permission,.group-row{display:flex;align-items:center;justify-content:space-between;padding:16rpx 0;border-bottom:1px solid #edf1f1}.permission{justify-content:flex-start}.group-row text:last-child{color:#007f95}
</style>
