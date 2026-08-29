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
const drawingToolGroups = [
  {
    id: "navigate",
    label: "Navigate",
    icon: "open_with",
    tools: [
      { id: "select", icon: "near_me", label: "Select" },
      { id: "pan", icon: "pan_tool", label: "Pan" },
    ],
  },
  {
    id: "objects",
    label: "Objects",
    icon: "category",
    tools: [
      { id: "point", icon: "radio_button_checked", label: "Point" },
      { id: "segment", icon: "show_chart", label: "Segment" },
      { id: "line", icon: "horizontal_rule", label: "Line" },
      { id: "circle", icon: "radio_button_unchecked", label: "Circle" },
      { id: "rectangle", icon: "crop_square", label: "Rectangle" },
    ],
  },
  {
    id: "drawing",
    label: "Drawing",
    icon: "draw",
    tools: [
      { id: "pen", icon: "draw", label: "Free note" },
      { id: "text", icon: "title", label: "Text note" },
      { id: "eraser", icon: "ink_eraser", label: "Erase" },
    ],
  },
];
const tabs = [
  { id: "whiteboard", icon: "draw", label: "Board" },
  { id: "video", icon: "videocam", label: "Video" },
  { id: "screen", icon: "present_to_all", label: "Screen" },
  { id: "split", icon: "view_sidebar", label: "Split" },
];
const defaultBoardView = { x: 0, y: 0, scale: 48 };
const createEmptyBoard = () => ({
  expressions: [],
  objects: [],
  notes: [],
  view: { ...defaultBoardView },
});
const emptyBoard = createEmptyBoard();
const randomBoardColors = ["#2f6651", "#365f91", "#9a4f42", "#7b5a9a", "#b07b24", "#4d7f83", "#b33f67"];
const objectTools = ["point", "segment", "line", "circle", "rectangle"];

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

function normalizeBoardData(data) {
  if (Array.isArray(data)) return { ...createEmptyBoard(), notes: data };
  if (!data || typeof data !== "object") return createEmptyBoard();
  return {
    expressions: Array.isArray(data.expressions) ? data.expressions : [],
    objects: Array.isArray(data.objects) ? data.objects : [],
    notes: Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.operations)
        ? data.operations
        : [],
    view: {
      ...defaultBoardView,
      ...(data.view && typeof data.view === "object" ? data.view : {}),
      scale: Math.min(180, Math.max(16, Number(data.view?.scale) || defaultBoardView.scale)),
    },
  };
}

function boardSnapshot(board) {
  const normalized = normalizeBoardData(board);
  return JSON.parse(JSON.stringify(normalized));
}

function newBoardId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomBoardColor() {
  return randomBoardColors[Math.floor(Math.random() * randomBoardColors.length)];
}

function parseExpression(raw) {
  const input = raw.trim();
  if (!input) return null;
  const expression = input
    .replace(/^y\s*=\s*/i, "")
    .replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, "")
    .replace(/\bX\b/g, "x")
    .replace(/\^/g, "**");
  if (!/^[0-9xX+\-*/().,\s*a-zA-Z_]+$/.test(expression)) return null;
  const allowed = new Set([
    "x",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sqrt",
    "abs",
    "log",
    "ln",
    "exp",
    "pow",
    "floor",
    "ceil",
    "round",
    "min",
    "max",
    "pi",
    "PI",
    "e",
    "E",
  ]);
  const identifiers = expression.match(/[a-zA-Z_]+/g) || [];
  if (identifiers.some((name) => !allowed.has(name))) return null;
  const js = expression
    .replace(/\bln\s*\(/gi, "log(")
    .replace(/\bpi\b/gi, "PI")
    .replace(/\be\b/g, "E");
  try {
    const fn = new Function(
      "x",
      "M",
      `const {sin,cos,tan,asin,acos,atan,sqrt,abs,log,exp,pow,floor,ceil,round,min,max,PI,E}=M; return (${js});`,
    );
    return (x) => Number(fn(x, Math));
  } catch {
    return null;
  }
}

