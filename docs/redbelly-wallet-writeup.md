# Redbelly Wallet: write-up of the Rabby fork

CSEC3888 P5. This is the narrative account of the fork: why it exists, how it
works, what it checks and what it does not, how it was built and tested, and
what is left. The developer reference (build commands, contract addresses,
per-feature notes) is [`REDBELLY.md`](../REDBELLY.md), the end-user guide is
[`user-guide.md`](user-guide.md), and the demo walkthrough is
[`demo-script.md`](demo-script.md); the MetaMask Snap in
`redbelly-address-snap/` (on `main`) remains the assessed baseline.

## 1. Summary

Redbelly Wallet is a browser-extension wallet for Redbelly Network, forked
from Rabby v0.94.8 (MIT). It:

- talks only to Redbelly Mainnet (chain 151) and Testnet (153), both built
  in, and refuses every other chain to dApps;
- checks the address a transaction actually pays - decoded from the
  calldata for token transfers and approvals - against Redbelly's on-chain
  KYC permission list before signing, and makes the user tick "I understand
  the risks" before signing to a confirmed unregistered account;
- warns when a recipient imitates an address the user has paid before
  (address poisoning), and notes a first-time payee;
- shows balances, RBNT price, fees, staked RBNT and activity read from
  Redbelly itself, in the user's chosen currency;
- sends nothing about the user to DeBank, Rabby or analytics services.

Status (3 October 2026): every user story US1-US13 is implemented and
verified in a headless browser with an unfunded key. No transaction has yet
been signed and broadcast from a funded, KYC-registered account; that is
the first thing to do before a demo (section 10).

## 2. Background: why Redbelly needs its own wallet

Redbelly is an EVM chain with properties that general-purpose wallets do not
expect. All of these were established empirically during the Snap stage and
are not in Redbelly's documentation:

- **Permissioned accounts.** Only KYC-registered accounts can send. The
  check is `isAllowed(address)` on a permission contract whose address is
  resolved through a ContractsRegistry
  (`0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5`). Funds sent to an
  unregistered account cannot be moved until it registers.
- **Gas priced in US dollars.** A `gasfees` contract pegs gas at about
  US$0.01 per 21,000 gas and converts to RBNT, so fees look large next to
  Ethereum. The node's `eth_gasPrice` is the exact price; there is no
  priority fee.
- **One public RPC endpoint per network**, no WebSocket, no `net_version`.
- **No indexer support.** DeBank, which powers most of Rabby, has no
  Redbelly balances, history or transaction parsing.

A Redbelly community member's reports from MetaMask Mobile (balance showing
0 after claiming rewards, duplicate network entries, no dollar values,
staked RBNT invisible) and the client's priority - stop users paying
unregistered addresses - set the scope.

The MetaMask Snap addressed the priority within MetaMask's limits: it shows
the verdict on the confirmation screen, but a Snap can only annotate, never
hold, a confirmation (MetaMask's `critical` severity did not raise a modal in
testing). Holding a signature requires owning the wallet, hence the fork.

## 3. Why Rabby, and the path through it

Rabby was chosen over a MetaMask fork because it is MIT licensed, its
signing screen is its own React code, and it already supports custom
networks. Rabby has two kinds of chain:

