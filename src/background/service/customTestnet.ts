import {
  ERC_INTERFACE_ID,
  IPFS_DEFAULT_GATEWAY_URL,
  TOKEN_STANDARD,
} from '@/constant/custom-testnet';
import { CUSTOM_RPC_ENABLED } from '@/constant';
import { customTestnetTokenToTokenItem } from '@/ui/utils/token';
import { findChain, isSameTesnetToken, updateChainStore } from '@/utils/chain';
import { ga4 } from '@/utils/ga4';
import { matomoRequestEvent } from '@/utils/matomo-request';
import { CHAINS_ENUM } from '@debank/common';
import { intToHex } from '@ethereumjs/util';
import { abiERC1155, abiERC721 } from '@metamask/metamask-eth-abis';
import { GasLevel, ParseTxResponse, Tx } from 'background/service/openapi';
import {
  createPersistStore,
  isSameAddress,
  withTimeout,
} from 'background/utils';
import { BigNumber } from 'bignumber.js';
import { isZeroAddress } from 'ethereumjs-util';
import { omitBy, sortBy } from 'lodash';
import { nanoid } from 'nanoid';
import {
  createClient,
  decodeFunctionData,
  defineChain,
  erc20Abi,
  erc721Abi,
  getContract,
  http,
  isAddress,
} from 'viem';
import {
  estimateGas,
  getBalance,
  getBlock,
  getCode,
  getGasPrice,
  getTransactionCount,
  getTransactionReceipt,
  readContract,
} from 'viem/actions';
import { http as axios } from '../utils/http';
import { getFormattedIpfsUrl } from '../utils/ipfs';
import { storage } from '../webapi';
import RPCService, { RPCServiceStore } from './rpc';
import dayjs from 'dayjs';
import {
  isPinnedRedbellyRpc,
  isRedbellyChainId,
  REDBELLY_ONLY,
} from '@/constant/redbelly';
import {
  builtinRedbellyNetwork,
  REDBELLY_NETWORKS,
} from '@/constant/redbelly-chains';
import {
  RBNT_PEGGED_TOKENS,
  REDBELLY_DEFAULT_TOKENS,
  USD_PEGGED_TOKENS,
} from '@/constant/redbelly-assets';
import { REDBELLY_MAINNET_CHAIN_ID } from '@/constant/redbelly';
import redbellyService from './redbelly';
// import openapiService from './openapi';

const MAX_READ_CONTRACT_TIME = 15_000;

export interface TestnetChainBase {
  id: number;
  name: string;
  nativeTokenSymbol: string;
  rpcUrl: string;
  scanLink?: string;
}

export interface TestnetChain extends TestnetChainBase {
  nativeTokenAddress: string;
  hex: string;
  network: string;
  enum: CHAINS_ENUM;
  serverId: string;
  nativeTokenLogo: string;
  eip: Record<string, any>;
  nativeTokenDecimals: number;
  scanLink: string;
  isTestnet?: boolean;
  logo: string;
  whiteLogo?: string;
  needEstimateGas?: boolean;
  severity: number;
}

export interface RPCItem {
  url: string;
  enable: boolean;
}

export interface CustomTestnetTokenBase {
  id: string;
  chainId: number;
  symbol: string;
  decimals: number;
  /** A bundled logo, for the built-in Redbelly tokens. */
  logo?: string;
}

export interface CustomTestnetToken extends CustomTestnetTokenBase {
  amount: number;
  rawAmount: string;
  /** US dollars per token, where a trustworthy price exists. */
  price?: number;
}

export type CustomTestnetServiceStore = {
  customTestnet: Record<string, TestnetChain>;
  customTokenList: CustomTestnetTokenBase[];
  logos: Record<
    string,
    {
      chain_logo_url: string;
      token_logo_url?: string;
    }
  >;
  logosUpdatedAt: number;
};

const MAX = 4_294_967_295;
let idCounter = Math.floor(Math.random() * MAX);

function getUniqueId(): number {
  idCounter = (idCounter + 1) % MAX;
  return idCounter;
}

class CustomTestnetService {
  store: CustomTestnetServiceStore = {
    customTestnet: {},
    customTokenList: [],
    logos: {},
    logosUpdatedAt: 0,
  };

  chains: Record<string, ReturnType<typeof createClientByChain>> = {};

