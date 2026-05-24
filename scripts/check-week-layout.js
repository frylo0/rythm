#!/usr/bin/env node

const STEP_MIN = 5;
const PX_PER_5_MIN = 2;
const MIN_HEIGHT_PX = 30;

function assertDeepEqual(name, actual, expected) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    console.error(`FAIL ${name}`);
    console.error("actual  ", actual);
    console.error("expected", expected);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

function buildColumns(days) {
  return days.map((day, index) => ({
    index,
    label: day.label,
    start: day.start,
    end: day.end,
    startMarker: null,
    marker: null,
    extra: false
  }));
}

function buildRows(days) {
  return days.map((day, dayIndex) => {
    let cursor = day.start;
    const rows = [];
    day.blocks.forEach((block, blockIndex) => {
      if (block.start > cursor) {
        rows.push({ type: "gap", id: `gap-${dayIndex}-${cursor}`, from: cursor, to: block.start });
      }
      rows.push({
        type: "block",
        id: `block-${dayIndex}-${blockIndex}`,
        item: {
          id: `item-${dayIndex}-${blockIndex}`,
          type: "activity",
          activityId: "activity",
          startAbsMin: block.start,
          endAbsMin: block.end,
          createdAt: "",
          updatedAt: ""
        }
      });
      cursor = Math.max(cursor, block.end);
    });
    if (day.end > cursor) rows.push({ type: "gap", id: `gap-${dayIndex}-${cursor}`, from: cursor, to: day.end });
    return rows;
  });
}

function layoutFor(strategy, columns, rowsByColumn) {
  return globalThis.weekLayout.createWeekLayout({
    columns,
    rowsByColumn,
    step: STEP_MIN,
    baseSlotEm: PX_PER_5_MIN,
    minSegmentHeightEm: MIN_HEIGHT_PX,
    smart: true,
    strategy
  });
}

function compactLayout(layout) {
  return {
    pointsMin: layout.pointsMin,
    segmentHeightsEm: layout.segmentHeightsEm,
    cumulativeEm: layout.cumulativeEm
  };
}

function offsets(columns, layout) {
  return columns.map((column) => {
    const value = globalThis.weekLayout.dayOffsetsEm(column, layout);
    return {
      label: column.label,
      top: value.startOffset,
      bottom: value.endOffset
    };
  });
}

function range(column, layout, start, end) {
  return globalThis.weekLayout.rangeHeightEm(column, start, end, layout, MIN_HEIGHT_PX);
}

function runCase(testCase) {
  const columns = buildColumns(testCase.days);
  const rowsByColumn = buildRows(testCase.days);
  const reference = layoutFor("reference", columns, rowsByColumn);
  const optimized = layoutFor("optimized", columns, rowsByColumn);

  assertDeepEqual(`${testCase.name}: reference layout`, compactLayout(reference), testCase.expected.layout);
  assertDeepEqual(`${testCase.name}: optimized matches reference`, compactLayout(optimized), compactLayout(reference));
  assertDeepEqual(`${testCase.name}: offsets`, offsets(columns, optimized), testCase.expected.offsets);

  testCase.expected.ranges.forEach((item) => {
    const column = columns[item.dayIndex];
    assertDeepEqual(`${testCase.name}: ${item.label}`, range(column, optimized, item.start, item.end), item.height);
  });

  testCase.expected.projections.forEach((item) => {
    const column = columns[item.dayIndex];
    assertDeepEqual(
      `${testCase.name}: y ${item.label}`,
      globalThis.weekLayout.projectAbsMinute(column, item.at, optimized),
      item.y
    );
  });
}

async function main() {
  globalThis.weekLayout = await import("../src/client/lib/weekLayout.mjs");
  const cases = [
    {
      name: "different starts and ends",
      days: [
        { label: "Пн", start: 445, end: 1320, blocks: [{ start: 445, end: 540 }, { start: 540, end: 600 }, { start: 600, end: 1320 }] },
        { label: "Сб", start: 1980, end: 2850, blocks: [{ start: 1980, end: 2040 }, { start: 2040, end: 2100 }, { start: 2100, end: 2850 }] }
      ],
      expected: {
        layout: {
          pointsMin: [445, 540, 600, 660, 1320, 1410],
          segmentHeightsEm: [38, 30, 30, 264, 36],
          cumulativeEm: [0, 38, 68, 98, 362, 398]
        },
        offsets: [
          { label: "Пн", top: 0, bottom: 36 },
          { label: "Сб", top: 38, bottom: 0 }
        ],
        ranges: [
          { label: "Пн 07:25-09:00", dayIndex: 0, start: 445, end: 540, height: 38 },
          { label: "Сб 09:00-11:00", dayIndex: 1, start: 1980, end: 2100, height: 60 }
        ],
        projections: [
          { label: "Сб start", dayIndex: 1, at: 1980, y: 38 },
          { label: "Пн end", dayIndex: 0, at: 1320, y: 362 }
        ]
      }
    },
    {
      name: "crosses midnight",
      days: [
        { label: "Пн", start: 420, end: 1560, blocks: [{ start: 420, end: 1380 }, { start: 1380, end: 1560 }] },
        { label: "Вт", start: 1920, end: 2880, blocks: [{ start: 1920, end: 2160 }, { start: 2160, end: 2880 }] }
      ],
      expected: {
        layout: {
          pointsMin: [420, 480, 720, 1380, 1440, 1560],
          segmentHeightsEm: [30, 96, 264, 30, 48],
          cumulativeEm: [0, 30, 126, 390, 420, 468]
        },
        offsets: [
          { label: "Пн", top: 0, bottom: 0 },
          { label: "Вт", top: 30, bottom: 48 }
        ],
        ranges: [
          { label: "Пн 23:00-02:00", dayIndex: 0, start: 1380, end: 1560, height: 78 },
          { label: "Вт 08:00-12:00", dayIndex: 1, start: 1920, end: 2160, height: 96 }
        ],
        projections: [
          { label: "Пн midnight-cross end", dayIndex: 0, at: 1560, y: 468 },
          { label: "Вт end", dayIndex: 1, at: 2880, y: 420 }
        ]
      }
    }
  ];

  cases.forEach(runCase);
  if (process.exitCode) process.exit(process.exitCode);
  console.log("Week layout strategies match on all cases.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
