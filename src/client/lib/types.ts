export type ThemeMode = "system" | "light" | "dark";
export type ViewName = "week" | "activities" | "stats";
export type SystemPurchase = "dayEnd";

export interface RythmSettings {
  authEnabled: boolean;
  weekStartClockMin: number;
  timeStepMin: number;
  pxPer5Min: number;
  mobileWeekScale: number;
  firstDayLabel: string;
  theme: ThemeMode;
  glowEnabled: boolean;
}

export interface Activity {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  opacity: number;
  defaultDurationMin: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTimelineItem {
  id: string;
  type: "activity";
  activityId: string;
  startAbsMin: number;
  endAbsMin: number;
  createdAt: string;
  updatedAt: string;
}

export interface DayEndTimelineItem {
  id: string;
  type: "dayEnd";
  atAbsMin: number;
  createdAt: string;
  updatedAt: string;
}

export type TimelineItem = ActivityTimelineItem | DayEndTimelineItem;

export interface RythmState {
  schemaVersion: number;
  updatedAt: string;
  settings: RythmSettings;
  activities: Activity[];
  timeline: TimelineItem[];
}

export interface DayColumn {
  index: number;
  label: string;
  start: number;
  end: number;
  marker: DayEndTimelineItem | null;
  extra: boolean;
  synthetic?: boolean;
}

export interface RequestError extends Error {
  payload?: unknown;
  status?: number;
}

export interface SyncService {
  loadInitial(): Promise<void>;
  saveLocal(state: RythmState, dirty: boolean): Promise<void>;
  saveAndSync(state: RythmState): Promise<void>;
  syncNow(): Promise<void>;
}
