export type PlatformName = 'mp-weixin' | 'h5' | 'other';

export function currentPlatform(): PlatformName {
  // #ifdef MP-WEIXIN
  return 'mp-weixin';
  // #endif
  // #ifdef H5
  return 'h5';
  // #endif
  return 'other';
}
