export const capabilities: Readonly<Record<string, { supportsTemperature: boolean }>> = {
  "claude-haiku-4-5": { supportsTemperature: true },
  "claude-sonnet-5": { supportsTemperature: false },
};

export function samplingParameters(model: string, job: string): { temperature?: number } {
  return (job === "split" || job === "route") && Object.hasOwn(capabilities, model)
    && capabilities[model].supportsTemperature ? { temperature: 0 } : {};
}
