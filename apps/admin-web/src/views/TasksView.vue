<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, download, post, uploadTaskFile } from '../api';
import { dateTime, label } from '../format';

const props = defineProps<{ permissions: string[] }>();
const canManage = (permission: string) => props.permissions.includes('*') || props.permissions.includes(permission);

function defaultDeadline() {
  const date = new Date(Date.now() + 48 * 3600000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const items = ref<any[]>([]); const status = ref(''); const loading = ref(false); const error = ref('');
const page = ref(1); const totalPages = ref(1); const selectedIds = ref<string[]>([]);
const batchAction = ref<'' | 'close' | 'cancel'>('');
const batchBusy = ref(false); const batchResult = ref('');
const now = ref(Date.now()); let clock: ReturnType<typeof setInterval> | undefined;
const showCreate = ref(false); const selected = ref<any>(null); const records = ref<any>({ items: [], summary: {} });
const recordFilter = ref<'ALL' | 'UNFINISHED' | 'COMPLETED'>('ALL');
const form = ref({ title: '', content: '', level: 'IMPORTANT', completionMode: 'REVIEW', deadlineLocal: defaultDeadline() });
const attachmentFiles = ref<File[]>([]); const publishing = ref(false);
const pending = computed(() => records.value.items.filter((item: any) => ['PENDING', 'RETURNED'].includes(item.recordStatus)));
const completedStatuses = ['COMPLETED', 'APPROVED'];
const detailCounts = computed(() => {
  const total = records.value.summary?.total ?? 0;
  const counts = records.value.summary?.counts ?? {};
  const completed = (counts.COMPLETED ?? 0) + (counts.APPROVED ?? 0);
  return { total, completed, unfinished: total - completed, pendingReview: counts.SUBMITTED ?? 0 };
});
const visibleRecords = computed(() => records.value.items.filter((item: any) => recordFilter.value === 'ALL'
  || (recordFilter.value === 'COMPLETED' ? completedStatuses.includes(item.recordStatus) : !completedStatuses.includes(item.recordStatus))));
const selectedItems = computed(() => items.value.filter((item: any) => selectedIds.value.includes(item.id)));
const allVisibleSelected = computed(() => items.value.length > 0 && items.value.every((item: any) => selectedIds.value.includes(item.id)));
const selectableFor = (action: '' | 'close' | 'cancel') => action ? selectedItems.value.filter((item: any) => item.status === (action === 'close' ? 'PUBLISHED' : 'DRAFT')) : [];
const levelTone = (value: string) => ({ NORMAL: 'tone-normal', IMPORTANT: 'tone-important', URGENT: 'tone-urgent' } as Record<string, string>)[value] ?? 'tone-neutral';
const statusTone = (value: string) => ({ DRAFT: 'tone-draft', PUBLISHED: 'tone-published', CLOSED: 'tone-closed', WITHDRAWN: 'tone-withdrawn', CANCELLED: 'tone-cancelled' } as Record<string, string>)[value] ?? 'tone-neutral';
function remaining(item: any) {
  if (item.status === 'DRAFT') return '未发布';
  if (['CLOSED', 'WITHDRAWN', 'CANCELLED'].includes(item.status)) return '已结束';
  const deadline = Date.parse(item.deadline);
  if (!Number.isFinite(deadline)) return '—';
  const diff = deadline - now.value;
  const seconds = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const duration = `${days ? `${days}天 ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return diff >= 0 ? `剩余 ${duration}` : `已逾期 ${duration}`;
}

async function load() {
  loading.value = true; error.value = '';
  try {
    const query = status.value ? `&status=${status.value}` : '';
    const result = await api(`/tasks?page=${page.value}&pageSize=100${query}`);
    items.value = result.items ?? [];
    totalPages.value = Math.max(1, result.page?.totalPages ?? 1);
    selectedIds.value = selectedIds.value.filter((id) => items.value.some((item: any) => item.id === id));
  }
  catch (cause: any) { error.value = cause.message; }
  finally { loading.value = false; }
}

function changeStatus() { page.value = 1; selectedIds.value = []; batchResult.value = ''; load(); }
function changePage(next: number) { if (next < 1 || next > totalPages.value) return; page.value = next; selectedIds.value = []; load(); }
function changeBatchAction() { selectedIds.value = []; batchResult.value = ''; }
function toggleAll() { selectedIds.value = allVisibleSelected.value ? [] : items.value.map((item: any) => item.id); }
function toggleOne(id: string) { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((selected) => selected !== id) : [...selectedIds.value, id]; }

async function batchChange() {
  const action = batchAction.value;
  if (!action) return;
  const eligible = selectableFor(action);
  if (!eligible.length || batchBusy.value) return;
  const skipped = selectedItems.value.length - eligible.length;
  const verb = action === 'close' ? '关闭' : '取消';
  const warning = skipped ? `；另有 ${skipped} 项状态不适用，将跳过` : '';
  if (!confirm(`确定批量${verb} ${eligible.length} 项任务${warning}？此操作会记录每项任务的历史和审计。`)) return;
  batchBusy.value = true; batchResult.value = '';
  try {
    const outcomes = await Promise.allSettled(eligible.map((item: any) => action === 'close'
      ? post(`/tasks/${item.id}/close`, { reason: '管理员批量关闭' })
      : api(`/tasks/${item.id}`, { method: 'DELETE' })));
    const succeeded = eligible.filter((_: any, index: number) => outcomes[index]?.status === 'fulfilled');
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected') as PromiseRejectedResult[];
    selectedIds.value = selectedIds.value.filter((id) => !succeeded.some((item: any) => item.id === id));
    await load();
    batchResult.value = `已${verb} ${succeeded.length} 项；跳过 ${skipped} 项；失败 ${failed.length} 项。${failed.length ? `失败原因：${failed[0]?.reason?.message ?? '请重试'}` : ''}`;
  } finally { batchBusy.value = false; }
}

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const next = Array.from(input.files ?? []);
  if (attachmentFiles.value.length + next.length > 9) { alert('最多添加 9 个附件'); input.value = ''; return; }
  attachmentFiles.value.push(...next); input.value = '';
}

async function create() {
  if (publishing.value) return;
  const deadline = new Date(form.value.deadlineLocal);
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) return alert('请选择晚于当前时间的完成截止时间');
  publishing.value = true;
  try {
    const selection = { mode: 'ALL_ACTIVE' };
    const preview = await post('/tasks/assignee-preview', selection);
    if (!confirm(`确认向 ${preview.assigneeCount} 人发布任务？完成截止时间：${dateTime(deadline.toISOString())}`)) return;
    const uploaded = [];
    for (const file of attachmentFiles.value) uploaded.push(await uploadTaskFile(file));
    const draft = await post('/tasks', {
      title: form.value.title.trim(), content: form.value.content.trim(), level: form.value.level,
      completionMode: form.value.completionMode, feedbackRequired: form.value.completionMode === 'REVIEW',
      attachmentRequired: false, deadlineAt: deadline.toISOString(), assigneeSelection: selection,
      attachmentFileIds: uploaded.map((file: any) => file.id),
    });
    await post(`/tasks/${draft.id}/publish`);
    showCreate.value = false; attachmentFiles.value = [];
    form.value = { title: '', content: '', level: 'IMPORTANT', completionMode: 'REVIEW', deadlineLocal: defaultDeadline() };
    await load();
  } catch (cause: any) { alert(cause.message); }
  finally { publishing.value = false; }
}

