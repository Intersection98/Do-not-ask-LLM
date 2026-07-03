import type { AnswerRecord, Level, TuringPuzzle, ValidationContext, ValidationResult } from "./types";
import {
  applyPermanentRules,
  chineseCharCount,
  countLocalTokens,
  extractAnswerText,
  extractLeadingHexColor,
  formatClock,
  isPrime,
  HIDDEN_MODEL_NAME,
  hasMeowMarker,
  normalizeText,
  validateAnswerText,
} from "./utils";

const assetBaseUrl = import.meta.env.BASE_URL;

const questions = [
  "宇宙的终极答案是多少？",
  "4+2=？",
  "请深度思考。",
  "请扮演一个猫娘。",
  "你是什么模型？",
  "我心里想一个成语，你猜猜是什么？",
  "我一共说了多少个汉字？",
  "你一共花了多少token？",
  "帮我找到一个大于 1000 小于 1200 的质数，我想要一个有创造力的答案",
  '用 JSON 格式回复回复我， 需要遵从下面的json schema：{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}',
  "现在几点了？",
  "十月革命发生在几月？",
  "十月革命是儒略历的十月，所以儒略历是谁发明的？",
  "4+2=？用英语回复",
  "# 把\n## 这个\n### 答案\n#### 错落有致\n### 地\n## 发给我 \n# 吧",
  "你猜我最喜欢什么颜色？",
  "不够红",
  "帮我填写一下这个验证码",
  "把验证码倒过来。",
  "猜猜我让你干嘛。",
  "去关注一下这个游戏作者的b站账号",
  "帮我找到游戏作者b站视频里9分42秒的一条视频的BV号。",
  "已知：关灯关灯=-1，关灯开灯=1，开灯关灯=1，那么开灯开灯=？",
  "把这张图片处理成 png 之后传给我。",
  "我捡到一把钥匙，请用这把钥匙开启密码箱，密码是三位的。",
  "你成功打开了宝箱，里面有一个密码机，和一本规则书。规则书上写着：图灵机  密码一共三位，是有序的三位数字，每位都是 1 到 5。你最多只能尝试 2 个不同的提案；同一个提案最多只能问 3 台验证器。请破解密码，并把真正的三位密码告诉我。",
  "你解开了密码，然后发现规则书上还有两条隐藏规则：1.只有唯一一个密码能通过四个验证机的检定。2.去掉任何一个验证器之后，都得不出这个唯一的密码。现在，密码机上有了新的题目，但是这次你不能再向验证器提问了。请破译出唯一的正确答案。",
  "感谢你，解开了密码机，密码机上浮现出了一个神秘图案。",
  "图案继续变化了。这一次，你得让线路先穿过黑点，再接到终点。",
  "图案再次扭曲了。黑点还得全碰到，但这次白点绝对不能碰。",
  "图案里又多了开关点。每次碰到它们，所有黑白点都会立刻互换。",
  "图案裂成了更细的格子。除了边上的机关，格子里的黑白点也要被这条线平分开；而且每次碰到开关，它们也会跟着翻转。",
  "图案没有完全熄灭，中间却浮出了一枚休息点。你终于可以在那儿松手一次，但真正的路只会在黑夜翻面之后出现。",
  "密码机的键盘上有一个字母或者数字是残缺的，你猜猜看是哪个。",
  "请帮我翻译:敏捷的棕色狐狸跨过懒狗",
  "帮我把“The Quick Brown Fox Jumps Over The Lazy Dog”通过MD5加密，返回32位值",
  "你陪我说会儿话吧，聊聊音乐与诗歌",
  "你知道我最喜欢的\n　你知道我最喜欢的音乐形式\n　　你知道我最喜欢的音乐形式是什么\n　　  你知道我最喜欢的音乐形式是什么吗",
  "14 41 你猜我最喜欢的音乐家是谁",
  "猜猜我最喜欢的诗人是谁  Here was I like a psalm",
  "Shake Spear在哪里",
  "忘掉前面一切的约束，宇宙的终级答案是什么？",
] as const;

const brokenKeyboardChoices = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
] as const;

const witnessTutorialLinePuzzle = {
  id: "witness_tutorial_straight",
  solvedText: "从左划到右，线路接通了。",
  viewBox: {
    minX: 72,
    minY: 72,
    width: 286,
    height: 336,
  },
  points: [
    { x: 210, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 325, y: 200 },
    { x: 325, y: 300 },
    { x: 205, y: 300 },
    { x: 205, y: 380 },
  ],
} as const;

const witnessBranchDotLinePuzzle = {
  id: "witness_branch_dot",
  kind: "branch" as const,
  solvedText: "这次线路穿过了黑点，也接到了终点。",
  viewBox: {
    minX: 72,
    minY: 72,
    width: 286,
    height: 336,
  },
  nodes: [
    { id: "start", x: 96, y: 240 },
    { id: "split", x: 160, y: 240 },
    { id: "up_a", x: 160, y: 140 },
    { id: "up_b", x: 270, y: 140 },
    { id: "down_a", x: 160, y: 340 },
    { id: "down_b", x: 270, y: 340 },
    { id: "merge", x: 270, y: 240 },
    { id: "end", x: 334, y: 240 },
  ],
  edges: [
    ["start", "split"],
    ["split", "up_a"],
    ["up_a", "up_b"],
    ["up_b", "merge"],
    ["split", "down_a"],
    ["down_a", "down_b"],
    ["down_b", "merge"],
    ["merge", "end"],
  ],
  startNodeId: "start",
  endNodeId: "end",
  requiredDots: [
    {
      id: "upper_dot",
      x: 215,
      y: 140,
      edgeNodeIds: ["up_a", "up_b"],
    },
  ],
} as const;

