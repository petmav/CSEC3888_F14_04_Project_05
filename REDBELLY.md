# Redbelly Wallet (Rabby fork)

A browser-extension wallet for Redbelly Network, forked from Rabby v0.94.8
(MIT). It talks only to Redbelly Mainnet (151) and Testnet (153), checks
every recipient against Redbelly's on-chain KYC permission list before
signing, and makes the user acknowledge the risk before signing to a
confirmed unregistered account.

This is the fork deliverable of CSEC3888 P5. The MetaMask Snap in
`redbelly-address-snap` remains the assessed baseline. For the narrative
account - why, how, what is and is not checked, and what is left - see
[docs/redbelly-wallet-writeup.md](docs/redbelly-wallet-writeup.md). For
users: [docs/user-guide.md](docs/user-guide.md). For presenting it:
[docs/demo-script.md](docs/demo-script.md), with a demo dApp in
[docs/demo/](docs/demo/index.html).

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

**The signing gate** (`views/Approval/components/SignTestnetTx/`). The address
checked is decoded locally from `to` and calldata
(`utils/redbelly/recipient.ts`, shared with the Snap):

- a token transfer (ERC-20 `transfer`/`transferFrom`, ERC-721 and ERC-1155
  `safeTransferFrom`, `safeBatchTransferFrom`, ERC-677 `transferAndCall`,
  ERC-777 `send`) checks the payee inside the calldata, not the token
  contract;
- an approval (`approve`, `setApprovalForAll`, `increaseAllowance`, EIP-2612
  `permit`) checks the spender, and says that signing lets it spend the
  user's tokens. Revoking one (a zero amount, or `false`) is not warned
  about: it takes a permission away;
- any other contract call checks the contract, and the panel says plainly
  that an address the contract passes funds on to is not checked - a swap
  router's `to` argument, for example. `decreaseAllowance`, Permit2 and
  batching contracts (multicall, Safe) fall here.

The team chose
**warn and confirm, not block** (2026-10-02), matching the Send page:

- while the recipient check is running, Sign waits, so nobody signs before
  the warning appears;
- a confirmed unregistered recipient is shown in red, and Sign stays disabled
  until the user ticks "I understand the risks and want to continue" (US12);
- an unregistered signer gets a warning that the node will reject the
  transaction (-32603), but signing is not held. The exception is the
  registration call itself (`0x33f6cfb2` to the permission contract, the
  "enable wallet" step at access.redbelly.network), which the network accepts
  from an unregistered account: the panel explains it instead of warning
  (`utils/redbelly/registration.ts`).

The Send page applies the same verdict to the recipient field before the user
gets this far.

A check that cannot complete (`UNKNOWN`) is shown as a warning and does not
hold signing: Redbelly has one public endpoint, and an outage must not brick the
wallet. A failed read is retried once first (`utils/redbelly/transport.ts`).
Contracts are shown neutrally - every deployed contract reports
`isAllowed == false`.

**Familiarity** (`utils/redbelly/familiarity.ts`), a local stand-in for the
phishing checks this build drops. The wallet's known addresses are its own
accounts, the address book, and everyone it has paid on Redbelly (local
history, plus Mainnet history from Routescan - only transactions the account
signed, since the explorer's token list would otherwise let a scammer's
zero-value `transferFrom` plant the lookalike). A payee not among them gets a
"first time" note, or, if the history could not be read, a note saying so; one that shares the first and last four hex characters
with a known address but is not it - address poisoning - is shown in red and
holds Sign for "I understand the risks", on the signing screen and the Send
page alike.

**RPC.** The built-in networks ignore custom RPCs in this build
(`isPinnedRedbellyRpc`), so the KYC check and the broadcast always use the
same canonical node.

**Fees.** Every gas tier is the node's own `eth_gasPrice`; Rabby's 110-125%
markup for custom networks is removed, so the quoted fee is the charged fee.
Dollars come from the on-chain `gasfees` peg (US$0.01 per 21,000 gas).

**Gas limit.** The gas limit is the node's estimate times a multiplier that
starts at 1.1x and can be changed in Settings > Gas Limit Multiplier (presets,
or a custom value from 1 to 3 under Advanced). Unused gas is not charged, but
the balance check needs `limit x price + value`, so Rabby's old 1.5x blocked
accounts holding less than 1.5 times the fee. Raise it for contract calls
whose gas varies between estimate and execution.

**Balances, tokens, stake, activity.** All read from Redbelly, never zero
when unknown:

| What | Source |
| --- | --- |
| RBNT balance, own KYC status | node: `eth_getBalance`, permission `isAllowed` |
| RBNT/USD | registry `pricefeed` contract, `getLatestPrice()` (stale > 24h = no figure) |
| Tokens | default list (Reddex's tokens, logos bundled from Reddex in `_raw/images/redbelly-tokens/`) + Routescan holdings discovery |
| Stake | Reddex RBNT pools: `userInfo`, `getReward`, `getAvailalbeUnstakeAmount`, `getStakeUnlockTimes`, APR from `getCurrentAllocPoint` |
| Activity | Routescan explorer API (Mainnet); this wallet's own sends (Testnet) |

**Display currency.** Every Redbelly value - home total, RBNT price, fees,
token rows, stake - is shown in the user's chosen currency. Tap the currency
chip on the home card to cycle USD, AUD, EUR, GBP, SGD, JPY; Settings >
Currency has the full list. It is Rabby's own currency setting, so both are
the same switch. Prices are in US dollars on chain; conversion uses Rabby's
currency rate list.

**Account totals.** The account switcher and address list use the same
Redbelly total as the home card (`utils/redbelly/portfolio.ts`) instead of
DeBank's cross-chain figure.

## Look and feel

Dark by default (Settings > Theme still switches), with Redbelly's brand
red (#FF4646, from redbelly.network) in place of Rabby's blue: a red banner
on the home page, red buttons and accents, near-black backgrounds, and the
team's Redbelly logo in place of Rabby's artwork. The palette lives in
`src/constant/theme-colors.js`. Rabby also hardcodes its blues in hundreds
of styles and icons; `scripts/redbelly-restyle.py` rewrites those and must
be re-run after merging a new Rabby release (it is safe to run repeatedly).

## Privacy

A KYC-gated network's wallet should not tell third parties who its users
are or what they do. In the Redbelly-only build:

- Rabby's analytics (Matomo, GA4, DeBank stats) are off regardless of the
  preference, the Matomo page-view script is removed from every page, and
  Sentry is disabled.
- A network guard (`utils/redbelly/networkGuard.ts`, imported first in the
  background, UI and offscreen entry points) refuses `fetch`, XHR, beacon,
  WebSocket and EventSource requests to DeBank, Rabby, Hyperliquid, Google
  Analytics and Sentry, and does not load images from them (they would
  reveal the user's IP address). Every call site upstream adds later is
  covered without changes. The single exception is the currency rate list,
  which carries no user data; Settings > Currency shows each currency's
  symbol instead of DeBank's flag images.
- The guard patches the browser APIs rather than being enforced by the
  browser, so it covers code that runs after it - which is why it is the
  first import. Images that reach the page another way - `innerHTML`, CSS
  `url()`, SVG `<image>` - are not covered. A blocked image fails to load, so
  the UI's placeholder icon shows.
- The hourly DeBank chain sync, default-RPC sync, CEX labelling, uninstall
  survey URL and Perps connections do not start.

Verified by recording every request the extension made through onboarding,
home, assets, connect, signing, history and settings: the only third-party
data requests were Redbelly's RPC, Routescan and the currency list.

**What this costs.** Stock Rabby protects signing with services this build
does not call:

- the security engine's origin rules (known phishing sites, new or flagged
  dApps) query Rabby's API and are dropped;
- Redbelly transactions take the custom-network path, which has no
  simulated balance changes and no DeBank risk preview.

What remains on the signing screen is the Redbelly KYC check, with the
checked address in full - for a contract call, only the contract. Say so in demos and user docs: the wallet does not
warn about a phishing site.

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
| US12 unregistered sends | Done as warn-and-confirm (team decision): Sign waits for "I understand the risks"; also waits while checking. The Week 5 client request was a hard block - confirm the change with the client |
| US13 tokens and stake | Done - default tokens + discovery; Reddex pool positions |

## Community feedback

A Redbelly community member (Buffy, Discord, Sep-Oct 2026) reported these
from MetaMask Mobile:

| Report | In this wallet |
| --- | --- |
| After claiming staking rewards, the token view showed 0 RBNT; only the Send screen showed the real 5,310 | Balances are read from the node every time the view opens, and a failed read shows "Unavailable", never 0 (US8) |
| Two "Redbelly Network" entries, one showing 0, with no way to tell which is right | Both networks are built in and cannot be duplicated: a dApp's `wallet_addEthereumChain` for 151/153 is a no-op and other custom networks cannot be added (US10) |
| No $ amount next to RBNT | RBNT and WRBNT are valued at Redbelly's on-chain price feed and USDT/USDC.e at $1, in the asset list, on the Send screen and in the home total. Testnet RBNT has no price |
| 4M+ RBNT staked on Reddex invisible in the wallet | Pool positions are shown (US13) |
| Claim button cut off on mobile | Reddex's layout, not the wallet; passed on to Redbelly |

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
- Hardware wallets, WalletConnect and institutional wallets (Safe, Cobo
  Argus) are hidden (`REDBELLY_HIDE_UNTESTED_ACCOUNTS`) until each has signed
  and broadcast a Redbelly transaction. Safe is not deployed on Redbelly.
- English only: the Redbelly screens are not translated, so the language
  setting is hidden and the locale fixed to English.
- On the Send screen, entering the amount in dollars is offered only when
  the display currency is USD.
- Staking is read-only; stake, unstake and claim happen on Reddex through
  the normal signing screen.
- Testnet activity shows only what this wallet sent: Routescan's Testnet API
  did not answer.