async function open(item: any) {
  try {
    const [detail, progress] = await Promise.all([
      api(`/tasks/${item.id}`), api(`/tasks/${item.id}/records?pageSize=100`),
    ]);
    records.value = progress; recordFilter.value = 'ALL'; selected.value = detail;
  }
  catch (cause: any) { alert(cause.message); }
}
async function review(record: any, action: 'APPROVE' | 'RETURN') {
  const submission = record.submissions?.at(-1); if (!submission) return;
  const comment = action === 'RETURN' ? prompt('请输入退回原因') : '审核通过';
  if (action === 'RETURN' && !comment) return;
  try { await post(`/tasks/${selected.value.id}/records/${record.id}/review`, { submissionId: submission.id, action, comment }); await open(selected.value); }
  catch (cause: any) { alert(cause.message); }
}
async function remind() {
  if (!selected.value || !pending.value.length) return;
  try { await post(`/tasks/${selected.value.id}/reminders`, { targetUserIds: pending.value.map((item: any) => item.assignee.id), channels: ['IN_APP'], note: '管理员后台人工催办' }); alert('催办已记录'); }
  catch (cause: any) { alert(cause.message); }
}
async function closeTask() {
  if (!confirm('关闭后不再接受新的提交，确定关闭？')) return;
  try { await post(`/tasks/${selected.value.id}/close`, { reason: '管理员后台关闭' }); selected.value = null; await load(); }
  catch (cause: any) { alert(cause.message); }
}
async function exportRows() {
  try { const job = await post('/exports', { type: 'TASK_RECORDS', filters: selected.value ? { taskId: selected.value.id } : {} }); await download(job.downloadUrl.replace('/api/v1', ''), '任务处理明细.csv'); }
  catch (cause: any) { alert(cause.message); }
}
async function downloadFile(file: any) {
  try { await download(`/files/${file.id}/download`, file.originalName ?? file.fileName ?? '任务附件'); }
  catch (cause: any) { alert(cause.message); }
}
onMounted(() => { load(); clock = setInterval(() => { now.value = Date.now(); }, 1000); });
onUnmounted(() => { if (clock) clearInterval(clock); });
</script>