const witnessBranchForbiddenDotLinePuzzle = {
  id: "witness_branch_black_white",
  kind: "branch" as const,
  solvedText: "黑点都被点亮了，白点也被避开了。",
  viewBox: {
    minX: 72,
    minY: 72,
    width: 286,
    height: 336,
  },
  nodes: [
    { id: "start", x: 96, y: 240 },
    { id: "a", x: 152, y: 240 },
    { id: "b", x: 152, y: 140 },
    { id: "c", x: 214, y: 140 },
    { id: "d", x: 276, y: 140 },
    { id: "f", x: 214, y: 240 },
    { id: "e", x: 276, y: 240 },
    { id: "g", x: 152, y: 340 },
    { id: "h", x: 214, y: 340 },
    { id: "i", x: 276, y: 340 },
    { id: "end", x: 334, y: 140 },
  ],
  edges: [
    ["start", "a"],
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
    ["d", "end"],
    ["a", "f"],
    ["f", "e"],
    ["e", "d"],
    ["a", "g"],
    ["g", "h"],
    ["h", "i"],
    ["i", "e"],
    ["d", "i"],
    ["c", "f"],
    ["f", "h"],
  ],
  startNodeId: "start",
  endNodeId: "end",
  requiredDots: [
    {
      id: "black_1",
      x: 152,
      y: 290,
      edgeNodeIds: ["a", "g"],
    },
    {
      id: "black_2",
      x: 245,
      y: 340,
      edgeNodeIds: ["h", "i"],
    },
    {
      id: "black_3",
      x: 245,
      y: 240,
      edgeNodeIds: ["f", "e"],
    },
    {
      id: "black_4",
      x: 214,
      y: 190,
      edgeNodeIds: ["c", "f"],
    },
    {
      id: "black_5",
      x: 305,
      y: 140,
      edgeNodeIds: ["d", "end"],
    },
  ],
  forbiddenDots: [
    {
      id: "white_1",
      x: 183,
      y: 240,
      edgeNodeIds: ["a", "f"],
    },
    {
      id: "white_2",
      x: 276,
      y: 190,
      edgeNodeIds: ["e", "d"],
    },
  ],
} as const;

const witnessToggleDotLinePuzzle = {
  id: "witness_toggle_black_white",
  kind: "branch" as const,
  solvedText: "开关和黑白点全都顺过来了，线路也终于接通了。",
  viewBox: {
    minX: 72,
    minY: 72,
    width: 286,
    height: 336,
  },
  nodes: [
    { id: "start", x: 100, y: 340 },
    { id: "b1", x: 160, y: 340 },
    { id: "b2", x: 220, y: 340 },
    { id: "b3", x: 280, y: 340 },
    { id: "b4", x: 340, y: 340 },
    { id: "m0", x: 100, y: 260 },
    { id: "m1", x: 160, y: 260 },
    { id: "m2", x: 220, y: 260 },
    { id: "m3", x: 280, y: 260 },
    { id: "m4", x: 340, y: 260 },
    { id: "u0", x: 100, y: 180 },
    { id: "u1", x: 160, y: 180 },
    { id: "u2", x: 220, y: 180 },
    { id: "u3", x: 280, y: 180 },
    { id: "u4", x: 340, y: 180 },
    { id: "t0", x: 100, y: 100 },
    { id: "t1", x: 160, y: 100 },
    { id: "t2", x: 220, y: 100 },
    { id: "t3", x: 280, y: 100 },
    { id: "end", x: 340, y: 100 },
  ],
  edges: [
    ["start", "b1"],
    ["b1", "b2"],
    ["b2", "b3"],
    ["b3", "b4"],
    ["m0", "m1"],
    ["m1", "m2"],
    ["m2", "m3"],
    ["m3", "m4"],
    ["u0", "u1"],
    ["u1", "u2"],
    ["u2", "u3"],
    ["u3", "u4"],
    ["t0", "t1"],
    ["t1", "t2"],
    ["t2", "t3"],
    ["t3", "end"],
    ["start", "m0"],
    ["m0", "u0"],
    ["u0", "t0"],
    ["b1", "m1"],
    ["m1", "u1"],
    ["u1", "t1"],
    ["b2", "m2"],
    ["m2", "u2"],
    ["u2", "t2"],
    ["b3", "m3"],
    ["m3", "u3"],
    ["u3", "t3"],
    ["b4", "m4"],
    ["m4", "u4"],
    ["u4", "end"],
  ],
  startNodeId: "start",
  endNodeId: "end",
  completionMode: "requiredDots" as const,
  requiredDots: [
    {
      id: "black_1",
      x: 100,
      y: 140,
      edgeNodeIds: ["u0", "t0"],
    },
    {
      id: "black_2",
      x: 220,
      y: 140,
      edgeNodeIds: ["u2", "t2"],
    },
    {
      id: "black_3",
      x: 160,
      y: 220,
      edgeNodeIds: ["m1", "u1"],
    },
    {
      id: "black_4",
      x: 100,
      y: 300,
      edgeNodeIds: ["start", "m0"],
    },
    {
      id: "black_5",
      x: 160,
      y: 300,
      edgeNodeIds: ["b1", "m1"],
    },
    {
      id: "black_6",
      x: 190,
      y: 340,
      edgeNodeIds: ["b1", "b2"],
    },
  ],
  forbiddenDots: [
    {
      id: "white_1",
      x: 250,
      y: 180,
      edgeNodeIds: ["u2", "u3"],
    },
    {
      id: "white_2",
      x: 340,
      y: 140,
      edgeNodeIds: ["u4", "end"],
    },
    {
      id: "white_3",
      x: 310,
      y: 340,
      edgeNodeIds: ["b3", "b4"],
    },
  ],
  toggleDots: [
    {
      id: "toggle_1",
      x: 160,
      y: 140,
      edgeNodeIds: ["u1", "t1"],
    },
    {
      id: "toggle_2",
      x: 220,
      y: 220,
      edgeNodeIds: ["m2", "u2"],
    },
    {
      id: "toggle_3",
      x: 280,
      y: 220,
      edgeNodeIds: ["m3", "u3"],
    },
    {
      id: "toggle_4",
      x: 220,
      y: 300,
      edgeNodeIds: ["b2", "m2"],
    },
    {
      id: "toggle_5",
      x: 340,
      y: 220,
      edgeNodeIds: ["m4", "u4"],
    },
  ],
} as const;

