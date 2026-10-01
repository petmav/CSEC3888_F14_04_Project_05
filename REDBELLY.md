# Redbelly Wallet (Rabby fork)

A browser-extension wallet for Redbelly Network, forked from Rabby v0.94.8
(MIT). It talks only to Redbelly Mainnet (151) and Testnet (153), checks
every recipient against Redbelly's on-chain KYC permission list before
signing, and refuses to sign to a confirmed unregistered account.

This is the fork deliverable of CSEC3888 P5 (milestones M8-M15). The
MetaMask Snap in `redbelly-address-snap` remains the assessed baseline.

## Build and load

```sh
node .yarn/releases/yarn-4.14.1.cjs          # install (yarn 4, bundled)
node .yarn/releases/yarn-4.14.1.cjs build:dev  # watch build into dist/
node .yarn/releases/yarn-4.14.1.cjs build:pro  # production build
npx jest __tests__/redbelly                  # Redbelly suites
npx tsc --noEmit --skipLibCheck              # typecheck
```

Load `dist/` at `chrome://extensions` with developer mode on ("Load
unpacked"). A first build takes about five minutes; watch rebuilds take
seconds.

## How it works

**Redbelly is a built-in custom network.** Rabby has two kinds of chain.
Integrated chains are DeBank's: balances, gas, transaction parsing and
simulation all come from DeBank's servers, which do not index Redbelly - on
that path the signing screen fails with "No gas level available". Custom
networks are RPC-only: everything comes from the node. Both Redbelly
networks are written into the custom-network store on every start
(`background/service/customTestnet.ts`, `constant/redbelly-chains.ts`),
cannot be removed, and nothing about a Redbelly transaction is sent to
DeBank.

**Redbelly-only** (`REDBELLY_ONLY` in `constant/redbelly.ts`). DeBank's chain
list stays in the internal store, because much of Rabby looks Ethereum up by
enum, but no picker shows it and the dApp provider refuses it
(`utils/redbelly/allowlist.ts`, `background/service/permission.ts`,
`background/controller/provider/controller.ts`):

- a new site starts on Redbelly Mainnet;
- `wallet_switchEthereumChain` / `wallet_addEthereumChain` to any other chain
  return 4901;
- typed data whose domain names another chain is refused;
- `net_version` is answered locally (Redbelly nodes do not implement it).

**The signing gate** (`views/Approval/components/SignTestnetTx/`). The payee
is decoded locally from `to` and calldata - an ERC-20 `transfer` or
`transferFrom` pays the address inside the calldata, not the token contract
(`utils/redbelly/recipient.ts`, shared with the Snap). The Sign button stays
disabled:

- while the recipient check is running;
- if the recipient is a confirmed unregistered account (US12);
- if the signer is a confirmed unregistered account, which the node would
  reject with -32603 after signing.

A check that cannot complete (`UNKNOWN`) is shown as a warning but does not
block: Redbelly has one public endpoint, and an outage must not brick the
wallet. Contracts are shown neutrally - every deployed contract reports
`isAllowed == false`.

**Fees.** Every gas tier is the node's own `eth_gasPrice`; Rabby's 110-125%
markup for custom networks is removed, so the quoted fee is the charged fee.
Dollars come from the on-chain `gasfees` peg (US$0.01 per 21,000 gas).

**Balances, tokens, stake, activity.** All read from Redbelly, never zero
when unknown:

| What | Source |
| --- | --- |
| RBNT balance, own KYC status | node: `eth_getBalance`, permission `isAllowed` |
| RBNT/USD | registry `pricefeed` contract, `getLatestPrice()` (stale > 24h = no figure) |
| Tokens | default list (Reddex's tokens) + Routescan holdings discovery |
| Stake | Reddex RBNT pools: `userInfo`, `getReward`, `getAvailalbeUnstakeAmount`, `getStakeUnlockTimes`, APR from `getCurrentAllocPoint` |
| Activity | Routescan explorer API (Mainnet); this wallet's own sends (Testnet) |

## Contracts and endpoints

| | Mainnet (151) | Testnet (153) |
| --- | --- | --- |
| RPC | `https://governors.mainnet.redbelly.network` | `https://governors.testnet.redbelly.network` |
| ContractsRegistry | `0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5` | same |
| permission (via registry) | `0xcb385cd9...9a163` | `0x519ba1b4...5b690` |
| gasfees (via registry) | `0x292cc6d7...b4a33` | same |
| pricefeed (via registry) | `0x0cd42d82...aead4` | `0xbf207257...8039a` |
| RBNT 365-day pool (15%) | `0x5E8040e85D0E6363D798a43BEa939C026449946d` | - |
| RBNT flexible pool (6%) | `0x43A1dc107BBb06dF266278056055AE7Fc5bd2817` | - |
| Explorer | `redbelly.routescan.io` | `redbelly.testnet.routescan.io` |

Registry-held addresses are resolved at runtime, never hardcoded. The pool
addresses and ABI were recovered from the Reddex frontend and confirmed live
on 2026-10-01; none of these interfaces is documented by Redbelly.

## User stories

| Story | Status in the fork |
| --- | --- |
| US1-US4 recipient verdicts | Done - panel on the signing screen; verified live for Registered, Not registered, Contract |
| US5 nothing off Redbelly | Done - the wallet only serves Redbelly |
| US6/US7 fee in RBNT and USD | Done - exact node gas price, USD from the gasfees peg |
| US8 balance from the node | Done - home card and asset list; unavailable is never shown as 0 |
| US9 own KYC status | Done - home chip, asset list, signing screen |
| US10 no manual network setup | Done - both networks built in |
| US11 token transfer payee | Done - in the fork and the Snap (0.3.0) |
| US12 block unregistered sends | Done - Sign disabled, fail-closed while checking |
| US13 tokens and stake | Done - default tokens + discovery; Reddex pool positions |

## Verified

In Chromium with the built extension (headless Playwright, fresh profiles):
connect; chain switch/add refusal; `net_version`; signing screen verdicts
for a registered account, an unregistered account, a token transfer to an
unregistered payee, and Multicall3, on Mainnet and Testnet; Sign gating;
home, asset list, staking and activity against a live Mainnet staker. 96
Redbelly unit tests; project typecheck clean.

## Not yet done

- **No signed transaction has been broadcast yet.** The test key was
  unfunded and unregistered, so every send stopped at the gate as designed.
  Before a demo, send RBNT and a token from a funded, KYC-registered
  Testnet account, then a Mainnet one.
- Hardware wallets, Safe and WalletConnect signing are untested.
- Rabby's own telemetry (Matomo, GA4, Sentry) and its hourly chain-list sync
  from `static.debank.com` are still on. The account switcher and address
  list still show DeBank's USD totals.
- Settings still lists Rabby features (points, mobile sync, and so on).
- Staking is read-only; stake, unstake and claim happen on Reddex through
  the normal signing screen.
- Testnet activity shows only what this wallet sent: Routescan's Testnet API
  did not answer.
