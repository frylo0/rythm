const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = process.env.RYTHM_DATA_DIR || path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const TMP_PATH = path.join(DATA_DIR, "state.json.tmp");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUP_LIMIT = 20;

function isoNow() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function baseActivity(name, color, duration, parentId = null) {
  const now = isoNow();
  return {
    id: id("act"),
    parentId,
    name,
    color,
    opacity: 1,
    defaultDurationMin: duration,
    archived: false,
    createdAt: now,
    updatedAt: now
  };
}

function createDefaultState() {
  const now = isoNow();
  const sleep = baseActivity("Сон", "#1f2937", 480);
  const work = baseActivity("Работа", "#475569", 480);
  const food = baseActivity("Еда", "#a16207", 60);
  const sport = baseActivity("Спорт", "#3f6212", 60);
  const learning = baseActivity("Обучение", "#1d4ed8", 90);
  const rest = baseActivity("Отдых", "#7c3aed", 120);
  const chores = baseActivity("Быт", "#0f766e", 60);

  const activities = [sleep, work, food, sport, learning, rest, chores];
  const timeline = [];

  for (let day = 0; day < 7; day += 1) {
    const base = day * 1440;
    const weekend = day >= 5;
    timeline.push({
      id: id("item"),
      type: "activity",
      activityId: sleep.id,
      startAbsMin: base,
      endAbsMin: base + 480,
      createdAt: now,
      updatedAt: now
    });
    timeline.push({
      id: id("item"),
      type: "activity",
      activityId: food.id,
      startAbsMin: base + 510,
      endAbsMin: base + 540,
      createdAt: now,
      updatedAt: now
    });
    if (!weekend) {
      timeline.push({
        id: id("item"),
        type: "activity",
        activityId: work.id,
        startAbsMin: base + 540,
        endAbsMin: base + 1020,
        createdAt: now,
        updatedAt: now
      });
      timeline.push({
        id: id("item"),
        type: "activity",
        activityId: learning.id,
        startAbsMin: base + 1110,
        endAbsMin: base + 1200,
        createdAt: now,
        updatedAt: now
      });
    } else {
      timeline.push({
        id: id("item"),
        type: "activity",
        activityId: sport.id,
        startAbsMin: base + 600,
        endAbsMin: base + 690,
        createdAt: now,
        updatedAt: now
      });
      timeline.push({
        id: id("item"),
        type: "activity",
        activityId: chores.id,
        startAbsMin: base + 780,
        endAbsMin: base + 900,
        createdAt: now,
        updatedAt: now
      });
    }
    timeline.push({
      id: id("item"),
      type: "activity",
      activityId: rest.id,
      startAbsMin: base + 1230,
      endAbsMin: base + 1380,
      createdAt: now,
      updatedAt: now
    });
    timeline.push({
      id: id("marker"),
      type: "dayEnd",
      atAbsMin: base + 1440,
      createdAt: now,
      updatedAt: now
    });
  }

  return {
    schemaVersion: 2,
    updatedAt: now,
    settings: {
      authEnabled: Boolean(process.env.RYTHM_PASSWORD_HASH),
      weekStartClockMin: 420,
      timeStepMin: 5,
      pxPer5Min: 2,
      mobileWeekScale: 1,
      firstDayLabel: "Пн",
      theme: "system",
      glowEnabled: true
    },
    activities,
    timeline
  };
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function readState() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    const state = createDefaultState();
    await writeState(state, { backup: false });
    return state;
  }
}

function backupName() {
  return `state-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

async function rotateBackups() {
  const files = await fs.readdir(BACKUP_DIR).catch(() => []);
  const backups = files.filter((name) => name.startsWith("state-") && name.endsWith(".json")).sort().reverse();
  await Promise.all(backups.slice(BACKUP_LIMIT).map((name) => fs.unlink(path.join(BACKUP_DIR, name)).catch(() => {})));
}

async function writeState(state, options = {}) {
  await ensureDataDir();
  const next = JSON.stringify(state, null, 2);
  if (options.backup !== false) {
    try {
      await fs.copyFile(STATE_PATH, path.join(BACKUP_DIR, backupName()));
      await rotateBackups();
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  await fs.writeFile(TMP_PATH, next, "utf8");
  await fs.rename(TMP_PATH, STATE_PATH);
}

function compareUpdatedAt(a, b) {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

module.exports = {
  readState,
  writeState,
  compareUpdatedAt,
  createDefaultState
};
