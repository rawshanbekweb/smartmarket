/**
 * First-run setup for a real installation: creates the market and the first CHIEF.
 *
 *   npm run setup:production -- --market "Chorsu bozori" --address "Toshkent" \
 *     --name "Ism Familiya" --username rahbar
 *
 * The password is asked interactively (hidden). In non-interactive environments
 * (Docker, CI) pass it through BOOTSTRAP_CHIEF_PASSWORD; the account then has to
 * change it at first login.
 */
import 'dotenv/config';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { bootstrapProduction } from '../services/bootstrap.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Read a line from the TTY without echoing it. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const marketName = arg('market');
  const fullName = arg('name');
  const username = arg('username');
  if (!marketName || !fullName || !username) {
    console.error('Usage: npm run setup:production -- --market "<bozor nomi>" [--address "<manzil>"] --name "<F.I.Sh>" --username <login>');
    process.exitCode = 2;
    return;
  }

  let password = process.env.BOOTSTRAP_CHIEF_PASSWORD;
  const fromEnv = !!password;
  if (!password) {
    if (!process.stdin.isTTY) {
      console.error('No TTY: set BOOTSTRAP_CHIEF_PASSWORD to pass the initial password.');
      process.exitCode = 2;
      return;
    }
    password = await askHidden('Rahbar paroli (kamida 10 belgi, katta/kichik harf va raqam): ');
    if ((await askHidden('Parolni takrorlang: ')) !== password) {
      console.error('Parollar mos kelmadi.');
      process.exitCode = 2;
      return;
    }
  }

  const prisma = new PrismaClient();
  try {
    const r = await bootstrapProduction(prisma, {
      marketName,
      marketAddress: arg('address'),
      fullName,
      username,
      password,
      mustChangePassword: fromEnv,
    });
    console.log(`\n✔ Bozor: ${r.market.name}${r.marketCreated ? ' (yaratildi)' : ' (mavjud)'}`);
    console.log(`✔ Rahbar hisobi: ${r.user.username}${fromEnv ? ' — birinchi kirishda parolni almashtirish talab qilinadi' : ''}`);
    console.log('\nKeyingi qadamlar (interfeysda): Sozlamalar → Tarif va To\'lov sikli, Qatorlar, Savdo joylari, Kameralar, Foydalanuvchilar.');
  } catch (e) {
    if (e instanceof ZodError) console.error(e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    else console.error((e as Error).message ?? e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
