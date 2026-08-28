import { useEffect, useRef, useState } from "react";
import {
  createLocalTracks,
  LocalVideoTrack,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { supabase } from "../lib/supabase";
import {
  getClassroomData,
  getLiveKitToken,
  saveWhiteboard,
  sendChatMessage,
} from "../lib/api";

const tools = ["select", "pen", "eraser", "line", "rectangle", "circle", "text"];
const channelName = (lessonId) => `lesson:${lessonId}:whiteboard`;

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
  }, [participant]);
  useEffect(() => {
    if (!videoRef.current || !publication?.track) return undefined;
    publication.track.attach(videoRef.current);
    return () => publication.track?.detach(videoRef.current);
  }, [publication]);
  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-[#22231f]">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <span className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/60 text-white text-[10px]">
        {participant.name || participant.identity}
      </span>
    </div>
  );
}

function Whiteboard({ lessonId, initialData, channel, canEdit }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);
  const [operations, setOperations] = useState(Array.isArray(initialData) ? initialData : []);
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
    items.forEach((item) => {
      context.strokeStyle = item.color;
      context.fillStyle = item.color;
      context.lineWidth = item.width;
      context.lineCap = "round";
      if (item.kind === "text") context.fillText(item.text, item.x, item.y);
      else if (item.kind === "path") {
        context.beginPath();
        item.points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
        context.stroke();
      } else {
        context.beginPath();
        if (item.kind === "line") context.moveTo(item.x, item.y), context.lineTo(item.x2, item.y2);
        if (item.kind === "rectangle") context.rect(item.x, item.y, item.x2 - item.x, item.y2 - item.y);
        if (item.kind === "circle") {
          const radius = Math.hypot(item.x2 - item.x, item.y2 - item.y);
          context.arc(item.x, item.y, radius, 0, Math.PI * 2);
        }
        context.stroke();
      }
    });
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;
    canvas.getContext("2d").scale(window.devicePixelRatio, window.devicePixelRatio);
    redraw(operations);
  }, [operations]);
  useEffect(() => {
    const handler = ({ payload }) => {
      const next = payload;
      if (next.type === "replace") setOperations(next.operations);
    };
    channel.on("broadcast", { event: "board" }, handler).subscribe();
    return () => channel.off("broadcast", { event: "board" }, handler);
  }, [channel]);
  const publish = (next) => {
    setHistory((current) => [...current, operations]);
    setRedo([]);
    setOperations(next);
    channel.send({ type: "broadcast", event: "board", payload: new TextEncoder().encode(JSON.stringify({ type: "replace", operations: next })) });
    saveWhiteboard(lessonId, next).catch(() => {});
  };
  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  return (
    <div className="flex flex-col h-full min-h-0 bg-white rounded-2xl border border-[#e5e2dc] overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-[#eee]">
        {tools.map((name) => <button key={name} disabled={!canEdit} title={name} onClick={() => setTool(name)} className={`px-2 py-1 rounded-lg text-[10px] ${tool === name ? "bg-[#30312d] text-white" : "bg-[#f1efe9]"}`}>{name}</button>)}
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} title="Color" className="w-7 h-7" disabled={!canEdit} />
        <input type="range" min="1" max="14" value={width} onChange={(event) => setWidth(Number(event.target.value))} title="Line width" disabled={!canEdit} />
        <button disabled={!canEdit} onClick={() => publish([])} className="ml-auto px-2 py-1 rounded-lg bg-[#f1efe9] text-[10px]">Clear</button>
        <button disabled={!canEdit || !history.length} onClick={() => { const previous = history.at(-1); setHistory(history.slice(0, -1)); setRedo([...redo, operations]); setOperations(previous); channel.send({ type: "broadcast", event: "board", payload: new TextEncoder().encode(JSON.stringify({ type: "replace", operations: previous })) }); }} className="px-2 py-1 rounded-lg bg-[#f1efe9] text-[10px]">Undo</button>
        <button disabled={!canEdit || !redo.length} onClick={() => { const next = redo.at(-1); setRedo(redo.slice(0, -1)); setHistory([...history, operations]); setOperations(next); channel.send({ type: "broadcast", event: "board", payload: new TextEncoder().encode(JSON.stringify({ type: "replace", operations: next })) }); }} className="px-2 py-1 rounded-lg bg-[#f1efe9] text-[10px]">Redo</button>
      </div>
      <canvas ref={canvasRef} className="w-full flex-1 min-h-[340px] touch-none" onPointerDown={(event) => { if (!canEdit) return; const [x, y] = point(event); if (tool === "text") { const text = window.prompt("Text"); if (text) publish([...operations, { kind: "text", text, x, y, color, width }]); return; } drawingRef.current = { x, y, points: [[x, y]] }; canvasRef.current.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drawingRef.current) return; const [x, y] = point(event); drawingRef.current.points.push([x, y]); redraw([...operations, { ...drawingRef.current, kind: "path", color: tool === "eraser" ? "#ffffff" : color, width: tool === "eraser" ? width * 5 : width }]); }} onPointerUp={(event) => { if (!drawingRef.current) return; const draft = drawingRef.current; drawingRef.current = null; const [x2, y2] = point(event); const kind = ["line", "rectangle", "circle"].includes(tool) ? tool : "path"; publish([...operations, { ...draft, kind, x2, y2, color: tool === "eraser" ? "#ffffff" : color, width: tool === "eraser" ? width * 5 : width }]); }} />
    </div>
  );
}

