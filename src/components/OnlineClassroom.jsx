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
const emptyBoard = { operations: [], view: { x: 0, y: 0, scale: 1 } };

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

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

function participantRole(participant) {
  try {
    return JSON.parse(participant.metadata || "{}").role;
  } catch {
    return undefined;
  }
}

function ParticipantTile({
  participant,
  source,
  compact = false,
  selected = false,
  speaking = false,
  level = 0,
  onSelect,
}) {
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
    <button
      type="button"
      onClick={onSelect}
      className={`relative block aspect-video w-full overflow-hidden rounded-2xl bg-[#20211d] text-left shadow-sm ${
        selected ? "ring-2 ring-[#8f9d92]" : ""
      }`}
    >
      {publication?.track ? (
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-white/70">
          <div className={`${compact ? "h-11 w-11" : "h-16 w-16"} grid place-items-center rounded-full bg-white/10`}>
            <Icon size={compact ? 25 : 34}>person</Icon>
          </div>
        </div>
      )}
      <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded-full bg-black/65 px-3 py-1 text-[11px] font-semibold text-white">
        {participant.name || participant.identity}
      </span>
      <span className="absolute inset-x-3 bottom-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
        <span
          className={`block h-full rounded-full transition-all ${
            speaking ? "bg-[#b7d8bf]" : "bg-white/25"
          }`}
          style={{ width: speaking ? `${Math.max(28, Math.min(100, 42 + level * 90))}%` : "12%" }}
        />
      </span>
    </button>
  );
}

