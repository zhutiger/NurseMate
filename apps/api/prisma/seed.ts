import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';

const prisma = new PrismaClient();

async function main() {
  const headEmployeeNo = process.env.SEED_HEAD_EMPLOYEE_NO ?? 'admin';
  const headPassword = process.env.SEED_HEAD_PASSWORD;
  const nursePassword = process.env.SEED_NURSE_PASSWORD;
  if (!headPassword || !nursePassword) {
    throw new Error('SEED_HEAD_PASSWORD and SEED_NURSE_PASSWORD are required');
  }

  const department = await prisma.department.upsert({
    where: { code: 'PCCM' },
    update: { name: '呼吸与危重症医学科护理单元', enabled: true },
    create: { code: 'PCCM', name: '呼吸与危重症医学科护理单元' },
  });

  await prisma.permission.createMany({
    skipDuplicates: true,
    data: [
      ['notice.publish', '发布通知'], ['notice.stats', '通知统计'], ['notice.remind', '通知催办'],
      ['notice.manage', '通知管理'], ['task.publish', '发布任务'], ['task.stats', '任务统计'],
      ['task.remind', '任务催办'], ['task.review', '任务审核'], ['task.manage', '任务管理'],
      ['user.manage', '人员管理'], ['permission.manage', '权限管理'], ['report.export', '导出报表'],
      ['audit.view', '查看审计'],
    ].map(([code, name]) => ({ code, name, description: name })),
  });

  const head = await prisma.user.upsert({
    where: { employeeNo: headEmployeeNo },
    update: {
      name: '系统管理员',
      role: 'HEAD_NURSE',
    },
    create: {
      departmentId: department.id,
      employeeNo: headEmployeeNo,
      name: '系统管理员',
      role: 'HEAD_NURSE',
      status: 'ACTIVE',
      passwordHash: await hashPassword(headPassword),
      activatedAt: new Date(),
    },
  });

  const nurse = await prisma.user.upsert({
    where: { employeeNo: 'smoke-nurse' },
    update: {
      name: '测试护士',
      role: 'NURSE',
      status: 'ACTIVE',
      passwordHash: await hashPassword(nursePassword),
      activatedAt: new Date(),
    },
    create: {
      departmentId: department.id,
      employeeNo: 'smoke-nurse',
      name: '测试护士',
      role: 'NURSE',
      status: 'ACTIVE',
      passwordHash: await hashPassword(nursePassword),
      activatedAt: new Date(),
    },
  });

  console.log(JSON.stringify({ seeded: true, headId: head.id, nurseId: nurse.id }));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