<template>
  <div class="page-head"><div><h3>任务列表</h3><span class="muted">区分待完成、已提交、退回补充和审核通过</span></div><div class="page-actions"><button class="secondary" @click="exportRows">导出明细</button><button class="primary" @click="showCreate = true">＋ 发布任务</button></div></div>
  <section class="panel">
    <div class="toolbar"><select v-model="status" @change="changeStatus"><option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="CLOSED">已关闭</option><option value="WITHDRAWN">已撤回</option><option value="CANCELLED">已取消</option></select><span class="grow"></span><button class="ghost" @click="load">刷新</button></div>
    <div class="batch-toolbar">
      <label class="batch-choice">批量操作
        <select v-model="batchAction" :disabled="batchBusy" @change="changeBatchAction">
          <option value="">选择操作后勾选任务</option>
          <option v-if="canManage('task.manage')" value="close">关闭已发布任务</option>
          <option v-if="canManage('task.publish')" value="cancel">取消任务草稿</option>
        </select>
      </label>
      <template v-if="batchAction">
        <span class="muted">当前页 {{ items.length }} 项 · 已选 {{ selectedItems.length }} 项 · 可执行 {{ selectableFor(batchAction).length }} 项</span>
        <button :class="batchAction === 'cancel' ? 'danger small-button' : 'secondary small-button'" :disabled="batchBusy || !selectableFor(batchAction).length" @click="batchChange">执行批量{{ batchAction === 'close' ? '关闭' : '取消' }}</button>
      </template>
    </div>
    <p v-if="batchResult" class="batch-result" role="status">{{ batchResult }}</p>
    <p v-if="error" class="form-error">{{ error }} <button class="ghost small-button" @click="load">重试</button></p>
    <div v-if="loading" class="empty">正在加载…</div>
    <div v-else class="table-wrap"><table class="data-table task-list"><thead><tr>
      <th v-if="batchAction" class="select-column"><input type="checkbox" :checked="allVisibleSelected" :disabled="batchBusy || !items.length" aria-label="选择当前页任务" @change="toggleAll" /></th>
      <th>任务标题</th><th>模式</th><th>级别</th><th>状态</th><th>任务发起时间</th><th>截止时间</th><th>未完成人数</th><th>已完成人数</th><th>剩余时间</th><th>操作</th>
    </tr></thead><tbody><tr v-for="item in items" :key="item.id">
      <td v-if="batchAction"><input type="checkbox" :checked="selectedIds.includes(item.id)" :disabled="batchBusy" :aria-label="`选择任务：${item.title}`" @change="toggleOne(item.id)" /></td>
      <td><button class="link" @click="open(item)">{{ item.title }}</button></td>
      <td>{{ label(item.completionMode) }}</td>
      <td><span :class="['tag', levelTone(item.level)]">{{ label(item.level) }}</span></td>
      <td><span :class="['tag', statusTone(item.status)]">{{ label(item.status) }}</span></td>
      <td>{{ item.publishedAt ? dateTime(item.publishedAt) : '未发布' }}</td>
      <td>{{ dateTime(item.deadline) }}</td>
      <td><span class="count unfinished">{{ item.unfinishedCount }}</span></td>
      <td><span class="count completed">{{ item.completedCount }}</span></td>
      <td :class="['remaining', item.status === 'PUBLISHED' && Date.parse(item.deadline) < now ? 'overdue-time' : '']">{{ remaining(item) }}</td>
      <td><button class="ghost small-button" @click="open(item)">进度与审核</button></td>
    </tr></tbody></table><div v-if="!items.length" class="empty">暂无任务</div></div>
    <div v-if="totalPages > 1" class="pager"><button class="ghost small-button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button><span>第 {{ page }} / {{ totalPages }} 页</span><button class="ghost small-button" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button></div>
  </section>
  <div v-if="showCreate" class="modal-backdrop"><form class="modal large" @submit.prevent="create"><div class="modal-head"><h3>发布新任务</h3><button type="button" @click="showCreate = false">×</button></div><div class="form-grid"><label class="field full">任务标题<input v-model="form.title" required maxlength="200" /></label><label class="field full">执行要求<textarea v-model="form.content" required maxlength="20000"></textarea></label><label class="field">完成方式<select v-model="form.completionMode"><option value="REVIEW">提交后审核</option><option value="SIMPLE">点击即完成</option></select></label><label class="field">重要程度<select v-model="form.level"><option value="NORMAL">普通</option><option value="IMPORTANT">重要</option><option value="URGENT">紧急</option></select></label><label class="field">完成截止时间（年月日时分）<input v-model="form.deadlineLocal" type="datetime-local" required /></label><label class="field full">任务附件（图片、PDF、Word，单个不超过 10 MB，最多 9 个）<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" multiple @change="chooseFiles" /></label></div><div v-if="attachmentFiles.length" class="file-list"><div v-for="(file, index) in attachmentFiles" :key="`${file.name}-${index}`"><span>{{ file.name }}</span><button type="button" class="ghost small-button" @click="attachmentFiles.splice(index, 1)">移除</button></div></div><p class="muted">请勿上传患者病历、身份证或具体病情资料。</p><div class="page-actions" style="margin-top:20px;justify-content:flex-end"><button type="button" class="secondary" @click="showCreate = false">取消</button><button class="primary" :disabled="publishing">{{ publishing ? '正在上传并发布…' : '预览人数并发布' }}</button></div></form></div>
  <div v-if="selected" class="modal-backdrop"><div class="modal large task-detail">
    <div class="modal-head"><div><h3>{{ selected.title }}</h3><span class="muted">{{ label(selected.status) }} · {{ label(selected.completionMode) }} · 发起于 {{ selected.publishedAt ? dateTime(selected.publishedAt) : '未发布' }}</span></div><button @click="selected = null">×</button></div>
    <div class="progress-cards">
      <div><span>负责人总数</span><strong>{{ detailCounts.total }}</strong></div>
      <div><span>已完成人数</span><strong class="done-number">{{ detailCounts.completed }}</strong></div>
      <div><span>未完成人数</span><strong class="pending-number">{{ detailCounts.unfinished }}</strong></div>
      <div><span>其中待审核</span><strong>{{ detailCounts.pendingReview }}</strong></div>
    </div>
    <p class="muted progress-note">已提交待审核仍计入未完成；已排除人员不计入统计。</p>
    <div class="detail-block">{{ selected.content }}</div>
    <div v-if="selected.attachments?.length" class="file-list"><strong>任务附件</strong><div v-for="item in selected.attachments" :key="item.file.id"><span>{{ item.file.originalName }}</span><button class="ghost small-button" @click="downloadFile(item.file)">下载</button></div></div>
    <div class="page-actions detail-actions"><button v-if="pending.length" class="primary" @click="remind">催办待完成 {{ pending.length }} 人</button><button class="secondary" @click="exportRows">导出本任务</button><button v-if="selected.status === 'PUBLISHED'" class="danger" @click="closeTask">关闭任务</button></div>
    <div class="personnel-head"><h4>人员明细</h4><select v-model="recordFilter" aria-label="筛选任务人员"><option value="ALL">全部人员</option><option value="UNFINISHED">未完成</option><option value="COMPLETED">已完成</option></select></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>工号</th><th>执行状态</th><th>提交反馈</th><th>完成/提交时间</th><th>审核</th></tr></thead><tbody><tr v-for="record in visibleRecords" :key="record.id"><td>{{ record.assignee.name }}</td><td>{{ record.assignee.employeeNo }}</td><td><span :class="['tag', completedStatuses.includes(record.recordStatus) ? 'success' : record.derivedStatus?.startsWith('OVERDUE') ? 'overdue' : 'neutral']">{{ label(record.derivedStatus ?? record.recordStatus) }}</span></td><td>{{ record.submissions?.at(-1)?.feedback ?? '—' }}</td><td>{{ dateTime(record.completedAt ?? record.submissions?.at(-1)?.submittedAt) }}</td><td><div v-if="record.recordStatus === 'SUBMITTED'" class="inline-actions"><button class="secondary small-button" @click="review(record, 'RETURN')">退回</button><button class="primary small-button" @click="review(record, 'APPROVE')">通过</button></div><span v-else>—</span></td></tr></tbody></table><div v-if="!visibleRecords.length" class="empty">当前筛选下暂无人员</div></div>
  </div></div>
