import { createSseParser, type SseMessage } from '../sse';

function collect(): { messages: SseMessage[]; parser: ReturnType<typeof createSseParser> } {
  const messages: SseMessage[] = [];
  return { messages, parser: createSseParser((message) => messages.push(message)) };
}

function parseAll(chunks: string[]): SseMessage[] {
  const { messages, parser } = collect();
  for (const chunk of chunks) parser.feed(chunk);
  return messages;
}

describe('createSseParser', () => {
  it('parses one event per blank line', () => {
    expect(parseAll(['data: one\n\ndata: two\n\n'])).toEqual([{ data: 'one' }, { data: 'two' }]);
  });

  it('waits for the blank line before emitting', () => {
    const { messages, parser } = collect();
    parser.feed('data: partial');
    expect(messages).toEqual([]);
    parser.feed('\n');
    expect(messages).toEqual([]);
    parser.feed('\n');
    expect(messages).toEqual([{ data: 'partial' }]);
  });

  it('gives the same result however the input is split into chunks', () => {
    const input =
      'data: {"type":"delta","text":"Hello "}\n\n: keep-alive\n\nevent: x\ndata: a\ndata: b\n\n';
    const expected = parseAll([input]);
    expect(expected).toHaveLength(2);

    // Every possible two-way split, then one character at a time.
    for (let cut = 1; cut < input.length; cut++) {
      expect(parseAll([input.slice(0, cut), input.slice(cut)])).toEqual(expected);
    }
    expect(parseAll(input.split(''))).toEqual(expected);
  });

  it('joins repeated data fields with a newline', () => {
    expect(parseAll(['data: line one\ndata: line two\n\n'])).toEqual([
      { data: 'line one\nline two' },
    ]);
  });

  it('reads the event name', () => {
    expect(parseAll(['event: ping\ndata: {}\n\n'])).toEqual([{ event: 'ping', data: '{}' }]);
  });

  it('does not carry the event name over to the next event', () => {
    expect(parseAll(['event: a\ndata: 1\n\ndata: 2\n\n'])).toEqual([
      { event: 'a', data: '1' },
      { data: '2' },
    ]);
  });

  it('ignores comments and unknown fields', () => {
    expect(parseAll([': heartbeat\nid: 7\nretry: 100\ndata: kept\n\n'])).toEqual([
      { data: 'kept' },
    ]);
  });

  it('emits nothing for an event with no data', () => {
    expect(parseAll(['event: empty\n\n', ': only a comment\n\n'])).toEqual([]);
  });

  it('strips only one leading space from the value', () => {
    expect(parseAll(['data:no space\n\ndata:  two spaces\n\n'])).toEqual([
      { data: 'no space' },
      { data: ' two spaces' },
    ]);
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ])('accepts %s line endings', (_name, eol) => {
    expect(parseAll([`data: a${eol}${eol}data: b${eol}${eol}`])).toEqual([
      { data: 'a' },
      { data: 'b' },
    ]);
  });

  it('handles a CRLF pair split across two chunks', () => {
    expect(parseAll(['data: a\r', '\n\r', '\ndata: b\r\n\r\n'])).toEqual([
      { data: 'a' },
      { data: 'b' },
    ]);
  });

  it('keeps colons that are part of the value', () => {
    expect(parseAll(['data: {"url":"http://x.test"}\n\n'])).toEqual([
      { data: '{"url":"http://x.test"}' },
    ]);
  });

  it('drops an event that never got its blank line', () => {
    expect(parseAll(['data: finished\n\ndata: never finished\n'])).toEqual([{ data: 'finished' }]);
  });
});