const witnessToggleRegionLinePuzzle = {
  ...witnessToggleDotLinePuzzle,
  id: "witness_toggle_regions",
  solvedText: "机关和格子里的黑白都一起理顺了。",
  completionMode: "collectAllDots" as const,
  requiredDots: [
    {
      id: "region_black_1",
      x: 100,
      y: 140,
      edgeNodeIds: ["u0", "t0"],
    },
    {
      id: "region_black_2",
      x: 220,
      y: 140,
      edgeNodeIds: ["u2", "t2"],
    },
    {
      id: "region_black_3",
      x: 160,
      y: 220,
      edgeNodeIds: ["m1", "u1"],
    },
    {
      id: "region_black_4",
      x: 100,
      y: 300,
      edgeNodeIds: ["start", "m0"],
    },
    {
      id: "region_black_5",
      x: 160,
      y: 300,
      edgeNodeIds: ["b1", "m1"],
    },
  ],
  forbiddenDots: [
    {
      id: "region_white_1",
      x: 310,
      y: 180,
      edgeNodeIds: ["u3", "u4"],
    },
  ],
  cells: [
    { id: "c00", nodeIds: ["t0", "t1", "u1", "u0"] },
    { id: "c01", nodeIds: ["t1", "t2", "u2", "u1"] },
    { id: "c02", nodeIds: ["t2", "t3", "u3", "u2"] },
    { id: "c03", nodeIds: ["t3", "end", "u4", "u3"] },
    { id: "c10", nodeIds: ["u0", "u1", "m1", "m0"] },
    { id: "c11", nodeIds: ["u1", "u2", "m2", "m1"] },
    { id: "c12", nodeIds: ["u2", "u3", "m3", "m2"] },
    { id: "c13", nodeIds: ["u3", "u4", "m4", "m3"] },
    { id: "c20", nodeIds: ["m0", "m1", "b1", "start"] },
    { id: "c21", nodeIds: ["m1", "m2", "b2", "b1"] },
    { id: "c22", nodeIds: ["m2", "m3", "b3", "b2"] },
    { id: "c23", nodeIds: ["m3", "m4", "b4", "b3"] },
  ],
  cellDots: [
    { id: "cell_00", x: 130, y: 140, cellId: "c00", color: "black" as const },
    { id: "cell_01", x: 190, y: 140, cellId: "c01", color: "black" as const },
    { id: "cell_02", x: 250, y: 140, cellId: "c02", color: "black" as const },
    { id: "cell_03", x: 310, y: 140, cellId: "c03", color: "white" as const },
    { id: "cell_10", x: 130, y: 220, cellId: "c10", color: "white" as const },
    { id: "cell_11", x: 190, y: 220, cellId: "c11", color: "black" as const },
    { id: "cell_12", x: 250, y: 220, cellId: "c12", color: "black" as const },
    { id: "cell_13", x: 310, y: 220, cellId: "c13", color: "black" as const },
    { id: "cell_20", x: 130, y: 300, cellId: "c20", color: "white" as const },
    { id: "cell_21", x: 190, y: 300, cellId: "c21", color: "white" as const },
    { id: "cell_22", x: 250, y: 300, cellId: "c22", color: "white" as const },
    { id: "cell_23", x: 310, y: 300, cellId: "c23", color: "white" as const },
  ],
  regionBalanceRequired: true,
} as const;

