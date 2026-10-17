/**
 * An `xs:dateTime`, as a `UTCTiming` server answers (`http-xsdate`,
 * `http-iso`) and as a `direct` value carries it: a date, a time with any
 * number of fraction digits, and an optional time zone.
 */
const XS_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * The time a `UTCTiming` answer or value gives, in epoch milliseconds; `NaN`
 * where the text holds none.
 *
 * `Date.parse` alone is not enough. It reads a date-time with no time zone as
 * local time, which puts the clock off by the device's UTC offset, where the
 * DASH guidelines say the time is UTC. And ECMAScript defines only three
 * fraction digits, so an engine may refuse more. Text in that form is read
 * here, as UTC where it names no zone; any other text, such as a `Date`
 * header, is left to `Date.parse`.
 */
export function parseUtcTime(text: string): number {
  const match = XS_DATE_TIME.exec(text.trim());
  if (!match) return Date.parse(text);
  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  const milliseconds = Number(`${fraction}000`.slice(0, 3));
  const time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  // An optional group that did not match is `undefined`, typings aside.
  if (!zone || zone === "Z") return time;
  const digits = zone.slice(1).replace(":", "");
  const offsetMinutes =
    Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
  // A time ahead of UTC by the offset names an earlier UTC moment.
  return time - (zone.startsWith("-") ? -1 : 1) * offsetMinutes * 60_000;
}
