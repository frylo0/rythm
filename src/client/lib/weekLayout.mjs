export const WEEK_LAYOUT_STRATEGIES = {
  reference: "reference",
  optimized: "optimized"
};

export const EMPTY_WEEK_LAYOUT = Object.freeze({
  step: 5,
  baseSlotEm: 1,
  pointsMin: [0, 5],
  segmentHeightsEm: [1],
  cumulativeEm: [0, 1],
  smart: false,
  strategy: WEEK_LAYOUT_STRATEGIES.optimized
});

export function createWeekLayout(options) {
  const columns = options.columns || [];
  const rowsByColumn = options.rowsByColumn || [];
  const step = options.step || 5;
  const baseSlotEm = Math.max(0.01, Number(options.baseSlotEm || 1));
  const strategy = normalizeStrategy(options.strategy);
  if (options.smart === false) {
    return createUniformWeekLayout(columns, step, baseSlotEm, strategy);
  }
  const pointsMin = strategy === WEEK_LAYOUT_STRATEGIES.reference
    ? buildReferencePoints(columns, rowsByColumn, step)
    : buildOptimizedPoints(columns, rowsByColumn, step);
  const minSegmentHeightEm = options.minSegmentHeightEm || baseSlotEm;
  const fallbackTimeMin = minSegmentHeightEm * step / baseSlotEm;
  const segmentHeightsEm = createSegmentHeights(pointsMin, {
    step,
    baseSlotEm,
    minSegmentHeightEm
  });
  return createLayoutFromSegments(step, baseSlotEm, pointsMin, segmentHeightsEm, true, strategy, fallbackTimeMin);
}

export function normalizeStrategy(strategy) {
  return strategy === WEEK_LAYOUT_STRATEGIES.reference ? WEEK_LAYOUT_STRATEGIES.reference : WEEK_LAYOUT_STRATEGIES.optimized;
}

export function projectAbsMinute(column, absMin, layout) {
  return projectAxisMinute(axisMinute(column, absMin, layout), layout);
}

export function minuteFromY(column, yEm, layout) {
  const minY = projectAbsMinute(column, column.start, layout);
  const maxY = projectAbsMinute(column, column.end, layout);
  if (yEm <= minY) return column.start;
  if (yEm >= maxY) return column.end;
  for (let index = 0; index < layout.segmentHeightsEm.length; index += 1) {
    const segmentStart = layout.pointsMin[index] || 0;
    const segmentEnd = layout.pointsMin[index + 1] || segmentStart + layout.step;
    const cursor = layout.cumulativeEm[index] || 0;
    const segmentHeight = layout.segmentHeightsEm[index] || layout.baseSlotEm;
    if (yEm <= cursor + segmentHeight) {
      const ratio = segmentHeight > 0 ? clamp01((yEm - cursor) / segmentHeight) : 0;
      const axis = segmentStart + ratio * (segmentEnd - segmentStart);
      return Math.min(column.end, Math.max(column.start, absMinuteFromAxis(column, axis, layout)));
    }
  }
  return column.end;
}

export function rangeHeightEm(column, fromAbsMin, toAbsMin, layout, minHeightEm = 0) {
  const height = projectAbsMinute(column, toAbsMin, layout) - projectAbsMinute(column, fromAbsMin, layout);
  return layout.smart ? Math.max(0, height) : Math.max(minHeightEm, height);
}

export function dayOffsetsEm(column, layout) {
  const end = weekHeightEm(layout);
  const startOffset = projectAbsMinute(column, column.start, layout);
  const endOffset = Math.max(0, end - projectAbsMinute(column, column.end, layout));
  return { startOffset, endOffset };
}

export function weekHeightEm(layout) {
  return layout.cumulativeEm[layout.cumulativeEm.length - 1] || 0;
}

export function axisMinute(column, absMin, layout) {
  return localDayMinute(column, absMin);
}

export function absMinuteFromAxis(column, axisMin, layout) {
  return columnAxisBase(column) + axisMin;
}

export function describeWeekLayout(columns, rowsByColumn, layout) {
  const height = weekHeightEm(layout);
  const emToPx = (value) => value * 16;
  return {
    strategy: layout.strategy,
    smart: layout.smart,
    step: layout.step,
    baseSlotEm: layout.baseSlotEm,
    baseSlotPx: emToPx(layout.baseSlotEm),
    fallbackTimeMin: layout.fallbackTimeMin || layout.step,
    heightPx: emToPx(height),
    heightEm: height,
    segments: layout.pointsMin.slice(0, -1).map((point, index) => ({
      fromAxisMin: point,
      toAxisMin: layout.pointsMin[index + 1],
      durationMin: layout.pointsMin[index + 1] - point,
      heightPx: emToPx(layout.segmentHeightsEm[index]),
      heightEm: layout.segmentHeightsEm[index],
      yPx: emToPx(layout.cumulativeEm[index]),
      yEm: layout.cumulativeEm[index]
    })),
    days: columns.map((column, columnIndex) => {
      const rows = rowsByColumn[columnIndex] || [];
      const visualEndAbsMin = rows.reduce((end, row) => Math.max(end, rowEnd(row)), column.end);
      const startOffset = projectAbsMinute(column, column.start, layout);
      const endOffset = Math.max(0, height - projectAbsMinute(column, visualEndAbsMin, layout));
      return {
        column,
        visualEndAbsMin,
        startOffsetPx: emToPx(startOffset),
        startOffsetEm: startOffset,
        endOffsetPx: emToPx(endOffset),
        endOffsetEm: endOffset,
        points: [
          { type: "dayStart", label: "dayStart", atAbsMin: column.start, yPx: emToPx(projectAbsMinute(column, column.start, layout)), yEm: projectAbsMinute(column, column.start, layout) },
          ...rows.map((row) => ({
            type: row.type,
            label: row.type === "gap" ? "gap" : "block",
            atAbsMin: rowEnd(row),
            durationMin: rowDuration(row),
            yPx: emToPx(projectAbsMinute(column, rowEnd(row), layout)),
            yEm: projectAbsMinute(column, rowEnd(row), layout)
          })),
          { type: "dayEnd", label: "dayEnd", atAbsMin: column.end, yPx: emToPx(projectAbsMinute(column, column.end, layout)), yEm: projectAbsMinute(column, column.end, layout) }
        ]
      };
    })
  };
}