</template>

<style scoped>
.file-list { margin:14px 0; padding:12px; border:1px solid #dce9e9; border-radius:12px; }
.file-list > div { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:7px 0; }
.file-list span { overflow-wrap:anywhere; }
.batch-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:9px; margin-bottom:15px; }
.batch-toolbar .muted { margin-right:auto; font-size:13px; }
.batch-toolbar button:disabled { opacity:.45; cursor:not-allowed; }
.batch-choice { display:flex; align-items:center; gap:10px; color:#4b646b; font-size:13px; font-weight:700; }
.batch-choice select { min-width:210px; }
.batch-result { padding:10px 12px; border-radius:9px; background:#e8f5ef; color:#276b54; font-size:13px; }
.select-column { width:42px; }
.data-table input[type="checkbox"] { width:16px; height:16px; accent-color:#0086a1; }
.task-list { min-width:1250px; }
.task-list th,.task-list td { white-space:nowrap; }
.task-list .link { white-space:normal; text-align:left; min-width:180px; max-width:280px; }
.count { display:inline-block; min-width:30px; text-align:center; padding:4px 8px; border-radius:9px; font-weight:700; }
.count.unfinished { color:#a85b19; background:#fff0df; }
.count.completed { color:#25765a; background:#e5f5ed; }
.remaining { font-variant-numeric:tabular-nums; color:#275f9e; font-weight:700; }
.remaining.overdue-time { color:#b3403e; }
.progress-cards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:16px 0 8px; }
.progress-cards > div { padding:15px; border:1px solid #dce9e9; border-radius:12px; background:#f7fbfb; }
.progress-cards span,.progress-cards strong { display:block; }
.progress-cards span { color:#60777e; font-size:13px; }
.progress-cards strong { margin-top:6px; font-size:27px; color:#006b80; }
.progress-cards .done-number { color:#25765a; }
.progress-cards .pending-number { color:#a85b19; }
.progress-note { font-size:12px; margin:0 0 16px; }
.detail-actions { margin-bottom:15px; }
.personnel-head { display:flex; align-items:center; justify-content:space-between; margin:15px 0 10px; }
.personnel-head h4 { margin:0; }
.pager { display:flex; align-items:center; justify-content:flex-end; gap:10px; padding-top:14px; color:#60777e; font-size:13px; }
.tag.tone-normal { background:#e9f2f5; color:#35677a; }
.tag.tone-important { background:#fff0d8; color:#965c16; }
.tag.tone-urgent { background:#ffebea; color:#b3403e; }
.tag.tone-draft { background:#eef1f2; color:#5b6e74; }
.tag.tone-published { background:#e5effc; color:#275f9e; }
.tag.tone-closed { background:#e5f5ed; color:#25765a; }
.tag.tone-withdrawn { background:#fff0df; color:#a85b19; }
.tag.tone-cancelled { background:#f1eafa; color:#71539a; }
</style>
