export type ViewedRange = [number, number];
// Store coverage, not the greatest scroll position: End must not skip unseen text.
export function addViewedRange(previous: ViewedRange[], start: number, end: number): ViewedRange[] {
  const sorted = [...previous, [Math.max(0, start), Math.max(0, end)] as ViewedRange].sort((a, b) => a[0] - b[0]);
  return sorted.reduce<ViewedRange[]>((ranges, next) => {
    const last = ranges[ranges.length - 1];
    if (last && next[0] <= last[1] + 2) last[1] = Math.max(last[1], next[1]);
    else ranges.push([...next]);
    return ranges;
  }, []);
}
export function viewedEntireDocument(ranges: ViewedRange[], height: number) {
  return height > 0 && ranges.length === 1 && ranges[0]![0] <= 2 && ranges[0]![1] >= height - 2;
}