function RemoteAudio({ participant }) {
  const audioRef = useRef(null);
  const [tracks, setTracks] = useState([]);

  useEffect(() => {
    const update = () => {
      setTracks(
        [...participant.audioTrackPublications.values()]
          .map((publication) => publication.track)
          .filter(Boolean),
      );
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
  }, [participant]);

  useEffect(() => {
    const elements = tracks.map((track) => {
      const element = track.attach();
      element.autoplay = true;
      element.playsInline = true;
      return element;
    });
    audioRef.current?.replaceChildren(...elements);
    return () => tracks.forEach((track) => track.detach());
  }, [tracks]);

  return <div ref={audioRef} aria-hidden="true" className="fixed h-0 w-0 overflow-hidden" />;
}

function Whiteboard({ lessonId, board, onBoardChange, canEdit }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);
  const boardChannelRef = useRef(null);
  const panRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#30312d");
  const [width, setWidth] = useState(3);
  const [history, setHistory] = useState([]);
  const [redo, setRedo] = useState([]);
  const operations = Array.isArray(board?.operations) ? board.operations : [];
  const view = board?.view || emptyBoard.view;

  const redraw = (items = operations, nextView = view) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    context.translate(nextView.x, nextView.y);
    context.scale(nextView.scale, nextView.scale);
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
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [operations, view]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const handler = ({ payload }) => {
      if (active && payload?.type === "replace") {
        onBoardChange({
          operations: payload.operations || [],
          view: payload.view || emptyBoard.view,
        });
      }
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

  const broadcast = (nextOperations, nextView = view) => {
    boardChannelRef.current?.send({
      type: "broadcast",
      event: "board",
      payload: { type: "replace", operations: nextOperations, view: nextView },
    });
  };

  const publish = (nextOperations, nextView = view, save = true) => {
    setHistory((current) => [...current, { operations, view }]);
    setRedo([]);
    onBoardChange({ operations: nextOperations, view: nextView });
    broadcast(nextOperations, nextView);
    if (save) saveWhiteboard(lessonId, nextOperations).catch(() => {});
  };

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [
      (event.clientX - rect.left - view.x) / view.scale,
      (event.clientY - rect.top - view.y) / view.scale,
    ];
  };

  const restore = (next, nextHistory, nextRedo) => {
    setHistory(nextHistory);
    setRedo(nextRedo);
    onBoardChange(next);
    broadcast(next.operations, next.view);
    saveWhiteboard(lessonId, next.operations).catch(() => {});
  };

  const setView = (nextView) => {
    onBoardChange({ operations, view: nextView });
    broadcast(operations, nextView);
  };

  const zoom = (delta) => {
    const nextScale = Math.min(2.5, Math.max(0.5, Number((view.scale + delta).toFixed(2))));
    setView({ ...view, scale: nextScale });
  };

  const resetView = () => setView(emptyBoard.view);

  const startPan = (event) => {
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      view,
    };
    canvasRef.current.setPointerCapture(event.pointerId);
  };

  const movePan = (event) => {
    if (!panRef.current) return;
    const nextView = {
      ...panRef.current.view,
      x: panRef.current.view.x + event.clientX - panRef.current.x,
      y: panRef.current.view.y + event.clientY - panRef.current.y,
    };
    onBoardChange({ operations, view: nextView });
    redraw(operations, nextView);
  };

  const endPan = () => {
    if (!panRef.current) return;
    panRef.current = null;
    broadcast(operations, view);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e5e2dc] bg-white">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#eee] bg-[#fbfaf7] p-2">
        <div className="flex shrink-0 gap-1">
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
        <div className="ml-auto flex shrink-0 gap-1">
          <button
            disabled={!canEdit || !history.length}
            title="Undo"
            onClick={() => {
              const previous = history.at(-1);
              restore(previous, history.slice(0, -1), [...redo, { operations, view }]);
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
              restore(next, [...history, { operations, view }], redo.slice(0, -1));
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
          <button
            title="Zoom out"
            onClick={() => zoom(-0.1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white"
          >
            <Icon size={19}>zoom_out</Icon>
          </button>
          <button
            title="Reset view"
            onClick={resetView}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white"
          >
            <Icon size={19}>center_focus_strong</Icon>
          </button>
          <button
            title="Zoom in"
            onClick={() => zoom(0.1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e2dc] bg-white"
          >
            <Icon size={19}>zoom_in</Icon>
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="min-h-[340px] flex-1 touch-none bg-white"
        onPointerDown={(event) => {
          if (event.button === 1) {
            event.preventDefault();
            startPan(event);
            return;
          }
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
          if (panRef.current) {
            movePan(event);
            return;
          }
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
          if (panRef.current) {
            endPan(event);
            return;
          }
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
        onAuxClick={(event) => event.preventDefault()}
      />
    </div>
  );
}

export default function OnlineClassroom({ lesson, profile, onLeave }) {
  const shellRef = useRef(null);
  const onLeaveRef = useRef(onLeave);
  const classroomChannelRef = useRef(null);
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [participants, setParticipants] = useState([]);
  const [local, setLocal] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [tab, setTab] = useState("whiteboard");
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState(emptyBoard);
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [screen, setScreen] = useState(false);
  const [presence, setPresence] = useState([]);
  const [notice, setNotice] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focusedId, setFocusedId] = useState(null);
  const [speakerLevels, setSpeakerLevels] = useState({});
  const endedRef = useRef(false);

  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    let active = true;
    let realtime;
    const syncParticipants = () => setParticipants([...room.remoteParticipants.values()]);
    const syncLocalMedia = () => {
      setMic(room.localParticipant.isMicrophoneEnabled);
      setCamera(room.localParticipant.isCameraEnabled);
      setScreen(room.localParticipant.isScreenShareEnabled);
    };
    const syncAudioPlayback = () => setAudioBlocked(!room.canPlaybackAudio);
    const syncActiveSpeakers = (speakers) => {
      const next = {};
      speakers.forEach((participant) => {
        next[participant.identity] = participant.audioLevel || 0.5;
      });
      setSpeakerLevels(next);
    };
    const handleParticipantDisconnected = (participant) => {
      syncParticipants();
      if (profile.role !== "teacher" && participantRole(participant) === "teacher") {
        setNotice("The teacher ended this classroom.");
        room.disconnect();
        onLeaveRef.current();
      }
    };

    const connect = async () => {
      try {
        const [{ token, url }, classroom] = await Promise.all([
          getLiveKitToken(lesson.id),
          getClassroomData(lesson.id),
        ]);
        if (!active) return;
        setChat(classroom.chat);
        setBoard({
          operations: classroom.whiteboard?.data || [],
          view: emptyBoard.view,
        });
        realtime = supabase.channel(channelName(lesson.id), {
          config: { presence: { key: profile.id } },
        });
        classroomChannelRef.current = realtime;
        realtime
          .on("presence", { event: "sync" }, () => {
            setPresence(Object.values(realtime.presenceState()).flat());
          })
          .on("broadcast", { event: "classroom:end" }, () => {
            endedRef.current = true;
            setNotice("The teacher ended this classroom.");
            room.disconnect();
            onLeaveRef.current();
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
        room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
        room.on(RoomEvent.LocalTrackPublished, syncLocalMedia);
        room.on(RoomEvent.LocalTrackUnpublished, syncLocalMedia);
        room.on(RoomEvent.AudioPlaybackStatusChanged, syncAudioPlayback);
        room.on(RoomEvent.ActiveSpeakersChanged, syncActiveSpeakers);
        await room.connect(url, token);
        if (!active) return;
        setLocal(room.localParticipant);
        syncParticipants();
        syncLocalMedia();
        syncAudioPlayback();
        setStatus("connected");
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
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.LocalTrackPublished, syncLocalMedia);
      room.off(RoomEvent.LocalTrackUnpublished, syncLocalMedia);
      room.off(RoomEvent.AudioPlaybackStatusChanged, syncAudioPlayback);
      room.off(RoomEvent.ActiveSpeakersChanged, syncActiveSpeakers);
      room.disconnect();
      if (realtime) {
        if (profile.role === "teacher" && !endedRef.current) {
          realtime.send({
            type: "broadcast",
            event: "classroom:end",
            payload: { lesson_id: lesson.id },
          });
          saveWhiteboard(lesson.id, []).catch(() => {});
        }
        realtime.untrack();
        supabase.removeChannel(realtime);
        classroomChannelRef.current = null;
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

  const leaveClassroom = async () => {
    if (profile.role === "teacher") {
      endedRef.current = true;
      setBoard(emptyBoard);
      try {
        await saveWhiteboard(lesson.id, []);
        await classroomChannelRef.current?.send({
          type: "broadcast",
          event: "classroom:end",
          payload: { lesson_id: lesson.id },
        });
      } catch (error) {
        setNotice(error.message || "Could not notify everyone, leaving anyway.");
      }
    }
    room.disconnect();
    onLeaveRef.current();
  };

  const toggleMic = async () => {
    try {
      const shouldEnable = !room.localParticipant.isMicrophoneEnabled;
      if (shouldEnable) await requestMicrophonePermission();
      await room.localParticipant.setMicrophoneEnabled(shouldEnable, {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      });
      if (shouldEnable) {
        try {
          await room.startAudio();
        } catch {
          setAudioBlocked(true);
        }
      }
      setMic(room.localParticipant.isMicrophoneEnabled);
      setAudioBlocked(!room.canPlaybackAudio);
      setNotice("");
    } catch (error) {
      setMic(room.localParticipant.isMicrophoneEnabled);
      setNotice(
        isPermissionError(error)
          ? "Microphone permission is blocked. Open your browser site settings for Dayo and allow microphone access."
          : error.message,
      );
    }
  };

  const toggleCamera = async () => {
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
      setCamera(room.localParticipant.isCameraEnabled);
      setNotice("");
    } catch (error) {
      setCamera(room.localParticipant.isCameraEnabled);
      setNotice(
        isPermissionError(error)
          ? "Camera permission is blocked by this browser."
          : error.message,
      );
    }
  };

  const toggleScreen = async () => {
    try {
      await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled);
      setScreen(room.localParticipant.isScreenShareEnabled);
      setNotice("");
    } catch (error) {
      setScreen(room.localParticipant.isScreenShareEnabled);
      setNotice(error.message || "Screen sharing is not available on this device.");
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await shellRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  };

  const startSound = async () => {
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
      setNotice("");
    } catch (error) {
      setNotice(error.message || "Audio playback is blocked by this browser.");
    }
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
  const hasTrack = (participant, source) =>
    [...participant.videoTrackPublications.values()].some(
      (item) => item.source === source && item.track,
    );
  const classroomParticipants =
    tab === "screen"
      ? allParticipants.filter((item) => hasTrack(item, Track.Source.ScreenShare))
      : allParticipants;
  const videoStage = (source) => {
    const visible = source === Track.Source.ScreenShare
      ? allParticipants.filter((item) => hasTrack(item, source))
      : classroomParticipants;
    const focused =
      visible.find((item) => item.identity === focusedId) ||
      visible.find((item) => hasTrack(item, source || Track.Source.Camera)) ||
      visible[0];
    const strip = visible.filter((item) => item.identity !== focused?.identity);
    if (!visible.length) {
      return (
        <div className="grid h-full place-items-center rounded-2xl bg-[#20211d] p-6 text-center text-sm font-semibold text-white/65">
          No screen is being shared.
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 rounded-2xl bg-[#20211d] p-3">
        <div className="mx-auto w-full max-w-5xl flex-1 content-center">
          <ParticipantTile
            participant={focused}
            source={source}
            selected
            speaking={Boolean(speakerLevels[focused.identity])}
            level={speakerLevels[focused.identity] || 0}
            onSelect={() => setFocusedId(focused.identity)}
          />
        </div>
        {strip.length > 0 && (
          <div className="flex max-h-36 gap-3 overflow-x-auto pb-1">
            {strip.map((item) => (
              <div key={`${item.identity}-${source || "camera"}-strip`} className="w-48 shrink-0">
                <ParticipantTile
                  participant={item}
                  source={source}
                  compact
                  speaking={Boolean(speakerLevels[item.identity])}
                  level={speakerLevels[item.identity] || 0}
                  onSelect={() => setFocusedId(item.identity)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={shellRef}
      className="flex h-[calc(100dvh-64px)] flex-col gap-2 overflow-hidden bg-[#e9e8e3] p-2 md:h-[calc(100vh-80px)] md:gap-3 md:p-5"
    >
      <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-[#e4e1da] bg-white px-2 py-2 shadow-sm md:gap-3 md:px-3">
        <button
          onClick={leaveClassroom}
          title="Leave classroom"
          className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1efe9] text-[#30312d]"
        >
          <Icon>arrow_back</Icon>
        </button>
        <div className="min-w-0 flex-1">
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
        <span className="rounded-full bg-[#e2ebe5] px-2 py-1 text-[10px] font-bold text-[#52735d] md:px-3 md:text-[11px]">
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
        <div className="shrink-0 rounded-xl border border-[#ead8bc] bg-[#fff7e8] px-3 py-2 text-xs font-semibold text-[#8a6333]">
          {notice}
        </div>
      )}
      {audioBlocked && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-[#d5deec] bg-[#eef4ff] px-3 py-2 text-xs font-semibold text-[#435a74]">
          <span>Audio playback is blocked by this browser.</span>
          <button
            onClick={startSound}
            className="flex h-8 items-center gap-1 rounded-lg bg-[#435a74] px-3 text-white"
          >
            <Icon size={16}>volume_up</Icon>
            Start sound
          </button>
        </div>
      )}
      <div aria-hidden="true" className="fixed h-0 w-0 overflow-hidden">
        {participants.map((participant) => (
          <RemoteAudio key={`${participant.identity}-audio`} participant={participant} />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_320px]">
        <main className="min-h-0">
          {tab === "whiteboard" ? (
            <Whiteboard lessonId={lesson.id} board={board} onBoardChange={setBoard} canEdit />
          ) : tab === "split" ? (
            <div className="grid h-full gap-3 lg:grid-cols-2">
              <Whiteboard lessonId={lesson.id} board={board} onBoardChange={setBoard} canEdit />
              {videoStage()}
            </div>
          ) : (
            videoStage(tab === "screen" ? Track.Source.ScreenShare : undefined)
          )}
        </main>

        <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
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

      <div className="shrink-0 rounded-2xl border border-[#e4e1da] bg-white p-2 shadow-sm">
        <div className="mb-2 grid grid-cols-4 gap-1 lg:hidden">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              title={item.label}
              className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-bold transition ${
                tab === item.id ? "bg-[#30312d] text-white" : "bg-[#f1efe9] text-[#66675f]"
              }`}
            >
              <Icon size={17}>{item.icon}</Icon>
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2">
        <button
          onClick={toggleMic}
          title={mic ? "Mute microphone" : "Turn microphone on"}
          className={`flex h-12 w-12 items-center justify-center gap-2 rounded-full text-xs font-bold sm:w-auto sm:rounded-xl sm:px-4 ${
            mic ? "bg-[#e2ebe5] text-[#52735d]" : "bg-[#f3e3de] text-[#a35645]"
          }`}
        >
          <Icon size={19}>{mic ? "mic" : "mic_off"}</Icon>
          <span className="hidden sm:inline">{mic ? "Mute" : "Unmute"}</span>
        </button>
        <button
          onClick={toggleCamera}
          title={camera ? "Turn camera off" : "Turn camera on"}
          className={`flex h-12 w-12 items-center justify-center gap-2 rounded-full text-xs font-bold sm:w-auto sm:rounded-xl sm:px-4 ${
            camera ? "bg-[#e2ebe5] text-[#52735d]" : "bg-[#f3e3de] text-[#a35645]"
          }`}
        >
          <Icon size={19}>{camera ? "videocam" : "videocam_off"}</Icon>
          <span className="hidden sm:inline">{camera ? "Camera off" : "Camera on"}</span>
        </button>
        <button
          onClick={toggleScreen}
          title={screen ? "Stop sharing screen" : "Share screen"}
          className={`hidden h-12 items-center justify-center gap-2 rounded-full text-xs font-bold sm:flex sm:w-auto sm:rounded-xl sm:px-4 ${
            screen ? "bg-[#e4e8ef] text-[#435a74]" : "bg-[#f1efe9] text-[#30312d]"
          }`}
        >
          <Icon size={19}>{screen ? "stop_screen_share" : "screen_share"}</Icon>
          <span>{screen ? "Stop share" : "Share"}</span>
        </button>
        <button
          onClick={leaveClassroom}
          title="Leave classroom"
          className="ml-2 flex h-12 w-14 items-center justify-center gap-2 rounded-full bg-[#a35645] text-xs font-bold text-white sm:w-auto sm:rounded-xl sm:px-4 md:ml-auto"
        >
          <Icon size={19}>call_end</Icon>
          <span className="hidden sm:inline">Leave</span>
        </button>
        </div>
      </div>
    </div>
  );
}
