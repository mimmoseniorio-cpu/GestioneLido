/** Accesso condiviso dagli script e2e: dopo F4-01 nessuna pagina si apre da sola. */
export async function accedi(p, url, email = 'admin@lidoadriano.it', password = 'lido2026') {
  await p.goto(`${url}/login`, { waitUntil: 'networkidle' })
  if (!p.url().includes('/login')) return          // sessione già aperta
  await p.getByLabel('Email').fill(email)
  await p.getByLabel('Password').fill(password)
  await p.getByRole('button', { name: 'ENTRA' }).click()
  await p.waitForURL(`${url}/map`, { timeout: 15_000 })
}
