<script setup lang="ts">
import { ref } from 'vue';
import { activate, login, resetPassword, saveSession } from '../../services/api';
import { currentPlatform } from '../../platform';

const mode = ref<'login' | 'activate' | 'reset'>('login');
const employeeNo = ref('');
const password = ref('');
const activationCode = ref('');
const resetCode = ref('');
const submitting = ref(false);

async function submit() {
  if (!employeeNo.value || !password.value || (mode.value === 'activate' && !activationCode.value) || (mode.value === 'reset' && !resetCode.value)) {
    return uni.showToast({ title: '请完整填写信息', icon: 'none' });
  }
  submitting.value = true;
  try {
    if (mode.value === 'reset') {
      await resetPassword({ employeeNo: employeeNo.value.trim(), resetCode: resetCode.value.trim(), newPassword: password.value });
      uni.showToast({ title: '密码已重置，请登录', icon: 'success' });
      mode.value = 'login'; password.value = ''; resetCode.value = '';
      return;
    }
    const clientPlatform = currentPlatform() === 'mp-weixin' ? 'MINI_PROGRAM' : 'H5';
    const result = mode.value === 'login'
      ? await login({ employeeNo: employeeNo.value.trim(), password: password.value, clientPlatform, deviceName: '呼吸通客户端' })
      : await activate({ employeeNo: employeeNo.value.trim(), activationCode: activationCode.value.trim(), password: password.value, clientPlatform, deviceName: '呼吸通客户端' });
    saveSession(result);
    uni.reLaunch({ url: '/pages/index/index' });
  } catch (error: any) {
    uni.showToast({ title: error.message ?? '操作失败', icon: 'none' });
  } finally { submitting.value = false; }
}
</script>

<template>
  <view class="login-page">
    <view class="brand-block"><view class="logo">HXT</view><text class="title">呼吸通</text><text class="subtitle">广东医科大学附属医院 · 科室内部版</text></view>
    <view class="login-card">
      <view class="switch"><text :class="{ active: mode === 'login' }" @tap="mode='login'">账号登录</text><text :class="{ active: mode === 'activate' }" @tap="mode='activate'">首次激活</text><text :class="{ active: mode === 'reset' }" @tap="mode='reset'">重置密码</text></view>
      <text class="label">工号</text><input v-model="employeeNo" class="input" placeholder="请输入工号" />
      <text v-if="mode === 'activate'" class="label">激活码</text><input v-if="mode === 'activate'" v-model="activationCode" class="input" placeholder="请输入一次性激活码" />
      <text v-if="mode === 'reset'" class="label">重置码</text><input v-if="mode === 'reset'" v-model="resetCode" class="input" placeholder="请输入管理员提供的一次性重置码" />
      <text class="label">{{ mode === 'reset' ? '新密码' : '密码' }}</text><input v-model="password" class="input" password :placeholder="mode === 'login' ? '请输入密码' : '至少10位，包含字母和数字'" />
      <button class="primary-btn submit" :loading="submitting" @tap="submit">{{ mode === 'login' ? '登录' : mode === 'activate' ? '激活并登录' : '确认重置密码' }}</button>
      <text class="tip">账号由护士长预先创建。激活码或密码问题请联系科室管理员。</text>
    </view>
  </view>
</template>

<style scoped>
.login-page { min-height:100vh; box-sizing:border-box; padding:120rpx 40rpx 60rpx; background:linear-gradient(165deg,#e3f5f3,#f8fbfa 52%); }
.brand-block { display:flex; flex-direction:column; align-items:center; margin-bottom:55rpx; }.logo { display:flex;align-items:center;justify-content:center;width:116rpx;height:116rpx;color:#fff;font-size:34rpx;font-weight:800;border-radius:34rpx;background:linear-gradient(135deg,#007f95,#00a6b2);box-shadow:0 22rpx 50rpx rgba(0,127,149,.22); }
.title { margin-top:22rpx;color:#006e83;font-size:48rpx;font-weight:800; }.subtitle { margin-top:8rpx;color:#698488;font-size:23rpx; }
.login-card { padding:38rpx; border-radius:32rpx; background:#fff; box-shadow:0 24rpx 70rpx rgba(0,91,112,.1); }.switch { display:flex; margin-bottom:34rpx; border-bottom:1px solid #e6eeee; }.switch text { flex:1; padding:20rpx; color:#829498; text-align:center; }.switch .active { color:#007f95; font-weight:700; border-bottom:4rpx solid #00a6b2; }
.label { display:block;margin:24rpx 0 12rpx;color:#45646a;font-size:25rpx; }.input { height:88rpx;padding:0 24rpx;border:1px solid #dce8e9;border-radius:16rpx;background:#f8fbfb; }.submit { margin-top:38rpx; }.tip { display:block;margin-top:26rpx;color:#84969a;font-size:22rpx;line-height:1.7;text-align:center; }
</style>
