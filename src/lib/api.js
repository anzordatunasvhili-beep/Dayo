import { supabase } from "./supabase";

const requireClient = () => {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.",
    );
  return supabase;
};

const invokeFunction = async (name, options) => {
  const { data, error } = await requireClient().functions.invoke(name, options);
  if (!error) {
    if (data?.error) throw new Error(data.error);
    return data;
  }

  let message = error.message;
  try {
    const payload = await error.context?.json();
    message = payload?.error || payload?.message || message;
    if (payload?.code === "NOT_FOUND") {
      message = `Supabase Edge Function "${name}" is not deployed. Deploy it with: npx supabase functions deploy ${name}`;
    }
  } catch {
    /* Response body was not JSON. */
  }
  throw new Error(message);
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
  const lessonSelectBase =
    "*, subject:subjects!lessons_subject_id_fkey(name,icon), student:profiles!lessons_student_id_fkey(first_name,last_name), group:groups!lessons_group_id_fkey(name), student_audiences:lesson_students!lesson_students_lesson_id_fkey(student_id,student:profiles!lesson_students_student_id_fkey(first_name,last_name)), group_audiences:lesson_groups!lesson_groups_lesson_id_fkey(group_id,group:groups!lesson_groups_group_id_fkey(name)), records:lesson_student_records(student_id,attendance,homework,homework_note,price_snapshot,currency,billable,paid)";
  const lessonSelect =
    `${lessonSelectBase}, homework_assignment:lesson_homework_assignments(id,description,attachments,assigned_at,updated_at), homework_submissions:lesson_homework_submissions(id,student_id,description,attachments,submitted_at,updated_at,student:profiles!lesson_homework_submissions_student_id_fkey(first_name,last_name))`;
  const paymentSelect =
    "*, student:profiles!payments_student_id_fkey(first_name,last_name)";
  const empty = Promise.resolve({ data: [], error: null });
  const [students, subjects, groups, lessons, payments, redZones, prices] =
    await Promise.all([
      teacher
        ? db
            .from("profiles")
            .select(
              "*, assignments:student_subjects!student_subjects_student_id_fkey(subject_id,lesson_mode), memberships:group_members!group_members_student_id_fkey(group_id)",
            )
            .eq("teacher_id", user.id)
            .order("first_name")
        : empty,
      teacher
        ? db
            .from("subjects")
            .select("*")
            .eq("teacher_id", user.id)
            .order("name")
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
      teacher
        ? db
            .from("teacher_unavailability")
            .select("*")
            .eq("teacher_id", user.id)
            .order("starts_at")
        : db.from("teacher_unavailability").select("*").order("starts_at"),
      teacher
        ? db
            .from("student_subject_prices")
            .select(
              "*,subject:subjects(name),student:profiles!student_subject_prices_student_id_fkey(first_name,last_name)",
            )
            .eq("teacher_id", user.id)
        : db
            .from("student_subject_prices")
            .select("*,subject:subjects(name)")
            .eq("student_id", user.id),
    ]);
  if (lessons.error && /lesson_homework_assignments|lesson_homework_submissions|schema cache|relationship/i.test(lessons.error.message)) {
    const fallbackLessons = teacher
      ? await db
          .from("lessons")
          .select(lessonSelectBase)
          .eq("teacher_id", user.id)
          .order("starts_at")
      : await db.from("lessons").select(lessonSelectBase).order("starts_at");
    lessons.data = (fallbackLessons.data || []).map((lesson) => ({
      ...lesson,
      homework_assignment: [],
      homework_submissions: [],
    }));
    lessons.error = fallbackLessons.error;
  }
  for (const result of [
    students,
    subjects,
    groups,
    lessons,
    payments,
    redZones,
    prices,
  ])
    if (result.error) throw result.error;
  lessons.data = (lessons.data || []).map((lesson) => ({
    ...lesson,
    homework_assignment: Array.isArray(lesson.homework_assignment)
      ? lesson.homework_assignment
      : lesson.homework_assignment
        ? [lesson.homework_assignment]
        : [],
    homework_submissions: lesson.homework_submissions || [],
  }));
  return {
    user,
    profile: profile.data,
    students: students.data,
    subjects: subjects.data,
    groups: groups.data,
    lessons: lessons.data,
    payments: payments.data,
    redZones: redZones.data,
    prices: prices.data,
  };
}

export async function createStudent(input) {
  return invokeFunction("create-student", {
    body: input,
  });
}

export async function resetStudentPassword(studentId, password) {
  return invokeFunction("reset-student-password", {
    body: { student_id: studentId, password },
  });
}

export async function updateStudent(id, input) {
  const db = requireClient();
  const { subject_ids = [], group_ids = [], ...profile } = input;
  const { error } = await db
    .from("profiles")
    .update({
      first_name: profile.first_name,
      last_name: profile.last_name,
      country_region: profile.country_region,
    })
    .eq("id", id);
  if (error) throw error;
  const { error: assignmentDelete } = await db
    .from("student_subjects")
    .delete()
    .eq("student_id", id);
  if (assignmentDelete) throw assignmentDelete;
  if (subject_ids.length) {
    const { error: assignmentError } = await db.from("student_subjects").insert(
      subject_ids.map((subject_id) => ({
        student_id: id,
        subject_id,
        lesson_mode: "individual",
      })),
    );
    if (assignmentError) throw assignmentError;
  }
  const { error: memberDelete } = await db
    .from("group_members")
    .delete()
    .eq("student_id", id);
  if (memberDelete) throw memberDelete;
  if (group_ids.length) {
    const { error: memberError } = await db
      .from("group_members")
      .insert(group_ids.map((group_id) => ({ student_id: id, group_id })));
    if (memberError) throw memberError;
  }
}

