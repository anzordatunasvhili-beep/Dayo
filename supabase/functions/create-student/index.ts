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
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const admin = createClient(url, service);
    const { data: teacher } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .eq("role", "teacher")
      .single();
    if (!teacher) throw new Error("Only teachers can create student accounts.");
    const body = await req.json();
    const cleanLocal = (value: string) =>
      value.trim().replace(/[^a-zA-Z0-9]/g, "_");
    const cleanDomain = (value: string) =>
      value
        .trim()
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    const region = cleanDomain(
      body.country_region || teacher.country_region || "global",
    );
    const email = `${cleanLocal(body.first_name)}_${cleanLocal(body.last_name)}_${cleanLocal(teacher.studio_code || teacher.first_name[0] + teacher.last_name[0])}@Dayo.Edu.${region}`;
    const password = body.password || crypto.randomUUID().slice(0, 12) + "Aa1!";
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: body.first_name,
        last_name: body.last_name,
        role: "student",
        teacher_id: user.id,
      },
    });
    if (error) throw error;
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: created.user.id,
        role: "student",
        email,
        first_name: body.first_name,
        last_name: body.last_name,
        teacher_id: user.id,
        country_region: body.country_region || teacher.country_region,
      });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    if (body.subject_ids?.length)
      await admin
        .from("student_subjects")
        .insert(
          body.subject_ids.map((subject_id: string) => ({
            student_id: created.user.id,
            subject_id,
            lesson_mode: body.lesson_mode || "individual",
            group_id: body.group_id || null,
          })),
        );
    if (body.group_id)
      await admin
        .from("group_members")
        .insert({ group_id: body.group_id, student_id: created.user.id });
    return new Response(
      JSON.stringify({
        student: created.user,
        email,
        temporary_password: password,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("create-student failed:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