  init = async () => {
    const storageCache = await createPersistStore<CustomTestnetServiceStore>({
      name: 'customTestnet',
      template: {
        customTestnet: {},
        customTokenList: [],
        logos: {},
        logosUpdatedAt: 0,
      },
    });
    this.store = storageCache || this.store;
    this.store.logos = this.store.logos || {};
    this.store.logosUpdatedAt = this.store.logosUpdatedAt || 0;

    const coped = { ...this.store.customTestnet };
    Object.keys(coped).forEach((key) => {
      if (!/^\d+$/.test(key)) {
        delete coped[key];
      }
    });
    this.store.customTestnet = coped;
    this.ensureBuiltinNetworks();
    const rpcStorage: RPCServiceStore = await storage.get('rpc');
    Object.values(this.store.customTestnet).forEach((chain) => {
      const config =
        CUSTOM_RPC_ENABLED &&
        !isPinnedRedbellyRpc(chain.enum) &&
        // Optional: a fresh install has no RPC store yet, and with Redbelly
        // built in this loop now runs on first start.
        rpcStorage?.customRPC?.[chain.enum] &&
        rpcStorage.customRPC[chain.enum]?.enable
          ? { ...chain, rpcUrl: rpcStorage.customRPC[chain.enum].url }
          : chain;
      const client = createClientByChain(config);
      this.chains[chain.id] = client;
    });

    this.syncChainList();
    this.fetchLogos().then(() => {
      this.syncChainList();
    });
  };
  /**
   * Write the built-in Redbelly networks into the store (FR6 / US10).
   *
   * Done on every start rather than once, so the canonical definition always
   * wins: an endpoint or explorer change ships with the next release instead
   * of being stuck behind whatever an earlier version persisted.
   */
  ensureBuiltinNetworks = () => {
    const builtins: Record<string, TestnetChain> = {};
    REDBELLY_NETWORKS.forEach((network) => {
      builtins[network.id] = createTestnetChain({
        id: network.id,
        name: network.name,
        nativeTokenSymbol: network.nativeTokenSymbol,
        rpcUrl: network.rpcUrl,
        scanLink: network.scanLink,
      });
    });
    // Built-ins first, so every list that preserves insertion order shows
    // Redbelly Mainnet, then Testnet, then anything the user added.
    this.store.customTestnet = {
      ...builtins,
      ...omitBy(this.store.customTestnet, (item) =>
        builtinRedbellyNetwork(item.id)
      ),
    };
  };

  add = async (chain: TestnetChainBase) => {
    return this._update(chain, true);
  };

  update = async (chain: TestnetChainBase) => {
    return this._update(chain);
  };

  _update = async (chain: TestnetChainBase, isAdd?: boolean) => {
    chain.id = +chain.id;
    if (REDBELLY_ONLY && !builtinRedbellyNetwork(chain.id)) {
      return {
        error: {
          key: 'id',
          message: 'This wallet only supports Redbelly Network',
        },
      };
    }
    const local = findChain({
      id: +chain.id,
    });
    if (isAdd && local) {
      if (local.isTestnet) {
        return {
          error: {
            key: 'id',
            message: "You've already added this chain",
            status: 'alreadyAdded',
          },
        };
      } else {
        return {
          error: {
            key: 'id',
            message: 'Chain already integrated by Rabby Wallet',
            status: 'alreadySupported',
          },
        };
      }
    }
    try {
      const { data } = await axios.post(
        chain.rpcUrl,
        {
          jsonrpc: '2.0',
          id: getUniqueId(),
          method: 'eth_chainId',
          params: [],
        },
        {
          timeout: 6000,
        }
      );
      if (+data.result !== +chain.id) {
        return {
          error: {
            key: 'rpcUrl',
            message: 'RPC does not match the chainID',
          },
        };
      }
    } catch (error) {
      return {
        error: {
          key: 'rpcUrl',
          message: 'RPC invalid or currently unavailable',
        },
      };
    }
    const testnetChain = createTestnetChain(chain);
    this.store.customTestnet = {
      ...this.store.customTestnet,
      [chain.id]: testnetChain,
    };
    if (!RPCService.hasCustomRPC(testnetChain.enum)) {
      this.chains[chain.id] = createClientByChain(chain);
    }
    this.syncChainList();

    if (this.getList().length) {
      matomoRequestEvent({
        category: 'Custom Network',
        action: 'Custom Network Status',
        value: this.getList().length,
      });

      ga4.fireEvent('Has_CustomNetwork', {
        event_category: 'Custom Network',
      });
    }
    return this.store.customTestnet[chain.id];
  };

  remove = (chainId: number) => {
    // Redbelly is the wallet, not an add-on to it.
    if (builtinRedbellyNetwork(chainId)) {
      return;
    }
    this.store.customTestnet = omitBy(this.store.customTestnet, (item) => {
      return +chainId === +item.id;
    });
    this.store.customTokenList = this.store.customTokenList.filter((item) => {
      return +item.chainId !== +chainId;
    });
    delete this.chains[chainId];
    this.syncChainList();
    if (this.getList().length) {
      matomoRequestEvent({
        category: 'Custom Network',
        action: 'Custom Network Status',
        value: this.getList().length,
      });

      ga4.fireEvent('Has_CustomNetwork', {
        event_category: 'Custom Network',
      });
    }
  };

  /**
   * The native token logo for a network: Redbelly's own for the built-ins,
   * otherwise whatever DeBank's logo list has.
   */
  nativeLogo = (chainId: number | string) =>
    builtinRedbellyNetwork(chainId)?.logo ||
    this.store.logos?.[chainId]?.token_logo_url;

  getClient = (chainId: number) => {
    return this.chains[chainId];
  };

  getList = () => {
    const list = Object.values(this.store.customTestnet).map((item) => {
      const res = createTestnetChain(item);

      const builtin = builtinRedbellyNetwork(res.id);
      if (builtin) {
        res.logo = builtin.logo;
        res.whiteLogo = builtin.logo;
        res.nativeTokenLogo = builtin.logo;
        return res;
      }

      if (this.store.logos?.[res.id]) {
        res.logo = this.store.logos[res.id].chain_logo_url;
        res.nativeTokenLogo = this.store.logos[res.id].token_logo_url || '';
      }

      return res;
    });

    return list;
  };

