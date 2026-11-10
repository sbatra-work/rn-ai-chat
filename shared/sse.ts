/**
 * A small incremental parser for Server-Sent Events.
 *
 * Network chunks do not line up with events: one chunk can hold several
 * events, and one event can be split across chunks (even in the middle of a
 * line ending). Feed chunks in as they arrive and the parser calls
 * `onMessage` once per complete event.
 *
 * Covers the parts of the SSE format this project uses: `data:` fields
 * (joined with newlines when repeated), `event:` fields, comment lines, and
 * all three line endings (LF, CRLF, CR). `id:` and `retry:` are ignored.
 */

export interface SseMessage {
  /** Value of the `event:` field, if the event had one. */
  event?: string;
  /** All `data:` lines of the event joined with "\n". */
  data: string;
}

export interface SseParser {
  /** Add the next chunk of decoded text. */
  feed(chunk: string): void;
  /**
   * Forget any partial input, ready for a new stream. A trailing event with
   * no blank line after it is dropped, as the SSE spec requires.
   */
  reset(): void;
}

export function createSseParser(onMessage: (message: SseMessage) => void): SseParser {
  let buffer = '';
  let dataLines: string[] = [];
  let eventName: string | undefined;
  /** True when the last chunk ended in "\r", so a leading "\n" is its pair. */
  let skipLeadingLf = false;

  function dispatch(): void {
    if (dataLines.length > 0) {
      const message: SseMessage = { data: dataLines.join('\n') };
      if (eventName !== undefined) message.event = eventName;
      onMessage(message);
    }
    dataLines = [];
    eventName = undefined;
  }

  function handleLine(line: string): void {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment, used as a keep-alive

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') dataLines.push(value);
    else if (field === 'event') eventName = value;
  }

  return {
    feed(chunk) {
      if (chunk === '') return;
      if (skipLeadingLf && chunk.startsWith('\n')) chunk = chunk.slice(1);
      skipLeadingLf = false;
      buffer += chunk;

      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== '\n' && char !== '\r') continue;

        handleLine(buffer.slice(start, i));
        if (char === '\r') {
          if (i + 1 < buffer.length) {
            if (buffer[i + 1] === '\n') i++;
          } else {
            skipLeadingLf = true;
          }
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
    reset() {
      buffer = '';
      dataLines = [];
      eventName = undefined;
      skipLeadingLf = false;
    },
  };
}
