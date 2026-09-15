import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../src/common/constants/permissions.constants';
const prisma = new PrismaClient();

// Permission keys and role grants now come from the same file organization.service.ts
// uses for real org bootstrap — previously this list used different key names
// ('schedule:view' vs 'shifts:read') and would have silently diverged.
const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Demo Organization',
      timezone: 'America/Toronto',
    },
  });

  const permissionRecords = await Promise.all(
    PERMISSIONS.map((key) =>
      prisma.permission.upsert({ where: { key }, update: {}, create: { key } }),
    ),
  );
  const permissionByKey = Object.fromEntries(permissionRecords.map((p) => [p.key, p.id]));

  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { orgId_name: { orgId: org.id, name: roleName } },
      update: {},
      create: { orgId: org.id, name: roleName, isSystemRole: true },
    });

    for (const key of keys) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permissionByKey[key] } },
        update: {},
        create: { roleId: role.id, permissionId: permissionByKey[key] },
      });
    }
  }

  console.log('Seed complete: default org + Owner/Admin/Manager/Employee roles created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
