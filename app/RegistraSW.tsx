'use client'
import { useEffect } from 'react'

/** MVP-16 · Registra il service worker che rende l'app installabile. */
export default function RegistraSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const t = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // L'app funziona lo stesso: l'installabilità è un di più, non un requisito
        // per lavorare.
      })
    }, 1200)   // non rubare banda al primo caricamento della mappa
    return () => clearTimeout(t)
  }, [])
  return null
}