export async function updateOwnProfile(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  const { error } = await db
    .from("profiles")
    .update({ first_name: input.first_name, last_name: input.last_name })
    .eq("id", user.id);
  if (error) throw error;
}

export async function getLiveKitToken(lessonId) {
  return invokeFunction("create-livekit-token", {
    body: { lesson_id: lessonId },
  });
}

export async function getClassroomData(lessonId) {
  const db = requireClient();
  const [{ data: whiteboard, error: whiteboardError }, { data: chat, error: chatError }] =
    await Promise.all([
      db.from("lesson_whiteboards").select("data").eq("lesson_id", lessonId).maybeSingle(),
      db.from("lesson_chat_messages").select("*").eq("lesson_id", lessonId).order("created_at"),
    ]);
  if (whiteboardError) throw whiteboardError;
  if (chatError) throw chatError;
  return { whiteboard, chat: chat || [] };
}

export async function saveWhiteboard(lessonId, data) {
  const db = requireClient();
  const { data: userData } = await db.auth.getUser();
  const { error } = await db.from("lesson_whiteboards").upsert({
    lesson_id: lessonId,
    data,
    updated_by: userData.user?.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function sendChatMessage(lessonId, body) {
  const db = requireClient();
  const { data: userData } = await db.auth.getUser();
  const { error } = await db.from("lesson_chat_messages").insert({
    lesson_id: lessonId,
    user_id: userData.user?.id,
    body,
  });
  if (error) throw error;
}

function safePathPart(value) {
  return String(value || "file")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "file")
    .join("/");
}

export async function submitLessonHomework(lessonId, { description = "", files = [] }) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const { data: submission, error: submissionError } = await db
    .from("lesson_homework_submissions")
    .upsert(
      {
        lesson_id: lessonId,
        student_id: user.id,
        description: description.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,student_id" },
    )
    .select()
    .single();
  if (submissionError) throw submissionError;

  const uploaded = [];
  for (const file of files) {
    const relativeName = safePathPart(file.webkitRelativePath || file.name);
    const path = `${lessonId}/${user.id}/${submission.id}/${relativeName}`;
    const { error: uploadError } = await db.storage
      .from("homework-submissions")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) throw uploadError;
    uploaded.push({
      path,
      name: file.name,
      relative_path: relativeName,
      size: file.size,
      type: file.type || "application/octet-stream",
    });
  }

  const attachments = files.length ? uploaded : submission.attachments || [];
  const { error: updateError } = await db
    .from("lesson_homework_submissions")
    .update({
      description: description.trim(),
      attachments,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", submission.id);
  if (updateError) throw updateError;
}

export async function getHomeworkAttachmentUrl(path) {
  const { data, error } = await requireClient()
    .storage
    .from("homework-submissions")
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveLessonHomeworkAssignment(lessonId, { description = "", files = [] }) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("You are not signed in.");

  const { data: assignment, error: assignmentError } = await db
    .from("lesson_homework_assignments")
    .upsert(
      {
        lesson_id: lessonId,
        description: description.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id" },
    )
    .select()
    .single();
  if (assignmentError) throw assignmentError;

  const uploaded = [];
  for (const file of files) {
    const relativeName = safePathPart(file.webkitRelativePath || file.name);
    const path = `${lessonId}/${assignment.id}/${relativeName}`;
    const { error: uploadError } = await db.storage
      .from("homework-assignments")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) throw uploadError;
    uploaded.push({
      path,
      name: file.name,
      relative_path: relativeName,
      size: file.size,
      type: file.type || "application/octet-stream",
    });
  }

  const attachments = files.length ? uploaded : assignment.attachments || [];
  const { error: updateError } = await db
    .from("lesson_homework_assignments")
    .update({
      description: description.trim(),
      attachments,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id);
  if (updateError) throw updateError;
}

export async function getHomeworkAssignmentAttachmentUrl(path) {
  const { data, error } = await requireClient()
    .storage
    .from("homework-assignments")
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
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

export async function createRedZone(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { error } = await db
    .from("teacher_unavailability")
    .insert({ ...input, teacher_id: user.id });
  if (error) throw error;
}

export async function updateRedZone(id, input) {
  const { error } = await requireClient()
    .from("teacher_unavailability")
    .update(input)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRedZone(id) {
  const { error } = await requireClient()
    .from("teacher_unavailability")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function setStudentSubjectPrice(input) {
  const db = requireClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { error } = await db
    .from("student_subject_prices")
    .upsert(
      { ...input, teacher_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "student_id,subject_id" },
    );
  if (error) throw error;
}

export async function setLessonStudentRecord(input) {
  const db = requireClient();
  const { data: existing } = await db
    .from("lesson_student_records")
    .select("price_snapshot,currency")
    .eq("lesson_id", input.lesson_id)
    .eq("student_id", input.student_id)
    .maybeSingle();
  let snapshot = {};
  if (existing?.price_snapshot != null)
    snapshot = {
      price_snapshot: existing.price_snapshot,
      currency: existing.currency,
    };
  else if (input.billable) {
    const { data: lesson } = await db
      .from("lessons")
      .select("subject_id")
      .eq("id", input.lesson_id)
      .single();
    if (lesson?.subject_id) {
      const { data: rate } = await db
        .from("student_subject_prices")
        .select("price,currency")
        .eq("student_id", input.student_id)
        .eq("subject_id", lesson.subject_id)
        .maybeSingle();
      if (rate)
        snapshot = { price_snapshot: rate.price, currency: rate.currency };
    }
  }
  const { error } = await db
    .from("lesson_student_records")
    .upsert(
      { ...input, ...snapshot, updated_at: new Date().toISOString() },
      { onConflict: "lesson_id,student_id" },
    );
  if (error) throw error;
}
