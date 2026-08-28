import { useEffect, useRef, useState } from "react";
import { ParticipantEvent, Room, RoomEvent, Track } from "livekit-client";
import { supabase } from "../lib/supabase";
import {
  getClassroomData,
  getLiveKitToken,
  saveWhiteboard,
  sendChatMessage,
} from "../lib/api";

const channelName = (lessonId) => `lesson:${lessonId}:whiteboard`;
const drawingTools = [
  { id: "pen", icon: "draw", label: "Pen" },
  { id: "eraser", icon: "ink_eraser", label: "Eraser" },
  { id: "line", icon: "horizontal_rule", label: "Line" },
  { id: "rectangle", icon: "crop_square", label: "Rectangle" },
  { id: "circle", icon: "radio_button_unchecked", label: "Circle" },
  { id: "text", icon: "title", label: "Text" },
];
const tabs = [
  { id: "whiteboard", icon: "draw", label: "Board" },
  { id: "video", icon: "videocam", label: "Video" },
  { id: "screen", icon: "present_to_all", label: "Screen" },
  { id: "split", icon: "view_sidebar", label: "Split" },
];

function Icon({ children, size = 20 }) {
  return (
    <span className="material-symbols-rounded" style={{ fontSize: size }}>
      {children}
    </span>
  );
}

function isPermissionError(error) {
  return ["NotAllowedError", "PermissionDeniedError"].includes(error?.name);
}

function ParticipantTile({ participant, source }) {
  const videoRef = useRef(null);
  const [publication, setPublication] = useState(null);

  useEffect(() => {
    const update = () => {
      const video = [...participant.videoTrackPublications.values()].find(
        (item) => item.source === (source || Track.Source.Camera) && item.track,
      );
      setPublication(video || null);
    };
    update();
    participant.on(ParticipantEvent.TrackSubscribed, update);
    participant.on(ParticipantEvent.TrackUnsubscribed, update);
    participant.on(ParticipantEvent.TrackMuted, update);
    participant.on(ParticipantEvent.TrackUnmuted, update);
    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, update);
      participant.off(ParticipantEvent.TrackUnsubscribed, update);
      participant.off(ParticipantEvent.TrackMuted, update);
      participant.off(ParticipantEvent.TrackUnmuted, update);
    };
  }, [participant, source]);

  useEffect(() => {
    if (!videoRef.current || !publication?.track) return undefined;
    publication.track.attach(videoRef.current);
    return () => publication.track?.detach(videoRef.current);
  }, [publication]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#20211d] shadow-sm">
      {publication?.track ? (
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-white/70">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10">
            <Icon size={34}>person</Icon>
          </div>
        </div>
      )}
      <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded-full bg-black/65 px-3 py-1 text-[11px] font-semibold text-white">
        {participant.name || participant.identity}
      </span>
    </div>
  );
}

