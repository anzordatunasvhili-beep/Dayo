import { supabase } from "./supabase";

const requireClient = () => {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.",
    );
  return supabase;
};

export async function getWorkspace() {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  const profile = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (profile.error) throw profile.error;
  const teacher = profile.data.role === "teacher";
  const lessonSelect =
    "*, subject:subjects!lessons_subject_id_fkey(name,icon), student:profiles!lessons_student_id_fkey(first_name,last_name), group:groups!lessons_group_id_fkey(name), student_audiences:lesson_students!lesson_students_lesson_id_fkey(student_id,student:profiles!lesson_students_student_id_fkey(first_name,last_name)), group_audiences:lesson_groups!lesson_groups_lesson_id_fkey(group_id,group:groups!lesson_groups_group_id_fkey(name))";
  const paymentSelect =
    "*, student:profiles!payments_student_id_fkey(first_name,last_name)";
  const empty = Promise.resolve({ data: [], error: null });
  const [students, subjects, groups, lessons, payments] = await Promise.all([
    teacher
      ? db
          .from("profiles")
          .select("*")
          .eq("teacher_id", user.id)
          .order("first_name")
      : empty,
    teacher
      ? db.from("subjects").select("*").eq("teacher_id", user.id).order("name")
      : db.from("subjects").select("*").order("name"),
    teacher
      ? db
          .from("groups")
          .select(
            "*, subject:subjects(name), members:group_members(student_id)",
          )
          .eq("teacher_id", user.id)
          .order("name")
      : db
          .from("groups")
          .select(
            "*, subject:subjects(name), members:group_members(student_id)",
          )
          .order("name"),
    teacher
      ? db
          .from("lessons")
          .select(lessonSelect)
          .eq("teacher_id", user.id)
          .order("starts_at")
      : db.from("lessons").select(lessonSelect).order("starts_at"),
    teacher
      ? db
          .from("payments")
          .select(paymentSelect)
          .eq("teacher_id", user.id)
          .order("due_date", { ascending: false })
      : db
          .from("payments")
          .select(paymentSelect)
          .eq("student_id", user.id)
          .order("due_date", { ascending: false }),
  ]);
  for (const result of [students, subjects, groups, lessons, payments])
    if (result.error) throw result.error;
  return {
    user,
    profile: profile.data,
    students: students.data,
    subjects: subjects.data,
    groups: groups.data,
    lessons: lessons.data,
    payments: payments.data,
  };
}