function Whiteboard({ lessonId, board, onBoardChange, canEdit, profile }) {
  const canvasRef = useRef(null);
  const drawRef = useRef(null);
  const boardChannelRef = useRef(null);
  const panRef = useRef(null);
  const lastViewRef = useRef(null);
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState("#2f6651");
  const [randomColor, setRandomColor] = useState(false);
  const [snapSize, setSnapSize] = useState("1");
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [width, setWidth] = useState(3);
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState([]);
  const [redo, setRedo] = useState([]);
  const [remoteViews, setRemoteViews] = useState({});
  const graph = normalizeBoardData(board);
  const view = graph.view;
  const expressions = graph.expressions;
  const objects = graph.objects;
  const notes = graph.notes;

  const screenPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const toScreen = ([x, y], nextView = view) => {
    const canvas = canvasRef.current;
    const widthPx = canvas?.clientWidth || 1;
    const heightPx = canvas?.clientHeight || 1;
    return [
      widthPx / 2 + nextView.x + x * nextView.scale,
      heightPx / 2 + nextView.y - y * nextView.scale,
    ];
  };

  const toWorld = ([x, y], nextView = view) => {
    const canvas = canvasRef.current;
    const widthPx = canvas?.clientWidth || 1;
    const heightPx = canvas?.clientHeight || 1;
    return [
      (x - widthPx / 2 - nextView.x) / nextView.scale,
      (heightPx / 2 + nextView.y - y) / nextView.scale,
    ];
  };

  const visibleWorld = (nextView = view) => {
    const canvas = canvasRef.current;
    const widthPx = canvas?.clientWidth || 1;
    const heightPx = canvas?.clientHeight || 1;
    const topLeft = toWorld([0, 0], nextView);
    const bottomRight = toWorld([widthPx, heightPx], nextView);
    return {
      left: topLeft[0],
      right: bottomRight[0],
      top: topLeft[1],
      bottom: bottomRight[1],
    };
  };

  const graphStep = () => {
    const raw = 42 / view.scale;
    const power = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].find((item) => item * power >= raw) * power;
  };

  const activeSnapStep = () => {
    const step = Number(snapSize);
    return Number.isFinite(step) && step > 0 ? step : graphStep();
  };

  const creationColor = () => (randomColor ? randomBoardColor() : color);

  const objectAnchorPoints = () =>
    objects.flatMap((item) => {
      if (item.kind === "point") return [item.point];
      return [item.a, item.b].filter(Boolean);
    });

  const snapWorldPoint = (screen, { preferObjects = true } = {}) => {
    const raw = toWorld(screen);
    if (preferObjects) {
      const nearest = objectAnchorPoints().reduce(
        (best, point) => {
          const [x, y] = toScreen(point);
          const distance = Math.hypot(x - screen[0], y - screen[1]);
          return distance < best.distance ? { point, distance } : best;
        },
        { point: null, distance: 15 },
      );
      if (nearest.point) return [...nearest.point];
    }
    const step = activeSnapStep();
    return [
      Number((Math.round(raw[0] / step) * step).toPrecision(10)),
      Number((Math.round(raw[1] / step) * step).toPrecision(10)),
    ];
  };

  const objectScreenBounds = (item) => {
    if (item.kind === "point") {
      const [x, y] = toScreen(item.point);
      return { left: x - 12, right: x + 12, top: y - 12, bottom: y + 12 };
    }
    const [aX, aY] = toScreen(item.a);
    const [bX, bY] = toScreen(item.b);
    if (item.kind === "circle") {
      const radius = Math.hypot(bX - aX, bY - aY);
      return { left: aX - radius, right: aX + radius, top: aY - radius, bottom: aY + radius };
    }
    const pad = item.kind === "line" ? 18 : 10;
    return {
      left: Math.min(aX, bX) - pad,
      right: Math.max(aX, bX) + pad,
      top: Math.min(aY, bY) - pad,
      bottom: Math.max(aY, bY) + pad,
    };
  };

  const screenDistanceToSegment = (point, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return Math.hypot(point[0] - a[0], point[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq));
    return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
  };

  const hitTestObject = (screen) => {
    const tolerance = 12;
    return [...objects].reverse().find((item) => {
      if (item.kind === "point") {
        const point = toScreen(item.point);
        return Math.hypot(point[0] - screen[0], point[1] - screen[1]) <= tolerance;
      }
      const a = toScreen(item.a);
      const b = toScreen(item.b);
      if (item.kind === "circle") {
        const radius = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const distance = Math.hypot(screen[0] - a[0], screen[1] - a[1]);
        return Math.abs(distance - radius) <= tolerance || distance <= tolerance;
      }
      if (item.kind === "rectangle") {
        const bounds = objectScreenBounds(item);
        const inside =
          screen[0] >= bounds.left &&
          screen[0] <= bounds.right &&
          screen[1] >= bounds.top &&
          screen[1] <= bounds.bottom;
        const edge =
          Math.min(
            Math.abs(screen[0] - bounds.left),
            Math.abs(screen[0] - bounds.right),
            Math.abs(screen[1] - bounds.top),
            Math.abs(screen[1] - bounds.bottom),
          ) <= tolerance;
        return inside && edge;
      }
      return screenDistanceToSegment(screen, a, b) <= tolerance;
    });
  };

  const drawGrid = (context) => {
    const canvas = canvasRef.current;
    const widthPx = canvas.clientWidth;
    const heightPx = canvas.clientHeight;
    const bounds = visibleWorld();
    const step = graphStep();
    context.lineWidth = 1;
    context.strokeStyle = "#ece8dd";
    context.fillStyle = "#8a887f";
    context.font = "11px DM Sans, sans-serif";
    for (let x = Math.floor(bounds.left / step) * step; x <= bounds.right; x += step) {
      const [sx] = toScreen([x, 0]);
      context.beginPath();
      context.moveTo(sx, 0);
      context.lineTo(sx, heightPx);
      context.stroke();
      if (Math.abs(x) > step / 4) context.fillText(Number(x.toPrecision(4)), sx + 4, heightPx / 2 + view.y + 14);
    }
    for (let y = Math.floor(bounds.bottom / step) * step; y <= bounds.top; y += step) {
      const [, sy] = toScreen([0, y]);
      context.beginPath();
      context.moveTo(0, sy);
      context.lineTo(widthPx, sy);
      context.stroke();
      if (Math.abs(y) > step / 4) context.fillText(Number(y.toPrecision(4)), widthPx / 2 + view.x + 6, sy - 4);
    }
    context.strokeStyle = "#85816f";
    context.lineWidth = 1.5;
    const [axisX] = toScreen([0, 0]);
    const [, axisY] = toScreen([0, 0]);
    context.beginPath();
    context.moveTo(axisX, 0);
    context.lineTo(axisX, heightPx);
    context.moveTo(0, axisY);
    context.lineTo(widthPx, axisY);
    context.stroke();
  };

  const drawExpression = (context, item) => {
    if (item.hidden) return;
    const fn = parseExpression(item.value);
    if (!fn) return;
    const canvas = canvasRef.current;
    const bounds = visibleWorld();
    const samples = Math.min(900, Math.max(220, Math.floor(canvas.clientWidth * 1.2)));
    context.strokeStyle = item.color;
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let drawing = false;
    let previousY = null;
    for (let index = 0; index <= samples; index += 1) {
      const x = bounds.left + ((bounds.right - bounds.left) * index) / samples;
      const y = fn(x);
      const jump = previousY !== null && Math.abs(y - previousY) * view.scale > canvas.clientHeight * 0.7;
      if (!Number.isFinite(y) || Math.abs(y) > 100000 || jump) {
        drawing = false;
        previousY = null;
        continue;
      }
      const [sx, sy] = toScreen([x, y]);
      if (drawing) context.lineTo(sx, sy);
      else context.moveTo(sx, sy);
      drawing = true;
      previousY = y;
    }
    context.stroke();
  };

  const drawObject = (context, item) => {
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (item.kind === "point") {
      const [x, y] = toScreen(item.point);
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.font = "600 12px DM Sans, sans-serif";
      context.fillText(item.label, x + 8, y - 8);
      return;
    }
    const [aX, aY] = toScreen(item.a);
    const [bX, bY] = toScreen(item.b);
    context.beginPath();
    if (item.kind === "segment") {
      context.moveTo(aX, aY);
      context.lineTo(bX, bY);
    }
    if (item.kind === "line") {
      const bounds = visibleWorld();
      const dx = item.b[0] - item.a[0];
      const dy = item.b[1] - item.a[1];
      if (Math.abs(dx) < 0.0001) {
        const [sx1, sy1] = toScreen([item.a[0], bounds.bottom]);
        const [sx2, sy2] = toScreen([item.a[0], bounds.top]);
        context.moveTo(sx1, sy1);
        context.lineTo(sx2, sy2);
      } else {
        const slope = dy / dx;
        const y1 = item.a[1] + (bounds.left - item.a[0]) * slope;
        const y2 = item.a[1] + (bounds.right - item.a[0]) * slope;
        const [sx1, sy1] = toScreen([bounds.left, y1]);
        const [sx2, sy2] = toScreen([bounds.right, y2]);
        context.moveTo(sx1, sy1);
        context.lineTo(sx2, sy2);
      }
    }
    if (item.kind === "rectangle") context.rect(aX, aY, bX - aX, bY - aY);
    if (item.kind === "circle") {
      const radius = Math.hypot(bX - aX, bY - aY);
      context.arc(aX, aY, radius, 0, Math.PI * 2);
    }
    context.stroke();
    [item.a, item.b].forEach((point) => {
      const [x, y] = toScreen(point);
      context.beginPath();
      context.arc(x, y, 3.5, 0, Math.PI * 2);
      context.fill();
    });
  };

  const drawNote = (context, item) => {
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineWidth = item.width || width;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (item.kind === "text") {
      const [x, y] = toScreen(item.point || [item.x || 0, item.y || 0]);
      context.font = "600 16px DM Sans, sans-serif";
      context.fillText(item.text, x, y);
      return;
    }
    const points = item.points || [];
    context.beginPath();
    points.forEach((point, index) => {
      const [x, y] = toScreen(point);
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    context.stroke();
  };

  const drawRemoteViews = (context) => {
    Object.values(remoteViews).forEach((item, index) => {
      if (!item?.view) return;
      const remote = visibleWorld(item.view);
      const [x1, y1] = toScreen([remote.left, remote.top]);
      const [x2, y2] = toScreen([remote.right, remote.bottom]);
      const hue = (index * 74 + 165) % 360;
      context.strokeStyle = `hsl(${hue} 45% 48%)`;
      context.fillStyle = `hsl(${hue} 45% 48% / 0.08)`;
      context.lineWidth = 2;
      context.fillRect(x1, y1, x2 - x1, y2 - y1);
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
      context.font = "700 11px DM Sans, sans-serif";
      context.fillStyle = `hsl(${hue} 45% 34%)`;
      context.fillText(item.name || "Viewer", x1 + 8, y1 + 18);
    });
  };

  const drawSnapMarker = (context, point) => {
    if (!point) return;
    const [x, y] = toScreen(point);
    context.strokeStyle = "#2f6651";
    context.fillStyle = "rgb(47 102 81 / 0.12)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(x - 13, y);
    context.lineTo(x + 13, y);
    context.moveTo(x, y - 13);
    context.lineTo(x, y + 13);
    context.stroke();
  };

  const drawSelection = (context) => {
    const selected = objects.find((item) => item.id === selectedObjectId);
    if (!selected) return;
    const bounds = objectScreenBounds(selected);
    context.save();
    context.strokeStyle = "#30312d";
    context.lineWidth = 1.5;
    context.setLineDash([5, 5]);
    context.strokeRect(
      bounds.left - 8,
      bounds.top - 8,
      bounds.right - bounds.left + 16,
      bounds.bottom - bounds.top + 16,
    );
    context.restore();
  };

  const redraw = (draft = null, nextGraph = graph) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawGrid(context);
    nextGraph.expressions.forEach((item) => drawExpression(context, item));
    nextGraph.objects.forEach((item) => drawObject(context, item));
    nextGraph.notes.forEach((item) => drawNote(context, item));
    if (draft?.kind === "path") drawNote(context, draft);
    if (draft && ["segment", "line", "circle", "rectangle"].includes(draft.kind)) {
      drawObject(context, draft);
    }
    drawSelection(context);
    drawSnapMarker(context, draft?.snap);
    drawRemoteViews(context);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [board, remoteViews, selectedObjectId]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const boardChannel = supabase.channel(`${channelName(lessonId)}:board`);
    boardChannel
      .on("broadcast", { event: "board" }, ({ payload }) => {
        if (active && payload?.type === "replace") onBoardChange(normalizeBoardData(payload.board));
      })
      .on("broadcast", { event: "viewport" }, ({ payload }) => {
        if (!active || !payload?.user_id || payload.user_id === profile?.id) return;
        setRemoteViews((current) => ({
          ...current,
          [payload.user_id]: {
            name: payload.name,
            view: payload.view,
            at: Date.now(),
          },
        }));
      })
      .subscribe();
    boardChannelRef.current = boardChannel;
    return () => {
      active = false;
      boardChannelRef.current = null;
      supabase.removeChannel(boardChannel);
    };
  }, [lessonId, profile?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemoteViews((current) =>
        Object.fromEntries(Object.entries(current).filter(([, item]) => Date.now() - item.at < 45000)),
      );
    }, 12000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedObjectId && !objects.some((item) => item.id === selectedObjectId)) {
      setSelectedObjectId(null);
    }
  }, [objects, selectedObjectId]);

  const sendViewport = (nextView) => {
    const key = JSON.stringify(nextView);
    if (lastViewRef.current === key) return;
    lastViewRef.current = key;
    boardChannelRef.current?.send({
      type: "broadcast",
      event: "viewport",
      payload: {
        user_id: profile?.id,
        name: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Viewer",
        view: nextView,
      },
    });
  };

  const broadcastBoard = (nextGraph) => {
    boardChannelRef.current?.send({
      type: "broadcast",
      event: "board",
      payload: { type: "replace", board: nextGraph },
    });
  };

  const publish = (nextGraph, save = true) => {
    const normalized = normalizeBoardData(nextGraph);
    setHistory((current) => [...current.slice(-39), boardSnapshot(graph)]);
    setRedo([]);
    onBoardChange(normalized);
    broadcastBoard(normalized);
    if (save) saveWhiteboard(lessonId, normalized).catch(() => {});
  };

  const restore = (next, nextHistory, nextRedo) => {
    const normalized = normalizeBoardData(next);
    setHistory(nextHistory);
    setRedo(nextRedo);
    onBoardChange(normalized);
    broadcastBoard(normalized);
    saveWhiteboard(lessonId, normalized).catch(() => {});
  };

  const setView = (nextView, announce = true) => {
    const nextGraph = { ...graph, view: nextView };
    onBoardChange(nextGraph);
    redraw(null, nextGraph);
    if (announce) sendViewport(nextView);
  };

  const zoom = (factor) => {
    const canvas = canvasRef.current;
    const center = [canvas.clientWidth / 2, canvas.clientHeight / 2];
    const before = toWorld(center);
    const nextScale = Math.min(180, Math.max(16, Number((view.scale * factor).toFixed(2))));
    const nextView = {
      ...view,
      scale: nextScale,
      x: center[0] - canvas.clientWidth / 2 - before[0] * nextScale,
      y: before[1] * nextScale - canvas.clientHeight / 2 + center[1],
    };
    setView(nextView);
  };

  const resetView = () => setView({ ...defaultBoardView });

  const addExpression = () => {
    if (!canEdit || !parseExpression(expression)) return;
    publish({
      ...graph,
      expressions: [
        ...expressions,
        {
          id: newBoardId(),
          value: expression.trim(),
          color: creationColor(),
        },
      ],
    });
    setExpression("");
  };

  const removeExpression = (id) => {
    publish({ ...graph, expressions: expressions.filter((item) => item.id !== id) });
  };

  const updateExpression = (id, value) => {
    publish({
      ...graph,
      expressions: expressions.map((item) => (item.id === id ? { ...item, value } : item)),
    });
  };

  const eraseAt = (point) => {
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const threshold = 16 / view.scale;
    const nextObjects = objects.filter((item) => {
      if (item.kind === "point") return distance(item.point, point) > threshold;
      return distance(item.a, point) > threshold && distance(item.b, point) > threshold;
    });
    const nextNotes = notes.filter((item) => {
      const points = item.points || [item.point || [item.x, item.y]];
      return !points.some((candidate) => distance(candidate, point) < threshold);
    });
    if (nextObjects.length !== objects.length || nextNotes.length !== notes.length) {
      publish({ ...graph, objects: nextObjects, notes: nextNotes });
    }
  };

  const beginPan = (event) => {
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      view: { ...view },
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
    setView(nextView);
  };

  const endPan = () => {
    if (!panRef.current) return;
    panRef.current = null;
    sendViewport(view);
  };

  const followViewport = (nextView) => setView({ ...defaultBoardView, ...nextView });

  const clearBoard = () => {
    const next = createEmptyBoard();
    next.view = { ...view };
    setSelectedObjectId(null);
    publish(next);
  };

  const deleteSelectedObject = () => {
    if (!canEdit || !selectedObjectId) return;
    publish({ ...graph, objects: objects.filter((item) => item.id !== selectedObjectId) });
    setSelectedObjectId(null);
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#dedbd2] bg-white lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:grid-rows-1">
      <aside className="flex max-h-[44vh] min-h-0 flex-col border-b border-[#ece8dd] bg-[#fbfaf7] lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {drawingToolGroups.map((group) => (
            <section key={group.id}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#66675f]">
                <Icon size={16}>{group.icon}</Icon>
                {group.label}
              </div>
              <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-4">
                {group.tools.map((item) => (
                  <button
                    key={item.id}
                    disabled={!canEdit && !["pan", "select"].includes(item.id)}
                    title={item.label}
                    onClick={() => setTool(item.id)}
                    className={`grid h-10 min-w-0 place-items-center rounded-xl border text-[#30312d] transition ${
                      tool === item.id
                        ? "border-[#30312d] bg-[#30312d] text-white"
                        : "border-[#dedbd2] bg-white hover:bg-[#f1efe9]"
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <Icon size={20}>{item.icon}</Icon>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#66675f]">
              <Icon size={16}>palette</Icon>
              Style
            </div>
            <div className="grid grid-cols-[42px_1fr] gap-2">
              <label className="grid h-10 place-items-center rounded-xl border border-[#dedbd2] bg-white" title="Color">
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  disabled={!canEdit}
                  className="h-6 w-6 border-0 bg-transparent p-0"
                />
              </label>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-[#dedbd2] bg-white px-3">
                <Icon size={18}>line_weight</Icon>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                  disabled={!canEdit}
                  className="min-w-0 flex-1 accent-[#30312d]"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setRandomColor((current) => !current)}
              className={`mt-2 flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                randomColor
                  ? "border-[#30312d] bg-[#30312d] text-white"
                  : "border-[#dedbd2] bg-white text-[#30312d] hover:bg-[#f1efe9]"
              } disabled:opacity-40`}
            >
              <Icon size={18}>{randomColor ? "shuffle_on" : "shuffle"}</Icon>
              Random color
            </button>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#66675f]">
              <Icon size={16}>grid_on</Icon>
              Snap
            </div>
            <select
              value={snapSize}
              onChange={(event) => setSnapSize(event.target.value)}
              className="h-10 w-full rounded-xl border border-[#dedbd2] bg-white px-3 text-sm font-bold text-[#30312d] outline-none focus:border-[#30312d]"
            >
              <option value="0.1">0.1 units</option>
              <option value="0.25">0.25 units</option>
              <option value="0.5">0.5 units</option>
              <option value="1">1 unit</option>
              <option value="2">2 units</option>
              <option value="5">5 units</option>
            </select>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#66675f]">
              <Icon size={16}>functions</Icon>
              Graphs
            </div>
            <div className="flex gap-2">
              <input
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addExpression();
                }}
                disabled={!canEdit}
                placeholder="y = sin(x)"
                className="min-w-0 flex-1 rounded-xl border border-[#dedbd2] bg-white px-3 py-2 text-sm text-[#30312d] outline-none focus:border-[#30312d]"
              />
              <button
                disabled={!canEdit || !parseExpression(expression)}
                onClick={addExpression}
                title="Add graph"
                className="grid h-10 w-10 place-items-center rounded-xl bg-[#30312d] text-white disabled:opacity-40"
              >
                <Icon size={20}>add</Icon>
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {expressions.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[#e8e4da] bg-white px-2 py-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                  <input
                    value={item.value}
                    disabled={!canEdit}
                    onChange={(event) => updateExpression(item.id, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#30312d] outline-none"
                  />
                  <button disabled={!canEdit} onClick={() => removeExpression(item.id)} title="Remove graph" className="text-[#a35645] disabled:opacity-40">
                    <Icon size={18}>close</Icon>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#66675f]">
              <Icon size={16}>category</Icon>
              Objects
            </div>
            {selectedObjectId && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={deleteSelectedObject}
                className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d9b8ad] bg-[#fff5f1] px-3 text-xs font-bold text-[#9a4f42] disabled:opacity-40"
              >
                <Icon size={18}>delete</Icon>
                Delete selected
              </button>
            )}
            <div className="space-y-1 text-xs font-semibold text-[#595a53]">
              {objects.length ? (
                objects.slice(-12).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedObjectId(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                      selectedObjectId === item.id
                        ? "border-[#30312d] bg-white text-[#30312d]"
                        : "border-[#e8e4da] bg-white"
                    }`}
                  >
                    <span>{item.label || item.kind}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#d8d3c7] px-3 py-3 text-[#85816f]">
                  Points, lines, circles, and rectangles stay editable as objects.
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#66675f]">
              <Icon size={16}>visibility</Icon>
              Viewports
            </div>
            <div className="space-y-1">
              {Object.entries(remoteViews).length ? (
                Object.entries(remoteViews).map(([id, item]) => (
                  <button
                    key={id}
                    onClick={() => followViewport(item.view)}
                    className="flex w-full items-center gap-2 rounded-xl border border-[#e8e4da] bg-white px-3 py-2 text-left text-xs font-bold text-[#30312d]"
                  >
                    <Icon size={17}>center_focus_strong</Icon>
                    <span className="min-w-0 flex-1 truncate">{item.name || "Viewer"}</span>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#d8d3c7] px-3 py-3 text-xs font-semibold text-[#85816f]">
                  Other people will appear here when they move around the board.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center gap-1 border-t border-[#ece8dd] p-2">
          <button
            disabled={!canEdit || !history.length}
            title="Undo"
            onClick={() => restore(history.at(-1), history.slice(0, -1), [...redo, boardSnapshot(graph)])}
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#dedbd2] bg-white disabled:opacity-40"
          >
            <Icon size={20}>undo</Icon>
          </button>
          <button
            disabled={!canEdit || !redo.length}
            title="Redo"
            onClick={() => restore(redo.at(-1), [...history, boardSnapshot(graph)], redo.slice(0, -1))}
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#dedbd2] bg-white disabled:opacity-40"
          >
            <Icon size={20}>redo</Icon>
          </button>
          <button
            disabled={!canEdit}
            title="Clear board"
            onClick={clearBoard}
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#dedbd2] bg-white text-[#a35645] disabled:opacity-40"
          >
            <Icon size={20}>delete</Icon>
          </button>
          <div className="ml-auto flex gap-1">
            <button title="Zoom out" onClick={() => zoom(0.82)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dedbd2] bg-white">
              <Icon size={20}>zoom_out</Icon>
            </button>
            <button title="Reset view" onClick={resetView} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dedbd2] bg-white">
              <Icon size={20}>my_location</Icon>
            </button>
            <button title="Zoom in" onClick={() => zoom(1.18)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dedbd2] bg-white">
              <Icon size={20}>zoom_in</Icon>
            </button>
          </div>
        </div>
      </aside>

      <canvas
        ref={canvasRef}
        className="h-full min-h-0 w-full min-w-0 touch-none bg-white"
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY > 0 ? 0.9 : 1.1);
        }}
        onPointerDown={(event) => {
          if (event.button === 1 || tool === "pan") {
            event.preventDefault();
            beginPan(event);
            return;
          }
          const screen = screenPoint(event);
          if (tool === "select") {
            setSelectedObjectId(hitTestObject(screen)?.id || null);
            return;
          }
          if (!canEdit) return;
          const world = toWorld(screen);
          if (tool === "eraser") {
            eraseAt(world);
            return;
          }
          if (tool === "text") {
            const text = window.prompt("Text note");
            if (text) publish({ ...graph, notes: [...notes, { id: newBoardId(), kind: "text", text, point: world, color: creationColor(), width }] });
            return;
          }
          if (tool === "point") {
            const snapped = snapWorldPoint(screen, { preferObjects: false });
            const item = {
              id: newBoardId(),
              kind: "point",
              point: snapped,
              color: creationColor(),
              label: `P${objects.length + 1}`,
            };
            publish({
              ...graph,
              objects: [...objects, item],
            });
            setSelectedObjectId(item.id);
            setTool("select");
            return;
          }
          if (objectTools.includes(tool)) {
            const snapped = snapWorldPoint(screen);
            drawRef.current = {
              kind: tool,
              a: snapped,
              b: snapped,
              snap: snapped,
              color: creationColor(),
              id: newBoardId(),
              label: tool,
            };
            canvasRef.current.setPointerCapture(event.pointerId);
            return;
          }
          if (tool === "pen") {
            drawRef.current = { id: newBoardId(), kind: "path", points: [world], color: creationColor(), width };
            canvasRef.current.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (panRef.current) {
            movePan(event);
            return;
          }
          if (!drawRef.current) return;
          const screen = screenPoint(event);
          const world = drawRef.current.kind === "path" ? toWorld(screen) : snapWorldPoint(screen);
          if (drawRef.current.kind === "path") {
            drawRef.current.points.push(world);
          } else {
            drawRef.current.b = world;
            drawRef.current.snap = world;
          }
          redraw(drawRef.current);
        }}
        onPointerUp={(event) => {
          if (panRef.current) {
            endPan(event);
            return;
          }
          if (!drawRef.current) return;
          const draft = drawRef.current;
          drawRef.current = null;
          if (draft.kind === "path") {
            if (draft.points.length > 1) publish({ ...graph, notes: [...notes, draft] });
            return;
          }
          delete draft.snap;
          const distance = Math.hypot(draft.a[0] - draft.b[0], draft.a[1] - draft.b[1]);
          if (distance > 0.02) {
            publish({ ...graph, objects: [...objects, draft] });
            setSelectedObjectId(draft.id);
            setTool("select");
          }
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
        setBoard(normalizeBoardData(classroom.whiteboard?.data));
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
          saveWhiteboard(lesson.id, createEmptyBoard()).catch(() => {});
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
      setBoard(createEmptyBoard());
      try {
        await saveWhiteboard(lesson.id, createEmptyBoard());
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
            <Whiteboard lessonId={lesson.id} board={board} onBoardChange={setBoard} canEdit profile={profile} />
          ) : tab === "split" ? (
            <div className="grid h-full gap-3 lg:grid-cols-2">
              <Whiteboard lessonId={lesson.id} board={board} onBoardChange={setBoard} canEdit profile={profile} />
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
