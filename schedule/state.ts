import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface StandbyEntry {
  scheduleId: number;
  seriesId: number;
  date: string; // YYYY-MM-DD
}

export interface AppState {
  standby: StandbyEntry[];
}

const STATE_PATH =
  process.env.STATE_FILE ?? resolve(process.cwd(), "state.json");

export function loadState(): AppState {
  if (!existsSync(STATE_PATH)) return { standby: [] };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as AppState;
  } catch {
    return { standby: [] };
  }
}

export function saveState(state: AppState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function addStandbyEntry(entry: StandbyEntry): void {
  const state = loadState();
  if (!state.standby.find((e) => e.scheduleId === entry.scheduleId)) {
    state.standby.push(entry);
    saveState(state);
  }
}

export function removeStandbyEntry(state: AppState, scheduleId: number): void {
  state.standby = state.standby.filter((e) => e.scheduleId !== scheduleId);
}