| | Integrated (DeBank) chains | Custom networks |
| --- | --- | --- |
| Balances, gas, parsing | DeBank servers | The chain's RPC |
| Signing screen | `SignTx` (needs DeBank's parse and gas market) | `SignTestnetTx` |
| Redbelly | Not indexed: signing fails with "No gas level available" | Works |

DeBank does list Redbelly in its portfolio product, but its wallet APIs do
not serve it. The team chose the RPC path (2 October 2026): Redbelly is a
built-in custom network, and nothing about a Redbelly transaction goes to
DeBank. A teammate's work on the DeBank path (PR #1) was merged; its
DeBank-independent parts (the corrected `isAllowed` decoding, gas price
reads, the Send page's verdict, fee and sender rows) were kept, and its
DeBank-path signing components were set aside.

## 4. Architecture

```
constant/redbelly*.ts      chain ids, endpoints, registry keys, tokens, pools, flags
        |
utils/redbelly/*.ts        pure logic, no I/O: verdict, recipient decoding,
        |                  familiarity, fees, price, staking, explorer rows,
        |                  allowlist, network guard, JSON-RPC transport
        |
background/service/        redbelly.ts: every chain read, with timeouts and
        |                  caches; customTestnet.ts: built-in networks, tokens
background/controller/     wallet.ts exposes getRedbelly* to the UI;
        |                  provider/controller.ts enforces the chain allowlist
        |
ui/state, ui/hooks         recipient-check store, useRedbellyTxGate,
        |                  useRedbellyCurrency, useAddressRisks
ui/views                   signing panel, Send page rows, home card,
                           asset list, staking, history, settings
```

Two rules shape the code. Pure logic lives in `utils/redbelly/` so every
decision is unit-tested without a network, a browser or a wallet. And the
fork is switched by one flag, `REDBELLY_ONLY` in `constant/redbelly.ts`:
Rabby's own behaviour is preserved behind it, so features can be re-enabled
one at a time.

### A dApp transaction, end to end

1. **Provider** (`background/controller/provider/controller.ts`). The chain
   is normalised (hex or decimal) and checked against the allowlist;
   anything other than 151/153 is refused with 4901. `wallet_addEthereumChain`
   cannot replace Redbelly's endpoint.
2. **Approval.** The transaction reaches `SignTestnetTx`, Rabby's
   custom-network signing screen.
3. **Gate** (`useRedbellyTxGate`). The address to check is decoded locally
   (`utils/redbelly/recipient.ts`): `to` for a plain send; the payee for a
   token transfer (ERC-20, ERC-721, ERC-1155, ERC-677, ERC-777); the spender
   for an approval or permit; the contract for any other call. A revoke is
   a call, not an approval.
4. **Checks** (`background/service/redbelly.ts`). `eth_getCode` and
   `isAllowed` give the verdict: Registered, Not registered, Contract, or
   Unknown when the node does not answer. In parallel the gate reads the
   user's known addresses (own accounts, address book, past payees from
   local history and the explorer) for the familiarity check.
5. **Decision.** Sign waits while either check is running. A confirmed
   unregistered recipient, or a lookalike of a known address, holds Sign
   until the user ticks "I understand the risks"; the tick belongs to that
   recipient and chain only. Unknown and Contract do not hold signing. If
   the user's history could not be read, the panel says so rather than
   calling the payee new.
6. **Broadcast** goes to the same canonical endpoint the checks used.

## 5. What the wallet does, by user story

| Story | In the wallet |
| --- | --- |
| US1-US4 recipient verdicts | Panel on the signing screen and the Send page: Registered, Not registered, Contract, Unknown, with the checked address in full |
| US5 Redbelly only | Other chains hidden in the UI and refused at the provider |
| US6/US7 fees | The node's exact gas price (Rabby's custom-network markup removed); dollar value from the on-chain peg |
| US8 balances | Read from the node each time; a failed read shows "Unavailable", never 0 |
| US9 own KYC status | Home chip, asset list, signing screen; an unregistered sender is warned that the node will reject the transaction |
| US10 no setup | Both networks built in, rewritten on every start, not removable or duplicable |
| US11 token payee | Payee decoded from calldata, in the wallet and the Snap |
| US12 unregistered recipient | Warn and confirm: Sign waits for "I understand the risks" (team decision; the client's Week 5 ask was a hard block - see section 10) |
| US13 tokens and stake | Reddex's tokens listed with logos, plus discovery from the explorer; Reddex staking pool positions |

Beyond the stories:

- **Address-poisoning and first-time checks**, from the wallet's own data,
  on the signing screen and the Send page.
- **Display currency.** Every Redbelly value follows Rabby's currency
  setting; a chip on the home card cycles USD, AUD, EUR, GBP, SGD and JPY.
- **History.** Mainnet activity, incoming included, from Redbelly's explorer
  (Routescan); an explorer error shows as unavailable, not as "no activity".
- **A narrower product.** Hardware, mobile (WalletConnect) and institutional
  wallets are hidden until each is tested on Redbelly; the interface is
  English only, because the Redbelly screens are not translated; the
  styling is Redbelly's (dark, red accents).

## 6. Security model

**What is checked.** The address a transaction pays or approves, against
Redbelly's permission list, and against the addresses the user already
knows. The address is shown in full, because a shortened address hides
exactly the characters a typo or a poisoned lookalike changes.

**What holds signing.** A check still running; a confirmed unregistered
recipient; a lookalike. Each needs a fresh "I understand the risks" for that
recipient on that chain.

**What deliberately does not hold signing.**

- *Unknown.* Redbelly has one public endpoint and no failover; holding on a
  failed check would make an outage indistinguishable from a bricked
  wallet. Unknown is shown prominently instead, and a failed read is retried
  once before it counts.
- *Contract.* No contract is ever KYC-registered, so warning on contracts
  would fire on every dApp interaction and teach users to click through.
- *Unregistered sender.* The node rejects the transaction itself; the panel
  says why beforehand.

**Threats and coverage.**

| Threat | Covered by |
| --- | --- |
| Paying an unregistered account (funds stuck) | KYC verdict, risk tick |
| Wrong recipient inside a token transfer | Calldata decoding (US11) |
| Address poisoning (lookalike in history) | Familiarity check, risk tick. Only payees of transactions the user signed count as known, so a scammer's zero-value `transferFrom` cannot make the lookalike "known" |
| dApp switching the wallet to another chain | Provider allowlist (4901) |
| dApp replacing Redbelly's RPC | `wallet_addEthereumChain` ignored for 151/153; custom RPCs ignored for the built-in networks, so the check and the broadcast use the same node |
| Funds forwarded by a contract to an unregistered account | **Not covered.** The panel says only the contract was checked |
| Phishing site, malicious dApp | **Not covered.** Rabby's security engine rules query Rabby's servers and are dropped; there is no transaction simulation on the custom-network path |

**Rabby's own invariants** (approval ids, fail-closed signing, lock and
account-switch boundaries) are untouched; the fork adds a gate in front of
Rabby's signing screen and does not change how approvals resolve.

