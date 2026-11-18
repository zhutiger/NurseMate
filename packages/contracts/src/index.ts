export interface ApiResponse<T> {
  data: T;
  requestId: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
}

export type ClientPlatform = 'MINI_PROGRAM' | 'H5' | 'ADMIN_WEB';
export type UserRole = 'HEAD_NURSE' | 'COORDINATOR' | 'NURSE';
export type NoticeStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'WITHDRAWN' | 'CANCELLED';
export type TaskRecordStatus = 'PENDING' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'COMPLETED' | 'EXCLUDED';
