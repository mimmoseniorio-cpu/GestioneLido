/**
 * Primo avvio in produzione (F4-10).
 *
 * Popola lo stabilimento dimostrativo **solo se il database è vuoto**. Gira a
 * ogni build su Vercel, quindi la condizione non è una comodità: è ciò che
 * impedisce a un rilascio di cancellare i dati veri di un gestore. Il seed
 * azzera tutto con TRUNCATE, e una build parte anche solo perché qualcuno ha
 * corretto una virgola in un file di testo.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const stabilimenti = await prisma.beachClub.count()
  if (stabilimenti > 0) {
    console.log(`· database già popolato (${stabilimenti} stabilimenti): non tocco nulla`)
    return
  }
  console.log('· database vuoto: carico lo stabilimento dimostrativo')
  const { seedDemo } = await import('./seed')
  await seedDemo()
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
