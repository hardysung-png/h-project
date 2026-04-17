import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { calculateSettlement } from "@/lib/settlement";
import { upsertCostItem, deleteCostItem, updateAttendeeExclusion } from "@/app/actions/events";
import Link from "next/link";
import { CopyInviteLinkButton } from "@/components/CopyInviteLinkButton";

type Props = { params: Promise<{ eventId: string }> };

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, invite_token, schedules(id, title, starts_at, sort_order), cost_items(id, name, amount, child_ratio)"
    )
    .eq("id", eventId)
    .eq("host_id", user.id)
    .single();

  if (!event) notFound();

  const schedules = [...(event.schedules ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const costItems = event.cost_items ?? [];

  const { data: attendees } = await supabase
    .from("attendees")
    .select("id, nickname, is_adult, is_excluded_from_settlement")
    .eq("event_id", eventId)
    .order("created_at");

  const attendeeList = attendees ?? [];

  // 일정별 참석 수 집계
  const { data: responses } = await supabase
    .from("attendance_responses")
    .select("attendee_id, schedule_id, attending")
    .in(
      "attendee_id",
      attendeeList.map((a) => a.id)
    );

  const responsesMap = new Map<string, Map<string, boolean>>();
  for (const r of responses ?? []) {
    if (!responsesMap.has(r.schedule_id)) {
      responsesMap.set(r.schedule_id, new Map());
    }
    responsesMap.get(r.schedule_id)!.set(r.attendee_id, r.attending);
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/i/${event.invite_token}`;

  const settlement = calculateSettlement(attendeeList, costItems);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:underline">
            ← 목록
          </Link>
          <h1 className="text-xl font-semibold mt-1">{event.title}</h1>
        </div>
        <CopyInviteLinkButton url={inviteUrl} />
      </div>

      {/* 일정별 참석 집계 */}
      <section>
        <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
          일정별 참석 현황
        </h2>
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">일정이 없습니다.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">이름</th>
                  {schedules.map((s) => (
                    <th key={s.id} className="text-center px-3 py-2 font-medium">
                      {s.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendeeList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={schedules.length + 1}
                      className="text-center text-muted-foreground py-4 text-xs"
                    >
                      아직 응답이 없습니다.
                    </td>
                  </tr>
                ) : (
                  attendeeList.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="px-3 py-2">
                        {a.nickname}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({a.is_adult ? "어른" : "아이"})
                        </span>
                      </td>
                      {schedules.map((s) => {
                        const attending = responsesMap.get(s.id)?.get(a.id);
                        return (
                          <td key={s.id} className="text-center px-3 py-2">
                            {attending === true
                              ? "✓"
                              : attending === false
                                ? "✗"
                                : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
              {attendeeList.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td className="px-3 py-2 text-xs font-medium">참석 합계</td>
                    {schedules.map((s) => {
                      const count = [...(responsesMap.get(s.id)?.values() ?? [])].filter(
                        Boolean
                      ).length;
                      return (
                        <td key={s.id} className="text-center px-3 py-2 text-xs font-medium">
                          {count}/{attendeeList.length}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      {/* 비용 입력 */}
      <section>
        <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
          비용 항목
        </h2>
        <form action={upsertCostItem} className="flex gap-2 mb-3">
          <input type="hidden" name="eventId" value={eventId} />
          <input
            name="name"
            required
            placeholder="항목 (예: 식비)"
            className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <input
            name="amount"
            type="number"
            required
            min="0"
            placeholder="금액 (원)"
            className="w-32 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <input type="hidden" name="childRatio" value="0.5" />
          <button
            type="submit"
            className="bg-foreground text-background px-3 py-1.5 rounded-md text-sm hover:opacity-90"
          >
            추가
          </button>
        </form>

        {costItems.length > 0 && (
          <ul className="flex flex-col gap-1">
            {costItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                <span>{item.name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{item.amount.toLocaleString()}원</span>
                  <form action={deleteCostItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">
                      삭제
                    </button>
                  </form>
                </div>
              </li>
            ))}
            <li className="flex justify-between px-3 py-2 text-sm font-semibold border-t mt-1">
              <span>총액</span>
              <span className="font-mono">{settlement.totalAmount.toLocaleString()}원</span>
            </li>
          </ul>
        )}
      </section>

      {/* 차등 N빵 정산 */}
      {attendeeList.length > 0 && costItems.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
            차등 N빵 정산
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">이름</th>
                  <th className="text-center px-3 py-2 font-medium">구분</th>
                  <th className="text-center px-3 py-2 font-medium">가중치</th>
                  <th className="text-right px-3 py-2 font-medium">부담금</th>
                  <th className="text-center px-3 py-2 font-medium">제외</th>
                </tr>
              </thead>
              <tbody>
                {settlement.rows.map((row) => {
                  const attendee = attendeeList.find((a) => a.id === row.attendeeId);
                  return (
                    <tr key={row.attendeeId} className="border-t">
                      <td className="px-3 py-2">{row.nickname}</td>
                      <td className="text-center px-3 py-2 text-muted-foreground text-xs">
                        {attendee?.is_adult ? "어른" : "아이"}
                      </td>
                      <td className="text-center px-3 py-2">{row.weight}</td>
                      <td className="text-right px-3 py-2 font-mono">
                        {row.weight === 0 ? (
                          <span className="text-muted-foreground">제외</span>
                        ) : (
                          `${row.share.toLocaleString()}원`
                        )}
                      </td>
                      <td className="text-center px-3 py-2">
                        <form action={updateAttendeeExclusion}>
                          <input type="hidden" name="attendeeId" value={row.attendeeId} />
                          <input type="hidden" name="eventId" value={eventId} />
                          <input
                            type="hidden"
                            name="excluded"
                            value={String(!(attendee?.is_excluded_from_settlement ?? false))}
                          />
                          <button
                            type="submit"
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            {attendee?.is_excluded_from_settlement ? "포함" : "제외"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium">
                    총 {settlement.totalWeight}인분 기준
                  </td>
                  <td className="text-right px-3 py-2 text-xs font-mono font-medium">
                    {settlement.totalAmount.toLocaleString()}원
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