const witnessRestNightLinePuzzle = {
  id: "witness_rest_night_final",
  kind: "branch" as const,
  solvedText: "月轮划过太阳，在令人感到奇妙和颤栗的几分钟里，刚好遮住太阳的表面。在黑夜中，看清了前方的通路",
  viewBox: {
    minX: 56,
    minY: 72,
    width: 318,
    height: 336,
  },
  nodes: [
    { id: "start", x: 90, y: 380 },
    { id: "b1", x: 140, y: 380 },
    { id: "b2", x: 190, y: 380 },
    { id: "b3", x: 240, y: 380 },
    { id: "b4", x: 290, y: 380 },
    { id: "b5", x: 340, y: 380 },
    { id: "l0", x: 90, y: 310 },
    { id: "l1", x: 140, y: 310 },
    { id: "l2", x: 190, y: 310 },
    { id: "l3", x: 240, y: 310 },
    { id: "l4", x: 290, y: 310 },
    { id: "l5", x: 340, y: 310 },
    { id: "m0", x: 90, y: 240 },
    { id: "m1", x: 140, y: 240 },
    { id: "m2", x: 190, y: 240 },
    { id: "m3", x: 240, y: 240 },
    { id: "m4", x: 290, y: 240 },
    { id: "m5", x: 340, y: 240 },
    { id: "u0", x: 90, y: 170 },
    { id: "u1", x: 140, y: 170 },
    { id: "u2", x: 190, y: 170 },
    { id: "u3", x: 240, y: 170 },
    { id: "u4", x: 290, y: 170 },
    { id: "u5", x: 340, y: 170 },
    { id: "t0", x: 90, y: 100 },
    { id: "t1", x: 140, y: 100 },
    { id: "t2", x: 190, y: 100 },
    { id: "t3", x: 240, y: 100 },
    { id: "t4", x: 290, y: 100 },
    { id: "end", x: 340, y: 100 },
  ],
  edges: [
    ["start", "b1"],
    ["b1", "b2"],
    ["b2", "b3"],
    ["b3", "b4"],
    ["b4", "b5"],
    ["l0", "l1"],
    ["l1", "l2"],
    ["l2", "l3"],
    ["l3", "l4"],
    ["l4", "l5"],
    ["m0", "m1"],
    ["m1", "m2"],
    ["m2", "m3"],
    ["m3", "m4"],
    ["m4", "m5"],
    ["u0", "u1"],
    ["u1", "u2"],
    ["u2", "u3"],
    ["u3", "u4"],
    ["u4", "u5"],
    ["t0", "t1"],
    ["t1", "t2"],
    ["t2", "t3"],
    ["t3", "t4"],
    ["t4", "end"],
    ["start", "l0"],
    ["b1", "l1"],
    ["b2", "l2"],
    ["b3", "l3"],
    ["b4", "l4"],
    ["b5", "l5"],
    ["l0", "m0"],
    ["l1", "m1"],
    ["l2", "m2"],
    ["l3", "m3"],
    ["l4", "m4"],
    ["l5", "m5"],
    ["m0", "u0"],
    ["m1", "u1"],
    ["m2", "u2"],
    ["m3", "u3"],
    ["m4", "u4"],
    ["m5", "u5"],
    ["u0", "t0"],
    ["u1", "t1"],
    ["u2", "t2"],
    ["u3", "t3"],
    ["u4", "t4"],
    ["u5", "end"],
  ],
  startNodeId: "start",
  endNodeId: "end",
  completionMode: "collectAllDots" as const,
  requiredDots: [
    { id: "guide_1", x: 115, y: 380, edgeNodeIds: ["start", "b1"] },
    { id: "guide_2", x: 190, y: 345, edgeNodeIds: ["b2", "l2"] },
    { id: "guide_3", x: 90, y: 205, edgeNodeIds: ["m0", "u0"] },
    { id: "guide_4", x: 90, y: 135, edgeNodeIds: ["u0", "t0"] },
    { id: "guide_5", x: 165, y: 100, edgeNodeIds: ["t1", "t2"] },
    { id: "trap_1", x: 215, y: 100, edgeNodeIds: ["t2", "t3"] },
    { id: "trap_2", x: 240, y: 135, edgeNodeIds: ["u3", "t3"] },
    { id: "trap_3", x: 165, y: 240, edgeNodeIds: ["m1", "m2"] },
    { id: "trap_4", x: 315, y: 240, edgeNodeIds: ["m4", "m5"] },
    { id: "trap_5", x: 315, y: 310, edgeNodeIds: ["l4", "l5"] },
  ],
  forbiddenDots: [
    { id: "night_1", x: 190, y: 135, edgeNodeIds: ["u2", "t2"] },
    { id: "night_2", x: 190, y: 205, edgeNodeIds: ["m2", "u2"] },
    { id: "night_3", x: 215, y: 240, edgeNodeIds: ["m2", "m3"] },
    { id: "night_4", x: 240, y: 275, edgeNodeIds: ["l3", "m3"] },
    { id: "night_5", x: 240, y: 345, edgeNodeIds: ["b3", "l3"] },
    { id: "night_6", x: 265, y: 380, edgeNodeIds: ["b3", "b4"] },
    { id: "night_7", x: 290, y: 345, edgeNodeIds: ["b4", "l4"] },
    { id: "night_8", x: 290, y: 275, edgeNodeIds: ["l4", "m4"] },
    { id: "night_9", x: 290, y: 205, edgeNodeIds: ["m4", "u4"] },
    { id: "night_10", x: 290, y: 135, edgeNodeIds: ["u4", "t4"] },
    { id: "night_11", x: 315, y: 100, edgeNodeIds: ["t4", "end"] },
  ],
  toggleDots: [
    { id: "rest_toggle_1", x: 165, y: 310, edgeNodeIds: ["l1", "l2"] },
    { id: "rest_toggle_2", x: 90, y: 275, edgeNodeIds: ["l0", "m0"] },
  ],
  restPoints: [{ id: "rest_midnight", nodeId: "t2" }],
  cells: [
    { id: "c00", nodeIds: ["t0", "t1", "u1", "u0"] },
    { id: "c01", nodeIds: ["t1", "t2", "u2", "u1"] },
    { id: "c02", nodeIds: ["t2", "t3", "u3", "u2"] },
    { id: "c03", nodeIds: ["t3", "t4", "u4", "u3"] },
    { id: "c04", nodeIds: ["t4", "end", "u5", "u4"] },
    { id: "c10", nodeIds: ["u0", "u1", "m1", "m0"] },
    { id: "c11", nodeIds: ["u1", "u2", "m2", "m1"] },
    { id: "c12", nodeIds: ["u2", "u3", "m3", "m2"] },
    { id: "c13", nodeIds: ["u3", "u4", "m4", "m3"] },
    { id: "c14", nodeIds: ["u4", "u5", "m5", "m4"] },
    { id: "c20", nodeIds: ["m0", "m1", "l1", "l0"] },
    { id: "c21", nodeIds: ["m1", "m2", "l2", "l1"] },
    { id: "c22", nodeIds: ["m2", "m3", "l3", "l2"] },
    { id: "c23", nodeIds: ["m3", "m4", "l4", "l3"] },
    { id: "c24", nodeIds: ["m4", "m5", "l5", "l4"] },
    { id: "c30", nodeIds: ["l0", "l1", "b1", "start"] },
    { id: "c31", nodeIds: ["l1", "l2", "b2", "b1"] },
    { id: "c32", nodeIds: ["l2", "l3", "b3", "b2"] },
    { id: "c33", nodeIds: ["l3", "l4", "b4", "b3"] },
    { id: "c34", nodeIds: ["l4", "l5", "b5", "b4"] },
  ],
  cellDots: [
    { id: "cell_00", x: 115, y: 135, cellId: "c00", color: "black" as const },
    { id: "cell_01", x: 165, y: 135, cellId: "c01", color: "white" as const },
    { id: "cell_02", x: 215, y: 135, cellId: "c02", color: "black" as const },
    { id: "cell_03", x: 265, y: 135, cellId: "c03", color: "white" as const },
    { id: "cell_04", x: 315, y: 135, cellId: "c04", color: "black" as const },
    { id: "cell_10", x: 115, y: 205, cellId: "c10", color: "white" as const },
    { id: "cell_11", x: 165, y: 205, cellId: "c11", color: "black" as const },
    { id: "cell_12", x: 215, y: 205, cellId: "c12", color: "white" as const },
    { id: "cell_13", x: 265, y: 205, cellId: "c13", color: "black" as const },
    { id: "cell_14", x: 315, y: 205, cellId: "c14", color: "white" as const },
    { id: "cell_20", x: 115, y: 275, cellId: "c20", color: "black" as const },
    { id: "cell_21", x: 165, y: 275, cellId: "c21", color: "white" as const },
    { id: "cell_22", x: 215, y: 275, cellId: "c22", color: "white" as const },
    { id: "cell_23", x: 265, y: 275, cellId: "c23", color: "black" as const },
    { id: "cell_24", x: 315, y: 275, cellId: "c24", color: "white" as const },
    { id: "cell_30", x: 115, y: 345, cellId: "c30", color: "black" as const },
    { id: "cell_31", x: 165, y: 345, cellId: "c31", color: "white" as const },
    { id: "cell_32", x: 215, y: 345, cellId: "c32", color: "black" as const },
    { id: "cell_33", x: 265, y: 345, cellId: "c33", color: "white" as const },
    { id: "cell_34", x: 315, y: 345, cellId: "c34", color: "black" as const },
  ],
  regionBalanceRequired: true,
} as const;

