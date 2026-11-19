<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api, hasSession, login, logout } from './api';
import AuditView from './views/AuditView.vue';
import DashboardView from './views/DashboardView.vue';
import NoticesView from './views/NoticesView.vue';
import TasksView from './views/TasksView.vue';
import UsersView from './views/UsersView.vue';

type Section = 'dashboard' | 'notices' | 'tasks' | 'users' | 'audit';
const section = ref<Section>('dashboard');
const authenticated = ref(hasSession());
const me = ref<any>(null);
const employeeNo = ref('admin');
const password = ref('');
const resetCode = ref('');
const resetMode = ref(false);
const error = ref('');
const notice = ref('');
const working = ref(false);

const sections: Array<{ key: Section; label: string; icon: string }> = [
  { key: 'dashboard', label: '管理看板', icon: '▦' },
  { key: 'notices', label: '通知管理', icon: '●' },
  { key: 'tasks', label: '任务管理', icon: '✓' },
  { key: 'users', label: '人员管理', icon: '♙' },
  { key: 'audit', label: '审计日志', icon: '≡' },
];

async function loadMe() {
  try {
    me.value = await api('/me');
    if (!['HEAD_NURSE', 'COORDINATOR'].includes(me.value?.user?.role)) {
      throw new Error('当前账号没有管理端访问权限');
    }
  } catch (cause: any) {
    error.value = cause.message;
    authenticated.value = false;
  }
}

async function signIn() {
  error.value = '';
  notice.value = '';
  working.value = true;
  try {
    await login(employeeNo.value.trim(), password.value);
    authenticated.value = true;
    await loadMe();
  } catch (cause: any) {
    error.value = cause.message === 'CREDENTIALS_INVALID' ? '账号或密码不正确' : cause.message;
  } finally {
    working.value = false;
  }
}

async function submitReset() {
  error.value = ''; notice.value = ''; working.value = true;
  try {
    await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ employeeNo: employeeNo.value.trim(), resetCode: resetCode.value.trim(), newPassword: password.value }) });
    resetMode.value = false; resetCode.value = ''; password.value = '';
    notice.value = '密码已重置，请使用新密码登录';
  } catch (cause: any) { error.value = cause.message; }
  finally { working.value = false; }
}

async function signOut() {
  await logout();
  authenticated.value = false;
  me.value = null;
  password.value = '';
}

function expired() {
  authenticated.value = false;
  me.value = null;
  error.value = '登录已过期，请重新登录';
}

onMounted(() => {
  window.addEventListener('hzy-session-expired', expired);
  if (authenticated.value) loadMe();
});
onBeforeUnmount(() => window.removeEventListener('hzy-session-expired', expired));
</script>

<template>
  <div v-if="!authenticated" class="login-shell">
    <div class="login-brand">
      <div class="brand-mark">护</div>
      <div>
        <h1>护知音</h1>
        <p>护理消息与任务闭环管理平台</p>
      </div>
    </div>
    <form class="login-card" @submit.prevent="resetMode ? submitReset() : signIn()">
      <span class="eyebrow">HZY ADMIN</span>
      <h2>{{ resetMode ? '重置管理账号密码' : '管理端登录' }}</h2>
      <p class="muted">{{ resetMode ? '请输入管理员提供的一次性重置码' : '护士长与授权协管员使用统一账号登录' }}</p>
      <label>工号</label>
      <input v-model="employeeNo" autocomplete="username" placeholder="请输入工号" />
      <template v-if="resetMode"><label>重置码</label><input v-model="resetCode" required placeholder="请输入一次性重置码" /></template>
      <label>{{ resetMode ? '新密码' : '密码' }}</label>
      <input v-model="password" type="password" :autocomplete="resetMode ? 'new-password' : 'current-password'" :placeholder="resetMode ? '至少10位，包含字母和数字' : '请输入密码'" required />
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="notice" class="muted">{{ notice }}</p>
      <button class="primary wide" :disabled="working">{{ working ? '请稍候…' : resetMode ? '确认重置密码' : '登录管理后台' }}</button>
      <button type="button" class="ghost wide" @click="resetMode = !resetMode; error = ''; notice = ''">{{ resetMode ? '返回登录' : '使用重置码修改密码' }}</button>
      <p class="login-note">重要通知的推送、查看、确认与任务完成是不同状态，管理端将分别统计。</p>
    </form>
  </div>

  <div v-else class="admin-shell">
    <aside class="sidebar">
      <div class="side-brand"><span class="brand-mark small">护</span><div><b>护知音</b><small>HZY ADMIN</small></div></div>
      <nav>
        <button v-for="item in sections" :key="item.key" :class="{ active: section === item.key }" @click="section = item.key">
          <span>{{ item.icon }}</span>{{ item.label }}
        </button>
      </nav>
      <div class="side-foot"><p>{{ me?.user?.name }}</p><small>{{ me?.user?.employeeNo }} · {{ me?.user?.role === 'HEAD_NURSE' ? '护士长' : '协管员' }}</small><button @click="signOut">退出登录</button></div>
    </aside>
    <main class="main">
      <header class="topbar"><div><span class="eyebrow">呼吸与危重症医学科</span><h2>{{ sections.find((item) => item.key === section)?.label }}</h2></div><div class="status-dot"><i></i>系统运行正常</div></header>
      <DashboardView v-if="section === 'dashboard'" @navigate="section = $event" />
      <NoticesView v-else-if="section === 'notices'" />
      <TasksView v-else-if="section === 'tasks'" />
      <UsersView v-else-if="section === 'users'" />
      <AuditView v-else />
    </main>
  </div>
</template>
