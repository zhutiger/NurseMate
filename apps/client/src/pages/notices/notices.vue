<script setup lang="ts">
const uni = (globalThis as any).uni;
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { api, hasSession } from '../../services/api';
import { label } from '../../services/display';
const items = ref<any[]>([]); const loading = ref(true); const filter = ref('');
async function load() { if (!hasSession()) return uni.reLaunch({url:'/pages/login/login'}); loading.value=true; try { const result:any=await api(`/me/notices${filter.value?`?status=${filter.value}`:''}`); items.value=result.items??[]; } catch(e:any){uni.showToast({title:e.message,icon:'none'});} finally{loading.value=false;} }
function change(value:string){filter.value=value;load();} onShow(load);
</script>
<template><view class="page"><view class="filters"><text :class="{active:!filter}" @tap="change('')">全部</text><text :class="{active:filter==='UNSEEN'}" @tap="change('UNSEEN')">未查看</text><text :class="{active:filter==='VIEWED'}" @tap="change('VIEWED')">待确认</text><text :class="{active:filter==='CONFIRMED'}" @tap="change('CONFIRMED')">已确认</text></view>
<view v-if="loading" class="empty">正在加载…</view><view v-else-if="!items.length" class="empty">暂无消息</view>
<view v-for="item in items" :key="item.id" class="card row" @tap="uni.navigateTo({url:`/pages/notices/detail?id=${item.id}`})"><view :class="['level',item.level.toLowerCase()]">{{ label(item.level) }}</view><view class="content"><text class="title">{{item.title}}</text><text class="muted">{{ label(item.recipientStatus) }} · {{item.deadlineAt?new Date(item.deadlineAt).toLocaleString('zh-CN'):'无截止时间'}}</text></view><text class="arrow">›</text></view></view></template>
<style scoped>.filters{display:flex;gap:14rpx;margin-bottom:25rpx;overflow:auto}.filters text{padding:14rpx 22rpx;white-space:nowrap;color:#667f84;border-radius:24rpx;background:#fff}.filters .active{color:#fff;background:#007f95}.row{display:flex;align-items:center}.level{padding:10rpx 14rpx;font-size:21rpx;border-radius:12rpx;background:#e6eeee}.level.important{color:#b85f29;background:#fff0e4}.level.urgent{color:#b73d36;background:#ffe9e6}.content{flex:1;margin-left:20rpx}.title,.muted{display:block}.title{margin-bottom:10rpx;font-weight:700}.muted{font-size:22rpx}.arrow{font-size:42rpx;color:#9aaeb2}</style>
