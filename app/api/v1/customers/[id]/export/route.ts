import type { NextRequest } from 'next/server'
import { esportaCliente } from '@/server/use-cases/gdpr'
import { richiediStaffApi } from '@/server/current-user'
import { fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const dati = await esportaCliente(await richiediStaffApi(), { customerId: id })
    // Si scarica come file: è ciò che va consegnato al cliente che lo chiede.
    return new Response(JSON.stringify(dati, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="dati-cliente-${id.slice(0, 8)}.json"`,
      },
    })
  } catch (e) {
    return fail(e)
  }
}
