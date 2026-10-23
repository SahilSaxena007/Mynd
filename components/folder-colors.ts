const colors: Record<string, string> = {
  journal: "#6aa5b8", tasks: "#6f9e7b", work: "#b8705f",
  inbox: "#c9a86a", mynd: "#8f6ac4", personal: "#a76a94",
};

export function folderColor(folder: { slug: string; color: string | null }): string {
  return folder.color ?? colors[folder.slug] ?? "#888888";
}
export const FOLDER_PALETTE = ["#7a9c73", "#6686ac", "#8d79b8", "#b89068", "#a07a9c", "#6aa5b8", "#c9a86a", "#b8705f", "#6f9e7b", "#a76a94"];