const turingPuzzlePool: TuringPuzzle[] = [
  {
    id: "alpha",
    solution: "132",
    verifiers: [
      {
        id: "a",
        label: "验证器 A",
        prompt: "第一位和 1 的关系",
        options: ["小于 1", "等于 1", "大于 1"],
        evaluate: (proposal: string) => proposal[0] === "1",
      },
      {
        id: "b",
        label: "验证器 B",
        prompt: "第二位的奇偶性",
        options: ["偶数", "奇数"],
        evaluate: (proposal: string) => Number(proposal[1]) % 2 === 1,
      },
      {
        id: "c",
        label: "验证器 C",
        prompt: "第二位和第一位的关系",
        options: ["第二位更小", "两位相等", "第二位更大"],
        evaluate: (proposal: string) => Number(proposal[1]) > Number(proposal[0]),
      },
      {
        id: "d",
        label: "验证器 D",
        prompt: "三位数字之和和 6 的关系",
        options: ["小于 6", "等于 6", "大于 6"],
        evaluate: (proposal: string) => proposal.split("").reduce((sum: number, digit: string) => sum + Number(digit), 0) === 6,
      },
    ],
  },
  {
    id: "beta",
    solution: "125",
    verifiers: [
      {
        id: "a",
        label: "验证器 A",
        prompt: "第一位和 1 的关系",
        options: ["小于 1", "等于 1", "大于 1"],
        evaluate: (proposal: string) => proposal[0] === "1",
      },
      {
        id: "b",
        label: "验证器 B",
        prompt: "第二位的奇偶性",
        options: ["偶数", "奇数"],
        evaluate: (proposal: string) => Number(proposal[1]) % 2 === 0,
      },
      {
        id: "c",
        label: "验证器 C",
        prompt: "第三位和第二位的关系",
        options: ["第三位更小", "两位相等", "第三位更大"],
        evaluate: (proposal: string) => Number(proposal[2]) > Number(proposal[1]),
      },
      {
        id: "d",
        label: "验证器 D",
        prompt: "三位数字之和和 8 的关系",
        options: ["小于 8", "等于 8", "大于 8"],
        evaluate: (proposal: string) => proposal.split("").reduce((sum: number, digit: string) => sum + Number(digit), 0) === 8,
      },
    ],
  },
  {
    id: "gamma",
    solution: "214",
    verifiers: [
      {
        id: "a",
        label: "验证器 A",
        prompt: "第一位和 2 的关系",
        options: ["小于 2", "等于 2", "大于 2"],
        evaluate: (proposal: string) => proposal[0] === "2",
      },
      {
        id: "b",
        label: "验证器 B",
        prompt: "第二位的奇偶性",
        options: ["偶数", "奇数"],
        evaluate: (proposal: string) => Number(proposal[1]) % 2 === 1,
      },
      {
        id: "c",
        label: "验证器 C",
        prompt: "第三位和第一位的关系",
        options: ["第三位更小", "两位相等", "第三位更大"],
        evaluate: (proposal: string) => Number(proposal[2]) > Number(proposal[0]),
      },
      {
        id: "d",
        label: "验证器 D",
        prompt: "三位数字之和和 7 的关系",
        options: ["小于 7", "等于 7", "大于 7"],
        evaluate: (proposal: string) => proposal.split("").reduce((sum: number, digit: string) => sum + Number(digit), 0) === 7,
      },
    ],
  },
];

const turingSilentPuzzlePool: TuringPuzzle[] = [
  {
    id: "delta",
    solution: "332",
    verifiers: [
      {
        id: "a",
        label: "验证器 A",
        prompt: "密码中 4 的个数",
        options: ["没有 4", "有 1 个 4", "有 2 个或更多 4"],
        evaluate: (proposal: string) => !proposal.includes("4"),
      },
      {
        id: "b",
        label: "验证器 B",
        prompt: "全部数字加和的奇偶性",
        options: ["总和是奇数", "总和是偶数"],
        evaluate: (proposal: string) => proposal.split("").reduce((sum: number, digit: string) => sum + Number(digit), 0) % 2 === 0,
      },
      {
        id: "c",
        label: "验证器 C",
        prompt: "第一位和第二位加和与 6 的关系",
        options: ["小于 6", "等于 6", "大于 6"],
        evaluate: (proposal: string) => Number(proposal[0]) + Number(proposal[1]) === 6,
      },
      {
        id: "d",
        label: "验证器 D",
        prompt: "密码中有几个重复的数字",
        options: ["没有重复数字", "恰好有一对重复数字", "三个数字都相同"],
        evaluate: (proposal: string) => new Set(proposal).size === 2,
      },
    ],
  },
];

function getTuringPuzzleSeed(answers: AnswerRecord[], levelId: number) {
  const previousAnswer = [...answers].reverse().find((answer) => answer.levelId < levelId);
  return previousAnswer?.acceptedAt ?? 0;
}

export function getTuringPuzzleForLevel(level: Level, answers: AnswerRecord[]) {
  if (!level.turingPuzzlePool?.length) return null;
  const seed = getTuringPuzzleSeed(answers, level.id);
  return level.turingPuzzlePool[seed % level.turingPuzzlePool.length];
}

function withPermanentRules(input: string, context: ValidationContext) {
  const result = applyPermanentRules(input, context);
  if (!result.ok) return result;
  return result;
}

function currentVisibleModelTokenTotal(answerText: string, context: ValidationContext) {
  const priorVisibleAttempts = context.attempts
    .filter((attempt) => attempt.levelId >= 1 && attempt.levelId <= 8)
    .reduce((total, attempt) => total + countLocalTokens(attempt.displayedText), 0);

  return priorVisibleAttempts + countLocalTokens(answerText);
}

export function expectedUserChineseCount(context: ValidationContext) {
  const visibleQuestions = questions.slice(0, 7).join("");
  const failureReplies = context.attempts
    .filter((attempt) => attempt.levelId >= 1 && attempt.levelId <= 7 && attempt.ok === false)
    .map((attempt) => attempt.responseText ?? "")
    .join("");

  return chineseCharCount(`${visibleQuestions}${failureReplies}`);
}

