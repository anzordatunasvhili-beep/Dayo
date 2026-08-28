import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: authData, error: userError } = await callerClient.auth.getUser();
    if (userError || !authData.user) throw new Error("Unauthorized");

    const { student_id: studentId, password } = await req.json();
    if (typeof password !== "string" || password.length < 8)
      throw new Error("Password must be at least 8 characters.");

    const admin = createClient(url, service);
    const { data: student } = await admin
      .from("profiles")
      .select("id")
      .eq("id", studentId)
      .eq("role", "student")
      .eq("teacher_id", authData.user.id)
      .single();
    if (!student) throw new Error("Student not found.");

    const { error } = await admin.auth.admin.updateUserById(student.id, {
      password,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("reset-student-password failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});