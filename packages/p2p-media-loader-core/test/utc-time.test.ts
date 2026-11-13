import { describe, expect, it } from "vitest";
import { parseUtcTime } from "../src/manifest/utc-time.js";

const NOON = Date.UTC(2026, 9, 7, 12, 0, 0, 123);

describe("parseUtcTime", () => {
  it("reads a time in UTC", () => {
    expect(parseUtcTime("2026-10-07T12:00:00.123Z")).toBe(NOON);
  });

  it("reads a time with no time zone as UTC, not as local time", () => {
    expect(parseUtcTime("2026-10-07T12:00:00.123")).toBe(NOON);
  });

  it("applies a time zone offset", () => {
    expect(parseUtcTime("2026-10-07T14:00:00.123+02:00")).toBe(NOON);
    expect(parseUtcTime("2026-10-07T06:30:00.123-0530")).toBe(NOON);
  });

  it("reads any number of fraction digits, to the millisecond", () => {
    expect(parseUtcTime("2026-10-07T12:00:00.123456Z")).toBe(NOON);
    expect(parseUtcTime("2026-10-07T12:00:00.1Z")).toBe(NOON - 23);
    expect(parseUtcTime("2026-10-07T12:00:00Z")).toBe(NOON - 123);
  });

  it("ignores the white space around a server's answer", () => {
    expect(parseUtcTime("  2026-10-07T12:00:00.123Z\n")).toBe(NOON);
  });

  it("leaves other forms to Date.parse", () => {
    expect(parseUtcTime("Wed, 07 Oct 2026 12:00:00 GMT")).toBe(NOON - 123);
    expect(parseUtcTime("not a date")).toBeNaN();
  });
});