function createUniformWeekLayout(columns, step, baseSlotEm, strategy) {
  const maxAxisMin = Math.max(step, ...columns.map((column) => localDayMinute(column, column.end)));
  const slotCount = Math.max(1, Math.ceil(maxAxisMin / step));
  const pointsMin = Array.from({ length: slotCount + 1 }, (_, index) => index * step);
  const segmentHeightsEm = Array.from({ length: slotCount }, () => baseSlotEm);
  return createLayoutFromSegments(step, baseSlotEm, pointsMin, segmentHeightsEm, false, strategy, step);
}

function buildReferencePoints(columns, rowsByColumn, step) {
  const vectors = columns.map((column, columnIndex) => createBoundaryVector(column, rowsByColumn[columnIndex] || [], step));
  const pointer = Array.from({ length: vectors.length }, () => 0);
  const points = [];
  for (;;) {
    let bestValue = Infinity;
    let bestVector = -1;
    for (let vectorIndex = 0; vectorIndex < vectors.length; vectorIndex += 1) {
      const index = pointer[vectorIndex];
      const value = vectors[vectorIndex][index];
      if (value != null && value < bestValue) {
        bestValue = value;
        bestVector = vectorIndex;
      }
    }
    if (bestVector < 0) break;
    if (points[points.length - 1] !== bestValue) points.push(bestValue);
    for (let vectorIndex = 0; vectorIndex < vectors.length; vectorIndex += 1) {
      while (vectors[vectorIndex][pointer[vectorIndex]] === bestValue) {
        pointer[vectorIndex] += 1;
      }
    }
  }
  return points.length > 1 ? points : [0, step];
}

function buildOptimizedPoints(columns, rowsByColumn, step) {
  const points = [];
  columns.forEach((column, columnIndex) => {
    points.push(...createBoundaryVector(column, rowsByColumn[columnIndex] || [], step));
  });
  points.sort((a, b) => a - b);
  const unique = [];
  points.forEach((point) => {
    if (unique[unique.length - 1] !== point) unique.push(point);
  });
  return unique.length > 1 ? unique : [0, step];
}

function createBoundaryVector(column, rows, step) {
  const dayStart = normalizeLayoutPoint(localDayMinute(column, column.start), step);
  const dayEnd = normalizeLayoutPoint(localDayMinute(column, column.end), step);
  const points = [dayStart, dayEnd];
  rows.forEach((row) => {
    points.push(normalizeLayoutPoint(localDayMinute(column, rowEnd(row)), step));
  });
  points.sort((a, b) => a - b);
  const unique = [];
  points.forEach((point) => {
    if (point >= dayStart && point <= dayEnd && unique[unique.length - 1] !== point) unique.push(point);
  });
  return unique;
}

function createSegmentHeights(pointsMin, options) {
  const fallbackTimeMin = options.minSegmentHeightEm * options.step / options.baseSlotEm;
  return pointsMin.slice(0, -1).map((point, index) => {
    const durationMin = Math.max(options.step, pointsMin[index + 1] - point);
    return durationMin < fallbackTimeMin ? options.minSegmentHeightEm : (durationMin / options.step) * options.baseSlotEm;
  });
}

function createLayoutFromSegments(step, baseSlotEm, pointsMin, segmentHeightsEm, smart, strategy, fallbackTimeMin) {
  const cumulativeEm = [0];
  segmentHeightsEm.forEach((height) => {
    cumulativeEm.push(cumulativeEm[cumulativeEm.length - 1] + height);
  });
  return { step, baseSlotEm, pointsMin, segmentHeightsEm, cumulativeEm, smart, strategy, fallbackTimeMin };
}

function projectAxisMinute(axisMin, layout) {
  const points = layout.pointsMin;
  if (axisMin <= points[0]) return 0;
  if (axisMin >= points[points.length - 1]) return weekHeightEm(layout);
  const index = segmentIndexForMinute(points, axisMin);
  const start = points[index];
  const end = points[index + 1];
  const segmentDuration = Math.max(1, end - start);
  const ratio = clamp01((axisMin - start) / segmentDuration);
  return (layout.cumulativeEm[index] || 0) + ratio * (layout.segmentHeightsEm[index] || layout.baseSlotEm);
}

function segmentIndexForMinute(pointsMin, minute) {
  let low = 0;
  let high = pointsMin.length - 2;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (minute < pointsMin[mid]) {
      high = mid - 1;
    } else if (minute >= pointsMin[mid + 1]) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.max(0, Math.min(pointsMin.length - 2, low));
}

function normalizeLayoutPoint(value, step) {
  return Math.max(0, Math.round(value / step) * step);
}

function columnAxisBase(column) {
  return column.index * 1440;
}

function localDayMinute(column, absMin) {
  return absMin - columnAxisBase(column);
}

function rowEnd(row) {
  return row.type === "gap" ? row.to : row.item.endAbsMin;
}

function rowDuration(row) {
  return row.type === "gap" ? row.to - row.from : row.item.endAbsMin - row.item.startAbsMin;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
