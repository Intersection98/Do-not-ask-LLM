export type HandleDailyPuzzle = {
  answer: string;
  hint: string;
};
const LOCAL_HANDLE_PUZZLES: readonly HandleDailyPuzzle[] = [
  { answer: "物华天宝", hint: "华" },
  { answer: "人杰地灵", hint: "杰" },
  { answer: "俊采星驰", hint: "驰" },
  { answer: "胜友如云", hint: "友" },
  { answer: "高朋满座", hint: "朋" },
  { answer: "腾蛟起凤", hint: "蛟" },
  { answer: "钟鸣鼎食", hint: "鼎" },
  { answer: "云销雨霁", hint: "霁" },
  { answer: "逸兴遄飞", hint: "遄" },
  { answer: "天高地迥", hint: "迥" },
  { answer: "兴尽悲来", hint: "悲" },
  { answer: "萍水相逢", hint: "萍" },
  { answer: "时运不齐", hint: "运" },
  { answer: "命途多舛", hint: "舛" },
  { answer: "冯唐易老", hint: "冯" },
  { answer: "李广难封", hint: "广" },
  { answer: "达人知命", hint: "达" },
  { answer: "老当益壮", hint: "益" },
  { answer: "穷且益坚", hint: "坚" },
  { answer: "青云之志", hint: "云" },
  { answer: "北海虽赊", hint: "赊" },
  { answer: "桑榆非晚", hint: "榆" },
];

function pickRandomIndex(size: number) {
  if (size <= 1) return 0;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % size;
  }
  return Math.floor(Math.random() * size);
}

export function pickRandomHandlePuzzle(previousAnswer?: string): HandleDailyPuzzle {
  const candidates = previousAnswer
    ? LOCAL_HANDLE_PUZZLES.filter((puzzle) => puzzle.answer !== previousAnswer)
    : [...LOCAL_HANDLE_PUZZLES];
  const pool = candidates.length > 0 ? candidates : [...LOCAL_HANDLE_PUZZLES];
  return pool[pickRandomIndex(pool.length)];
}
