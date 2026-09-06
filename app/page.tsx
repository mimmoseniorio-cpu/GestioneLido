import { redirect } from 'next/navigation'

// MAPPA FIRST: non esiste una homepage prima della mappa (docs/05 §1).
export default function Home() {
  redirect('/map')
}
