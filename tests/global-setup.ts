import { execSync } from 'node:child_process'

/** I test girano su un database dedicato: mai su quello di sviluppo, cosi'
 *  eseguirli non distrugge i dati demo su cui si sta valutando la UX. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL non impostata (vedi .env.example)')
  // `directUrl` esiste per i pooler dei fornitori di hosting; in locale deve
  // puntare allo stesso database di test, altrimenti le migrazioni finirebbero
  // su quello di sviluppo.
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
  })
}
