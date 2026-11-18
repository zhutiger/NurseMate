import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';

const prisma = new PrismaClient();

async function main() {
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

  const head = await prisma.user.upsert({
    where: { employeeNo: 'smoke-head' },
    update: {
      name: '测试护士长',
      role: 'HEAD_NURSE',
      status: 'ACTIVE',
      passwordHash: await hashPassword(headPassword),
      activatedAt: new Date(),
    },
    create: {
      departmentId: department.id,
      employeeNo: 'smoke-head',
      name: '测试护士长',
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
