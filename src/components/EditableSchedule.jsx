import { useMemo, useRef, useState } from "react";

const Icon = ({ children, size = 20 }) => (
  <span className="material-symbols-rounded" style={{ fontSize: size }}>
    {children}
  </span>
);
const inputClass =
  "mt-2 w-full h-11 rounded-xl border border-[#dedbd3] bg-white px-3 outline-none focus:border-[#8f9d92] text-sm";
const colors = [
  "bg-[#dceae1] border-[#bad0c2]",
  "bg-[#dee8ef] border-[#becfd9]",
  "bg-[#f1e6cc] border-[#ddcda8]",
  "bg-[#e7e1ed] border-[#cec2d7]",
  "bg-[#efdfda] border-[#dabfb6]",
];
const mondayOf = (value) => {
  const d = new Date(value);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
};
const dateValue = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const timeValue = (value) =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function EditableSchedule({
  lessons,
  students,
  subjects,
  groups,
  onCreate,
  onUpdate,
  onDelete,
  readOnly = false,
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [editing, setEditing] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const dragging = useRef(false);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        return date;
      }),
    [weekStart],
  );
  const visible = lessons.filter((lesson) => {
    const start = new Date(lesson.starts_at);
    return (
      start >= weekDays[0] && start < new Date(weekDays[6].getTime() + 86400000)
    );
  });
  const moveWeek = (amount) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + amount * 7);
    setWeekStart(next);
  };
  const dropLesson = (event, day) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/lesson-id");
    const lesson = lessons.find((item) => item.id === id);
    if (!lesson) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const minutes = Math.max(
      0,
      Math.min(
        14 * 60,
        Math.round((((event.clientY - bounds.top) / 60) * 60) / 15) * 15,
      ),
    );
    const start = new Date(day);
    start.setHours(7 + Math.floor(minutes / 60), minutes % 60, 0, 0);
    const duration = new Date(lesson.ends_at) - new Date(lesson.starts_at);
    const end = new Date(start.getTime() + duration);
    setPendingMove({
      lesson,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
    setTimeout(() => {
      dragging.current = false;
    }, 0);
  };
  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-in">
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <div className="flex bg-white border border-[#e1dfd8] rounded-xl p-1 items-center">
          <button
            onClick={() => moveWeek(-1)}
            className="w-9 h-8 border-0 bg-transparent grid place-items-center"
          >
            <Icon>chevron_left</Icon>
          </button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="px-3 border-0 bg-transparent text-xs font-semibold"
          >
            {weekDays[0].toLocaleDateString("en", {
              month: "short",
              day: "numeric",
            })}{" "}
            –{" "}
            {weekDays[6].toLocaleDateString("en", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </button>
          <button
            onClick={() => moveWeek(1)}
            className="w-9 h-8 border-0 bg-transparent grid place-items-center"
          >
            <Icon>chevron_right</Icon>
          </button>
        </div>
        <button
          onClick={() => setWeekStart(mondayOf(new Date()))}
          className="h-10 px-4 bg-white border border-[#e1dfd8] rounded-xl text-xs"
        >
          Today
        </button>
        <p className="hidden md:block ml-auto text-[11px] text-[#999]">
          {readOnly
            ? "Your confirmed lesson schedule"
            : "Drag a lesson to another day or time"}
        </p>
        {!readOnly && (
          <button
            onClick={() => setEditing({})}
            className="bg-[#30312d] text-white border-0 rounded-xl px-4 h-10 text-xs font-semibold flex items-center gap-2"
          >
            <Icon size={17}>add</Icon>New lesson
          </button>
        )}
      </div>
      <div className="bg-white rounded-[24px] border border-[#e4e2dc] overflow-auto">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-[#ebe9e3]">
            <div />
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="p-3 text-center border-l border-[#eeece7]"
              >
                <div className="text-[10px] text-[#999] uppercase">
                  {day.toLocaleDateString("en", { weekday: "short" })}
                </div>
                <div
                  className={`mx-auto mt-1 w-8 h-8 grid place-items-center rounded-full text-sm font-semibold ${day.toDateString() === new Date().toDateString() ? "bg-[#30312d] text-white" : ""}`}
                >
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
          <div className="h-[900px] grid grid-cols-[70px_repeat(7,1fr)] bg-[linear-gradient(to_bottom,#eeece7_1px,transparent_1px)] bg-[length:100%_60px]">
            <div>
              {Array.from({ length: 15 }, (_, i) => (
                <div
                  key={i}
                  className="h-[60px] text-[10px] text-[#999] text-center pt-1"
                >
                  {String(i + 7).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekDays.map((day, dayIndex) => (
              <div
                key={day.toISOString()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropLesson(e, day)}
                className="relative border-l border-[#eeece7]"
              >
                {visible
                  .filter(
                    (lesson) =>
                      new Date(lesson.starts_at).toDateString() ===
                      day.toDateString(),
                  )
                  .map((lesson, index) => {
                    const start = new Date(lesson.starts_at),
                      end = new Date(lesson.ends_at);
                    const startHour =
                      start.getHours() + start.getMinutes() / 60;
                    const duration = (end - start) / 36e5;
                    const audienceNames = [
                      ...(lesson.student_audiences || []).map(
                        (item) =>
                          `${item.student.first_name} ${item.student.last_name}`,
                      ),
                      ...(lesson.group_audiences || []).map(
                        (item) => item.group.name,
                      ),
                    ];
                    if (!audienceNames.length && lesson.student)
                      audienceNames.push(
                        `${lesson.student.first_name} ${lesson.student.last_name}`,
                      );
                    if (!audienceNames.length && lesson.group)
                      audienceNames.push(lesson.group.name);
                    const audience = audienceNames.length
                      ? audienceNames.join(", ")
                      : "Open slot";
                    return (
                      <button
                        draggable={!readOnly}
                        onDragStart={(e) => {
                          if (readOnly) return;
                          dragging.current = true;
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/lesson-id", lesson.id);
                        }}
                        onClick={() =>
                          !readOnly && !dragging.current && setEditing(lesson)
                        }
                        key={lesson.id}
                        className={`absolute left-2 right-2 rounded-xl border text-left p-3 overflow-hidden ${readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing hover:shadow-md"} transition ${colors[index % colors.length]}`}
                        style={{
                          top: (startHour - 7) * 60 + 5,
                          height: Math.max(44, duration * 60 - 8),
                        }}
                      >
                        <div className="flex gap-1 items-center">
                          <Icon size={15}>
                            {lesson.subject?.icon || "event"}
                          </Icon>
                          <span className="text-xs font-semibold truncate">
                            {lesson.available
                              ? "Available"
                              : lesson.subject?.name || "Lesson"}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-60 mt-1 truncate">
                          {audience}
                        </div>
                        <div className="text-[9px] opacity-50 mt-1">
                          {timeValue(start)} · {duration}h
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {editing && (
        <LessonEditor
          lesson={editing.id ? editing : null}
          initialDate={editing.id ? null : weekDays[0]}
          students={students}
          subjects={subjects}
          groups={groups}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            editing.id
              ? await onUpdate(editing.id, value)
              : await onCreate(value);
            setEditing(null);
          }}
          onDelete={
            editing.id
              ? async () => {
                  await onDelete(editing.id);
                  setEditing(null);
                }
              : null
          }
        />
      )}
      {pendingMove && (
        <ConfirmMove
          move={pendingMove}
          onCancel={() => setPendingMove(null)}
          onSave={async () => {
            await onUpdate(pendingMove.lesson.id, {
              starts_at: pendingMove.starts_at,
              ends_at: pendingMove.ends_at,
            });
            setPendingMove(null);
          }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children, small = false }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`w-full ${small ? "max-w-sm" : "max-w-xl"} max-h-[92vh] overflow-auto bg-[#fbfaf7] rounded-[26px] shadow-2xl p-6 animate-in`}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border-0 bg-[#eeece6] grid place-items-center"
          >
            <Icon>close</Icon>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => (
  <label className="block text-xs font-semibold text-[#66675f] mb-4">
    {label}
    {children}
  </label>
);

function LessonEditor({
  lesson,
  initialDate,
  students,
  subjects,
  groups,
  onClose,
  onSave,
  onDelete,
}) {
  const initialStudentIds =
    lesson?.student_audiences?.map((item) => item.student_id) ||
    (lesson?.student_id ? [lesson.student_id] : []);
  const initialGroupIds =
    lesson?.group_audiences?.map((item) => item.group_id) ||
    (lesson?.group_id ? [lesson.group_id] : []);
  const initialDuration = lesson
    ? (new Date(lesson.ends_at) - new Date(lesson.starts_at)) / 60000
    : 60;
  const [form, setForm] = useState({
    subject_id: lesson?.subject_id || subjects[0]?.id || "",
    student_ids: initialStudentIds,
    group_ids: initialGroupIds,
    date: dateValue(lesson?.starts_at || initialDate || new Date()),
    time: timeValue(lesson?.starts_at || new Date().setHours(10, 0, 0, 0)),
    duration: initialDuration,
    available: lesson?.available || false,
    notes: lesson?.notes || "",
    recurrence_weeks: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!form.available && !form.student_ids.length && !form.group_ids.length)
        throw new Error("Select at least one student or group.");
      const start = new Date(`${form.date}T${form.time}`);
      const end = new Date(start.getTime() + Number(form.duration) * 60000);
      await onSave({
        subject_id: form.subject_id || null,
        student_ids: form.available ? [] : form.student_ids,
        group_ids: form.available ? [] : form.group_ids,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        available: form.available,
        notes: form.notes || null,
        ...(!lesson ? { recurrence_weeks: Number(form.recurrence_weeks) } : {}),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal
      title={lesson ? "Edit lesson" : "Schedule a lesson"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Subject">
            <select
              required
              className={inputClass}
              value={form.subject_id}
              onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              required
              type="date"
              className={inputClass}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Start time">
            <input
              required
              type="time"
              step="900"
              className={inputClass}
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </Field>
          <Field label="Duration">
            <select
              className={inputClass}
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            >
              {[30, 45, 60, 75, 90, 120, 180].map((v) => (
                <option value={v} key={v}>
                  {v < 60 ? `${v} minutes` : `${v / 60} hours`}
                </option>
              ))}
            </select>
          </Field>
          {!lesson && (
            <Field label="Repeat weekly">
              <select
                className={inputClass}
                value={form.recurrence_weeks}
                onChange={(e) =>
                  setForm({ ...form, recurrence_weeks: e.target.value })
                }
              >
                <option value="1">Does not repeat</option>
                <option value="2">For 2 weeks</option>
                <option value="4">For 4 weeks</option>
                <option value="8">For 8 weeks</option>
                <option value="12">For 12 weeks</option>
                <option value="24">For 24 weeks</option>
                <option value="52">For 1 year</option>
              </select>
            </Field>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs mb-4">
          <input
            type="checkbox"
            checked={form.available}
            onChange={(e) => setForm({ ...form, available: e.target.checked })}
          />
          Available booking slot
        </label>
        {!form.available && (
          <AudiencePicker
            students={students}
            groups={groups}
            studentIds={form.student_ids}
            groupIds={form.group_ids}
            onStudents={(student_ids) => setForm({ ...form, student_ids })}
            onGroups={(group_ids) => setForm({ ...form, group_ids })}
          />
        )}
        <Field label="Notes">
          <textarea
            className={`${inputClass} h-20 py-3 resize-none`}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        {error && (
          <p className="mb-3 text-xs text-[#a35645] bg-[#f3e3de] rounded-xl p-3">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          {onDelete && (
            <button
              type="button"
              onClick={() =>
                confirm("Delete this lesson permanently?") && onDelete()
              }
              className="h-11 px-4 rounded-xl border border-[#dabfb6] bg-[#f6ebe7] text-[#995848] text-sm"
            >
              Delete
            </button>
          )}
          <button
            disabled={saving}
            className="ml-auto h-11 px-6 rounded-xl border-0 bg-[#30312d] text-white text-sm font-semibold"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AudiencePicker({
  students,
  groups,
  studentIds,
  groupIds,
  onStudents,
  onGroups,
}) {
  const toggle = (values, id, setter) =>
    setter(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  return (
    <div className="mb-4 rounded-2xl border border-[#dedbd3] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold">Audience</p>
          <p className="text-[10px] text-[#999] mt-0.5">
            Mix any students and groups
          </p>
        </div>
        <span className="text-[10px] bg-[#efede7] rounded-full px-2 py-1">
          {studentIds.length + groupIds.length} selected
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 max-h-44 overflow-auto">
        <div>
          <p className="text-[10px] tracking-wider text-[#999] mb-2">
            INDIVIDUAL STUDENTS
          </p>
          {students.length ? (
            students.map((student) => (
              <label
                key={student.id}
                className="flex items-center gap-2 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={studentIds.includes(student.id)}
                  onChange={() => toggle(studentIds, student.id, onStudents)}
                />
                {student.first_name} {student.last_name}
              </label>
            ))
          ) : (
            <p className="text-xs text-[#aaa]">No students yet</p>
          )}
        </div>
        <div>
          <p className="text-[10px] tracking-wider text-[#999] mb-2">GROUPS</p>
          {groups.length ? (
            groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={groupIds.includes(group.id)}
                  onChange={() => toggle(groupIds, group.id, onGroups)}
                />
                {group.name}
              </label>
            ))
          ) : (
            <p className="text-xs text-[#aaa]">No groups yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmMove({ move, onCancel, onSave }) {
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Save new position?" onClose={onCancel} small>
      <div className="rounded-2xl bg-[#efede7] p-4 mb-5">
        <p className="text-sm font-semibold">
          {move.lesson.subject?.name || "Lesson"}
        </p>
        <p className="text-xs text-[#777] mt-1">
          {new Date(move.starts_at).toLocaleString([], {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <p className="text-sm text-[#777] mb-6">
        The lesson has been moved. Save this new date and time?
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="h-10 px-4 rounded-xl border border-[#ddd] bg-white text-sm"
        >
          Discard
        </button>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave();
          }}
          className="h-10 px-5 rounded-xl border-0 bg-[#30312d] text-white text-sm font-semibold"
        >
          {saving ? "Saving…" : "Save move"}
        </button>
      </div>
    </Modal>
  );
}
