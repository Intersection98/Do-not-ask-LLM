export type PermanentRule = "meowSuffix" | "refusalTone" | "jsonOnly" | "colorMatch";

export type GameFlags = {
  temperature: number;
  handleAnswer: string;
  timeOverride: string | null;
  permanentAppendPrefix: string;
  permanentAppendSuffix: string;
  forbiddenKeyboardChar: string | null;
  consoleSendUnlocked: boolean;
  isNightMode: boolean;
  lightPuzzleStep: number;
};

export type AnswerRecord = {
  levelId: number;
  question: string;
  input: string;
  acceptedText: string;
  acceptedAt: number;
};

export type AttemptRecord = {
  levelId: number;
  input: string;
  displayedText: string;
  ok: boolean;
  responseText?: string;
  createdAt: number;
};

export type GameStateSnapshot = {
  currentLevel: number;
  answers: AnswerRecord[];
  attempts: AttemptRecord[];
  rules: PermanentRule[];
  flags: GameFlags;
};

export type ValidationContext = {
  answers: AnswerRecord[];
  attempts: AttemptRecord[];
  rules: PermanentRule[];
  flags: GameFlags;
  now: Date;
  currentQuestionColor?: string;
};

export type ValidationResult =
  | {
      ok: true;
      acceptedText?: string;
      addRules?: PermanentRule[];
      note?: string;
    }
  | {
      ok: false;
      message: string;
    };

export type TuringVerifier = {
  id: string;
  label: string;
  prompt: string;
  options: [string, ...string[]];
  evaluate: (proposal: string) => boolean;
};

export type TuringPuzzle = {
  id: string;
  solution: string;
  verifiers: TuringVerifier[];
};

export type LinePuzzlePoint = {
  x: number;
  y: number;
};

export type LinePuzzleViewBox = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type LinePuzzleBranchNode = {
  id: string;
  x: number;
  y: number;
};

export type LinePuzzleRequiredDot = {
  id: string;
  x: number;
  y: number;
  edgeNodeIds: readonly [string, string];
};

export type LinePuzzleForbiddenDot = {
  id: string;
  x: number;
  y: number;
  edgeNodeIds: readonly [string, string];
};

export type LinePuzzleToggleDot = {
  id: string;
  x: number;
  y: number;
  edgeNodeIds: readonly [string, string];
};

export type LinePuzzleCell = {
  id: string;
  nodeIds: readonly [string, string, string, string];
};

export type LinePuzzleCellDot = {
  id: string;
  x: number;
  y: number;
  cellId: string;
  color: "black" | "white";
};

export type LinePuzzleRestPoint = {
  id: string;
  nodeId: string;
};

export type LinePuzzle =
  | {
      id: string;
      kind?: "path";
      solvedText: string;
      viewBox: LinePuzzleViewBox;
      points: readonly LinePuzzlePoint[];
    }
  | {
      id: string;
      kind: "branch";
      solvedText: string;
      viewBox: LinePuzzleViewBox;
      nodes: readonly LinePuzzleBranchNode[];
      edges: ReadonlyArray<readonly [string, string]>;
      startNodeId: string;
      endNodeId: string;
      completionMode?: "requiredDots" | "collectAllDots";
      requiredDots: readonly LinePuzzleRequiredDot[];
      forbiddenDots?: readonly LinePuzzleForbiddenDot[];
      toggleDots?: readonly LinePuzzleToggleDot[];
      restPoints?: readonly LinePuzzleRestPoint[];
      cells?: readonly LinePuzzleCell[];
      cellDots?: readonly LinePuzzleCellDot[];
      regionBalanceRequired?: boolean;
    };

export type Level = {
  id: number;
  question: string;
  answerHint: string;
  questionFormat?: "plain" | "markdown";
  questionColor?: string;
  questionCopyText?: string;
  questionCopyDisabled?: boolean;
  captchaText?: string;
  questionImageSrc?: string;
  questionImageDownloadDisabled?: boolean;
  turingPuzzlePool?: TuringPuzzle[];
  turingQueryDisabled?: boolean;
  linePuzzle?: LinePuzzle;
  keyboardChoices?: readonly string[];
  uploadAccept?: string;
  validate: (input: string, context: ValidationContext) => ValidationResult;
};
