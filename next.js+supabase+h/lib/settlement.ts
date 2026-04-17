export interface Attendee {
  id: string;
  nickname: string;
  is_adult: boolean;
  is_excluded_from_settlement: boolean;
}

export interface CostItem {
  id: string;
  name: string;
  amount: number;
  child_ratio: number;
}

export interface SettlementRow {
  attendeeId: string;
  nickname: string;
  weight: number;
  share: number;
}

export interface SettlementResult {
  totalAmount: number;
  totalWeight: number;
  perUnit: number;
  rows: SettlementRow[];
}

export function calculateSettlement(
  attendees: Attendee[],
  costItems: CostItem[]
): SettlementResult {
  const totalAmount = costItems.reduce((sum, item) => sum + item.amount, 0);

  const defaultChildRatio =
    costItems.length > 0 ? costItems[0].child_ratio : 0.5;

  const rows: SettlementRow[] = attendees.map((a) => {
    let weight = 0;
    if (!a.is_excluded_from_settlement) {
      weight = a.is_adult ? 1 : defaultChildRatio;
    }
    return {
      attendeeId: a.id,
      nickname: a.nickname,
      weight,
      share: 0,
    };
  });

  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  const perUnit = totalWeight > 0 ? totalAmount / totalWeight : 0;

  for (const row of rows) {
    row.share = Math.round(row.weight * perUnit);
  }

  // 반올림 오차를 마지막 참석자(제외 아닌)에게 보정
  const included = rows.filter((r) => r.weight > 0);
  if (included.length > 0) {
    const allocated = rows.reduce((sum, r) => sum + r.share, 0);
    const diff = totalAmount - allocated;
    included[included.length - 1].share += diff;
  }

  return { totalAmount, totalWeight, perUnit, rows };
}
