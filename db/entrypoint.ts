/**
 * «Questo file è stato lanciato direttamente, o soltanto importato?»
 *
 * Sembra una sfumatura e invece è costata un rilascio: la prima versione
 * chiedeva se il percorso *finisse* per `seed.ts`, e `db/deploy-seed.ts`
 * finisce per `seed.ts`. Il seed è partito due volte insieme, uno ha azzerato
 * il database mentre l'altro ci stava scrivendo dentro.
 *
 * Il confronto giusto è sul nome del file, per intero.
 */
import { basename } from 'node:path'

export function eseguitoDirettamente(nomeFile: string, argv1 = process.argv[1]): boolean {
  if (!argv1) return false
  return basename(argv1) === nomeFile
}
