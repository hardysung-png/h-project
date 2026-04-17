"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createEvent(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const title = formData.get("title") as string;
  if (!title?.trim()) throw new Error("제목을 입력해주세요");

  const scheduleCount = parseInt(formData.get("scheduleCount") as string, 10);

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({ host_id: user.id, title: title.trim() })
    .select("id")
    .single();

  if (eventError || !event) throw new Error(eventError?.message ?? "이벤트 생성 실패");

  const schedules = [];
  for (let i = 0; i < scheduleCount; i++) {
    const schedTitle = formData.get(`schedule_${i}_title`) as string;
    const startsAt = formData.get(`schedule_${i}_starts_at`) as string;
    if (schedTitle?.trim()) {
      schedules.push({
        event_id: event.id,
        title: schedTitle.trim(),
        starts_at: startsAt || null,
        sort_order: i,
      });
    }
  }

  if (schedules.length > 0) {
    const { error } = await supabase.from("schedules").insert(schedules);
    if (error) throw new Error(error.message);
  }

  redirect(`/events/${event.id}`);
}

export async function upsertCostItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const eventId = formData.get("eventId") as string;
  const name = formData.get("name") as string;
  const amount = parseInt(formData.get("amount") as string, 10);
  const childRatio = parseFloat(formData.get("childRatio") as string) || 0.5;

  const { error } = await supabase.from("cost_items").insert({
    event_id: eventId,
    name: name.trim(),
    amount,
    child_ratio: childRatio,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function deleteCostItem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const id = formData.get("id") as string;
  const eventId = formData.get("eventId") as string;

  const { error } = await supabase.from("cost_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function updateAttendeeExclusion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const attendeeId = formData.get("attendeeId") as string;
  const eventId = formData.get("eventId") as string;
  const excluded = formData.get("excluded") === "true";

  await supabase
    .from("attendees")
    .update({ is_excluded_from_settlement: excluded })
    .eq("id", attendeeId);

  revalidatePath(`/events/${eventId}`);
}
