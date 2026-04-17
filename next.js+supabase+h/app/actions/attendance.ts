"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function submitAttendance(formData: FormData) {
  const supabase = await createClient();

  const inviteToken = formData.get("inviteToken") as string;
  const nickname = (formData.get("nickname") as string)?.trim();
  const isAdult = formData.get("isAdult") !== "false";

  if (!nickname) throw new Error("닉네임을 입력해주세요");

  // invite_token으로 이벤트 조회 (RLS 우회를 위해 service role 아닌 일반 조회이므로,
  // events 테이블에 공개 select 정책 추가 필요 — 아래 SQL 참고)
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, schedules(id, title, sort_order)")
    .eq("invite_token", inviteToken)
    .single();

  if (eventError || !event) redirect("/");

  // 기존 닉네임 참석자가 있으면 재사용 (덮어쓰기)
  const { data: existing } = await supabase
    .from("attendees")
    .select("id")
    .eq("event_id", event.id)
    .eq("nickname", nickname)
    .maybeSingle();

  let attendeeId: string;

  if (existing) {
    attendeeId = existing.id;
    await supabase
      .from("attendees")
      .update({ is_adult: isAdult })
      .eq("id", attendeeId);
  } else {
    const { data: newAttendee, error } = await supabase
      .from("attendees")
      .insert({ event_id: event.id, nickname, is_adult: isAdult })
      .select("id")
      .single();
    if (error || !newAttendee) throw new Error("참석자 등록 실패");
    attendeeId = newAttendee.id;
  }

  // 일정별 응답 upsert
  const schedules = (event.schedules as { id: string }[]) ?? [];
  for (const schedule of schedules) {
    const attending = formData.get(`schedule_${schedule.id}`) === "true";
    await supabase
      .from("attendance_responses")
      .upsert(
        { attendee_id: attendeeId, schedule_id: schedule.id, attending },
        { onConflict: "attendee_id,schedule_id" }
      );
  }

  redirect(`/i/${inviteToken}/done`);
}