export async function createStudent(input) {
  const db = requireClient();
  const { data, error } = await db.functions.invoke("create-student", {
    body: input,
  });
  if (error) {
    let message = error.message;
    try {
      const payload = await error.context?.json();
      message = payload?.error || payload?.message || message;
    } catch {
      /* Response body was not JSON. */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createLesson(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const {
    student_ids = [],
    group_ids = [],
    recurrence_weeks = 1,
    ...lesson
  } = input;
  const seriesId = recurrence_weeks > 1 ? crypto.randomUUID() : null;
  const rows = Array.from({ length: recurrence_weeks }, (_, index) => {
    const starts = new Date(lesson.starts_at);
    starts.setDate(starts.getDate() + index * 7);
    const ends = new Date(lesson.ends_at);
    ends.setDate(ends.getDate() + index * 7);
    return {
      ...lesson,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      teacher_id: user.id,
      student_id: null,
      group_id: null,
      recurrence_series_id: seriesId,
    };
  });
  const { data, error } = await db.from("lessons").insert(rows).select();
  if (error) throw error;
  const studentRows = data.flatMap((item) =>
    student_ids.map((student_id) => ({ lesson_id: item.id, student_id })),
  );
  const groupRows = data.flatMap((item) =>
    group_ids.map((group_id) => ({ lesson_id: item.id, group_id })),
  );
  if (studentRows.length) {
    const { error: audienceError } = await db
      .from("lesson_students")
      .insert(studentRows);
    if (audienceError) throw audienceError;
  }
  if (groupRows.length) {
    const { error: audienceError } = await db
      .from("lesson_groups")
      .insert(groupRows);
    if (audienceError) throw audienceError;
  }
  return data;
}

export async function deleteLesson(id) {
  const { error } = await requireClient().from("lessons").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteLessonScope(id, scope = "occurrence") {
  if (scope === "occurrence") return deleteLesson(id);
  const db = requireClient();
  const { data: target, error: targetError } = await db
    .from("lessons")
    .select("recurrence_series_id,starts_at")
    .eq("id", id)
    .single();
  if (targetError) throw targetError;
  if (!target.recurrence_series_id) return deleteLesson(id);
  let query = db
    .from("lessons")
    .delete()
    .eq("recurrence_series_id", target.recurrence_series_id);
  if (scope === "future") query = query.gte("starts_at", target.starts_at);
  const { error } = await query;
  if (error) throw error;
}

export async function updateLesson(id, input) {
  const db = requireClient();
  const { student_ids, group_ids, ...lesson } = input;
  const { data, error } = await db
    .from("lessons")
    .update({ ...lesson, student_id: null, group_id: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  if (student_ids) {
    await db.from("lesson_students").delete().eq("lesson_id", id);
    if (student_ids.length) {
      const { error: audienceError } = await db
        .from("lesson_students")
        .insert(
          student_ids.map((student_id) => ({ lesson_id: id, student_id })),
        );
      if (audienceError) throw audienceError;
    }
  }
  if (group_ids) {
    await db.from("lesson_groups").delete().eq("lesson_id", id);
    if (group_ids.length) {
      const { error: audienceError } = await db
        .from("lesson_groups")
        .insert(group_ids.map((group_id) => ({ lesson_id: id, group_id })));
      if (audienceError) throw audienceError;
    }
  }
  return data;
}

export async function updateLessonScope(id, input, scope = "occurrence") {
  if (scope === "occurrence") return updateLesson(id, input);
  const db = requireClient();
  const { data: target, error: targetError } = await db
    .from("lessons")
    .select("id,recurrence_series_id,starts_at,ends_at")
    .eq("id", id)
    .single();
  if (targetError) throw targetError;
  if (!target.recurrence_series_id) return updateLesson(id, input);
  const { data: series, error: seriesError } = await db
    .from("lessons")
    .select("id,starts_at,ends_at")
    .eq("recurrence_series_id", target.recurrence_series_id)
    .order("starts_at");
  if (seriesError) throw seriesError;
  const selected =
    scope === "future"
      ? series.filter(
          (item) => new Date(item.starts_at) >= new Date(target.starts_at),
        )
      : series;
  const delta = new Date(input.starts_at) - new Date(target.starts_at);
  const duration = new Date(input.ends_at) - new Date(input.starts_at);
  const { starts_at: _start, ends_at: _end, ...shared } = input;
  await Promise.all(
    selected.map((item) => {
      const start = new Date(new Date(item.starts_at).getTime() + delta);
      const end = new Date(start.getTime() + duration);
      return updateLesson(item.id, {
        ...shared,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      });
    }),
  );
}

export async function createSubject(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { error } = await db
    .from("subjects")
    .insert({ teacher_id: user.id, name: input.name, icon: input.icon });
  if (error) throw error;
}

export async function updateSubject(id, input) {
  const { error } = await requireClient()
    .from("subjects")
    .update(input)
    .eq("id", id);
  if (error) throw error;
}

export async function createGroup(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data, error } = await db
    .from("groups")
    .insert({
      teacher_id: user.id,
      name: input.name,
      subject_id: input.subject_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  if (input.student_ids?.length) {
    const { error: memberError } = await db.from("group_members").insert(
      input.student_ids.map((student_id) => ({
        group_id: data.id,
        student_id,
      })),
    );
    if (memberError) throw memberError;
  }
  return data;
}

export async function updateGroup(id, input) {
  const db = requireClient();
  const { student_ids = [], ...group } = input;
  const { error } = await db
    .from("groups")
    .update({ name: group.name, subject_id: group.subject_id || null })
    .eq("id", id);
  if (error) throw error;
  const { error: removeError } = await db
    .from("group_members")
    .delete()
    .eq("group_id", id);
  if (removeError) throw removeError;
  if (student_ids.length) {
    const { error: memberError } = await db
      .from("group_members")
      .insert(student_ids.map((student_id) => ({ group_id: id, student_id })));
    if (memberError) throw memberError;
  }
}

export async function createPayment(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { error } = await db
    .from("payments")
    .insert({ ...input, teacher_id: user.id });
  if (error) throw error;
}

export async function markPaymentPaid(id) {
  const { error } = await requireClient()
    .from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
