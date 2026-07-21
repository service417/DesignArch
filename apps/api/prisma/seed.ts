/**
 * Development seed.
 *
 * Creates one user per role plus a project and a job card with both stages, so
 * the full workflow — assign, ready, inspect, price, accept, pay — can be walked
 * by hand immediately after a fresh migration.
 *
 * Development only. The password below is deliberately obvious and must never
 * exist in a deployed environment.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DesignArc!Dev2026';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const [admin, carpenter, painter, supervisor] = await Promise.all([
    upsertUser('admin@designarc.test', 'Ayesha Perera', 'ADMIN', passwordHash),
    upsertUser('carpenter@designarc.test', 'Nuwan Silva', 'CARPENTER', passwordHash),
    upsertUser('painter@designarc.test', 'Dilani Fernando', 'PAINTER', passwordHash),
    upsertUser('supervisor@designarc.test', 'Rohan Jayasuriya', 'SUPERVISOR', passwordHash),
  ]);

  const project = await prisma.project.create({
    data: {
      name: 'Colombo 07 Residence — Living & Dining',
      client: 'Mr. & Mrs. Wickramasinghe',
      description: 'Custom teak dining set and wall units for a private residence.',
      createdById: admin.id,
      jobCards: {
        create: {
          title: 'Teak dining table, 8-seater',
          description:
            'Solid teak, 2400x1100mm, natural matte finish. Design attached.',
          stages: {
            create: [
              {
                type: 'CARPENTRY',
                sequenceNo: 1,
                assigneeId: carpenter.id,
                status: 'ASSIGNED',
              },
              // Painting starts life assigned but gated: the state machine will
              // refuse to start it until carpentry is approved (BR-3.2).
              {
                type: 'PAINTING',
                sequenceNo: 2,
                assigneeId: painter.id,
                status: 'ASSIGNED',
              },
            ],
          },
        },
      },
    },
    include: { jobCards: { include: { stages: true } } },
  });

  console.log('Seeded DesignArc development data:');
  console.table([
    { role: 'ADMIN', email: admin.email },
    { role: 'CARPENTER', email: carpenter.email },
    { role: 'PAINTER', email: painter.email },
    { role: 'SUPERVISOR', email: supervisor.email },
  ]);
  console.log(`\nPassword for all demo accounts: ${DEMO_PASSWORD}`);
  console.log(`Project:  ${project.name}`);
  console.log(`Job card: ${project.jobCards[0].title}`);
  for (const stage of project.jobCards[0].stages) {
    console.log(`  stage ${stage.type} (seq ${stage.sequenceNo}) -> ${stage.id}`);
  }
}

function upsertUser(
  email: string,
  name: string,
  role: 'ADMIN' | 'CARPENTER' | 'PAINTER' | 'SUPERVISOR',
  passwordHash: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
