import { z } from 'zod';

export const passwordSchema = z.string().min(10).max(72).regex(/[A-Za-z]/).regex(/[0-9]/);
export const employeeNoSchema = z.string().trim().min(1).max(64);
export const uuidSchema = z.uuid();
