import { parseErrorBody, parseStreamEvent } from '../protocol';

describe('parseStreamEvent', () => {
  it('accepts each event in the contract', () => {
    expect(parseStreamEvent('{"type":"delta","text":"hi"}')).toEqual({ type: 'delta', text: 'hi' });
    expect(parseStreamEvent('{"type":"done","finishReason":"refusal"}')).toEqual({
      type: 'done',
      finishReason: 'refusal',
    });
    expect(parseStreamEvent('{"type":"error","code":"upstream_error","message":"m"}')).toEqual({
      type: 'error',
      code: 'upstream_error',
      message: 'm',
    });
  });

  it.each([
    ['text that is not JSON', 'data'],
    ['a JSON value that is not an object', '"delta"'],
    ['null', 'null'],
    ['an unknown type', '{"type":"usage","tokens":3}'],
    ['a delta without text', '{"type":"delta"}'],
    ['a delta with the wrong type of text', '{"type":"delta","text":5}'],
    ['an unknown finish reason', '{"type":"done","finishReason":"length"}'],
    ['an unknown error code', '{"type":"error","code":"teapot","message":"m"}'],
  ])('returns null for %s', (_name, data) => {
    expect(parseStreamEvent(data)).toBeNull();
  });
});

describe('parseErrorBody', () => {
  it('accepts a well-formed error and rejects everything else', () => {
    const good = { error: { code: 'rate_limited', message: 'slow down' } };
    expect(parseErrorBody(good)).toEqual(good);
    expect(parseErrorBody(null)).toBeNull();
    expect(parseErrorBody({ error: 'nope' })).toBeNull();
    expect(parseErrorBody({ error: { code: 'made_up', message: 'x' } })).toBeNull();
  });
});
