import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import {
  createGroup,
  createLesson,
  createPayment,
  createStudent,
  createSubject,
  deleteLesson,
  getWorkspace,
  markPaymentPaid,
  updateLesson,
  updateSubject,
} from "./lib/api";
import Auth from "./Auth";
import EditableSchedule from "./components/EditableSchedule";

const Icon = ({ children, size = 20 }) => (
  <span className="material-symbols-rounded" style={{ fontSize: size }}>
    {children}
  </span>
);
const nav = [
  ["dashboard", "space_dashboard", "Overview"],
  ["schedule", "calendar_month", "Schedule"],
  ["students", "group", "Students"],
  ["payments", "account_balance_wallet", "Payments"],
  ["subjects", "menu_book", "Subjects & groups"],
];
const mondayOf = (date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
};
const weekStart = mondayOf(new Date());
const days = Array.from({ length: 5 }, (_, i) => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + i);
  return {
    short: d.toLocaleDateString("en", { weekday: "short" }).toUpperCase(),
    num: String(d.getDate()),
    name: d.toLocaleDateString("en", { weekday: "long" }),
    date: d,
  };
});
const colorMap = {
  sage: "bg-[#dceae1] border-[#bad0c2]",
  blue: "bg-[#dee8ef] border-[#becfd9]",
  sand: "bg-[#f1e6cc] border-[#ddcda8]",
  lilac: "bg-[#e7e1ed] border-[#cec2d7]",
  rose: "bg-[#efdfda] border-[#dabfb6]",
};

