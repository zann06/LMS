import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Json } from '@/lib/database.types'

interface ReviewItem {
  position: number
  question_type: 'mcq' | 'essay'
  question_text: string
  options: { id: string; text: string }[] | null
  points: number
  student_answer: Json | null
  is_correct: boolean | null
  awarded_points: number | null
  teacher_feedback: string | null
  correct_option_id: string | null
  explanation: string | null
}
interface Review {
  exam_title: string; status: string; score: number; max_score: number; feedback: string | null
  reveal_key: boolean; wants_explanations: boolean; items: ReviewItem[]
}

/** Hasil ujian per soal. Kunci jawaban & pembahasan hanya ada di data bila server mengizinkan. */
export function AttemptReviewDialog({ attemptId, onClose }: { attemptId: string | null; onClose: () => void }) {
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setReview(null); setError(null)
    if (!attemptId) return
    let cancelled = false
    setLoading(true)
    supabase.rpc('get_attempt_review', { p_attempt_id: attemptId }).then(({ data, error: err }) => {
      if (cancelled) return
      setLoading(false)
      if (err) setError(err.message)
      else setReview(data as unknown as Review)
    })
    return () => { cancelled = true }
  }, [attemptId])

  return (
    <Dialog open={!!attemptId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{review?.exam_title ?? 'Hasil Ujian'}</DialogTitle>
          <DialogDescription>
            {review ? `Nilai ${review.score} / ${review.max_score}` : 'Rincian jawaban per soal'}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Memuat...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {review && (
          <div className="space-y-4">
            {review.feedback && <div className="rounded-md bg-muted/30 p-3 text-sm"><strong>Catatan guru:</strong> {review.feedback}</div>}
            {review.wants_explanations && !review.reveal_key && (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Kunci jawaban dan pembahasan akan tampil setelah ujian berakhir dan semua percobaanmu selesai.
              </p>
            )}

            {review.items.map((it, i) => {
              const answerId = typeof it.student_answer === 'string' ? it.student_answer : null
              const answered = it.question_type === 'mcq' ? !!answerId : typeof it.student_answer === 'string' && it.student_answer.trim() !== ''
              return (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-muted-foreground">Soal {i + 1}</span>
                    {it.question_type === 'mcq'
                      ? <Badge variant={!answered ? 'secondary' : it.is_correct ? 'default' : 'destructive'}>{!answered ? 'Tidak dijawab' : it.is_correct ? 'Benar' : 'Salah'}</Badge>
                      : <Badge variant="secondary">Esai</Badge>}
                    <Badge variant="outline">{it.awarded_points ?? 0} / {it.points} poin</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm font-medium">{it.question_text}</p>

                  {it.question_type === 'mcq' && (it.options ?? []).map((o, k) => {
                    const mine = o.id === answerId
                    const correct = review.reveal_key && o.id === it.correct_option_id
                    return (
                      <div key={o.id} className={`flex items-start gap-2 rounded-md border p-2 text-sm ${correct ? 'border-green-600 bg-green-50' : mine ? 'border-destructive/60 bg-red-50' : ''}`}>
                        <span className="w-5 shrink-0 font-medium">{String.fromCharCode(65 + k)}.</span>
                        <span className="flex-1">{o.text}</span>
                        {mine && <span className="shrink-0 text-xs text-muted-foreground">jawabanmu</span>}
                        {correct && <span className="shrink-0 text-xs font-medium text-green-700">kunci</span>}
                      </div>
                    )
                  })}

                  {it.question_type === 'essay' && (
                    <div className="rounded-md bg-muted/30 p-2 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">Jawabanmu</p>
                      <p className="whitespace-pre-wrap">{answered ? String(it.student_answer) : '(tidak dijawab)'}</p>
                    </div>
                  )}
                  {it.teacher_feedback && <p className="text-sm"><strong>Komentar guru:</strong> {it.teacher_feedback}</p>}
                  {it.explanation && <p className="rounded-md bg-accent p-2 text-sm"><strong>Pembahasan:</strong> {it.explanation}</p>}
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