## 7. Privacy

A wallet for a KYC-gated network should not tell third parties who its users
are. In the Redbelly build analytics (Matomo, GA4, DeBank stats) and Sentry
are off, DeBank and Rabby background syncs do not start, and a network guard
imported first in every extension context refuses requests to DeBank,
Rabby, Hyperliquid, Google Analytics and Sentry - `fetch`, XHR, beacons,
WebSockets, EventSource and images. The one exception is Rabby's currency
rate list, which carries no user data. Recording every request through
onboarding, home, assets, connect, signing, history and settings showed only
Redbelly's RPC, the Routescan explorer and the rate list. The guard is
monkey-patching, not browser enforcement; its limits are listed in
`REDBELLY.md`.

## 8. Quality

- **Unit tests.** The Redbelly suites (`__tests__/redbelly/`) cover the
  decision logic and the signing gate itself: verdicts, calldata decoding
  (including dirty and truncated words and revokes), familiarity, fees,
  price and staking decoding, explorer responses and payees, the transport's
  retry, the network guard and the chain allowlist. The gate tests check
  every render, not just the settled one; a mutation check (keying the
  acknowledgement to nothing but a reset effect) makes them fail, as it
  should.
- **Browser verification.** A headless Chromium harness loads the built
  extension and drives a local dApp: connect, chain refusal, signing verdicts
  for registered, unregistered, token-transfer and contract transactions on
  both networks, approvals and unknown contract calls on Mainnet, and the
  home, asset, staking, history and settings screens.
- **CI** (GitHub Actions, `.github/workflows/ci.yml`): lint, typecheck,
  Redbelly tests (required), Rabby's full suite (informational - upstream
  already fails three suites), and the production build, uploaded as an
  installable artifact. A `v*` tag publishes a GitHub Release. The Snap has
  its own workflow on `main`.
- **Branch protection.** `rabby-fork` and `main` take changes only through
  pull requests whose checks pass.
- **Review.** Each pull request was reviewed by independent reviewers split
  by concern (security, correctness, CI, Snap); their findings - a revoke
  treated as a grant, missing selectors, image fallbacks, a test that did not
  prove its claim - were fixed before merging.

## 9. How it was delivered

| Date | Change |
| --- | --- |
| 18 Sep | Rabby v0.94.8 imported; Redbelly chain support and the KYC and fee read layer |
| 1 Oct | All user stories on the RPC path; currency, privacy guard, styling |
| 2 Oct | PR #1 (teammate's Send page work) merged; PR #2 Redbelly-only wallet on the RPC path; PR #3 CI that runs on github.com; PR #4 Snap CI and Snap 0.3.0 |
| 3 Oct | PR #5 review follow-ups (approvals, NFT payees, gate tests, explorer errors, guard coverage); PR #6 Snap 0.4.0; PR #7 MVP polish (account types, address poisoning, token logos, English only, currency on Send, RPC pinning and retry) |

Decisions on record: the RPC path over DeBank (2 Oct); warn and confirm over
a hard block (2 Oct, pending client confirmation); hide untested account
types rather than ship them untested (3 Oct).

## 10. Limitations and next steps

Before a demo:

1. **Broadcast for real.** Send RBNT and a token from a funded,
   KYC-registered Testnet account, then on Mainnet.
2. **Confirm US12 with the client.** Switching to a hard block is a one-line
   change in `utils/redbelly/verdict.ts`.

Known limitations:

- No phishing-site warnings and no transaction simulation (section 6).
- Hardware, mobile and institutional wallets are hidden until tested; Safe
  is not deployed on Redbelly.
- Staking is read-only; staking and claiming happen on Reddex.
- Testnet history shows only this wallet's own sends.
- One public endpoint per network: an outage shows checks as Unknown.
- English only.

Later: re-enable account types as each is tested; a plan for pulling in
Rabby's upstream security fixes; translations; staking actions in the
wallet.
