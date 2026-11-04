export const victoryMethods = [
 ["points", "Победа по очкам", "Ұпай бойынша жеңіс"],
 ["submission", "Сабмишн", "Сабмишн"],
 ["ko", "Нокаут", "Нокаут"],
 ["tko", "Технический нокаут", "Техникалық нокаут"],
 ["disqualification", "Дисквалификация", "Дисквалификация"],
 ["walkover", "Неявка", "Келмеу"],
 ["retirement", "Отказ соперника от продолжения", "Қарсыластың жалғастырудан бас тартуы"],
] as const;
export function victoryLabel(method: string | null | undefined, kk = false) {
 return victoryMethods.find(row=>row[0]===method)?.[kk?2:1] ?? "";
}
export type Scoreboard = { match_id:string;score_a:number;score_b:number;current_round:number;round_seconds:number;round_count:number;rest_seconds:number;remaining_ms:number;timer_started_at:string|null;is_rest:boolean;victory_method:string|null;version:number;server_now?:string };
export function remainingMilliseconds(board:Scoreboard, now=Date.now()) {
 return Math.max(0,board.remaining_ms-(board.timer_started_at?Math.max(0,now-Date.parse(board.timer_started_at)):0));
}
export function clockText(ms:number) { const seconds=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`; }
