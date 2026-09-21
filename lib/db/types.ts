export type Capture = {
  id: string;
  body: string;
  kind: string;
  capturedAt: Date;
  device: string | null;
  status: "pending" | "processed" | "failed" | "skipped";
  processedAt: Date | null;
  createdAt: Date;
};

export type Folder = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  parentId: string | null;
  createdAt: Date;
};

export type Note = {
  id: string;
  folderId: string;
  title: string;
  summary: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};
export type NoteMeta = Omit<Note, "body">;
export type NoteSummary = Pick<Note, "id" | "title" | "summary" | "folderId">;

export type OrganizeRunInput = {
  trigger: "cron" | "manual";
  status: "ok" | "failed" | "nothing_pending";
  startedAt: Date;
  capturesProcessed: number;
  itemsFiled: number;
  itemsQueued: number;
  notesCreated: number;
  notesAppended: number;
  costUsd: number;
  failedCaptureId: string | null;
  error: string | null;
};
export type OrganizeRun = OrganizeRunInput & { id: string; finishedAt: Date };

export type Rule = {
  id: string;
  kind: string;
  instruction: string;
  active: boolean;
  createdAt: Date;
};

export type CaptureInput = {
  body: string;
  kind?: string;
  capturedAt: Date;
  device?: string;
};
export type FolderInput = {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  parentId?: string;
};
export type NoteInput = {
  folderId: string;
  title: string;
  summary?: string;
  body: string;
};
export type RuleInput = { kind: string; instruction: string };

export type ModelCallInput = {
  job: "split" | "route" | "answer" | "grader";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thinkingTokens: number;
  estCostUsd: number;
};
export type ModelCall = ModelCallInput & { id: string; createdAt: Date };

export type AskCitation = { kind: "note" | "capture"; id: string; ref: string };
export type AskInput = {
  question: string; answer: string; answered: boolean; citations: AskCitation[];
  inputTokens: number; outputTokens: number; costUsd: number;
};
export type Ask = AskInput & { id: string; createdAt: Date };

export type QuickCallOption = {
  label: string; folder: string; note: string; new_note_title: string; new_folder_name: string;
};
export type QuickCallInput = {
  captureId: string; topic: string; itemText: string; options: QuickCallOption[];
  reason: "unsure" | "invalid_target" | "not_placed" | "added_detail";
};
export type QuickCall = QuickCallInput & {
  id: string; status: "open" | "resolved"; createdAt: Date; resolvedAt: Date | null;
};
