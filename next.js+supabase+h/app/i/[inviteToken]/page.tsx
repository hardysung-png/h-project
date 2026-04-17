import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { submitAttendance } from "@/app/actions/attendance";

type Props = { params: Promise<{ inviteToken: string }> };

export default async function InvitePage({ params }: Props) {
  const { inviteToken } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, schedules(id, title, starts_at, sort_order)")
    .eq("invite_token", inviteToken)
    .single();

  if (!event) notFound();

  const schedules = [...(event.schedules ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs text-muted-foreground mb-1">초대장</p>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
      </div>

      <form action={submitAttendance} className="flex flex-col gap-6">
        <input type="hidden" name="inviteToken" value={inviteToken} />

        <div>
          <label className="block text-sm font-medium mb-1">이름 (닉네임)</label>
          <input
            name="nickname"
            required
            placeholder="예: 큰이모"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">구분</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="isAdult"
                value="true"
                defaultChecked
                className="accent-foreground"
              />
              <span className="text-sm">어른</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="isAdult"
                value="false"
                className="accent-foreground"
              />
              <span className="text-sm">아이</span>
            </label>
          </div>
        </div>

        {schedules.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2">일정별 참석 여부</label>
            <div className="flex flex-col gap-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border rounded-md px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    {s.starts_at && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.starts_at).toLocaleString("ko-KR", {
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`schedule_${s.id}`}
                        value="true"
                        defaultChecked
                        className="accent-foreground"
                      />
                      <span className="text-sm">참석</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`schedule_${s.id}`}
                        value="false"
                        className="accent-foreground"
                      />
                      <span className="text-sm">불참</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-foreground text-background py-2.5 rounded-md text-sm font-medium hover:opacity-90"
        >
          응답 제출
        </button>
      </form>
    </div>
  );
}