function Sidebar({ page, setPage, open, setOpen, profile }) {
  const visibleNav =
    profile?.role === "student" ? nav.filter(([id]) => id !== "students") : nav;
  return (
    <aside
      className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-[260px] bg-[#f5f3ee] border-r border-[#deddd7] flex flex-col transition-transform`}
    >
      <div className="h-24 px-7 flex items-center justify-between">
        <button
          onClick={() => setPage("dashboard")}
          className="flex items-center gap-3 bg-transparent border-0"
        >
          <span className="w-10 h-10 rounded-2xl bg-[#30312d] text-white grid place-items-center">
            <Icon>school</Icon>
          </span>
          <span className="text-xl font-bold tracking-tight">dayo</span>
        </button>
        <button
          className="lg:hidden border-0 bg-transparent"
          onClick={() => setOpen(false)}
        >
          <Icon>close</Icon>
        </button>
      </div>
      <div className="px-4 flex-1">
        <p className="px-4 text-[10px] tracking-[.15em] text-[#999a92] font-semibold mb-3">
          WORKSPACE
        </p>
        {visibleNav.map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => {
              setPage(id);
              setOpen(false);
            }}
            className={`w-full h-11 px-4 mb-1 rounded-xl flex items-center gap-3 border-0 text-sm ${page === id ? "bg-white shadow-[0_3px_14px_rgba(30,30,25,.07)] text-[#20211d] font-semibold" : "bg-transparent text-[#66675f] hover:bg-white/60"}`}
          >
            <Icon>{icon}</Icon>
            {profile?.role === "student" && id === "subjects"
              ? "My subjects"
              : label}
            {id === "payments" && (
              <span className="ml-auto text-[10px] bg-[#e8d7c8] px-2 py-0.5 rounded-full">
                2 due
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="p-5">
        <button
          onClick={() => supabase?.auth.signOut()}
          title="Sign out"
          className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#e5e2db] text-left"
        >
          <div className="w-9 h-9 rounded-full bg-[#d8e3dc] grid place-items-center font-semibold text-xs">{`${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">
              {profile
                ? `${profile.first_name} ${profile.last_name}`
                : "Teacher"}
            </div>
            <div className="text-[10px] text-[#989890]">
              {profile?.role === "student" ? "Student" : "Teacher"} · Sign out
            </div>
          </div>
          <Icon size={18}>logout</Icon>
        </button>
      </div>
    </aside>
  );
}

function Header({ page, setMenu, profile }) {
  const titles = {
    dashboard: `Good morning, ${profile?.first_name || "Teacher"}`,
    schedule: "Your schedule",
    students: "Students",
    payments: "Payments",
    subjects: profile?.role === "student" ? "My subjects" : "Subjects & groups",
  };
  const today = new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return (
    <header className="h-20 flex items-center px-5 md:px-8 border-b border-[#e5e3dd] bg-[#fbfaf7]/90 sticky top-0 z-20 backdrop-blur">
      <button
        onClick={() => setMenu(true)}
        className="lg:hidden w-10 h-10 rounded-xl bg-white border border-[#ddd] mr-3 grid place-items-center"
      >
        <Icon>menu</Icon>
      </button>
      <div>
        <p className="text-[11px] text-[#96978f] mb-0.5">{today}</p>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight leading-none">
          {titles[page]}
        </h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-full bg-[#dceadf] text-[#3b6650]">
          <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
          Live workspace
        </span>
        <button className="w-10 h-10 rounded-xl bg-white border border-[#e1dfd9] grid place-items-center">
          <Icon>notifications</Icon>
        </button>
      </div>
    </header>
  );
}

function Stat({ icon, label, value, note, tint }) {
  return (
    <div className="bg-white border border-[#e7e4dd] rounded-[22px] p-5">
      <div
        className={`w-10 h-10 ${tint} rounded-xl grid place-items-center mb-5`}
      >
        <Icon>{icon}</Icon>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-[#85867e] mt-1">
        {label} <span className="text-[#afb0a8]">· {note}</span>
      </div>
    </div>
  );
}
function Dashboard({ setPage, data }) {
  const paid = data.payments
    .filter((p) => p.status === "paid")
    .reduce((n, p) => n + Number(p.amount), 0);
  const hours = data.lessons.reduce(
    (n, l) => n + (new Date(l.ends_at) - new Date(l.starts_at)) / 36e5,
    0,
  );
  const upcoming = data.lessons
    .filter((l) => new Date(l.starts_at) >= new Date())
    .slice(0, 3);
  return (
    <div className="p-5 md:p-8 max-w-[1400px] mx-auto animate-in">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          icon="groups"
          label="Active students"
          value={data.students.length}
          note="total"
          tint="bg-[#e2ebe5]"
        />
        <Stat
          icon="calendar_today"
          label="Scheduled lessons"
          value={data.lessons.length}
          note="all upcoming"
          tint="bg-[#e4e8ef]"
        />
        <Stat
          icon="payments"
          label="Payments collected"
          value={`$${paid.toFixed(0)}`}
          note="recorded"
          tint="bg-[#eee4d5]"
        />
        <Stat
          icon="schedule"
          label="Teaching time"
          value={`${hours.toFixed(1)}h`}
          note="scheduled"
          tint="bg-[#e9e1e8]"
        />
      </div>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-5 mt-5">
        <div className="bg-white border border-[#e7e4dd] rounded-[24px] p-5 md:p-6">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h2 className="font-semibold">Next lessons</h2>
              <p className="text-xs text-[#92938b] mt-1">
                Your upcoming schedule
              </p>
            </div>
            <button
              onClick={() => setPage("schedule")}
              className="text-xs bg-[#f1efe9] border-0 rounded-xl px-3 py-2"
            >
              View calendar
            </button>
          </div>
          {upcoming.length ? (
            upcoming.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-4 py-4 border-t border-[#efede8]"
              >
                <div
                  className={`w-2 h-10 rounded-full ${["bg-[#9bb5a2]", "bg-[#a7b8c6]", "bg-[#cdb98c]"][i]}`}
                />
                <div className="w-20 text-xs font-semibold">
                  {new Date(s.starts_at).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {s.subject?.name || "Available time"}
                  </div>
                  <div className="text-xs text-[#92938b] mt-1">
                    {s.student
                      ? `${s.student.first_name} ${s.student.last_name}`
                      : s.group?.name || "Open slot"}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Empty text="No upcoming lessons yet." />
          )}
        </div>
        <div className="bg-[#30312d] text-white rounded-[24px] p-6 relative overflow-hidden">
          <Icon size={28}>auto_awesome</Icon>
          <h2 className="text-xl font-semibold mt-10">
            Your live workspace is ready.
          </h2>
          <p className="text-sm text-white/55 mt-2 leading-relaxed">
            Schedule lessons, add students and keep payment records
            synchronized.
          </p>
          <button
            onClick={() => setPage("schedule")}
            className="mt-8 bg-white text-[#30312d] border-0 px-4 py-2.5 rounded-xl text-xs font-semibold"
          >
            Manage schedule
          </button>
        </div>
      </div>
    </div>
  );
}
const Empty = ({ text }) => (
  <div className="py-10 text-center text-sm text-[#999a92]">{text}</div>
);

function Schedule({ sessions, onCreate, students, subjects, groups }) {
  const [view, setView] = useState("week");
  const [modal, setModal] = useState(false);
  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto animate-in">
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <div className="flex items-center bg-white border border-[#e1dfd8] rounded-xl p-1">
          <button className="px-4 bg-transparent border-0 text-xs font-semibold">
            {days[0].date.toLocaleDateString("en", {
              month: "long",
              day: "numeric",
            })}{" "}
            –{" "}
            {days[4].date.toLocaleDateString("en", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </button>
        </div>
        <div className="ml-auto flex bg-[#e9e7e1] p-1 rounded-xl">
          {["week"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 border-0 rounded-lg text-xs capitalize ${view === v ? "bg-white shadow-sm font-semibold" : "bg-transparent text-[#777]"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setModal(true)}
          className="bg-[#30312d] text-white border-0 rounded-xl px-4 h-10 text-xs font-semibold flex items-center gap-2"
        >
          <Icon size={17}>add</Icon>New lesson
        </button>
      </div>
      <div className="bg-white rounded-[24px] border border-[#e4e2dc] overflow-auto">
        <div className="min-w-[850px]">
          <div className="grid grid-cols-[70px_repeat(5,1fr)] border-b border-[#ebe9e3]">
            <div />
            {days.map((d, i) => (
              <div
                key={d.short}
                className={`p-4 text-center border-l border-[#eeece7] ${i === 4 ? "bg-[#faf7f1]" : ""}`}
              >
                <div className="text-[10px] text-[#9a9b93] tracking-wider">
                  {d.short}
                </div>
                <div
                  className={`mx-auto mt-1 w-8 h-8 grid place-items-center rounded-full text-sm font-semibold ${new Date().toDateString() === d.date.toDateString() ? "bg-[#30312d] text-white" : ""}`}
                >
                  {d.num}
                </div>
              </div>
            ))}
          </div>
          <div className="relative h-[660px] grid grid-cols-[70px_repeat(5,1fr)] bg-[linear-gradient(to_bottom,#eeece7_1px,transparent_1px)] bg-[length:100%_60px]">
            {" "}
            <div>
              {Array.from({ length: 11 }, (_, i) => (
                <div
                  key={i}
                  className="h-[60px] text-[10px] text-[#999a92] text-center pt-1"
                >
                  {String(i + 7).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((_, day) => (
              <div key={day} className="relative border-l border-[#eeece7]">
                {sessions
                  .filter((s) => s.day === day)
                  .map((s) => (
                    <button
                      key={s.id}
                      title="Lesson saved in Supabase"
                      className={`absolute left-2 right-2 rounded-xl border text-left p-3 overflow-hidden hover:brightness-[.98] transition ${colorMap[s.color] || colorMap.sage}`}
                      style={{
                        top: (s.start - 7) * 60 + 5,
                        height: s.duration * 60 - 8,
                      }}
                    >
                      <div className="text-xs font-semibold truncate">
                        {s.title}
                      </div>
                      <div className="text-[10px] opacity-60 mt-1 truncate">
                        {s.student}
                      </div>
                      <div className="text-[9px] opacity-50 mt-2">
                        {s.start}:00 · {s.duration}h
                      </div>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {modal && (
        <LessonModal
          students={students}
          subjects={subjects}
          groups={groups}
          onClose={() => setModal(false)}
          onSave={async (s) => {
            await onCreate(s);
            setModal(false);
          }}
        />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-[#fbfaf7] rounded-[26px] shadow-2xl p-6 animate-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
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
const inputClass =
  "mt-2 w-full h-11 rounded-xl border border-[#dedbd3] bg-white px-3 outline-none focus:border-[#8f9d92] text-sm";
function LessonModal({ onClose, onSave, students, subjects, groups }) {
  const [form, setForm] = useState({
    subject_id: subjects[0]?.id || "",
    audience: students[0]?.id ? `student:${students[0].id}` : "",
    day: 0,
    time: "10:00",
    duration: 60,
    available: false,
  });
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title="Schedule a lesson" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const start = new Date(days[form.day].date);
          const [h, m] = form.time.split(":");
          start.setHours(+h, +m);
          const end = new Date(start.getTime() + form.duration * 60000);
          const [kind, id] = form.audience.split(":");
          await onSave({
            subject_id: form.subject_id || null,
            student_id: kind === "student" ? id : null,
            group_id: kind === "group" ? id : null,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            available: form.available,
          });
        }}
      >
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
          <Field label="Student or group">
            <select
              required={!form.available}
              className={inputClass}
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            >
              <option value="">Open availability</option>
              {students.map((s) => (
                <option value={`student:${s.id}`} key={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
              {groups.map((g) => (
                <option value={`group:${g.id}`} key={g.id}>
                  {g.name} (group)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Day">
            <select
              className={inputClass}
              value={form.day}
              onChange={(e) => setForm({ ...form, day: +e.target.value })}
            >
              {days.map((d, i) => (
                <option value={i} key={d.short}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start time">
            <input
              className={inputClass}
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </Field>
          <Field label="Duration">
            <select
              className={inputClass}
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: +e.target.value })}
            >
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs mb-4">
          <input
            type="checkbox"
            checked={form.available}
            onChange={(e) =>
              setForm({
                ...form,
                available: e.target.checked,
                audience: e.target.checked ? "" : form.audience,
              })
            }
          />
          Mark as an available booking slot
        </label>
        <button
          disabled={saving}
          className="w-full h-11 rounded-xl border-0 bg-[#30312d] text-white text-sm font-semibold mt-2"
        >
          {saving ? "Saving…" : "Add to schedule"}
        </button>
      </form>
    </ModalShell>
  );
}

function Students({ students, onCreate, subjects, groups, profile }) {
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const list = students.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.email.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="p-5 md:p-8 max-w-[1400px] mx-auto animate-in">
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <span className="absolute left-3 top-3 text-[#8f9088]">
            <Icon size={18}>search</Icon>
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#e1dfd8] outline-none text-sm"
            placeholder="Search students..."
          />
        </div>
        <button
          onClick={() => setModal(true)}
          className="ml-auto h-11 px-4 bg-[#30312d] text-white border-0 rounded-xl text-xs font-semibold flex gap-2 items-center"
        >
          <Icon size={17}>person_add</Icon>Add student
        </button>
      </div>
      <div className="bg-white border border-[#e5e2dc] rounded-[24px] overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_1.8fr_1.2fr_.7fr_40px] px-6 py-3 bg-[#f5f3ee] text-[10px] text-[#92938c] font-semibold tracking-wider">
          <span>STUDENT</span>
          <span>EMAIL</span>
          <span>SUBJECTS</span>
          <span>BALANCE</span>
          <span />
        </div>
        {list.length ? (
          list.map((s) => (
            <div
              key={s.id}
              className="grid md:grid-cols-[1.4fr_1.8fr_1.2fr_.7fr_40px] gap-2 md:gap-4 items-center px-5 md:px-6 py-4 border-t border-[#efede8] first:border-0"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full grid place-items-center text-xs font-semibold"
                  style={{ background: s.color }}
                >
                  {s.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-[10px] text-[#999]">Student</div>
                </div>
              </div>
              <div className="text-xs text-[#777871] truncate">{s.email}</div>
              <div className="flex gap-1 flex-wrap">
                {s.subjects.length ? (
                  s.subjects.map((x) => (
                    <span
                      key={x}
                      className="text-[9px] px-2 py-1 rounded-full bg-[#f0eee8]"
                    >
                      {x}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-[#aaa]">Not assigned</span>
                )}
              </div>
              <div
                className={`text-xs font-semibold ${s.balance ? "text-[#a25d4c]" : "text-[#5f816b]"}`}
              >
                {s.balance ? `$${s.balance} due` : "Paid"}
              </div>
              <button className="w-8 h-8 border-0 bg-transparent">
                <Icon size={18}>more_horiz</Icon>
              </button>
            </div>
          ))
        ) : (
          <Empty text="No students yet. Create your first student account." />
        )}
      </div>
      {modal && (
        <StudentModal
          profile={profile}
          subjects={subjects}
          groups={groups}
          onClose={() => setModal(false)}
          onSave={async (s) => {
            await onCreate(s);
            setModal(false);
          }}
        />
      )}
    </div>
  );
}
function StudentModal({ onClose, onSave, subjects, groups, profile }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    country_region: profile?.country_region || "GE_Tbilisi",
    subject_ids: [],
    lesson_mode: "individual",
    group_id: "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const code =
    profile?.studio_code ||
    `${profile?.first_name?.[0] || "T"}${profile?.last_name?.[0] || "R"}`;
  const email =
    form.first_name && form.last_name
      ? `${form.first_name}_${form.last_name}_${code}@Dayo.Edu.${form.country_region.replace(/_/g, "-")}`
      : "";
  return (
    <ModalShell title="Create student" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onSave(form);
          } catch (requestError) {
            setError(requestError.message);
            setSaving(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name">
            <input
              required
              className={inputClass}
              value={form.first_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  first_name: e.target.value.replace(/\s/g, ""),
                })
              }
            />
          </Field>
          <Field label="Last name">
            <input
              required
              className={inputClass}
              value={form.last_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_name: e.target.value.replace(/\s/g, ""),
                })
              }
            />
          </Field>
        </div>
        <Field label="Country & region">
          <input
            required
            className={inputClass}
            value={form.country_region}
            onChange={(e) =>
              setForm({
                ...form,
                country_region: e.target.value.replace(/\s/g, "_"),
              })
            }
          />
        </Field>
        <div className="mb-4 p-3 rounded-xl bg-[#efede7]">
          <div className="text-[10px] text-[#898a82] mb-1">ACCOUNT EMAIL</div>
          <div className="text-xs break-all font-medium">
            {email || "FirstName_LastName_Code@Dayo.Edu.Country-Region"}
          </div>
        </div>
        <Field label="Temporary password (optional)">
          <input
            className={inputClass}
            minLength="8"
            placeholder="Auto-generated if left empty"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Subjects">
          <select
            multiple
            className={`${inputClass} h-24 py-2`}
            value={form.subject_ids}
            onChange={(e) =>
              setForm({
                ...form,
                subject_ids: [...e.target.selectedOptions].map((o) => o.value),
              })
            }
          >
            {subjects.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Lesson type">
            <select
              className={inputClass}
              value={form.lesson_mode}
              onChange={(e) =>
                setForm({ ...form, lesson_mode: e.target.value })
              }
            >
              <option value="individual">Individual</option>
              <option value="group">Group</option>
            </select>
          </Field>
          <Field label="Group">
            <select
              className={inputClass}
              value={form.group_id}
              onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            >
              <option value="">None</option>
              {groups.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error && (
          <p className="mb-3 text-xs text-[#a35645] bg-[#f3e3de] rounded-xl p-3">
            {error}
          </p>
        )}
        <button
          disabled={saving}
          className="w-full h-11 rounded-xl border-0 bg-[#30312d] text-white text-sm font-semibold"
        >
          {saving ? "Creating account…" : "Create student account"}
        </button>
      </form>
    </ModalShell>
  );
}

function Payments({ payments, students, onCreate, onPaid }) {
  const [modal, setModal] = useState(false);
  const paid = payments
    .filter((p) => p.status === "paid")
    .reduce((n, p) => n + Number(p.amount), 0);
  const due = payments
    .filter((p) => p.status !== "paid")
    .reduce((n, p) => n + Number(p.amount), 0);
  return (
    <div className="p-5 md:p-8 max-w-[1400px] mx-auto animate-in">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal(true)}
          className="h-10 px-4 bg-[#30312d] text-white border-0 rounded-xl text-xs flex items-center gap-2"
        >
          <Icon size={17}>add</Icon>New invoice
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Stat
          icon="paid"
          label="Collected"
          value={`$${paid.toFixed(2)}`}
          note="all time"
          tint="bg-[#e2ebe5]"
        />
        <Stat
          icon="pending_actions"
          label="Outstanding"
          value={`$${due.toFixed(2)}`}
          note={`${payments.filter((p) => p.status !== "paid").length} invoices`}
          tint="bg-[#eee0db]"
        />
        <Stat
          icon="receipt_long"
          label="Invoices"
          value={payments.length}
          note="total"
          tint="bg-[#e7e3ee]"
        />
      </div>
      <div className="bg-white rounded-[24px] border border-[#e5e2dc] p-6">
        <h2 className="font-semibold mb-5">Invoices</h2>
        {payments.length ? (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 py-4 border-t border-[#efede8]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#f0eee8] grid place-items-center">
                <Icon>receipt</Icon>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {p.student?.first_name} {p.student?.last_name}
                </div>
                <div className="text-xs text-[#999]">
                  Due {new Date(`${p.due_date}T12:00`).toLocaleDateString()} ·{" "}
                  {p.note || "Tuition"}
                </div>
              </div>
              <div className="text-sm font-semibold">
                {p.currency} {Number(p.amount).toFixed(2)}
              </div>
              {p.status === "paid" ? (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#deebe2] text-[#52735d]">
                  Paid
                </span>
              ) : (
                <button
                  onClick={() => onPaid(p.id)}
                  className="text-[10px] px-3 py-2 rounded-full border-0 bg-[#f1dfda] text-[#995848]"
                >
                  Mark paid
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty text="No invoices yet." />
        )}
      </div>
      {modal && (
        <PaymentModal
          students={students}
          onClose={() => setModal(false)}
          onSave={async (p) => {
            await onCreate(p);
            setModal(false);
          }}
        />
      )}
    </div>
  );
}
function PaymentModal({ students, onClose, onSave }) {
  const [form, setForm] = useState({
    student_id: students[0]?.id || "",
    amount: "",
    currency: "USD",
    due_date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  return (
    <ModalShell title="Create invoice" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...form, amount: Number(form.amount), status: "pending" });
        }}
      >
        <Field label="Student">
          <select
            required
            className={inputClass}
            value={form.student_id}
            onChange={(e) => setForm({ ...form, student_id: e.target.value })}
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option value={s.id} key={s.id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount">
            <input
              required
              min="0"
              step="0.01"
              type="number"
              className={inputClass}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <select
              className={inputClass}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option>USD</option>
              <option>GEL</option>
              <option>EUR</option>
            </select>
          </Field>
        </div>
        <Field label="Due date">
          <input
            required
            type="date"
            className={inputClass}
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
        </Field>
        <Field label="Note">
          <input
            className={inputClass}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <button className="w-full h-11 rounded-xl border-0 bg-[#30312d] text-white text-sm font-semibold">
          Create invoice
        </button>
      </form>
    </ModalShell>
  );
}
const subjectIcons = [
  ["calculate", "Math"],
  ["science", "Physics"],
  ["translate", "Language"],
  ["code", "Coding"],
  ["history_edu", "Literature"],
  ["biotech", "Biology"],
  ["public", "Geography"],
  ["palette", "Art"],
  ["music_note", "Music"],
  ["fitness_center", "Sport"],
  ["psychology", "General"],
  ["menu_book", "Other"],
];
function Subjects({
  subjects,
  groups,
  onSubject,
  onUpdateSubject,
  onGroup,
  students,
}) {
  const [subjectName, setSubjectName] = useState("");
  const [subjectIcon, setSubjectIcon] = useState("calculate");
  const [groupName, setGroupName] = useState("");
  return (
    <div className="p-5 md:p-8 max-w-[1400px] mx-auto animate-in">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubject({ name: subjectName, icon: subjectIcon });
          setSubjectName("");
        }}
        className="flex flex-wrap gap-2 mb-5"
      >
        <input
          required
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          className="h-10 px-3 bg-white border border-[#ddd] rounded-xl text-sm"
          placeholder="New subject name"
        />
        <select
          value={subjectIcon}
          onChange={(e) => setSubjectIcon(e.target.value)}
          className="h-10 px-3 bg-white border border-[#ddd] rounded-xl text-sm"
        >
          {subjectIcons.map(([icon, label]) => (
            <option key={icon} value={icon}>
              {label}
            </option>
          ))}
        </select>
        <button className="bg-[#30312d] text-white border-0 rounded-xl px-4 text-xs">
          Add subject
        </button>
      </form>
      <div className="grid md:grid-cols-3 gap-4">
        {subjects.length ? (
          subjects.map((x) => (
            <div
              key={x.id}
              className="bg-white rounded-[22px] border border-[#e5e2dc] p-6"
            >
              <div className="w-12 h-12 rounded-2xl grid place-items-center mb-5 bg-[#e2ebe5]">
                <Icon size={24}>{x.icon || "menu_book"}</Icon>
              </div>
              <input
                defaultValue={x.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== x.name &&
                  onUpdateSubject(x.id, { name: e.target.value.trim() })
                }
                className="w-full font-semibold bg-transparent border-0 border-b border-transparent focus:border-[#aaa] outline-none"
                aria-label="Subject name"
              />
              <label className="block text-[10px] text-[#91928a] mt-3">
                ICON
                <select
                  value={x.icon || "menu_book"}
                  onChange={(e) =>
                    onUpdateSubject(x.id, { icon: e.target.value })
                  }
                  className="mt-1 w-full h-9 px-2 bg-[#f3f1ec] border-0 rounded-lg text-xs"
                >
                  {subjectIcons.map(([icon, label]) => (
                    <option key={icon} value={icon}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))
        ) : (
          <Empty text="Add your first subject." />
        )}
      </div>
      <div className="mt-5 bg-white border border-[#e5e2dc] rounded-[24px] p-6">
        <div>
          <h2 className="font-semibold">Learning groups</h2>
          <p className="text-xs text-[#999] mt-1">
            Students can belong to a group and still have individual subjects.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGroup({
              name: groupName,
              subject_id: subjects[0]?.id,
              student_ids: [],
            });
            setGroupName("");
          }}
          className="flex gap-2 mt-5"
        >
          <input
            required
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="h-10 px-3 border border-[#ddd] rounded-xl text-sm"
            placeholder="Group name"
          />
          <button className="bg-[#30312d] text-white border-0 rounded-xl px-4 text-xs">
            Create group
          </button>
        </form>
        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {groups.map((g) => (
            <div key={g.id} className="rounded-2xl bg-[#f1efe9] p-5">
              <b className="text-sm">{g.name}</b>
              <p className="text-xs text-[#888] mt-1">
                {g.subject?.name || "No subject"} · {g.members?.length || 0}{" "}
                students
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentDashboard({ data, setPage }) {
  const upcoming = data.lessons
    .filter((lesson) => new Date(lesson.starts_at) >= new Date())
    .slice(0, 4);
  const due = data.payments
    .filter((payment) => payment.status !== "paid")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  return (
    <div className="p-5 md:p-8 max-w-[1200px] mx-auto animate-in">
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat
          icon="calendar_month"
          label="Upcoming lessons"
          value={upcoming.length}
          note="next sessions"
          tint="bg-[#e2ebe5]"
        />
        <Stat
          icon="menu_book"
          label="My subjects"
          value={data.subjects.length}
          note="assigned"
          tint="bg-[#e4e8ef]"
        />
        <Stat
          icon="receipt_long"
          label="Payment due"
          value={`$${due.toFixed(2)}`}
          note="outstanding"
          tint="bg-[#eee4d5]"
        />
      </div>
      <div className="mt-5 bg-white border border-[#e7e4dd] rounded-[24px] p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold">My next lessons</h2>
            <p className="text-xs text-[#999] mt-1">
              Your personal and group schedule
            </p>
          </div>
          <button
            onClick={() => setPage("schedule")}
            className="text-xs bg-[#f1efe9] border-0 rounded-xl px-3 py-2"
          >
            View schedule
          </button>
        </div>
        {upcoming.length ? (
          upcoming.map((lesson) => (
            <div
              key={lesson.id}
              className="flex items-center gap-4 py-4 border-t border-[#efede8]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#e2ebe5] grid place-items-center">
                <Icon>{lesson.subject?.icon || "event"}</Icon>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {lesson.subject?.name || "Lesson"}
                </p>
                <p className="text-xs text-[#999] mt-1">
                  {new Date(lesson.starts_at).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        ) : (
          <Empty text="No upcoming lessons." />
        )}
      </div>
    </div>
  );
}

function StudentPayments({ payments }) {
  const due = payments
    .filter((p) => p.status !== "paid")
    .reduce((n, p) => n + Number(p.amount), 0);
  return (
    <div className="p-5 md:p-8 max-w-[1100px] mx-auto animate-in">
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Stat
          icon="pending_actions"
          label="Outstanding"
          value={`$${due.toFixed(2)}`}
          note="current balance"
          tint="bg-[#eee0db]"
        />
        <Stat
          icon="receipt_long"
          label="Invoices"
          value={payments.length}
          note="payment history"
          tint="bg-[#e7e3ee]"
        />
      </div>
      <div className="bg-white rounded-[24px] border border-[#e5e2dc] p-6">
        <h2 className="font-semibold mb-5">My invoices</h2>
        {payments.length ? (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 py-4 border-t border-[#efede8]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#f0eee8] grid place-items-center">
                <Icon>receipt</Icon>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{p.note || "Tuition"}</p>
                <p className="text-xs text-[#999] mt-1">
                  Due {new Date(`${p.due_date}T12:00`).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {p.currency} {Number(p.amount).toFixed(2)}
              </p>
              <span
                className={`text-[10px] px-2.5 py-1 rounded-full ${p.status === "paid" ? "bg-[#deebe2] text-[#52735d]" : "bg-[#f1dfda] text-[#995848]"}`}
              >
                {p.status}
              </span>
            </div>
          ))
        ) : (
          <Empty text="No invoices." />
        )}
      </div>
    </div>
  );
}

function StudentSubjects({ subjects, groups }) {
  return (
    <div className="p-5 md:p-8 max-w-[1100px] mx-auto animate-in">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.length ? (
          subjects.map((subject) => (
            <div
              key={subject.id}
              className="bg-white rounded-[22px] border border-[#e5e2dc] p-6"
            >
              <div className="w-12 h-12 rounded-2xl grid place-items-center mb-6 bg-[#e2ebe5]">
                <Icon size={24}>{subject.icon || "menu_book"}</Icon>
              </div>
              <h3 className="font-semibold">{subject.name}</h3>
              <p className="text-xs text-[#999] mt-1">Assigned subject</p>
            </div>
          ))
        ) : (
          <Empty text="No subjects assigned yet." />
        )}
      </div>
      {groups.length > 0 && (
        <div className="mt-5 bg-white rounded-[24px] border border-[#e5e2dc] p-6">
          <h2 className="font-semibold mb-4">My groups</h2>
          {groups.map((group) => (
            <div key={group.id} className="py-3 border-t border-[#eee] text-sm">
              <b>{group.name}</b>
              <span className="text-[#999] ml-2">
                {group.subject?.name || "General"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setData(null);
    });
    return () => subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setError("");
      setData(await getWorkspace());
    } catch (e) {
      setError(e.message);
    }
  }, [session]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const act = async (fn, message) => {
    try {
      setError("");
      await fn();
      await refresh();
      setNotice(message);
      setTimeout(() => setNotice(""), 3500);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };
  if (session === undefined) return <Loading />;
  if (!session) return <Auth />;
  if (!data) return <Loading error={error} />;
  const displayStudents = data.students.map((s, i) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.email || "Student account",
    initials: `${s.first_name[0]}${s.last_name[0]}`,
    color: ["#dce9e4", "#e9e1d6", "#dfe3ef", "#eee2dd"][i % 4],
    subjects: [],
    balance: data.payments
      .filter((p) => p.student_id === s.id && p.status !== "paid")
      .reduce((n, p) => n + Number(p.amount), 0),
  }));
  const teacherContent = {
    dashboard: <Dashboard setPage={setPage} data={data} />,
    schedule: (
      <EditableSchedule
        lessons={data.lessons}
        students={data.students}
        subjects={data.subjects}
        groups={data.groups}
        onCreate={(v) => act(() => createLesson(v), "Lesson saved")}
        onUpdate={(id, v) => act(() => updateLesson(id, v), "Lesson updated")}
        onDelete={(id) => act(() => deleteLesson(id), "Lesson deleted")}
      />
    ),
    students: (
      <Students
        students={displayStudents}
        subjects={data.subjects}
        groups={data.groups}
        profile={data.profile}
        onCreate={(v) => act(() => createStudent(v), "Student account created")}
      />
    ),
    payments: (
      <Payments
        payments={data.payments}
        students={data.students}
        onCreate={(v) => act(() => createPayment(v), "Invoice created")}
        onPaid={(id) =>
          act(() => markPaymentPaid(id), "Payment marked as paid")
        }
      />
    ),
    subjects: (
      <Subjects
        subjects={data.subjects}
        groups={data.groups}
        students={data.students}
        onSubject={(name) => act(() => createSubject(name), "Subject added")}
        onUpdateSubject={(id, values) =>
          act(() => updateSubject(id, values), "Subject updated")
        }
        onGroup={(v) => act(() => createGroup(v), "Group created")}
      />
    ),
  };
  const studentContent = {
    dashboard: <StudentDashboard data={data} setPage={setPage} />,
    schedule: (
      <EditableSchedule
        lessons={data.lessons}
        students={[]}
        subjects={data.subjects}
        groups={data.groups}
        readOnly
      />
    ),
    payments: <StudentPayments payments={data.payments} />,
    subjects: <StudentSubjects subjects={data.subjects} groups={data.groups} />,
  };
  const content =
    (data.profile.role === "student" ? studentContent : teacherContent)[page] ||
    (data.profile.role === "student"
      ? studentContent.dashboard
      : teacherContent.dashboard);
  return (
    <div className="min-h-screen lg:h-screen flex bg-[#fbfaf7] lg:p-4 lg:gap-0">
      <Sidebar
        page={page}
        setPage={setPage}
        open={menu}
        setOpen={setMenu}
        profile={data.profile}
      />
      {menu && (
        <div
          onClick={() => setMenu(false)}
          className="fixed inset-0 bg-black/25 z-30 lg:hidden"
        />
      )}
      <main className="flex-1 min-w-0 lg:rounded-r-[28px] lg:border lg:border-l-0 border-[#deddd7] overflow-auto bg-[#fbfaf7]">
        <Header page={page} setMenu={setMenu} profile={data.profile} />
        {error && (
          <div className="m-4 p-3 bg-[#f3e3de] text-[#9b5545] rounded-xl text-xs">
            {error}
          </div>
        )}
        {content}
      </main>
      {notice && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[#30312d] text-white px-5 py-3 rounded-xl shadow-xl text-sm animate-in">
          {notice}
        </div>
      )}
    </div>
  );
}
function Loading({ error }) {
  return (
    <main className="min-h-screen bg-[#efede8] grid place-items-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#30312d] text-white grid place-items-center animate-pulse">
          <Icon>school</Icon>
        </div>
        <p className="text-sm text-[#777] mt-4">
          {error || "Loading your workspace…"}
        </p>
      </div>
    </main>
  );
}