function Whiteboard({ lessonId, initialData, canEdit }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);
  const boardChannelRef = useRef(null);
  const [operations, setOperations] = useState(
    Array.isArray(initialData) ? initialData : [],
  );
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#30312d");
  const [width, setWidth] = useState(3);
  const [history, setHistory] = useState([]);
  const [redo, setRedo] = useState([]);

  const redraw = (items) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    items.forEach((item) => {
      context.strokeStyle = item.color;
      context.fillStyle = item.color;
      context.lineWidth = item.width;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (item.kind === "text") {
        context.font = "20px DM Sans, sans-serif";
        context.fillText(item.text, item.x, item.y);
      } else if (item.kind === "path") {
        context.beginPath();
        item.points.forEach(([x, y], index) =>
          index ? context.lineTo(x, y) : context.moveTo(x, y),
        );
        context.stroke();
      } else {
        context.beginPath();
        if (item.kind === "line") {
          context.moveTo(item.x, item.y);
          context.lineTo(item.x2, item.y2);
        }
        if (item.kind === "rectangle") {
          context.rect(item.x, item.y, item.x2 - item.x, item.y2 - item.y);
        }
        if (item.kind === "circle") {
          const radius = Math.hypot(item.x2 - item.x, item.y2 - item.y);
          context.arc(item.x, item.y, radius, 0, Math.PI * 2);
        }
        context.stroke();
      }
    });
    context.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      redraw(operations);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [operations]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const handler = ({ payload }) => {
      if (active && payload?.type === "replace") setOperations(payload.operations);
    };
    const boardChannel = supabase.channel(`${channelName(lessonId)}:board`);
    boardChannel.on("broadcast", { event: "board" }, handler).subscribe();
    boardChannelRef.current = boardChannel;
    return () => {
      active = false;
      boardChannelRef.current = null;
      supabase.removeChannel(boardChannel);
    };
  }, [lessonId]);

  const broadcast = (next) => {
    boardChannelRef.current?.send({
      type: "broadcast",
      event: "board",
      payload: { type: "replace", operations: next },
    });
  };

  const publish = (next) => {
    setHistory((current) => [...current, operations]);
    setRedo([]);
    setOperations(next);
    broadcast(next);
    saveWhiteboard(lessonId, next).catch(() => {});
  };

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const restore = (next, nextHistory, nextRedo) => {
    setHistory(nextHistory);
    setRedo(nextRedo);
    setOperations(next);
    broadcast(next);
    saveWhiteboard(lessonId, next).catch(() => {});
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e5e2dc] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#eee] bg-[#fbfaf7] p-2">
        <div className="flex flex-wrap gap-1">
          {drawingTools.map((item) => (
            <button
              key={item.id}
              disabled={!canEdit}
              title={item.label}
              onClick={() => setTool(item.id)}
              className={`grid h-9 w-9 place-items-center rounded-xl border text-[#30312d] transition ${
                tool === item.id
                  ? "border-[#30312d] bg-[#30312d] text-white"
                  : "border-[#e5e2dc] bg-white hover:bg-[#f1efe9]"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <Icon size={19}>{item.icon}</Icon>
            </button>
          ))}
        </div>
        <label
          className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white"
          title="Color"
        >
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            disabled={!canEdit}
            className="h-6 w-6 border-0 bg-transparent p-0"
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e5e2dc] bg-white px-3">
          <Icon size={18}>line_weight</Icon>
          <input
            type="range"
            min="1"
            max="14"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
            disabled={!canEdit}
            className="w-24 accent-[#30312d]"
          />
        </label>
        <div className="ml-auto flex gap-1">
          <button
            disabled={!canEdit || !history.length}
            title="Undo"
            onClick={() => {
              const previous = history.at(-1);
              restore(previous, history.slice(0, -1), [...redo, operations]);
            }}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white disabled:opacity-45"
          >
            <Icon size={19}>undo</Icon>
          </button>
          <button
            disabled={!canEdit || !redo.length}
            title="Redo"
            onClick={() => {
              const next = redo.at(-1);
              restore(next, [...history, operations], redo.slice(0, -1));
            }}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white disabled:opacity-45"
          >
            <Icon size={19}>redo</Icon>
          </button>
          <button
            disabled={!canEdit}
            title="Clear board"
            onClick={() => publish([])}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white text-[#a35645] disabled:opacity-45"
          >
            <Icon size={19}>delete</Icon>
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="min-h-[340px] flex-1 touch-none bg-white"
        onPointerDown={(event) => {
          if (!canEdit) return;
          const [x, y] = point(event);
          if (tool === "text") {
            const text = window.prompt("Text");
            if (text) publish([...operations, { kind: "text", text, x, y, color, width }]);
            return;
          }
          drawingRef.current = { x, y, points: [[x, y]] };
          canvasRef.current.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          const [x, y] = point(event);
          drawingRef.current.points.push([x, y]);
          redraw([
            ...operations,
            {
              ...drawingRef.current,
              kind: "path",
              color: tool === "eraser" ? "#ffffff" : color,
              width: tool === "eraser" ? width * 5 : width,
            },
          ]);
        }}
        onPointerUp={(event) => {
          if (!drawingRef.current) return;
          const draft = drawingRef.current;
          drawingRef.current = null;
          const [x2, y2] = point(event);
          const kind = ["line", "rectangle", "circle"].includes(tool) ? tool : "path";
          publish([
            ...operations,
            {
              ...draft,
              kind,
              x2,
              y2,
              color: tool === "eraser" ? "#ffffff" : color,
              width: tool === "eraser" ? width * 5 : width,
            },
          ]);
        }}
      />
    </div>
  );
}

export default function OnlineClassroom({ lesson, profile, onLeave }) {
  const shellRef = useRef(null);
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [participants, setParticipants] = useState([]);
  const [local, setLocal] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [tab, setTab] = useState("whiteboard");
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState([]);
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [screen, setScreen] = useState(false);
  const [presence, setPresence] = useState([]);
  const [notice, setNotice] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    let active = true;
    let realtime;
    const syncParticipants = () => setParticipants([...room.remoteParticipants.values()]);

    const connect = async () => {
      try {
        const [{ token, url }, classroom] = await Promise.all([
          getLiveKitToken(lesson.id),
          getClassroomData(lesson.id),
        ]);
        if (!active) return;
        setChat(classroom.chat);
        setBoard(classroom.whiteboard?.data || []);
        realtime = supabase.channel(channelName(lesson.id), {
          config: { presence: { key: profile.id } },
        });
        realtime
          .on("presence", { event: "sync" }, () => {
            setPresence(Object.values(realtime.presenceState()).flat());
          })
          .subscribe(async () => {
            await realtime.track({
              display_name: `${profile.first_name} ${profile.last_name}`,
              role: profile.role,
              state: "joined",
            });
          });
        room.on(RoomEvent.ConnectionStateChanged, (state) => setStatus(state.toLowerCase()));
        room.on(RoomEvent.ParticipantConnected, syncParticipants);
        room.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        await room.connect(url, token);
        if (!active) return;
        setLocal(room.localParticipant);
        syncParticipants();
        setStatus("connected");
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMic(true);
        } catch (error) {
          setMic(false);
          setNotice(
            isPermissionError(error)
              ? "Microphone permission is blocked. You can still stay in class and enable it from the browser when ready."
              : error.message,
          );
        }
        try {
          await room.localParticipant.setCameraEnabled(true);
          setCamera(true);
        } catch (error) {
          setCamera(false);
          setNotice(
            isPermissionError(error)
              ? "Camera permission is blocked. You are still connected to the classroom."
              : error.message,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(
          message.includes("could not establish signal connection")
            ? `${message}. Check that LIVEKIT_URL is a public wss:// URL with valid TLS and WebSocket forwarding enabled.`
            : message,
        );
      }
    };

    connect();
    return () => {
      active = false;
      room.off(RoomEvent.ParticipantConnected, syncParticipants);
      room.off(RoomEvent.ParticipantDisconnected, syncParticipants);
      room.disconnect();
      if (realtime) {
        realtime.untrack();
        supabase.removeChannel(realtime);
      }
    };
  }, [lesson.id, profile.id, profile.first_name, profile.last_name, profile.role, room]);

  useEffect(() => {
    if (!supabase) return undefined;
    const subscription = supabase
      .channel(`chat:${lesson.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lesson_chat_messages",
          filter: `lesson_id=eq.${lesson.id}`,
        },
        ({ new: item }) => setChat((current) => [...current, item]),
      )
      .subscribe();
    return () => supabase.removeChannel(subscription);
  }, [lesson.id]);

  const toggleMic = async () => {
    try {
      await room.localParticipant.setMicrophoneEnabled(!mic);
      setMic(!mic);
      setNotice("");
    } catch (error) {
      setNotice(
        isPermissionError(error)
          ? "Microphone permission is blocked by this browser."
          : error.message,
      );
    }
  };

  const toggleCamera = async () => {
    try {
      await room.localParticipant.setCameraEnabled(!camera);
      setCamera(!camera);
      setNotice("");
    } catch (error) {
      setNotice(
        isPermissionError(error)
          ? "Camera permission is blocked by this browser."
          : error.message,
      );
    }
  };

  const toggleScreen = async () => {
    try {
      await room.localParticipant.setScreenShareEnabled(!screen);
      setScreen(!screen);
      setNotice("");
    } catch (error) {
      setNotice(error.message || "Screen sharing is not available on this device.");
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await shellRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  };

  const send = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    await sendChatMessage(lesson.id, message.trim());
    setMessage("");
  };

  if (status !== "connected") {
    return (
      <div className="grid min-h-[60vh] place-items-center p-8 text-sm text-[#55564f]">
        {status === "connecting" ? "Connecting to classroom..." : `Classroom unavailable: ${status}`}
      </div>
    );
  }

  const allParticipants = [local, ...participants].filter(Boolean);
  const videoTiles = (source) => (
    <div className="grid h-full content-start gap-3 overflow-auto rounded-2xl bg-[#20211d] p-3 sm:grid-cols-2">
      {allParticipants.map((item) => (
        <ParticipantTile
          key={`${item.identity}-${source || "camera"}`}
          participant={item}
          source={source}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={shellRef}
      className="flex h-[calc(100vh-80px)] flex-col gap-3 bg-[#e9e8e3] p-3 md:p-5"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e4e1da] bg-white px-3 py-2 shadow-sm">
        <button
          onClick={onLeave}
          title="Leave classroom"
          className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1efe9] text-[#30312d]"
        >
          <Icon>arrow_back</Icon>
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-[#30312d]">
            {lesson.subject?.name || "Online lesson"}
          </h2>
          <p className="text-xs text-[#85867e]">
            {new Date(lesson.starts_at).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <span className="ml-auto rounded-full bg-[#e2ebe5] px-3 py-1 text-[11px] font-bold text-[#52735d]">
          {presence.length || allParticipants.length} online
        </span>
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e2dc] bg-white text-[#30312d]"
        >
          <Icon>{fullscreen ? "fullscreen_exit" : "fullscreen"}</Icon>
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#ead8bc] bg-[#fff7e8] px-4 py-2 text-xs font-semibold text-[#8a6333]">
          {notice}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_320px]">
        <main className="min-h-0">
          {tab === "whiteboard" ? (
            <Whiteboard lessonId={lesson.id} initialData={board} canEdit />
          ) : tab === "split" ? (
            <div className="grid h-full gap-3 lg:grid-cols-2">
              <Whiteboard lessonId={lesson.id} initialData={board} canEdit />
              {videoTiles()}
            </div>
          ) : (
            videoTiles(tab === "screen" ? Track.Source.ScreenShare : undefined)
          )}
        </main>

        <aside className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-4 gap-1 rounded-2xl border border-[#e5e2dc] bg-white p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                title={item.label}
                className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition ${
                  tab === item.id ? "bg-[#30312d] text-white" : "text-[#66675f] hover:bg-[#f1efe9]"
                }`}
              >
                <Icon size={18}>{item.icon}</Icon>
                {item.label}
              </button>
            ))}
          </div>

          <div className="min-h-[132px] overflow-auto rounded-2xl border border-[#e5e2dc] bg-white p-4">
            <p className="mb-2 text-xs font-bold text-[#30312d]">Participants</p>
            {allParticipants.map((item) => (
              <div key={item.identity} className="flex items-center gap-2 border-t border-[#eee] py-2 text-xs">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e2ebe5] text-[#52735d]">
                  <Icon size={16}>person</Icon>
                </span>
                <span className="truncate">{item.name || item.identity}</span>
              </div>
            ))}
          </div>

          <div className="flex min-h-[220px] flex-1 flex-col rounded-2xl border border-[#e5e2dc] bg-white p-4">
            <p className="mb-2 text-xs font-bold text-[#30312d]">Chat</p>
            <div className="flex-1 overflow-auto">
              {chat.map((item) => (
                <p key={item.id} className="border-t border-[#f1efe9] py-2 text-xs">
                  <b>{item.user_id === profile.id ? "You" : item.user_id}</b> {item.body}
                </p>
              ))}
            </div>
            <form onSubmit={send} className="mt-2 flex gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-xl border border-[#ddd] px-3 text-xs outline-none focus:border-[#8f9d92]"
                placeholder="Message"
              />
              <button className="grid h-10 w-10 place-items-center rounded-xl bg-[#30312d] text-white">
                <Icon size={18}>send</Icon>
              </button>
            </form>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#e4e1da] bg-white p-2 shadow-sm">
        <button
          onClick={toggleMic}
          title={mic ? "Mute microphone" : "Turn microphone on"}
          className={`flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold ${
            mic ? "bg-[#e2ebe5] text-[#52735d]" : "bg-[#f3e3de] text-[#a35645]"
          }`}
        >
          <Icon size={19}>{mic ? "mic" : "mic_off"}</Icon>
          {mic ? "Mute" : "Unmute"}
        </button>
        <button
          onClick={toggleCamera}
          title={camera ? "Turn camera off" : "Turn camera on"}
          className={`flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold ${
            camera ? "bg-[#e2ebe5] text-[#52735d]" : "bg-[#f3e3de] text-[#a35645]"
          }`}
        >
          <Icon size={19}>{camera ? "videocam" : "videocam_off"}</Icon>
          {camera ? "Camera off" : "Camera on"}
        </button>
        <button
          onClick={toggleScreen}
          title={screen ? "Stop sharing screen" : "Share screen"}
          className={`flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold ${
            screen ? "bg-[#e4e8ef] text-[#435a74]" : "bg-[#f1efe9] text-[#30312d]"
          }`}
        >
          <Icon size={19}>{screen ? "stop_screen_share" : "screen_share"}</Icon>
          {screen ? "Stop share" : "Share"}
        </button>
        <button
          onClick={onLeave}
          title="Leave classroom"
          className="ml-0 flex h-11 items-center gap-2 rounded-xl bg-[#a35645] px-4 text-xs font-bold text-white md:ml-auto"
        >
          <Icon size={19}>call_end</Icon>
          Leave
        </button>
      </div>
    </div>
  );
}