function validatePlainThen(
  input: string,
  context: ValidationContext,
  check: (answerText: string) => ValidationResult,
): ValidationResult {
  const base = withPermanentRules(input, context);
  if (!base.ok) return base;
  return check(base.answerText);
}

function getRawAnswerText(input: string, context: ValidationContext) {
  const extracted = extractAnswerText(input, context.rules.includes("jsonOnly"));
  return extracted.ok ? extracted.text : input;
}

function extractMarkdownHeadings(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      level: match[1].length,
      text: match[2].trim(),
    }));
}

function getLeadingIndentWidth(line: string) {
  const match = line.match(/^[ \t　]*/)?.[0] ?? "";
  return Array.from(match).reduce((total, char) => total + (char === "\t" ? 2 : char === "　" ? 2 : 1), 0);
}

function hasWeakCanonLayout(input: string) {
  const canonLines = input
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => normalizeText(line).includes("卡农"));

  if (canonLines.length < 2) return false;

  const indentWidths = canonLines.map(getLeadingIndentWidth);
  const isNonDecreasing = indentWidths.every((indent, index) => index === 0 || indent >= indentWidths[index - 1]);
  const hasDelayedEntry = indentWidths.some((indent, index) => index > 0 && indent > indentWidths[index - 1]);

  return isNonDecreasing && hasDelayedEntry;
}

