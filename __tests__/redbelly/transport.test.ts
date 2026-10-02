import { jsonRpcTransport } from '@/utils/redbelly/transport';

const URL = 'https://governors.testnet.redbelly.network';

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);

describe('jsonRpcTransport', () => {
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = (fetchMock as unknown) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the result', async () => {
    fetchMock.mockResolvedValue(reply(200, { result: '0x99' }));
    const request = jsonRpcTransport(URL, 0);
    await expect(request({ method: 'eth_chainId' })).resolves.toBe('0x99');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(JSON.parse(init.body)).toMatchObject({
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: [],
    });
  });

  it('retries once after a network failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(reply(200, { result: '0x1' }));
    await expect(
      jsonRpcTransport(URL, 0)({ method: 'eth_blockNumber' })
    ).resolves.toBe('0x1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on an overloaded node', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValueOnce(reply(200, { result: '0x2' }));
    await expect(
      jsonRpcTransport(URL, 0)({ method: 'eth_blockNumber' })
    ).resolves.toBe('0x2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the one retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      jsonRpcTransport(URL, 0)({ method: 'eth_blockNumber' })
    ).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a JSON-RPC error, which is an answer', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { error: { message: 'execution reverted' } })
    );
    await expect(
      jsonRpcTransport(URL, 0)({ method: 'eth_call' })
    ).rejects.toThrow('execution reverted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a client error', async () => {
    fetchMock.mockResolvedValue(reply(400, {}));
    await expect(
      jsonRpcTransport(URL, 0)({ method: 'eth_call' })
    ).rejects.toThrow('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
