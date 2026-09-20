const colors: Record<string, string> = {
  journal: "#6aa5b8", tasks: "#6f9e7b", work: "#b8705f",
  inbox: "#c9a86a", mynd: "#8f6ac4", personal: "#a76a94",
};

export function folderColor(folder: { slug: string; color: string | null }): string {
  return folder.color ?? colors[folder.slug] ?? "#888888";
}
