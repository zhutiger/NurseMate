<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => console.info('护知音已启动'));
</script>

<style>
page { background: #f3f7f7; color: #173a42; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
button { border-radius: 16rpx; }
.page { min-height: 100vh; box-sizing: border-box; padding: 28rpx; }
.card { margin-bottom: 22rpx; padding: 28rpx; border: 1px solid rgba(0, 91, 112, .08); border-radius: 24rpx; background: #fff; box-shadow: 0 10rpx 32rpx rgba(0, 91, 112, .06); }
.primary-btn { color: #fff; border: 0; background: linear-gradient(135deg, #007f95, #00a6b2); }
.secondary-btn { color: #007f95; border: 1px solid #9cd4d8; background: #effafa; }
.muted { color: #71868a; }
.danger { color: #c9623a; }
.section-title { margin: 20rpx 0; font-size: 30rpx; font-weight: 700; }
.empty { padding: 80rpx 20rpx; color: #829397; text-align: center; }
input, textarea, picker { box-sizing: border-box; width: 100%; }
</style>
