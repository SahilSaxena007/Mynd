export type Capture = {
  id: string;
  body: string;
  kind: string;
  capturedAt: Date;
  device: string | null;
  status: "pending" | "processed" | "failed";
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
  estCostUsd: number;
};
export type ModelCall = ModelCallInput & { id: string; createdAt: Date };
