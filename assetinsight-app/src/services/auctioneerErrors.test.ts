import { auctioneerErrorMessage } from './auctioneerErrors';

const fallback = 'Could not load assigned contracts. Check your connection and retry.';

it('preserves useful provider instructions', () => {
  expect(
    auctioneerErrorMessage(
      {
        response: {
          status: 409,
          data: {
            message: 'This contract is now assigned to another appraiser. Refresh Incoming.',
          },
        },
      },
      fallback
    )
  ).toBe('This contract is now assigned to another appraiser. Refresh Incoming.');
});

it.each([
  'http://127.0.0.1:3331/api/tasks',
  'https://private-upstream.example/api/tasks',
  'localhost:3331',
  'Request failed with status code 409',
  'Network Error',
  '<html>502 Bad Gateway</html>',
])('replaces transport diagnostics with recovery instructions: %s', (message) => {
  const result = auctioneerErrorMessage({ response: { status: 409, data: { message } } }, fallback);
  expect(result).toContain('assignment has changed');
  expect(result).not.toMatch(/https?:|localhost|status code|<html>/);
});

it('distinguishes an upstream server failure from the phone connection', () => {
  expect(
    auctioneerErrorMessage(
      { response: { status: 502, data: { message: 'fetch failed' } } },
      fallback
    )
  ).toContain('server could not connect');
  expect(auctioneerErrorMessage(new Error('Network Error'), fallback)).toBe(fallback);
});

it.each([null, undefined, {}, { message: {} }])(
  'handles missing or malformed errors without throwing %#',
  (error) => {
    expect(auctioneerErrorMessage(error, fallback)).toBe(fallback);
  }
);
