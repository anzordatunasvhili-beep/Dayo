import { supabase } from './supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
  return supabase
}

export async function getWorkspace() {
  const db = requireClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('You are not signed in.')
  const [profile, students, subjects, groups, lessons, payments] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).single(),
    db.from('profiles').select('*').eq('teacher_id', user.id).order('first_name'),
    db.from('subjects').select('*').eq('teacher_id', user.id).order('name'),
    db.from('groups').select('*, subject:subjects(name), members:group_members(student_id)').eq('teacher_id', user.id).order('name'),
    db.from('lessons').select('*, subject:subjects(name), student:profiles!lessons_student_id_fkey(first_name,last_name), group:groups(name)').eq('teacher_id', user.id).order('starts_at'),
    db.from('payments').select('*, student:profiles!payments_student_id_fkey(first_name,last_name)').eq('teacher_id', user.id).order('due_date', { ascending: false }),
  ])
  for (const result of [profile, students, subjects, groups, lessons, payments]) if (result.error) throw result.error
  return { user, profile: profile.data, students: students.data, subjects: subjects.data, groups: groups.data, lessons: lessons.data, payments: payments.data }
}

export async function createStudent(input) {
  const db = requireClient()
  const { data, error } = await db.functions.invoke('create-student', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function createLesson(input) {
  const db = requireClient()
  const { data: { user } } = await db.auth.getUser()
  const { data, error } = await db.from('lessons').insert({ ...input, teacher_id: user.id }).select().single()
  if (error) throw error
  return data
}

export async function deleteLesson(id) {
  const { error } = await requireClient().from('lessons').delete().eq('id', id)
  if (error) throw error
}

export async function createSubject(name) {
  const db = requireClient(); const { data: { user } } = await db.auth.getUser()
  const { error } = await db.from('subjects').insert({ teacher_id: user.id, name })
  if (error) throw error
}

export async function createGroup(input) {
  const db = requireClient(); const { data: { user } } = await db.auth.getUser()
  const { data, error } = await db.from('groups').insert({ teacher_id: user.id, name: input.name, subject_id: input.subject_id || null }).select().single()
  if (error) throw error
  if (input.student_ids?.length) {
    const { error: memberError } = await db.from('group_members').insert(input.student_ids.map(student_id => ({ group_id: data.id, student_id })))
    if (memberError) throw memberError
  }
  return data
}

export async function createPayment(input) {
  const db = requireClient(); const { data: { user } } = await db.auth.getUser()
  const { error } = await db.from('payments').insert({ ...input, teacher_id: user.id })
  if (error) throw error
}

export async function markPaymentPaid(id) {
  const { error } = await requireClient().from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
