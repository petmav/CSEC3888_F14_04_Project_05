// Why a gas estimate failed: the node refused the transaction, or could not
// be reached. The signing screen blocks both, with a different message. The
// error shapes are the ones Redbelly's node and viem produced live
// (2026-10-18).
import {
  EstimateGasExecutionError,
  ExecutionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  InvalidInputRpcError,
  RpcRequestError,
  TimeoutError,
} from 'viem';

import {
  classifyEstimateFailure,
  estimateFailureOf,
  redbellyEstimateError,
} from '@/utils/redbelly/estimate';

const URL = 'https://governors.mainnet.redbelly.network';
const account = {
  address: '0xf47d6F6557C8e22923F1E81864ac35AC16d4db2d',
} as any;

/** The node's -32000 answer, as viem wraps it. */
const nodeError = (message: string) =>
  new InvalidInputRpcError(
    new RpcRequestError({
      body: { method: 'eth_estimateGas' },
      error: { code: -32000, message },
      url: URL,
    })
  );

const estimateError = (cause: any) =>
  new EstimateGasExecutionError(cause, { account } as any);

describe('classifyEstimateFailure', () => {
  it('treats a transaction the node executed and refused as reverted', () => {
    // A request with no `to`: deploying the calldata hits an invalid opcode.
    expect(
      classifyEstimateFailure(
        estimateError(nodeError('invalid opcode: opcode 0xf6 not defined'))
      )
    ).toBe('reverted');
  });

  it('treats an execution revert as reverted', () => {
    expect(
      classifyEstimateFailure(
        estimateError(
          new ExecutionRevertedError({ message: 'execution reverted' })
        )
      )
    ).toBe('reverted');
  });

  it('treats insufficient funds as reverted: it could never succeed', () => {
    const cause = new InsufficientFundsError({
      cause: nodeError('insufficient funds for gas * price + value'),
    });
    expect(classifyEstimateFailure(estimateError(cause))).toBe('reverted');
  });

  it('treats an unreachable node as unavailable', () => {
    expect(
      classifyEstimateFailure(
        estimateError(new HttpRequestError({ url: URL, status: 502 }))
      )
    ).toBe('unavailable');
    expect(
      classifyEstimateFailure(
        estimateError(new TimeoutError({ body: {}, url: URL }))
      )
    ).toBe('unavailable');
  });

  it('treats anything unrecognised as unavailable (retry)', () => {
    expect(classifyEstimateFailure(new Error('something odd'))).toBe(
      'unavailable'
    );
    expect(classifyEstimateFailure(undefined)).toBe('unavailable');
    expect(classifyEstimateFailure('a string')).toBe('unavailable');
  });

  it('stops following a cause chain that loops', () => {
    const a: any = new Error('a');
    const b: any = new Error('b');
    a.cause = b;
    b.cause = a;
    expect(classifyEstimateFailure(a)).toBe('unavailable');
  });
});

describe('redbellyEstimateError and estimateFailureOf', () => {
  it('carries the classification in data, which survives to the UI', () => {
    const error = redbellyEstimateError(
      estimateError(nodeError('invalid opcode: opcode 0xf6 not defined'))
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.data).toStrictEqual({ redbellyEstimate: 'reverted' });
    // What the UI receives: message, code and data only.
    const received = { message: error.message, data: error.data };
    expect(estimateFailureOf(received)).toBe('reverted');
  });

  it('reads nothing from an error without a classification', () => {
    expect(estimateFailureOf(new Error('other chain'))).toBeNull();
    expect(estimateFailureOf({ data: { redbellyEstimate: 'bogus' } })).toBe(
      null
    );
    expect(estimateFailureOf(undefined)).toBeNull();
  });
});
