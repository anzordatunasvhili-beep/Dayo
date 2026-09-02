import { useEffect, useMemo, useRef, useState } from "react";

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
function formatFileSize(size) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;
const zoneOccurrence = (zone, day) => {
  const source = new Date(zone.starts_at);
  const start = new Date(day);
  start.setHours(source.getHours(), source.getMinutes(), 0, 0);
  const duration = new Date(zone.ends_at) - source;
  return {
    ...zone,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + duration).toISOString(),
  };
};
const isBlocked = (startsAt, endsAt, zones) => {
  const start = new Date(startsAt),
    end = new Date(endsAt);
  return zones.some((zone) => {
    if (!zone.recurring_weekly)
      return overlaps(
        start,
        end,
        new Date(zone.starts_at),
        new Date(zone.ends_at),
      );
    for (const offset of [-1, 0]) {
      const day = new Date(start);
      day.setDate(day.getDate() + offset);
      if (day.getDay() === new Date(zone.starts_at).getDay()) {
        const occurrence = zoneOccurrence(zone, day);
        if (
          overlaps(
            start,
            end,
            new Date(occurrence.starts_at),
            new Date(occurrence.ends_at),
          )
        )
          return true;
      }
    }
    return false;
  });
};

export default function EditableSchedule({
  lessons,
  students,
  subjects,
  groups,
  onCreate,
  onUpdate,
  onDelete,
  readOnly = false,
  redZones = [],
  onCreateRedZone,
  onUpdateRedZone,
  onDeleteRedZone,
  onTrack,
  onHomeworkAssignment,
  onHomeworkAssignmentDownload,
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [editing, setEditing] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const [dragMotion, setDragMotion] = useState(null);
  const [editingZone, setEditingZone] = useState(null);
  const [moveError, setMoveError] = useState("");
  const [hourHeight, setHourHeight] = useState(40);
  const calendarBody = useRef(null);
  const dragging = useRef(false);
  useEffect(() => {
    const fit = () =>
      setHourHeight(
        Math.max(22, Math.min(46, (window.innerHeight - 250) / 16)),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
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
  const startDrag = (event, lesson) => {
    if (readOnly || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragMotion({
      lesson,
      originX: event.clientX,
      originY: event.clientY,
      x: 0,
      y: 0,
    });
  };
  const moveDrag = (event) => {
    if (!dragMotion) return;
    const x = event.clientX - dragMotion.originX;
    const y = event.clientY - dragMotion.originY;
    if (Math.abs(x) + Math.abs(y) > 4) dragging.current = true;
    setDragMotion({ ...dragMotion, x, y });
  };
  const finishDrag = (event) => {
    if (!dragMotion) return;
    if (dragging.current && calendarBody.current) {
      const rect = calendarBody.current.getBoundingClientRect();
      const dayWidth = (rect.width - 70) / 7;
      const dayIndex = Math.max(
        0,
        Math.min(6, Math.floor((event.clientX - rect.left - 70) / dayWidth)),
      );
      const minuteOffset = Math.max(
        0,
        Math.min(
          15 * 60,
          Math.round((((event.clientY - rect.top) / hourHeight) * 60) / 15) *
            15,
        ),
      );
      const start = new Date(weekDays[dayIndex]);
      start.setHours(
        7 + Math.floor(minuteOffset / 60),
        minuteOffset % 60,
        0,
        0,
      );
      const duration =
        new Date(dragMotion.lesson.ends_at) -
        new Date(dragMotion.lesson.starts_at);
      const endsAt = new Date(start.getTime() + duration).toISOString();
      if (isBlocked(start.toISOString(), endsAt, redZones)) {
        setMoveError("That time is inside a teacher red zone.");
        setTimeout(() => setMoveError(""), 3500);
      } else
        setPendingMove({
          lesson: dragMotion.lesson,
          starts_at: start.toISOString(),
          ends_at: endsAt,
        });
    }
    setDragMotion(null);
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
            onClick={() => setEditingZone({})}
            className="h-10 px-4 rounded-xl border border-[#dfb9b0] bg-[#f6e7e3] text-[#944f42] text-xs font-semibold flex items-center gap-2"
          >
            <Icon size={17}>block</Icon>Red zone
          </button>
        )}
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
          <div
            ref={calendarBody}
            className="grid grid-cols-[70px_repeat(7,1fr)] bg-[linear-gradient(to_bottom,#eeece7_1px,transparent_1px)]"
            style={{
              height: hourHeight * 16,
              backgroundSize: `100% ${hourHeight}px`,
            }}
          >
            <div>
              {Array.from({ length: 16 }, (_, i) => (
                <div
                  key={i}
                  style={{ height: hourHeight }}
                  className="text-[10px] text-[#999] text-center pt-1"
                >
                  {String(i + 7).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekDays.map((day, dayIndex) => (
              <div
                key={day.toISOString()}
                className="relative border-l border-[#eeece7]"
              >
                {redZones
                  .map((zone) =>
                    zone.recurring_weekly
                      ? new Date(zone.starts_at).getDay() === day.getDay()
                        ? zoneOccurrence(zone, day)
                        : null
                      : new Date(zone.starts_at).toDateString() ===
                          day.toDateString()
                        ? zone
                        : null,
                  )
                  .filter(Boolean)
                  .map((zone) => {
                    const start = new Date(zone.starts_at),
                      end = new Date(zone.ends_at);
                    const startHour =
                      start.getHours() + start.getMinutes() / 60;
                    const duration = (end - start) / 36e5;
                    return (
                      <button
                        key={`${zone.id}-${day.toISOString()}`}
                        onClick={() =>
                          !readOnly &&
                          setEditingZone(
                            redZones.find((item) => item.id === zone.id),
                          )
                        }
                        className="absolute left-1 right-1 z-0 rounded-lg border border-[#d99c91] bg-[repeating-linear-gradient(135deg,#f4d9d4,#f4d9d4_6px,#efd0ca_6px,#efd0ca_12px)] p-2 text-left overflow-hidden"
                        style={{
                          top: Math.max(0, (startHour - 7) * hourHeight) + 2,
                          height: Math.max(
                            24,
                            Math.min(
                              duration * hourHeight,
                              (23 - Math.max(7, startHour)) * hourHeight,
                            ) - 4,
                          ),
                        }}
                      >
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#8f463a]">
                          <Icon size={13}>block</Icon>
                          {zone.label}
                        </div>
                        <div className="text-[9px] text-[#a26055] mt-1">
                          {timeValue(start)}–{timeValue(end)}
                          {zone.recurring_weekly ? " · weekly" : ""}
                        </div>
                      </button>
                    );
                  })}
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
                        onPointerDown={(e) => startDrag(e, lesson)}
                        onPointerMove={moveDrag}
                        onPointerUp={finishDrag}
                        onPointerCancel={() => {
                          setDragMotion(null);
                          dragging.current = false;
                        }}
                        onClick={() =>
                          !readOnly && !dragging.current && setEditing(lesson)
                        }
                        key={lesson.id}
                        className={`absolute left-2 right-2 rounded-xl border text-left p-3 overflow-hidden select-none ${readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing hover:shadow-md touch-none"} ${colors[index % colors.length]}`}
                        style={{
                          top: (startHour - 7) * hourHeight + 3,
                          height: Math.max(32, duration * hourHeight - 6),
                          transform:
                            dragMotion?.lesson.id === lesson.id
                              ? `translate3d(${dragMotion.x}px, ${dragMotion.y}px, 0) scale(1.02)`
                              : "translate3d(0,0,0)",
                          zIndex: dragMotion?.lesson.id === lesson.id ? 30 : 1,
                          boxShadow:
                            dragMotion?.lesson.id === lesson.id
                              ? "0 16px 30px rgba(40,40,35,.18)"
                              : undefined,
                          transition:
                            dragMotion?.lesson.id === lesson.id
                              ? "none"
                              : "transform 180ms ease, box-shadow 180ms ease",
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
          redZones={redZones}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            editing.id
              ? await onUpdate(editing.id, value.data, value.scope)
              : await onCreate(value.data);
            setEditing(null);
          }}
          onDelete={
            editing.id
              ? async (scope) => {
                  await onDelete(editing.id, scope);
                  setEditing(null);
                }
              : null
          }
          onTrack={onTrack}
          onHomeworkAssignment={onHomeworkAssignment}
          onHomeworkAssignmentDownload={onHomeworkAssignmentDownload}
        />
      )}
      {editingZone && (
        <RedZoneEditor
          zone={editingZone.id ? editingZone : null}
          initialDate={editingZone.id ? null : weekDays[0]}
          onClose={() => setEditingZone(null)}
          onSave={async (values) => {
            editingZone.id
              ? await onUpdateRedZone(editingZone.id, values)
              : await onCreateRedZone(values);
            setEditingZone(null);
          }}
          onDelete={
            editingZone.id
              ? async () => {
                  await onDeleteRedZone(editingZone.id);
                  setEditingZone(null);
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
            await onUpdate(
              pendingMove.lesson.id,
              {
                starts_at: pendingMove.starts_at,
                ends_at: pendingMove.ends_at,
              },
              "occurrence",
            );
            setPendingMove(null);
          }}
        />
      )}
      {moveError && (
        <div className="fixed bottom-6 right-6 z-[70] bg-[#9a4d41] text-white px-5 py-3 rounded-xl shadow-xl text-sm">
          {moveError}
        </div>
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
  redZones,
  onClose,
  onSave,
  onDelete,
  onTrack,
  onHomeworkAssignment,
  onHomeworkAssignmentDownload,
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
  const [seriesScope, setSeriesScope] = useState("occurrence");
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!form.available && !form.student_ids.length && !form.group_ids.length)
        throw new Error("Select at least one student or group.");
      const start = new Date(`${form.date}T${form.time}`);
      const end = new Date(start.getTime() + Number(form.duration) * 60000);
      if (isBlocked(start.toISOString(), end.toISOString(), redZones))
        throw new Error("This lesson overlaps a teacher red zone.");
      const data = {
        subject_id: form.subject_id || null,
        student_ids: form.available ? [] : form.student_ids,
        group_ids: form.available ? [] : form.group_ids,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        available: form.available,
        notes: form.notes || null,
        ...(!lesson ? { recurrence_weeks: Number(form.recurrence_weeks) } : {}),
      };
      await onSave({
        data,
        scope: lesson?.recurrence_series_id ? seriesScope : "occurrence",
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
        {lesson?.recurrence_series_id && (
          <Field label="Apply changes to">
            <select
              className={inputClass}
              value={seriesScope}
              onChange={(e) => setSeriesScope(e.target.value)}
            >
              <option value="occurrence">Only this lesson</option>
              <option value="future">This and following lessons</option>
              <option value="series">All lessons in this series</option>
            </select>
          </Field>
        )}
        {lesson && (
          <>
            <HomeworkAssignmentEditor
              lesson={lesson}
              onSave={onHomeworkAssignment}
              onDownload={onHomeworkAssignmentDownload}
            />
            <TrackingPanel
              lesson={lesson}
              students={students}
              groups={groups}
              onTrack={onTrack}
            />
          </>
        )}
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
                confirm(
                  seriesScope === "occurrence"
                    ? "Delete only this lesson?"
                    : seriesScope === "future"
                      ? "Delete this and all following lessons in the series?"
                      : "Delete every lesson in this repeated series?",
                ) && onDelete(seriesScope)
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

function HomeworkAssignmentEditor({ lesson, onSave, onDownload }) {
  const assignment = lesson.homework_assignment?.[0];
  const [description, setDescription] = useState(assignment?.description || "");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDescription(assignment?.description || "");
    setFiles([]);
  }, [assignment?.id, assignment?.description]);

  if (!onSave) return null;
  const attachments = assignment?.attachments || [];
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(lesson.id, { description, files });
      setFiles([]);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  const download = async (attachment) => {
    try {
      setError("");
      const url = await onDownload(attachment.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  return (
    <form onSubmit={submit} className="mb-5 rounded-2xl border border-[#dedbd3] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">Homework assignment</p>
          <p className="mt-1 text-[10px] text-[#999]">
            Add instructions and PDF files students can open before submitting
          </p>
        </div>
        {assignment && (
          <span className="rounded-full bg-[#e2ebe5] px-2 py-1 text-[10px] font-bold text-[#52735d]">
            Assigned
          </span>
        )}
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        maxLength={1200}
        placeholder="Homework instructions, page numbers, links, or reminders..."
        className="w-full resize-none rounded-xl border border-[#dedbd2] bg-[#fbfaf7] px-3 py-2 text-xs outline-none focus:border-[#30312d]"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9c4b8] bg-[#fbfaf7] px-3 text-xs font-bold text-[#30312d]">
          <Icon size={17}>picture_as_pdf</Icon>
          {files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Attach PDF or files"}
          <input
            type="file"
            multiple
            accept=".pdf,application/pdf,image/*,.doc,.docx,.ppt,.pptx,.txt"
            onChange={(event) => setFiles([...event.target.files])}
            className="hidden"
          />
        </label>
        <button
          disabled={saving || (!description.trim() && files.length === 0)}
          className="min-h-10 rounded-xl border-0 bg-[#30312d] px-4 text-xs font-bold text-white disabled:opacity-45"
        >
          {saving ? "Uploading..." : assignment ? "Update assignment" : "Assign homework"}
        </button>
      </div>
      {attachments.length > 0 && (
        <div className="mt-2 space-y-1">
          {attachments.map((attachment) => (
            <button
              key={attachment.path}
              type="button"
              onClick={() => download(attachment)}
              className="flex w-full items-center gap-2 rounded-xl bg-[#fbfaf7] px-3 py-2 text-left text-xs font-semibold text-[#595a53]"
            >
              <Icon size={17}>description</Icon>
              <span className="min-w-0 flex-1 truncate">{attachment.relative_path || attachment.name}</span>
              <span className="shrink-0 text-[#999a92]">{formatFileSize(attachment.size)}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-[#a35645]">{error}</p>}
    </form>
  );
}

function TrackingPanel({ lesson, students, groups, onTrack }) {
  const direct = (lesson.student_audiences || []).map(
    (item) => item.student_id,
  );
  if (lesson.student_id) direct.push(lesson.student_id);
  const groupIds = (lesson.group_audiences || []).map((item) => item.group_id);
  if (lesson.group_id) groupIds.push(lesson.group_id);
  const memberIds = groups
    .filter((group) => groupIds.includes(group.id))
    .flatMap((group) =>
      (group.members || []).map((member) => member.student_id),
    );
  const ids = [...new Set([...direct, ...memberIds])];
  const attendees = students.filter((student) => ids.includes(student.id));
  const initial = Object.fromEntries(
    attendees.map((student) => {
      const saved = (lesson.records || []).find(
        (record) => record.student_id === student.id,
      );
      return [
        student.id,
        {
          attendance: saved?.attendance || "unknown",
          homework: saved?.homework || "none",
          homework_note: saved?.homework_note || "",
          billable: saved?.billable ?? true,
          paid: saved?.paid ?? false,
        },
      ];
    }),
  );
  const [records, setRecords] = useState(initial);
  const change = (studentId, field, value) => {
    const next = { ...records[studentId], [field]: value };
    setRecords({ ...records, [studentId]: next });
    onTrack({ lesson_id: lesson.id, student_id: studentId, ...next });
  };
  if (!attendees.length) return null;
  return (
    <div className="mb-5 rounded-2xl border border-[#dedbd3] bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold">Attendance & homework</p>
        <p className="text-[10px] text-[#999] mt-1">
          Tracked separately for every student
        </p>
      </div>
      <div className="space-y-3">
        {attendees.map((student) => (
          <div key={student.id} className="rounded-xl bg-[#f5f3ee] p-3">
            <p className="text-xs font-semibold mb-2">
              {student.first_name} {student.last_name}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              <select
                className="h-9 rounded-lg border border-[#ddd] bg-white px-2 text-xs"
                value={records[student.id].attendance}
                onChange={(e) =>
                  change(student.id, "attendance", e.target.value)
                }
              >
                <option value="unknown">Attendance not set</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="excused">Excused</option>
              </select>
              <select
                className="h-9 rounded-lg border border-[#ddd] bg-white px-2 text-xs"
                value={records[student.id].homework}
                onChange={(e) => change(student.id, "homework", e.target.value)}
              >
                <option value="none">No homework</option>
                <option value="assigned">Assigned</option>
                <option value="submitted">Submitted</option>
                <option value="completed">Completed</option>
                <option value="missing">Missing</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={records[student.id].billable}
                  onChange={(e) =>
                    change(student.id, "billable", e.target.checked)
                  }
                />
                Counts toward payment
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-[#52735d]">
                <input
                  type="checkbox"
                  checked={records[student.id].paid}
                  onChange={(e) => change(student.id, "paid", e.target.checked)}
                />
                Already paid
              </label>
            </div>
            <input
              className="mt-2 w-full h-9 rounded-lg border border-[#ddd] bg-white px-2 text-xs"
              placeholder="Homework note"
              value={records[student.id].homework_note}
              onChange={(e) =>
                setRecords({
                  ...records,
                  [student.id]: {
                    ...records[student.id],
                    homework_note: e.target.value,
                  },
                })
              }
              onBlur={() =>
                change(
                  student.id,
                  "homework_note",
                  records[student.id].homework_note,
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RedZoneEditor({ zone, initialDate, onClose, onSave, onDelete }) {
  const defaultStart =
    zone?.starts_at || new Date(initialDate || new Date()).setHours(7, 0, 0, 0);
  const defaultEnd =
    zone?.ends_at || new Date(initialDate || new Date()).setHours(9, 0, 0, 0);
  const [form, setForm] = useState({
    label: zone?.label || "Unavailable",
    date: dateValue(defaultStart),
    start: timeValue(defaultStart),
    endDate: dateValue(defaultEnd),
    end: timeValue(defaultEnd),
    recurring_weekly: zone?.recurring_weekly || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={zone ? "Edit red zone" : "Add red zone"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const starts_at = new Date(
              `${form.date}T${form.start}`,
            ).toISOString();
            const ends_at = new Date(
              `${form.endDate}T${form.end}`,
            ).toISOString();
            if (new Date(ends_at) <= new Date(starts_at))
              throw new Error("End time must be after start time.");
            await onSave({
              label: form.label,
              starts_at,
              ends_at,
              recurring_weekly: form.recurring_weekly,
            });
          } catch (requestError) {
            setError(requestError.message);
            setSaving(false);
          }
        }}
      >
        <Field label="Label">
          <input
            required
            className={inputClass}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Night shift, morning shift…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
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
              className={inputClass}
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="End date">
            <input
              required
              type="date"
              className={inputClass}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
          <Field label="End time">
            <input
              required
              type="time"
              className={inputClass}
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs mb-5">
          <input
            type="checkbox"
            checked={form.recurring_weekly}
            onChange={(e) =>
              setForm({ ...form, recurring_weekly: e.target.checked })
            }
          />
          Repeat every week on this weekday
        </label>
        {error && (
          <p className="mb-3 text-xs text-[#a35645] bg-[#f3e3de] rounded-xl p-3">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          {onDelete && (
            <button
              type="button"
              onClick={() => confirm("Delete this red zone?") && onDelete()}
              className="h-11 px-4 rounded-xl border border-[#dabfb6] bg-[#f6e7e3] text-[#995848] text-sm"
            >
              Delete
            </button>
          )}
          <button
            disabled={saving}
            className="ml-auto h-11 px-5 rounded-xl border-0 bg-[#30312d] text-white text-sm font-semibold"
          >
            {saving ? "Saving…" : "Save red zone"}
          </button>
        </div>
      </form>
    </Modal>
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
