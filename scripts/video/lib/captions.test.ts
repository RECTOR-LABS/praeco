import {
  formatSrtTime,
  toSrt,
  groupWords,
  parseForcedAlignment,
  padShortCues,
  escapeXml,
  cueSvg,
} from "./captions";

test("formatSrtTime renders SRT HH:MM:SS,mmm", () => {
  expect(formatSrtTime(0)).toBe("00:00:00,000");
  expect(formatSrtTime(3.5)).toBe("00:00:03,500");
  expect(formatSrtTime(65.25)).toBe("00:01:05,250");
  expect(formatSrtTime(3661.007)).toBe("01:01:01,007");
});

test("formatSrtTime rounds to the nearest millisecond, carrying up", () => {
  expect(formatSrtTime(0.9999)).toBe("00:00:01,000");
});

test("toSrt numbers cues from 1 with timing lines and blank separators", () => {
  const srt = toSrt([
    { start: 0, end: 3.5, text: "First line" },
    { start: 3.5, end: 6, text: "Second line" },
  ]);
  expect(srt).toBe(
    "1\n00:00:00,000 --> 00:00:03,500\nFirst line\n\n" +
      "2\n00:00:03,500 --> 00:00:06,000\nSecond line\n"
  );
});

test("groupWords breaks after a sentence end; each cue spans first→last word", () => {
  const w = (text: string, start: number, end: number) => ({ text, start, end });
  const cues = groupWords(
    [
      w("Great", 0.0, 0.4),
      w("products", 0.4, 0.9),
      w("die.", 0.9, 1.3),
      w("Praeco", 1.4, 1.8),
      w("fixes", 1.8, 2.1),
      w("that.", 2.1, 2.5),
    ],
    { maxChars: 42, maxDurationSec: 6, maxGapSec: 0.8 }
  );
  expect(cues).toEqual([
    { start: 0.0, end: 1.3, text: "Great products die." },
    { start: 1.4, end: 2.5, text: "Praeco fixes that." },
  ]);
});

test("groupWords splits a long run at the character cap, preserving word order", () => {
  const words = ["one", "two", "three", "four", "five", "six", "seven", "eight"].map(
    (text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 })
  );
  const cues = groupWords(words, { maxChars: 15, maxDurationSec: 60, maxGapSec: 5 });
  for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(15);
  expect(cues.map((c) => c.text).join(" ")).toBe(
    "one two three four five six seven eight"
  );
});

test("groupWords breaks on a long pause between words", () => {
  const cues = groupWords(
    [
      { text: "before", start: 0, end: 0.5 },
      { text: "the", start: 0.6, end: 0.8 },
      { text: "pause", start: 2.0, end: 2.5 },
    ],
    { maxChars: 42, maxDurationSec: 6, maxGapSec: 0.8 }
  );
  expect(cues).toEqual([
    { start: 0, end: 0.8, text: "before the" },
    { start: 2.0, end: 2.5, text: "pause" },
  ]);
});

test("parseForcedAlignment extracts words with text/start/end, dropping extras", () => {
  const words = parseForcedAlignment({
    characters: [{ text: "H", start: 0, end: 0.1 }],
    words: [
      { text: "Hello", start: 0.0, end: 0.5, loss: 0.1 },
      { text: "world.", start: 0.6, end: 1.1, loss: 0.2 },
    ],
    loss: 0.15,
  });
  expect(words).toEqual([
    { text: "Hello", start: 0.0, end: 0.5 },
    { text: "world.", start: 0.6, end: 1.1 },
  ]);
});

test("parseForcedAlignment trims word text and drops blank tokens", () => {
  const words = parseForcedAlignment({
    words: [
      { text: " Praeco ", start: 0, end: 0.4 },
      { text: " ", start: 0.4, end: 0.45 },
      { text: "ships", start: 0.45, end: 0.8 },
    ],
  });
  expect(words).toEqual([
    { text: "Praeco", start: 0, end: 0.4 },
    { text: "ships", start: 0.45, end: 0.8 },
  ]);
});

test("parseForcedAlignment rejects a response without a words array", () => {
  expect(() => parseForcedAlignment({ characters: [] })).toThrow(/words/i);
});

test("padShortCues extends a too-short cue toward the minimum, stopping before the next", () => {
  const out = padShortCues(
    [
      { start: 0, end: 0.3, text: "Hi" },
      { start: 1.0, end: 2.5, text: "there" },
    ],
    1.0
  );
  expect(out[0].start).toBe(0);
  expect(out[0].end).toBeCloseTo(0.96); // 1.0 - 0.04s gap before the next cue
  expect(out[1]).toEqual({ start: 1.0, end: 2.5, text: "there" });
});

test("padShortCues extends a final short cue to the full minimum", () => {
  const out = padShortCues([{ start: 5.0, end: 5.28, text: "kit." }], 1.2);
  expect(out[0].end).toBeCloseTo(6.2);
});

test("padShortCues leaves cues already long enough untouched", () => {
  const cues = [{ start: 0, end: 2.0, text: "plenty long" }];
  expect(padShortCues(cues, 1.0)).toEqual(cues);
});

test("escapeXml encodes the five XML metacharacters", () => {
  expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
});

test("cueSvg centers escaped text in a 1920x1080 transparent frame with an outline", () => {
  const svg = cueSvg(`Tom & "Jerry" <go>`);
  expect(svg).toContain('width="1920"');
  expect(svg).toContain('height="1080"');
  expect(svg).toContain('text-anchor="middle"');
  expect(svg).toContain("Tom &amp; &quot;Jerry&quot; &lt;go&gt;");
  expect(svg).toContain("stroke="); // legibility outline
  expect(svg).not.toContain("<rect"); // transparent background, no fill box
});
