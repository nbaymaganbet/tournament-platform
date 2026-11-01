type SwapMatch = {
  id: string;
  status: string;
  winner_id: string | null;
  completed_at: string | null;
  participant_a_id: string | null;
  participant_b_id: string | null;
  next_match_id: string | null;
  loser_next_match_id: string | null;
};

export function swappableAthletes(matches: SwapMatch[]): Set<string> {
  const available = new Set<string>();
  const positions = new Map<string, SwapMatch[]>();
  const byId = new Map(matches.map(match => [match.id, match]));
  for (const match of matches) {
    for (const id of [match.participant_a_id, match.participant_b_id]) {
      if (id) positions.set(id, [...(positions.get(id) ?? []), match]);
    }
  }
  for (const [id, appearances] of positions) {
    if (appearances.length !== 1) continue;
    const pending = [appearances[0]];
    const seen = new Set<string>();
    let safe = true;
    while (pending.length) {
      const match = pending.pop()!;
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      if (match.winner_id || match.completed_at || !["scheduled", "ready"].includes(match.status)) {
        safe = false;
        break;
      }
      for (const targetId of [match.next_match_id, match.loser_next_match_id]) {
        if (targetId) {
          const target = byId.get(targetId);
          if (!target) { safe = false; break; }
          pending.push(target);
        }
      }
      if (!safe) break;
    }
    if (safe) available.add(id);
  }
  return available;
}
