import { supabase } from '@/lib/supabase'

export interface GradeRow {
  id: string; student_id: string; student_name: string; class_id: string
  source: 'Ujian' | 'Tugas'; title: string
  score: number; max_score: number; percent: number
  published: boolean; created_at: string; feedback: string | null
}

const chunk = <T,>(arr: T[], n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

async function inBatches<T>(ids: string[], fetcher: (part: string[]) => PromiseLike<T[] | null>): Promise<T[]> {
  const out: T[] = []
  for (const part of chunk([...new Set(ids)])) out.push(...((await fetcher(part)) ?? []))
  return out
}

/** Nilai ujian + tugas untuk kelas tertentu, lengkap dengan nama siswa dan judul sumbernya. */
export async function loadGradeRows(classIds: string[]): Promise<GradeRow[]> {
  if (classIds.length === 0) return []
  const { data: grades } = await supabase.from('grades')
    .select('id, student_id, class_id, exam_attempt_id, assignment_submission_id, score, max_score, feedback, published_at, created_at')
    .in('class_id', classIds).order('created_at', { ascending: false })
  const g = grades ?? []
  if (g.length === 0) return []

  const profiles = await inBatches(g.map(x => x.student_id), ids => supabase.from('profiles').select('id, full_name').in('id', ids).then(r => r.data))
  const names = new Map(profiles.map(p => [p.id, p.full_name]))

  const attemptIds = g.map(x => x.exam_attempt_id).filter((x): x is string => !!x)
  const attempts = await inBatches(attemptIds, ids => supabase.from('exam_attempts').select('id, exam_id').in('id', ids).then(r => r.data))
  const exams = await inBatches(attempts.map(a => a.exam_id), ids => supabase.from('exams').select('id, title').in('id', ids).then(r => r.data))
  const examTitle = new Map(exams.map(e => [e.id, e.title]))
  const attemptExam = new Map(attempts.map(a => [a.id, a.exam_id]))

  const subIds = g.map(x => x.assignment_submission_id).filter((x): x is string => !!x)
  const subs = await inBatches(subIds, ids => supabase.from('assignment_submissions').select('id, assignment_id').in('id', ids).then(r => r.data))
  const assigns = await inBatches(subs.map(s => s.assignment_id), ids => supabase.from('assignments').select('id, title').in('id', ids).then(r => r.data))
  const assignTitle = new Map(assigns.map(a => [a.id, a.title]))
  const subAssign = new Map(subs.map(s => [s.id, s.assignment_id]))

  return g.map(x => {
    const isExam = !!x.exam_attempt_id
    const title = isExam
      ? examTitle.get(attemptExam.get(x.exam_attempt_id!) ?? '') ?? 'Ujian'
      : assignTitle.get(subAssign.get(x.assignment_submission_id ?? '') ?? '') ?? 'Tugas'
    return {
      id: x.id, student_id: x.student_id, student_name: names.get(x.student_id) ?? 'Tidak dikenal', class_id: x.class_id,
      source: isExam ? 'Ujian' : 'Tugas', title,
      score: Number(x.score), max_score: Number(x.max_score),
      percent: x.max_score > 0 ? Math.round((Number(x.score) / Number(x.max_score)) * 1000) / 10 : 0,
      published: !!x.published_at, created_at: x.created_at, feedback: x.feedback,
    }
  })
}