export default function OnlineClassroom({ lesson, profile, onLeave }) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [participants, setParticipants] = useState([]);
  const [local, setLocal] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [tab, setTab] = useState("whiteboard");
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState([]);
  const [channel, setChannel] = useState(null);
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const [screen, setScreen] = useState(false);
  const [presence, setPresence] = useState([]);
  useEffect(() => {
    let active = true;
    let realtime;
    const connect = async () => {
      try {
        const [{ token, url }, classroom] = await Promise.all([getLiveKitToken(lesson.id), getClassroomData(lesson.id)]);
        if (!active) return;
        setChat(classroom.chat);
        setBoard(classroom.whiteboard?.data || []);
        realtime = supabase.channel(channelName(lesson.id), { config: { presence: { key: profile.id } } });
        realtime.on("presence", { event: "sync" }, () => {
          setPresence(Object.values(realtime.presenceState()).flat());
        }).subscribe(async () => {
          await realtime.track({ display_name: `${profile.first_name} ${profile.last_name}`, role: profile.role, state: "joined" });
        });
        setChannel(realtime);
        room.on(RoomEvent.ConnectionStateChanged, (state) => setStatus(state.toLowerCase()));
        room.on(RoomEvent.ParticipantConnected, () => setParticipants([...room.remoteParticipants.values()]));
        room.on(RoomEvent.ParticipantDisconnected, () => setParticipants([...room.remoteParticipants.values()]));
        await room.connect(url, token);
        await room.localParticipant.enableCameraAndMicrophone();
        setLocal(room.localParticipant);
        setParticipants([...room.remoteParticipants.values()]);
        setStatus("connected");
      } catch (error) { setStatus(error.message); }
    };
    connect();
    return () => { active = false; room.disconnect(); if (realtime) { realtime.untrack(); supabase.removeChannel(realtime); } };
  }, [lesson.id, profile.id, room]);
  const toggleMic = async () => { await room.localParticipant.setMicrophoneEnabled(!mic); setMic(!mic); };
  const toggleCamera = async () => { await room.localParticipant.setCameraEnabled(!camera); setCamera(!camera); };
  const toggleScreen = async () => { await room.localParticipant.setScreenShareEnabled(!screen); setScreen(!screen); };
  const send = async (event) => { event.preventDefault(); if (!message.trim()) return; await sendChatMessage(lesson.id, message.trim()); setMessage(""); };
  useEffect(() => { if (!supabase) return; const subscription = supabase.channel(`chat:${lesson.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "lesson_chat_messages", filter: `lesson_id=eq.${lesson.id}` }, ({ new: item }) => setChat((current) => [...current, item])).subscribe(); return () => supabase.removeChannel(subscription); }, [lesson.id]);
  if (status !== "connected") return <div className="p-8 text-sm">{status === "connecting" ? "Connecting to classroom…" : `Classroom unavailable: ${status}`}</div>;
  const allParticipants = [local, ...participants].filter(Boolean);
  const videoTiles = (source) => <div className="h-full grid sm:grid-cols-2 gap-3 bg-[#20211d] rounded-2xl p-3">{allParticipants.map((item) => <ParticipantTile key={`${item.identity}-${source}`} participant={item} source={source} />)}</div>;
  return <div className="p-4 md:p-6 max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col gap-3"><div className="flex flex-wrap items-center gap-3"><button onClick={onLeave} className="w-9 h-9 rounded-xl bg-white border border-[#ddd]">←</button><div><h2 className="font-semibold">{lesson.subject?.name || "Online lesson"}</h2><p className="text-xs text-[#92938b]">{new Date(lesson.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="ml-auto text-[10px] text-[#5f816b]">Connected · {presence.length || participants.length + (local ? 1 : 0)} online</span></div><div className="grid lg:grid-cols-[1fr_300px] gap-3 flex-1 min-h-0"><div className="min-h-0">{tab === "whiteboard" ? <Whiteboard lessonId={lesson.id} initialData={board} channel={channel} canEdit /> : tab === "split" ? <div className="h-full grid lg:grid-cols-2 gap-3"><Whiteboard lessonId={lesson.id} initialData={board} channel={channel} canEdit />{videoTiles()}</div> : videoTiles(tab === "screen" ? Track.Source.ScreenShare : undefined)}</div><aside className="min-h-0 flex flex-col gap-3"><div className="grid grid-cols-2 gap-1"><button onClick={() => setTab("whiteboard")} className={`rounded-lg py-2 text-xs ${tab === "whiteboard" ? "bg-[#30312d] text-white" : "bg-white"}`}>Whiteboard</button><button onClick={() => setTab("video")} className={`rounded-lg py-2 text-xs ${tab === "video" ? "bg-[#30312d] text-white" : "bg-white"}`}>Video</button><button onClick={() => setTab("screen")} className={`rounded-lg py-2 text-xs ${tab === "screen" ? "bg-[#30312d] text-white" : "bg-white"}`}>Screen share</button><button onClick={() => setTab("split")} className={`rounded-lg py-2 text-xs ${tab === "split" ? "bg-[#30312d] text-white" : "bg-white"}`}>Split</button></div><div className="bg-white border border-[#e5e2dc] rounded-2xl p-3 flex-1 min-h-[180px] overflow-auto"><p className="text-xs font-semibold mb-3">Participants</p>{[local, ...participants].filter(Boolean).map((item) => <div key={item.identity} className="text-xs py-2 border-t border-[#eee]">{item.name || item.identity}</div>)}</div><div className="bg-white border border-[#e5e2dc] rounded-2xl p-3 flex-1 min-h-[220px] flex flex-col"><p className="text-xs font-semibold mb-2">Chat</p><div className="flex-1 overflow-auto">{chat.map((item) => <p key={item.id} className="text-xs py-1"><b>{item.user_id === profile.id ? "You" : item.user_id}</b> {item.body}</p>)}</div><form onSubmit={send} className="flex gap-2 mt-2"><input value={message} onChange={(event) => setMessage(event.target.value)} className="min-w-0 flex-1 h-9 rounded-lg border border-[#ddd] px-2 text-xs" placeholder="Message" /><button className="px-3 rounded-lg bg-[#30312d] text-white text-xs">Send</button></form></div></aside></div><div className="flex flex-wrap gap-2"><button onClick={toggleMic} className="px-3 py-2 rounded-xl bg-white border border-[#ddd] text-xs">{mic ? "Mute" : "Unmute"}</button><button onClick={toggleCamera} className="px-3 py-2 rounded-xl bg-white border border-[#ddd] text-xs">{camera ? "Camera off" : "Camera on"}</button><button onClick={toggleScreen} className="px-3 py-2 rounded-xl bg-white border border-[#ddd] text-xs">{screen ? "Stop sharing" : "Share screen"}</button><button onClick={onLeave} className="ml-auto px-4 py-2 rounded-xl bg-[#a35645] text-white text-xs">Leave classroom</button></div></div>;
}
