import { noteSegments } from '@/lib/noteRiche';

/** Note de ligne avec son gras et ses couleurs (voir `noteRiche.ts`). Styles en ligne : sûrs pour html2canvas / PDF. */
export default function NoteRiche({ note }: { note: string }) {
  return (
    <>
      {noteSegments(note).map((s, i) => (
        <span key={i} style={{ ...(s.gras ? { fontWeight: 700 } : {}), ...(s.couleur ? { color: s.couleur } : {}) }}>{s.texte}</span>
      ))}
    </>
  );
}