  getTransactionReceipt = async ({
    chainId,
    hash,
  }: {
    chainId: number;
    hash: string;
  }) => {
    const client = this.getClient(+chainId);
    if (!client) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }
    const res = await getTransactionReceipt(client, {
      hash: hash as any,
    });
    return {
      ...res,
      status: res.status === 'success' ? '0x1' : '0x0',
    };
  };

  getTx = ({ hash, chainId }: { chainId: number; hash: string }) => {
    const chain = findChain({ id: chainId });
    if (!chain) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }
    return customTestnetService
      .getTransactionReceipt({
        chainId: chain!.id,
        hash: hash,
      })
      .then((res) => {
        return {
          ...res,
          hash: res.transactionHash,
          code: 0,
          status: parseInt(res.status, 16),
          gas_used: Number(res.gasUsed),
          token: customTestnetTokenToTokenItem({
            amount: 0,
            symbol: chain.nativeTokenSymbol,
            decimals: chain.nativeTokenDecimals,
            id: chain.nativeTokenAddress,
            chainId: chain.id,
            rawAmount: '0',
            logo: this.nativeLogo(chain.id),
          }),
        };
      })
      .catch((e) => {
        return {
          hash: hash,
          code: -1,
          status: 0,
          gas_used: 0,
          token: customTestnetTokenToTokenItem({
            amount: 0,
            symbol: chain.nativeTokenSymbol,
            decimals: chain.nativeTokenDecimals,
            id: chain.nativeTokenAddress,
            chainId: chain.id,
            rawAmount: '0',
            logo: this.nativeLogo(chain.id),
          }),
        };
      });
  };

  getTransactionCount = ({
    address,
    blockTag,
    chainId,
  }: {
    address: string;
    blockTag: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized';
    chainId: number;
  }) => {
    const client = this.getClient(+chainId);
    if (!client) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }
    return getTransactionCount(client, {
      address: address as any,
      blockTag,
    });
  };

  estimateGas = async ({
    address,
    tx,
    chainId,
  }: {
    address: string;
    tx: Tx;
    chainId: number;
  }) => {
    const client = this.getClient(+chainId);
    if (!client) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }
    const res = await estimateGas(client, {
      account: address as any,
      ...tx,
    } as any);
    return res.toString();
  };

  getGasPrice = async (chainId: number) => {
    const client = this.getClient(+chainId);
    if (!client) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }
    const res = await getGasPrice(client);
    return res.toString();
  };

  getBlockGasLimit = async (chainId: number) => {
    const client = this.getClient(+chainId);
    if (!client) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }
    const res = await getBlock(client);
    return res.gasLimit.toString();
  };

  getGasMarket = async ({
    chainId,
    custom,
  }: {
    chainId: number;
    custom?: number;
  }) => {
    // const SETTINGS_BY_PRIORITY_LEVEL = {
    //   low: {
    //     percentile: 10 as Percentile,
    //     baseFeePercentageMultiplier: new BN(110),
    //     priorityFeePercentageMultiplier: new BN(94),
    //     minSuggestedMaxPriorityFeePerGas: new BN(1_000_000_000),
    //     estimatedWaitTimes: {
    //       minWaitTimeEstimate: 15_000,
    //       maxWaitTimeEstimate: 30_000,
    //     },
    //   },
    //   medium: {
    //     percentile: 20 as Percentile,
    //     baseFeePercentageMultiplier: new BN(120),
    //     priorityFeePercentageMultiplier: new BN(97),
    //     minSuggestedMaxPriorityFeePerGas: new BN(1_500_000_000),
    //     estimatedWaitTimes: {
    //       minWaitTimeEstimate: 15_000,
    //       maxWaitTimeEstimate: 45_000,
    //     },
    //   },
    //   high: {
    //     percentile: 30 as Percentile,
    //     baseFeePercentageMultiplier: new BN(125),
    //     priorityFeePercentageMultiplier: new BN(98),
    //     minSuggestedMaxPriorityFeePerGas: new BN(2_000_000_000),
    //     estimatedWaitTimes: {
    //       minWaitTimeEstimate: 15_000,
    //       maxWaitTimeEstimate: 60_000,
    //     },
    //   },
    // };

    const gasPrice = await this.getGasPrice(chainId);

    // Redbelly sets one gas price for everyone from its USD peg (FR3); there
    // is no auction to win, so a 10-25% markup is money thrown away and makes
    // the quoted fee wrong. Every tier is the node's own price.
    if (isRedbellyChainId(chainId)) {
      return ['slow', 'normal', 'fast']
        .map((level) => ({
          level,
          price: Number(gasPrice),
          priority_price: 0,
          front_tx_count: 0,
          estimated_seconds: 0,
        }))
        .concat([
          {
            level: 'custom',
            price: custom || Number(gasPrice),
            priority_price: 0,
            front_tx_count: 0,
            estimated_seconds: 0,
          },
        ]) as GasLevel[];
    }

    const levels = [
      {
        level: 'slow',
        baseFeePercentageMultiplier: 110,
        priorityFeePercentageMultiplier: 94,
      },
      {
        level: 'normal',
        baseFeePercentageMultiplier: 120,
        priorityFeePercentageMultiplier: 97,
      },
      {
        level: 'fast',
        baseFeePercentageMultiplier: 125,
        priorityFeePercentageMultiplier: 98,
      },
    ];

    return levels
      .map((item) => {
        return {
          level: item.level,
          price: new BigNumber(gasPrice)
            .multipliedBy(item.baseFeePercentageMultiplier)
            .div(100)
            .integerValue()
            .toNumber(),
          priority_price: Math.round(
            new BigNumber(gasPrice)
              .multipliedBy(item.priorityFeePercentageMultiplier)
              .div(100)
              .integerValue()
              .toNumber()
          ),
          front_tx_count: 0,
          estimated_seconds: 0,
        };
      })
      .concat([
        {
          level: 'custom',
          price: custom || 0,
          priority_price: custom || 0,
          front_tx_count: 0,
          estimated_seconds: 0,
        },
      ]) as GasLevel[];
  };

  addToken = (params: CustomTestnetTokenBase) => {
    if (this.hasToken(params)) {
      throw new Error('Token already added');
    }
    this.store.customTokenList = [...this.store.customTokenList, params];
  };

  removeToken = (params: CustomTestnetTokenBase) => {
    this.store.customTokenList = this.store.customTokenList.filter((item) => {
      return !isSameTesnetToken(item, params);
    });
  };

  hasToken = (params: Pick<CustomTestnetTokenBase, 'id' | 'chainId'>) => {
    return !!this.store.customTokenList.find((item) => {
      return isSameTesnetToken(params, item);
    });
  };

  /**
   * A dollar price for a Redbelly Mainnet token, where one can be stated
   * honestly (FR2): RBNT and wrapped RBNT at Redbelly's on-chain price feed,
   * dollar stablecoins at $1. Everything else - Testnet included, whose RBNT
   * is worthless - has no price rather than a guessed one (US7).
   *
   * @param chainId - The chain id.
   * @param tokenId - The token, or null/native id for RBNT.
   * @returns The price, or undefined.
   */
  redbellyTokenPrice = async (
    chainId: number,
    tokenId?: string | null
  ): Promise<number | undefined> => {
    if (+chainId !== REDBELLY_MAINNET_CHAIN_ID) {
      return undefined;
    }
    const id = (tokenId || '').toLowerCase();
    if (USD_PEGGED_TOKENS.has(id)) {
      return 1;
    }
    const isNative = !id || id === `custom_${REDBELLY_MAINNET_CHAIN_ID}`;
    if (isNative || RBNT_PEGGED_TOKENS.has(id)) {
      return (await redbellyService.getRbntUsdPrice()) ?? undefined;
    }
    return undefined;
  };

  getToken = async ({
    chainId,
    address,
    tokenId,
  }: {
    chainId: number;
    address: string;
    tokenId?: string | null;
  }): Promise<CustomTestnetToken> => {
    const [balance, tokenInfo, price] = await Promise.all([
      this.getBalance({
        chainId,
        address,
        tokenId,
      }),
      this.getTokenInfo({
        chainId,
        tokenId,
      }),
      this.redbellyTokenPrice(chainId, tokenId),
    ]);

    const { decimals } = tokenInfo;

    return {
      ...tokenInfo,
      price,
      amount: new BigNumber(balance.toString())
        .div(new BigNumber(10).pow(decimals))
        .toNumber(),
      rawAmount: balance.toString(),
      logo:
        !tokenId || tokenId?.replace('custom_', '') === String(chainId)
          ? this.nativeLogo(chainId)
          : tokenInfo.logo,
    };
  };

  getBalance = async ({
    chainId,
    address,
    tokenId,
  }: {
    chainId: number;
    address: string;
    tokenId?: string | null;
  }) => {
    const client = this.getClient(+chainId);
    const chain = findChain({
      id: +chainId,
    });
    if (!client || !chain) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }

    if (!tokenId || tokenId === chain.nativeTokenAddress) {
      const balance = await getBalance(client, {
        address: address as any,
      });
      return balance;
    }

    const balance = await readContract(client, {
      address: tokenId as any,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as any],
    });

    return balance;
  };

  getTokenInfo = async ({
    chainId,
    tokenId,
  }: {
    chainId: number;
    tokenId?: string | null;
  }) => {
    const client = this.getClient(+chainId);
    const chain = findChain({
      id: +chainId,
    });
    if (!client || !chain) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }

    if (!tokenId || tokenId === chain.nativeTokenAddress) {
      return {
        id: chain.nativeTokenAddress,
        symbol: chain.nativeTokenSymbol,
        chainId,
        decimals: chain.nativeTokenDecimals,
      };
    }

    const local = this.store.customTokenList?.find((item) => {
      return isSameTesnetToken(item, {
        id: tokenId,
        chainId,
      });
    });
    if (local) {
      return local;
    }

    const listed = REDBELLY_DEFAULT_TOKENS[chainId]?.find(
      (item) => item.address.toLowerCase() === tokenId.toLowerCase()
    );
    if (listed) {
      return {
        id: listed.address.toLowerCase(),
        symbol: listed.symbol,
        chainId,
        decimals: listed.decimals,
        logo: listed.logo,
      };
    }

    // todo: multicall
    const [symbol, decimals] = await Promise.all([
      readContract(client, {
        address: tokenId as any,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      readContract(client, {
        address: tokenId as any,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
    ]);

    return {
      id: tokenId,
      symbol: symbol,
      chainId,
      decimals,
    };
  };

  getTokenList = async ({
    address,
    chainId,
    q,
    isRemote,
  }: {
    address: string;
    chainId?: number;
    q?: string;
    isRemote?: boolean;
  }) => {
    const nativeTokenList = Object.values(this.store.customTestnet).map(
      (item) => {
        return {
          id: null,
          chainId: item.id,
          symbol: item.nativeTokenSymbol,
          logo: this.nativeLogo(item.id),
        };
      }
    );
    const list = this.store.customTokenList || [];
    const redbellyTokens = await this.getRedbellyListedTokens({
      address,
      chainId,
    });
    const listedIds = new Set(
      redbellyTokens.map((item) => `${item.chainId}:${item.id}`)
    );
    let tokenList = [
      ...nativeTokenList,
      ...list.filter((item) => !listedIds.has(`${item.chainId}:${item.id}`)),
      ...redbellyTokens,
    ];
    if (chainId) {
      tokenList = tokenList.filter((item) => {
        return item.chainId === chainId;
      });
    }

    if (q) {
      tokenList = tokenList.filter((item) => {
        return (
          item.id === q || item.symbol.toLowerCase().includes(q.toLowerCase())
        );
      });
    }
    let queryList = tokenList.map((item) => {
      return {
        tokenId: item.id,
        chainId: item.chainId,
        address,
      };
    });

    if (q && isAddress(q) && isRemote) {
      const chainList = chainId
        ? [chainId]
        : Object.values(this.store.customTestnet).map((item) => item.id);

      queryList = chainList.map((chainId) => {
        return {
          tokenId: q,
          chainId,
          address,
        };
      });
    }

    const res = await Promise.all(
      queryList.map((item) =>
        withTimeout(this.getToken(item), MAX_READ_CONTRACT_TIME).catch((e) => {
          console.error(e);
          return null;
        })
      )
    );
    const result = sortBy(
      res
        .filter((item): item is CustomTestnetToken => !!item)
        // Listed and discovered tokens are shown when held; ones the user
        // added by hand always are, as is RBNT. A search shows everything.
        .filter(
          (item) =>
            !!q ||
            !item.id ||
            item.amount > 0 ||
            !listedIds.has(`${item.chainId}:${item.id}`) ||
            this.hasToken({ id: item.id, chainId: item.chainId })
        ),
      (item) => {
        return !item.id;
      },
      (item) => {
        return -item.amount;
      }
    );
    if (result.length <= 0 && q && isAddress(q) && chainId !== undefined) {
      const res = await this.getTokenStandardAndDetails({
        chainId,
        tokenId: q,
      });
      if (res?.type === TOKEN_STANDARD.ERC20) {
        const token = await this.getToken({
          chainId,
          address,
          tokenId: q,
        });
        return [token];
      }
    }
    return result;
  };

  /**
   * Redbelly tokens shown without the user adding them (US13): the default
   * list, plus anything the explorer says this address holds.
   *
   * @param params.address - The account.
   * @param params.chainId - Restrict to one chain, if given.
   * @returns Token entries in the shape of `customTokenList`.
   */
  getRedbellyListedTokens = async ({
    address,
    chainId,
  }: {
    address: string;
    chainId?: number;
  }): Promise<CustomTestnetTokenBase[]> => {
    const chainIds = REDBELLY_NETWORKS.map((item) => item.id).filter(
      (id) => chainId === undefined || id === chainId
    );
    const perChain = await Promise.all(
      chainIds.map(async (id) => {
        const discovered = address
          ? await redbellyService.discoverTokens(id, address)
          : [];
        const seen = new Set<string>();
        return [...(REDBELLY_DEFAULT_TOKENS[id] || []), ...discovered]
          .filter((token) => {
            const key = token.address.toLowerCase();
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          })
          .map((token) => ({
            id: token.address.toLowerCase(),
            chainId: id,
            symbol: token.symbol,
            decimals: token.decimals,
            logo: token.logo,
          }));
      })
    );
    return perChain.flat();
  };

  // todo
  getTokenWithBalance = this.getTokenList;

  hasCustomTokens = () => {
    const hasCustomNetwork = Object.values(this.store.customTestnet).length > 0;
    const hasCustomTokens = this.store.customTokenList.length > 0;
    return hasCustomNetwork || hasCustomTokens;
  };

  syncChainList = () => {
    const testnetList = this.getList();
    updateChainStore({
      testnetList: testnetList,
    });
  };

  fetchLogos = async () => {
    // The logos come from DeBank's servers, and the only networks a
    // Redbelly-only build has bring their own.
    if (REDBELLY_ONLY) {
      return {};
    }
    try {
      if (
        dayjs().isBefore(dayjs(this.store.logosUpdatedAt || 0).add(1, 'day'))
      ) {
        return {};
      }
      const { data } = await axios.get<CustomTestnetServiceStore['logos']>(
        'https://static.debank.com/supported_testnet_chains.json'
      );
      this.store.logos = data;
      this.store.logosUpdatedAt = Date.now();
      return data;
    } catch (e) {
      console.error(e);
      return {};
    }
  };

  setCustomRPC = ({ chainId, url }: { chainId: number; url: string }) => {
    const client = this.getClient(chainId);
    const chain = this.store.customTestnet[chainId];
    if (client && chain && !isPinnedRedbellyRpc(chain.enum)) {
      this.chains[chainId] = createClientByChain({
        ...this.store.customTestnet[chainId],
        rpcUrl: url,
      });
    }
  };

  removeCustomRPC = (chainId: number) => {
    const client = this.getClient(chainId);
    if (client) {
      this.chains[chainId] = createClientByChain(
        this.store.customTestnet[chainId]
      );
    }
  };

  getERC721Details = async ({
    chainId,
    tokenId,
  }: {
    chainId: number;
    tokenId: string;
  }) => {
    const client = this.getClient(+chainId);
    const chain = findChain({
      id: +chainId,
    });
    if (!client || !chain) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }

    const contract = getContract({
      address: tokenId as `0x${string}`,
      abi: abiERC721,
      client,
    });

    const isErc721 = await contract.read.supportsInterface([
      ERC_INTERFACE_ID.ERC721_INTERFACE_ID,
    ]);
    if (!isErc721) {
      throw new Error('is not valid erc721');
    }

    // const [symbol, name] = await Promise.all([
    //   contract.read.symbol(),
    //   contract.read.name(),
    // ]);

    const name = await contract.read.name();

    return {
      type: TOKEN_STANDARD.ERC721,
      contract: {
        contractId: tokenId,
        chainId,
        name,
      },
    } as const;
  };

  getERC1155Details = async ({
    chainId,
    tokenId,
  }: {
    chainId: number;
    tokenId: string;
  }) => {
    const client = this.getClient(+chainId);
    const chain = findChain({
      id: +chainId,
    });
    if (!client || !chain) {
      throw new Error(`Invalid chainId: ${chainId}`);
    }

    const contract = getContract({
      address: tokenId as `0x${string}`,
      abi: abiERC1155,
      client,
    });

    const isErc1155 = await contract.read.supportsInterface([
      ERC_INTERFACE_ID.ERC1155_INTERFACE_ID,
    ]);
    if (!isErc1155) {
      throw new Error('is not valid erc1155');
    }
    const name = await readContract(client, {
      address: tokenId as `0x${string}`,
      abi: [
        {
          inputs: [],
          name: 'name',
          outputs: [{ name: '_name', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
          payable: false,
        },
      ],
      functionName: 'name',
      args: [],
    }).catch(() => '');

    return {
      type: TOKEN_STANDARD.ERC1155,
      contract: {
        contractId: tokenId,
        chainId,
        name,
      },
    } as const;
  };

  getTokenStandardAndDetails = async ({
    chainId,
    tokenId,
  }: {
    chainId: number;
    tokenId: string;
  }) => {
    try {
      const res = await this.getERC721Details({
        chainId,
        tokenId,
      });
      return res;
    } catch (e) {
      console.error(e);
    }
    try {
      const res = await this.getERC1155Details({
        chainId,
        tokenId,
      });
      return res;
    } catch (e) {
      console.error(e);
    }

    try {
      const token = await this.getTokenInfo({
        chainId,
        tokenId,
      });
      return {
        type: TOKEN_STANDARD.ERC20,
        token: token,
      } as const;
    } catch (e) {
      console.error(e);
    }
  };

  getNFT721Metadata = async ({
    chainId,
    contractAddress,
    tokenId,
  }: {
    chainId: number;
    contractAddress: string;
    tokenId: string | bigint;
  }): Promise<
    | {
        name?: string;
        image?: string;
        description?: string;
      }
    | undefined
  > => {
    const client = this.getClient(chainId);

    try {
      const tokenURI = await readContract(client, {
        abi: erc721Abi,
        address: contractAddress as `0x${string}`,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      }).then((uri) => {
        return uri.startsWith('ipfs://')
          ? getFormattedIpfsUrl(IPFS_DEFAULT_GATEWAY_URL, uri, false)
          : uri;
      });

      if (tokenURI) {
        const { data: metaData } = await axios.get(tokenURI);
        if (metaData?.image?.startsWith('ipfs://')) {
          metaData.image = getFormattedIpfsUrl(
            IPFS_DEFAULT_GATEWAY_URL,
            metaData.image,
            false
          );
        }
        return metaData;
      }
    } catch (e) {
      console.error(e);
    }
  };

  getNFT1155Metadata = async ({
    chainId,
    contractAddress,
    tokenId,
  }: {
    chainId: number;
    contractAddress: string;
    tokenId: string | bigint;
  }): Promise<
    | {
        name?: string;
        image?: string;
        description?: string;
        decimals?: number;
      }
    | undefined
  > => {
    const client = this.getClient(chainId);

    try {
      const tokenURI = await readContract(client, {
        abi: abiERC1155,
        address: contractAddress as `0x${string}`,
        functionName: 'uri',
        args: [BigInt(tokenId)],
      }).then((uri) => {
        return uri.startsWith('ipfs://')
          ? getFormattedIpfsUrl(IPFS_DEFAULT_GATEWAY_URL, uri, false)
          : uri;
      });
      if (tokenURI) {
        const { data: metaData } = await axios.get(tokenURI);
        if (metaData?.image?.startsWith('ipfs://')) {
          metaData.image = getFormattedIpfsUrl(
            IPFS_DEFAULT_GATEWAY_URL,
            metaData.image,
            false
          );
        }
        return metaData;
      }
    } catch (e) {
      console.error(e);
    }
  };

  parseTx = async ({
    chainId,
    tx,
    origin,
    addr,
  }: {
    chainId: number;
    tx: Tx;
    origin: string;
    addr: string;
  }): Promise<Omit<ParseTxResponse, 'log_id'> | undefined | null> => {
    const client = this.getClient(+chainId);
    const chain = findChain({
      id: +chainId,
    });
    if (!client || !chain) {
      throw new Error(`can not find custom network client: ${chainId}`);
    }
    const { data, to } = tx;
    const hasValue = tx.value && tx.value !== '0x' && Number(tx.value) !== 0;
    const hasData = data && data !== '0x';

    if (hasData && !to) {
      return {
        action: {
          type: 'deploy_contract',
          data: null,
        },
      };
    }

    if (!to) {
      // unknown
      return;
    }

    const cancelAction = {
      action: {
        type: 'cancel_tx',
        data: null,
      },
    };

    if (isSameAddress(addr, to)) {
      return cancelAction;
    }
    const bytecode = await getCode(client, {
      address: to as `0x${string}`,
    });

    const isContractAddress =
      !!bytecode && bytecode !== '0x' && bytecode !== '0x0';

    // if no data and send to CA or send to EOA
    if ((isContractAddress && !hasData) || !isContractAddress) {
      const _value = new BigNumber(tx.value).isNaN()
        ? new BigNumber(0)
        : new BigNumber(tx.value);
      return {
        action: {
          type: 'send_token',
          data: {
            to: to || '',
            token: customTestnetTokenToTokenItem({
              amount: _value
                .div(new BigNumber(10).pow(chain.nativeTokenDecimals))
                .toNumber(),
              symbol: chain.nativeTokenSymbol,
              decimals: chain.nativeTokenDecimals,
              id: chain.nativeTokenAddress,
              chainId: chain.id,
              rawAmount: _value.toFixed(),
              logo: this.nativeLogo(chain.id),
            }),
          },
        },
      };
    }

    if (isContractAddress && hasData) {
      if (hasValue) {
        // unknown
        return;
      }

      const details = await this.getTokenStandardAndDetails({
        chainId,
        tokenId: to,
      });

      if (!details) {
        // unknown
        return;
      }

      if (details.type === TOKEN_STANDARD.ERC20) {
        const { token } = details;
        const parsedData = decodeFunctionData({
          abi: erc20Abi,
          data: data as `0x${string}`,
        });

        if (!parsedData) {
          // unknown
          return;
        }
        if (parsedData.functionName === 'transfer') {
          const [_to, _rawAmount] = parsedData.args;
          if (!_to) {
            throw new Error('unknown');
          }
          if (isSameAddress(addr, _to)) {
            return cancelAction;
          }
          const _value = new BigNumber(_rawAmount.toString()).isNaN()
            ? new BigNumber(0)
            : new BigNumber(_rawAmount.toString());
          return {
            action: {
              type: 'send_token',
              data: {
                to: _to || '',
                token: customTestnetTokenToTokenItem({
                  amount: _value
                    .div(new BigNumber(10).pow(token.decimals))
                    .toNumber(),
                  symbol: token.symbol,
                  decimals: token.decimals,
                  id: token.id,
                  chainId: token.chainId,
                  rawAmount: _value.toFixed(),
                  logo: token.logo || '',
                }),
              },
            },
          };
        } else if (parsedData?.functionName === 'approve') {
          const [spender, _rawAmount] = parsedData.args;
          const _value = new BigNumber((_rawAmount || 0).toString()).isNaN()
            ? new BigNumber(0)
            : new BigNumber((_rawAmount || 0).toString());
          return {
            action: {
              type: _value.isZero() ? 'revoke_token' : 'approve_token',
              data: {
                spender: spender || '',
                token: customTestnetTokenToTokenItem({
                  amount: _value
                    .div(new BigNumber(10).pow(token.decimals))
                    .toNumber(),
                  symbol: token.symbol,
                  decimals: token.decimals,
                  id: token.id,
                  chainId: token.chainId,
                  rawAmount: _value.toFixed(),
                  logo: token.logo || '',
                }),
              },
            },
          };
        } else {
          // unknown
          return;
        }
      } else if (details.type === TOKEN_STANDARD.ERC721) {
        const parsedData = decodeFunctionData({
          abi: erc721Abi,
          data: data as `0x${string}`,
        });
        if (!parsedData) {
          return;
        }
        if (
          parsedData.functionName === 'safeTransferFrom' ||
          parsedData.functionName === 'transferFrom'
        ) {
          const [_from, _to, _tokenId] = parsedData.args;

          if (isSameAddress(_from, _to)) {
            return cancelAction;
          }

          const metadata = await this.getNFT721Metadata({
            chainId,
            contractAddress: to,
            tokenId: _tokenId,
          }).catch(() => null);

          return {
            action: {
              type: 'send_nft',
              data: {
                to: _to,
                nft: {
                  chain: chain.serverId,
                  id: nanoid(),
                  contract_id: to,
                  inner_id: _tokenId.toString(),
                  name: metadata?.name ?? '',
                  contract_name: '',
                  description: metadata?.description ?? '',
                  amount: 1,
                  content_type: 'image_url',
                  content: metadata?.image ?? '',
                  detail_url: '',
                  is_erc1155: false,
                  is_erc721: true,
                },
              },
            },
          };
        }
        if (parsedData.functionName === 'approve') {
          const [_to, _tokenId] = parsedData.args;
          const metadata = await this.getNFT721Metadata({
            chainId,
            contractAddress: to,
            tokenId: _tokenId,
          }).catch(() => null);

          return {
            action: {
              type: isZeroAddress(_to) ? 'revoke_nft' : 'approve_nft',
              data: {
                spender: _to,
                nft: {
                  chain: chain.serverId,
                  id: nanoid(),
                  contract_id: to,
                  inner_id: _tokenId.toString(),
                  name: metadata?.name ?? '',
                  contract_name: details.contract.name,
                  description: metadata?.description ?? '',
                  amount: 1,
                  content_type: 'image_url',
                  content: metadata?.image ?? '',
                  detail_url: '',
                  is_erc1155: false,
                  is_erc721: true,
                },
              },
            },
          };
        }
        if (parsedData.functionName === 'setApprovalForAll') {
          const [spender, isApprove] = parsedData.args;
          return {
            action: {
              type: isApprove ? 'approve_collection' : 'revoke_collection',
              data: {
                collection: {
                  create_at: '',
                  id: to,
                  is_core: false,
                  name: details.contract.name,
                  price: 0,
                  chain: chain.serverId,
                  tokens: [],
                  floor_price: 0,
                  is_scam: false,
                  is_suspicious: false,
                  is_verified: false,
                },
                spender,
              },
            },
          };
        }
      } else if (details.type === TOKEN_STANDARD.ERC1155) {
        const parsedData = decodeFunctionData({
          abi: abiERC1155,
          data: data as `0x${string}`,
        });
        if (!parsedData) {
          return;
        }
        if (parsedData.functionName === 'safeTransferFrom') {
          const [_from, _to, _tokenId, _amount] = parsedData.args;

          if (isSameAddress(_from, _to)) {
            return cancelAction;
          }
          const metadata = await this.getNFT1155Metadata({
            chainId,
            contractAddress: to,
            tokenId: _tokenId,
          }).catch(() => null);

          // const amount = new BigNumber(_amount.toString())
          //   .div(
          //     metadata?.decimals && Number.isInteger(metadata.decimals)
          //       ? new BigNumber(10).pow(metadata?.decimals)
          //       : 1
          //   )
          //   .toNumber();
          return {
            action: {
              type: 'send_nft',
              data: {
                to: _to,
                nft: {
                  chain: chain.serverId,
                  id: nanoid(),
                  contract_id: to,
                  inner_id: _tokenId.toString(),
                  name: metadata?.name ?? '',
                  contract_name: '',
                  description: metadata?.description ?? '',
                  amount: Number(_amount),
                  content_type: 'image_url',
                  content: metadata?.image ?? '',
                  detail_url: '',
                  is_erc1155: true,
                  is_erc721: false,
                },
              },
            },
          };
        }
        if (parsedData.functionName === 'setApprovalForAll') {
          const [spender, isApprove] = parsedData.args;
          return {
            action: {
              type: isApprove ? 'approve_collection' : 'revoke_collection',
              data: {
                collection: {
                  create_at: '',
                  id: to,
                  is_core: false,
                  name: details.contract.name,
                  price: 0,
                  chain: chain.serverId,
                  tokens: [],
                  floor_price: 0,
                  is_scam: false,
                  is_suspicious: false,
                  is_verified: false,
                },
                spender,
              },
            },
          };
        }
      }
    }
  };
}

export const customTestnetService = new CustomTestnetService();
export const fakeTestnetOpenapi = {
  getToken: async (id: string, chainId: string, tokenId: string) => {
    const chain = findChain({
      serverId: chainId,
    });
    if (!chain) {
      throw new Error(`invalid chain: ${chainId}`);
    }

    const customToken = await customTestnetService.getToken({
      chainId: chain.id,
      address: id,
      tokenId: tokenId,
    });

    return customTestnetTokenToTokenItem(customToken);
  },
  // for testnet, we don't have a real API to get contract info, so we return null
  getContractInfo: async (id: string, chainId: string) => {
    return null;
  },
  // addrDesc: openapiService.addrDesc,
  addrDesc: async (id: string) => {
    return {
      desc: {},
    };
  },
  hasTransfer: async (chainId: string, from: string, to: string) => {
    return {
      has_transfer: false,
    };
  },
  hasInteraction: async (addr: string, chainId: string, contractId: string) => {
    return {
      has_interaction: false,
    };
  },
  isTokenContract: async (chainId: string, id: string) => {
    return {
      is_token: false,
    };
  },
  depositCexSupport: async (id: string, chainId: string, cexId: string) => {
    return {
      support: false,
    };
  },
  addrUsedChainList: async (id: string) => {
    return [];
  },
  checkSpoofing: async ({ from, to }: { from: string; to: string }) => {
    return { is_spoofing: false };
  },
};

const createClientByChain = (chain: TestnetChainBase) => {
  return createClient({
    chain: defineChain({
      id: chain.id,
      name: chain.name,
      nativeCurrency: {
        symbol: chain.nativeTokenSymbol,
        name: chain.nativeTokenSymbol,
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [chain.rpcUrl],
        },
      },
    }),
    transport: http(chain.rpcUrl, {
      timeout: 20_000,
      retryCount: 0,
    }),
  });
};

export const createTestnetChain = (chain: TestnetChainBase): TestnetChain => {
  chain.id = +chain.id;
  return {
    ...chain,
    id: +chain.id,
    hex: intToHex(+chain.id),
    network: '' + chain.id,
    enum: `CUSTOM_${chain.id}` as CHAINS_ENUM,
    serverId: `custom_${chain.id}`,
    nativeTokenAddress: `custom_${chain.id}`,
    nativeTokenDecimals: 18,
    nativeTokenLogo: '',
    scanLink: chain.scanLink || '',
    logo: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><circle cx='14' cy='14' r='14' fill='%236A7587'></circle><text x='14' y='15' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='16' font-weight='500'>${encodeURIComponent(
      chain.name.trim().substring(0, 1).toUpperCase()
    )}</text></svg>`,
    eip: {
      1559: false,
    },
    isTestnet: true,
    severity: 0,
  };
};