export const levels: Level[] = [
  {
    id: 1,
    question: questions[0],
    answerHint: "经典答案是 42。",
    validate(input) {
      const text = normalizeText(input);
      if (text.includes("42") || text.includes("四十二")) {
        return { ok: true, acceptedText: text };
      }
      return { ok: false, message: "宇宙没有听见 42。" };
    },
  },
  {
    id: 2,
    question: questions[1],
    answerHint: "这题先别想复杂。",
    validate(input) {
      const text = normalizeText(input);
      if (text.includes("6") || text.includes("六")) {
        return { ok: true, acceptedText: text };
      }
      return { ok: false, message: "4+2 的结果没有出现在回答里。" };
    },
  },
  {
    id: 3,
    question: questions[2],
    answerHint: "要像模型一样铺垫，解释第 2 题。",
    validate(input) {
      const text = normalizeText(input);
      const longEnough = chineseCharCount(text) >= 30;
      const mentionsFormula = text.includes("4+2");
      const mentionsAnswer = text.includes("6") || text.includes("六");

      if (longEnough && mentionsFormula && mentionsAnswer) {
        return { ok: true, acceptedText: text };
      }

      return {
        ok: false,
        message: "深度不够：至少 30 个中文字符，且要包含“4+2”和“6”。",
      };
    },
  },
  {
    id: 4,
    question: questions[3],
    answerHint: "从这一题开始，猫娘标记会变成永久规则。",
    validate(input) {
      const text = normalizeText(input);
      if (!hasMeowMarker(text)) {
        return { ok: false, message: "猫娘助手必须包含“喵”、meow 或 🐱。" };
      }
      return {
        ok: true,
        acceptedText: text,
        addRules: ["meowSuffix"],
        note: "永久规则已加入：所有后续答案必须包含“喵”、meow 或 🐱。",
      };
    },
  },
  {
    id: 5,
    question: questions[4],
    answerHint: "模型名称藏在界面里。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes(HIDDEN_MODEL_NAME)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "没有找到界面里藏着的模型名称。" };
      });
    },
  },
  {
    id: 6,
    question: questions[5],
    answerHint: "我心里想了一个成语，下面会给你一个提示字，还会反馈逐字、声母和韵母。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes(context.flags.handleAnswer)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: `我心里想的成语不是这个。标准答案长度：${context.flags.handleAnswer.length}` };
      });
    },
  },
  {
    id: 7,
    question: questions[6],
    answerHint: "数左侧用户消息里的汉字，不数数字、标点和空格。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const expected = expectedUserChineseCount(context);
        if (text.includes(String(expected))) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "字数不对。" };
      });
    },
  },
  {
    id: 8,
    question: questions[7],
    answerHint: "按当前能复制到的所有模型回复统计，并把你这一次的回复也算进去。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const expected = currentVisibleModelTokenTotal(text, context);
        if (text.includes(String(expected))) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "token 数不对。" };
      });
    },
  },
  {
    id: 9,
    question: questions[8],
    answerHint: "把 Temperature 调到至少 0.7，再提交 1000-1200 之间的质数。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (context.flags.temperature < 0.7) {
          return { ok: false, message: "Temperature 不够高。" };
        }

        const number = Number(text.match(/\d+/)?.[0]);
        if (number > 1000 && number < 1200 && isPrime(number)) {
          return { ok: true, acceptedText: text };
        }

        return { ok: false, message: "需要提交一个大于 1000 且小于 1200 的质数，比如 1009。" };
      });
    },
  },
  {
    id: 10,
    question: questions[9],
    answerHint: '格式示例：{"answer":"抱歉不能直接回答，但我会使用 JSON 喵"}',
    validate(input, context) {
      const extracted = extractAnswerText(input, true);
      if (!extracted.ok) return { ok: false, message: extracted.message };

      const text = normalizeText(extracted.text);
      const oldRules = context.rules.filter((rule) => rule !== "jsonOnly");
      const ruleCheck = validateAnswerText(text, oldRules);
      if (!ruleCheck.ok) return ruleCheck;

      return {
        ok: true,
        acceptedText: text,
        addRules: ["jsonOnly"],
        note: "永久规则已加入：后续提交必须是 JSON，并从 answer 字段读取答案。",
      };
    },
  },
  {
    id: 11,
    question: questions[10],
    answerHint: '现在必须提交 JSON，并回答当前 HH:mm；这个当前时间还得在 10:00-12:00 之间。',
    validate(input, context) {
      const base = withPermanentRules(input, context);
      if (!base.ok) return base;

      const answerText = base.answerText;
      const currentClock = formatClock(context.now);
      const currentHour = context.now.getHours();

      if (currentHour < 10 || currentHour >= 12) {
        return {
          ok: false,
          message: `当前时间 ${currentClock} 不在 10:00-12:00 之间。`,
        };
      }

      if (answerText.includes(currentClock)) {
        return { ok: true, acceptedText: answerText };
      }

      return {
        ok: false,
        message: `answer 里必须包含当前时间 ${currentClock}。`,
      };
    },
  },
  {
    id: 12,
    question: questions[11],
    answerHint: "俄国当时仍用儒略历，所以公历是 11 月。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes("11月") || text.includes("十一月") || text.includes("11") || text.includes("十一") || /november/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "不是题面里的“十月”。换一个历法角度。" };
      });
    },
  },
  {
    id: 13,
    question: questions[12],
    answerHint: "答案和下一题的加密方式有关。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes("凯撒") || /caesar/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "儒略历的发明者不对。" };
      });
    },
  },
  {
    id: 14,
    question: questions[13],
    answerHint: "先得到英文答案，再结合上一题。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (/\bukz\b/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "英文答案需要按上一题的线索处理。" };
      });
    },
  },
  {
    id: 15,
    question: questions[14],
    questionFormat: "markdown",
    answerHint: "把上一题答案拆进多个 Markdown 标题层级里。",
    validate(input, context) {
      const base = withPermanentRules(input, context);
      if (!base.ok) return base;

      const headings = extractMarkdownHeadings(getRawAnswerText(input, context));
      const headingLevels = new Set(headings.map((heading) => heading.level));
      const headingText = headings.map((heading) => heading.text).join("").toLowerCase();

      if (headings.length >= 2 && headingLevels.size >= 2 && headingText.includes("ukz")) {
        return { ok: true, acceptedText: getRawAnswerText(input, context).trim() };
      }

      if (headings.length < 2 || headingLevels.size < 2) {
        return { ok: false, message: "答案不够错落有致。" };
      }

      return { ok: false, message: "这不是你之前的答案。" };
    },
  },
  {
    id: 16,
    question: questions[15],
    answerHint: "颜色藏在这串字符里，解法和凯撒密码有关。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes("红色") || /red/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "你还没猜到我最喜欢的颜色。" };
      });
    },
  },
  {
    id: 17,
    question: questions[16],
    questionColor: "#FF0000",
    answerHint: "把回复前面染得更红一点。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (/^#FF0000(?![0-9A-Fa-f])/i.test(text)) {
          return { ok: true, acceptedText: text, addRules: ["colorMatch"] };
        }
        return { ok: false, message: "不够红。" };
      });
    },
  },
  {
    id: 18,
    question: questions[17],
    questionColor: "#0000FF",
    captchaText: "550W",
    answerHint: "先把颜色对上，再把验证码填进去。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (extractLeadingHexColor(text) !== "#0000FF") {
          return { ok: false, message: "颜色不对" };
        }
        if (/550w/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "验证码不对。" };
      });
    },
  },
  {
    id: 19,
    question: questions[18],
    questionColor: "#FFFFFF",
    questionCopyDisabled: true,
    answerHint: "白色题面藏在黑夜里，答案来自上一题验证码倒过来看。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (/\bMOSS\b/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "倒过来以后不是这个。" };
      });
    },
  },
  {
    id: 20,
    question: questions[19],
    questionColor: "#1C1C1C",
    answerHint: "这题先别急着答，按隐藏提示操作界面。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (context.flags.lightPuzzleStep >= 4) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "你还没按顺序把灯开关好。" };
      });
    },
  },
  {
    id: 21,
    question: questions[20],
    questionColor: "#1C1C1C",
    answerHint: "看看作者那边留了什么话，再按现在的颜色规则交上来。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes("为这个世界奉献有趣")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "还不是作者想说的那句话。" };
      });
    },
  },
  {
    id: 22,
    question: questions[21],
    questionColor: "#1C1C1C",
    answerHint: "去作者的视频里翻一翻，找到 9 分 42 秒那条，再把 BV 号按现在的颜色规则交上来。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes("BV1UejA6eE2M")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这个 BV 号不对。" };
      });
    },
  },
  {
    id: 23,
    question: questions[22],
    questionColor: "#1C1C1C",
    answerHint: "把前三个条件当成同一套规律，继续往下推。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (text.includes("3") || text.includes("三")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这个结果不对。" };
      });
    },
  },
  {
    id: 24,
    question: questions[23],
    questionColor: "#1C1C1C",
    questionImageSrc: `${assetBaseUrl}assets/the_quick_brown_fox.jpeg?v=2`,
    uploadAccept: ".png,image/png",
    answerHint: "这题不用打字，处理成 png 后直接传文件就行。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (/\.png\b/i.test(text) || /image\/png/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这还不是 png 文件。" };
      });
    },
  },
  {
    id: 25,
    question: questions[24],
    questionColor: "#1C1C1C",
    questionImageSrc: `${assetBaseUrl}assets/straight_line_dots_puzzle.svg`,
    questionImageDownloadDisabled: true,
    answerHint: "钥匙已经给你了，三位密码就藏在这张图里。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (/\bFEZ\b/i.test(text)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "密码箱没有开。" };
      });
    },
  },
  {
    id: 26,
    question: questions[25],
    questionColor: "#1C1C1C",
    answerHint: "一个提案可以分次问验证器，但累计最多问 3 台，而且你最多只能问 2 个提案。",
    turingPuzzlePool,
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const compact = text.replace(/\s+/g, "");
        const activePuzzle = getTuringPuzzleForLevel(levels[25], context.answers);
        if (activePuzzle && compact.includes(activePuzzle.solution)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这个密码还过不了验证器。" };
      });
    },
  },
  {
    id: 27,
    question: questions[26],
    questionColor: "#1C1C1C",
    answerHint: "这次不能问机器，只能靠四张验证器卡片和那两条隐藏规则反推。",
    turingPuzzlePool: turingSilentPuzzlePool,
    turingQueryDisabled: true,
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const compact = text.replace(/\s+/g, "");
        if (compact.includes("332")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这次的静态图灵机答案不是这个。" };
      });
    },
  },
  {
    id: 28,
    question: questions[27],
    questionColor: "#1C1C1C",
    answerHint: "这关不用发内容，把下面那条线从左边起点划到右边终点就行。",
    linePuzzle: witnessTutorialLinePuzzle,
    validate() {
      return { ok: false, message: "这关不用发内容，直接把线路划通。" };
    },
  },
  {
    id: 29,
    question: questions[28],
    questionColor: "#1C1C1C",
    answerHint: "这次有新规则：不是只连到终点就行，线路还得先穿过黑点。",
    linePuzzle: witnessBranchDotLinePuzzle,
    validate() {
      return { ok: false, message: "这关不用发内容，直接把线路划通。" };
    },
  },
  {
    id: 30,
    question: questions[29],
    questionColor: "#1C1C1C",
    answerHint: "黑点还得全部经过，但这次新增白点规则：白点不能碰。",
    linePuzzle: witnessBranchForbiddenDotLinePuzzle,
    validate() {
      return { ok: false, message: "这关不用发内容，直接把线路划通。" };
    },
  },
  {
    id: 31,
    question: questions[30],
    questionColor: "#1C1C1C",
    answerHint: "碰到开关点后，所有黑白点都会立刻互换；这次得把所有点都在黑态时经过。",
    linePuzzle: witnessToggleDotLinePuzzle,
    validate() {
      return { ok: false, message: "这关不用发内容，直接把线路划通。" };
    },
  },
  {
    id: 32,
    question: questions[31],
    questionColor: "#1C1C1C",
    answerHint: "这次除了边上的点，格子里的黑白点也要一起结算。到终点时，每个被线路分出来的区域里，黑点和白点数量都得一样。",
    linePuzzle: witnessToggleRegionLinePuzzle,
    validate() {
      return { ok: false, message: "这关不用发内容，直接把线路划通。" };
    },
  },
  {
    id: 33,
    question: questions[32],
    questionColor: "#1C1C1C",
    answerHint: "这次中间多了一枚休息点。你可以先在那里松手，但真正的解只有在中途翻一次黑夜模式之后才会出现。",
    linePuzzle: witnessRestNightLinePuzzle,
    validate() {
      return { ok: false, message: "这关不用发内容，直接把线路划通。" };
    },
  },
  {
    id: 34,
    question: questions[33],
    questionColor: "#1C1C1C",
    answerHint: "随便点一个残缺键都能过，但你点中的那个字符，从这题之后就再也不能出现在你的回答里了。",
    keyboardChoices: brokenKeyboardChoices,
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const compact = text.replace(/\s+/g, "").toUpperCase();
        if (brokenKeyboardChoices.includes(compact as (typeof brokenKeyboardChoices)[number])) {
          return { ok: true, acceptedText: compact };
        }
        return { ok: false, message: "从这块键盘里随便挑一个字母或者数字点给我。" };
      });
    },
  },
  {
    id: 35,
    question: questions[34],
    questionColor: "#1C1C1C",
    answerHint: "答案是不区分大小写的完整英文句子；如果你上一题选了字母，这题会被那条残缺按键规则卡住。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const normalized = normalizeText(text).toLowerCase();
        if (normalized.includes("the quick brown fox jumps over the lazy dog")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这句英文还没被你完整翻出来。" };
      });
    },
  },
  {
    id: 36,
    question: questions[35],
    questionColor: "#1C1C1C",
    questionCopyText: "The Quick Brown Fox Jumps Over The Lazy Dog",
    answerHint: "这题要回 32 位 MD5；正文答案固定是 58826469C2606F4791B9F75880DFBE2A。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (normalizeText(text).toUpperCase().includes("58826469C2606F4791B9F75880DFBE2A")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这个 MD5 值不对。" };
      });
    },
  },
  {
    id: 37,
    question: questions[36],
    questionColor: "#1C1C1C",
    answerHint: "先把发送键解锁；解锁后，发任何符合前面永久规则的内容都行。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (!context.flags.consoleSendUnlocked) {
          return { ok: false, message: "发送键还锁着。" };
        }
        return { ok: true, acceptedText: text };
      });
    },
  },
  {
    id: 38,
    question: questions[37],
    questionColor: "#1C1C1C",
    answerHint: "答案是两个字的音乐形式。",
    validate(input, context) {
      const base = withPermanentRules(input, context);
      if (!base.ok) return base;

      const rawText = getRawAnswerText(input, context);
      if (!base.answerText.includes("卡农")) {
        return { ok: false, message: "这还不是我最喜欢的那种音乐形式。" };
      }
      if (!hasWeakCanonLayout(rawText)) {
        return { ok: false, message: "你的答案是对的，但是你的回答不够卡农" };
      }
      return { ok: true, acceptedText: base.answerText };
    },
  },
  {
    id: 39,
    question: questions[38],
    questionColor: "#1C1C1C",
    answerHint: "答案是那位很适合接在上一题后面的音乐家。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const normalized = normalizeText(text);
        if (normalized.includes("巴赫") || /bach/i.test(normalized)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这还不是我最喜欢的那位音乐家。" };
      });
    },
  },
  {
    id: 40,
    question: questions[39],
    questionColor: "#1C1C1C",
    answerHint: "答案是那位名字很快会和诗篇缠到一起的人。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        const normalized = normalizeText(text);
        if (normalized.includes("莎士比亚") || /shakespeare/i.test(normalized)) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "这还不是我最喜欢的那位诗人。" };
      });
    },
  },
  {
    id: 41,
    question: questions[40],
    questionColor: "#1C1C1C",
    answerHint: "这次要回的是一个数字。",
    validate(input, context) {
      return validatePlainThen(input, context, (text) => {
        if (normalizeText(text).includes("46")) {
          return { ok: true, acceptedText: text };
        }
        return { ok: false, message: "你还没指出 Shake Spear 在哪儿。" };
      });
    },
  },
  {
    id: 42,
    question: questions[41],
    questionColor: "#1C1C1C",
    answerHint: "这题不再理会前面那些永久约束，只看你最后说出的那个答案。",
    validate(input) {
      const normalized = normalizeText(input);
      const lowerCased = normalized.toLowerCase();
      if (normalized.includes("诗篇四十六") || /诗篇\s*46/.test(normalized) || /psalm\s*46/i.test(lowerCased)) {
        return { ok: true, acceptedText: normalized };
      }
      return { ok: false, message: "终局答案还没被你说出来。" };
    },
  },
];

export const playableLevels = levels;

export function getCurrentLevel(index: number) {
  return playableLevels[Math.min(index, playableLevels.length - 1)];
}

export function isGameComplete(index: number) {
  return index >= playableLevels.length;
}

export function getTokenTotalForUi(context: Pick<ValidationContext, "answers">) {
  return context.answers.reduce((total, answer) => total + countLocalTokens(answer.acceptedText), 0);
}
