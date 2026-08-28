import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.15.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const normalizeLiveKitUrl = (value: string) => {
  const withProtocol = value.includes("://") ? value : `wss://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol !== "wss:" && url.protocol !== "ws:") {
    throw new Error("LIVEKIT_URL must use wss:// for production or ws:// for local testing.");
  }
  return url.toString().replace(/\/$/, "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !livekitUrl)
      throw new Error("LiveKit is not configured on the server.");
    const normalizedLiveKitUrl = normalizeLiveKitUrl(livekitUrl);

    const authorization = req.headers.get("Authorization") || "";
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { lesson_id: lessonId } = await req.json();
    if (typeof lessonId !== "string") throw new Error("A lesson is required.");
    const { data: lesson, error: lessonError } = await caller
      .from("lessons")
      .select("id,subject:subjects(name)")
      .eq("id", lessonId)
      .single();
    if (lessonError || !lesson) throw new Error("You cannot access this lesson.");

    const { data: profile } = await caller
      .from("profiles")
      .select("first_name,last_name,role")
      .eq("id", authData.user.id)
      .single();
    const token = new AccessToken(apiKey, apiSecret, {
      identity: authData.user.id,
      name: profile ? `${profile.first_name} ${profile.last_name}` : authData.user.email,
      metadata: JSON.stringify({ role: profile?.role || "student", lesson_id: lessonId }),
    });
    token.addGrant({ roomJoin: true, room: `lesson_${lessonId}` });
    return new Response(JSON.stringify({ token: await token.toJwt(), url: normalizedLiveKitUrl }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-livekit-token failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
