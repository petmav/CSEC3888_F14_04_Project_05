# Redbelly Address Check — MetaMask Snap Design

**Date:** 2026-08-13
**Status:** approved, implementation started
**Related:** `FINDINGS.md` §1.4 (permission registry), §2.3 (integration options), §2.4 (extensibility map)

---

## 1. Purpose

The client's primary objective, stated in the week-2 kickoff, is a wallet that
**validates the destination address before a transaction is issued**:

> "by cross-checking that the destination address you're trying to send money to is an
> existing permission address of the Redbelly network, you're drastically reducing the
> risks of making a mistake and sending your money into the void."
> — Vincent Gramoli, 25:29

"Exists" here has a precise, queryable meaning: the address is on Redbelly's on-chain
KYC/permission list. This is checkable with a single public `eth_call` to
`isAllowed(address)` — no API key and no IP whitelisting, contrary to the concern raised
at 26:18. See `FINDINGS.md` §1.4.

This Snap is **Option B** from `FINDINGS.md` §2.3: an in-wallet warning that ships to
real users without maintaining a MetaMask fork.

## 2. Scope

**In scope (first cut):** warn the user, on the transaction confirmation screen, whether
the recipient address is on the Redbelly permission list.

**Explicitly out of scope:**

- Blocking the transaction. A Snap cannot. `severity: "critical"` is Flask-only, and the
  redesigned confirmation UI does not wire Snap warnings into the blocking-alert system
  (§2.3). Hard blocking requires the fork.
- Fixing the balance display or gas estimation. Outside Snap reach entirely (§2.4).
- Checking the sender's permission status. Deferred; valuable but a separate concern.

## 3. Design decisions

| Decision                    | Choice                                                                                           | Rationale                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chain access                | `endowment:network-access`, endpoint chosen from the `chainId` handler parameter                 | **Revised after live testing — see below.**                                                                                                                                                                                                                   |
| Permission contract address | Resolved at runtime from registry `0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5`, cached per chain | §1.4 warns the contract sits behind a mutable registry and may be redeployed. Costs one extra `eth_call` on the first transaction only.                                                                                                                       |
| Failure behaviour           | **Fail loud** — render an explicit "could not verify" panel                                      | Silence reads as "checked, all fine". This is precisely the silent-failure flaw §2.1 documents in MetaMask's balance pipeline; we should not reproduce it. Redbelly has a single public RPC endpoint with no failover, so this case will occur in practice.   |
| Contract recipients         | Neutral panel, not a warning                                                                     | Contracts never complete IDV, so `isAllowed` returns `false` for every legitimately-deployed contract (confirmed live against Multicall3). Without this branch, every ERC-20 transfer would raise a false alarm and train users to click through the warning. |

### 3.1 Revision: why not `endowment:ethereum-provider`

The original design used the wallet's own provider, on the reasoning that it
needs no hardcoded URL and automatically follows the user's configured
endpoint — including any caching proxy the team later deploys.

**That reasoning was wrong, and live testing disproved it.** While MetaMask was
confirming a transaction on Redbelly Testnet (chain 153), the Snap's `ethereum`
global answered `eth_chainId` with `0x1` — Ethereum Mainnet. Every call landed
on the wrong chain: `eth_getCode` correctly returned `0x` for an address that
has no code on Ethereum, and the registry `eth_call` returned `0x` because the
ContractsRegistry does not exist there. The address decode then failed and the
panel reported `UNKNOWN` for an address that is demonstrably registered.

**A transaction-insight Snap cannot assume the `ethereum` provider is connected
to the chain the transaction targets.** This is why `onTransaction` receives
`chainId` as a parameter: it is the only authoritative source for the target
chain. Any Snap reading chain state to judge a pending transaction must use
`endowment:network-access` and select its own endpoint.

Consequences accepted:

- Two endpoint URLs are hardcoded (`rpcUrlFor`), so a Redbelly endpoint change
  requires a Snap release.
- The Snap no longer inherits the user's configured RPC, so a team-run caching
  proxy would not be picked up automatically.
- The Snap sends each recipient address to Redbelly's public node. Not an
  additional disclosure in practice — MetaMask already sends the transaction to
  the same endpoint — but it is now a request the Snap makes on the user's
  behalf, and belongs in any privacy review.

## 4. Behaviour

Trigger: `onTransaction`, on every pending transaction.

Return `null` (render nothing) when:

- `chainId` is not `eip155:151` (mainnet) or `eip155:153` (testnet) — otherwise the Snap
  would render Redbelly warnings on Ethereum
- the transaction has no `to` field (contract creation)

Otherwise resolve to exactly one verdict:

| Condition                    | Verdict          | Panel                                                                |
| ---------------------------- | ---------------- | -------------------------------------------------------------------- |
| `eth_getCode(to) != 0x`      | `CONTRACT`       | Neutral: the permission list applies to user accounts, not contracts |
| `isAllowed(to) == true`      | `REGISTERED`     | Positive: verified Redbelly participant                              |
| `isAllowed(to) == false`     | `NOT_REGISTERED` | Warning: funds sent here cannot be spent by anyone                   |
| any call throws or times out | `UNKNOWN`        | Amber: the check did not complete; this is _not_ a confirmation      |

Order matters: the contract check precedes the permission check, because a contract
returning `isAllowed == false` must not surface as a warning.

## 5. Structure

Four modules, so the decision logic is testable without a browser:

| File              | Responsibility                                                                                                             | Depends on                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `src/redbelly.ts` | Registry resolution, `isAllowed`, `getCode`, ABI encode/decode. Direct port of the proven selectors in `check_address.py`. | the injected provider     |
| `src/verdict.ts`  | Pure function: chain facts → one of four verdicts. No I/O.                                                                 | nothing                   |
| `src/ui.ts`       | Verdict → Snaps JSX panel                                                                                                  | `@metamask/snaps-sdk/jsx` |
| `src/index.ts`    | `onTransaction` handler wiring the above together                                                                          | all three                 |

`verdict.ts` being pure and I/O-free is what makes all four states exhaustively
unit-testable without network access or a wallet.

## 6. Constants

|                                | Mainnet                                      | Testnet                                      |
| ------------------------------ | -------------------------------------------- | -------------------------------------------- |
| CAIP-2 chain ID                | `eip155:151`                                 | `eip155:153`                                 |
| Permission contract (expected) | `0xcb385cd90ca6b219798f57b4a7958897e91a9163` | `0x519ba1b48d571fd92faf6fe4d20fe74ca435b690` |

Registry `0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5` on both. Selectors:
`getContractAddress(string)` = `0x04433bbc`, `isAllowed(address)` = `0xbabcc539`.

The permission addresses above are recorded for test assertions only — production code
resolves them at runtime.

## 7. Testing

### 7.1 Live verification (2026-08-13, MetaMask Flask)

Three of the four states confirmed end-to-end in a real wallet, across both
networks:

| Recipient                             | Network               | Panel shown            |
| ------------------------------------- | --------------------- | ---------------------- |
| `0xfbc7…d1af`                         | Testnet, then Mainnet | Registered on Redbelly |
| `0xfbc7…d1ae` (one character changed) | Mainnet               | Not registered         |
| `0xcA11…6CA11` (Multicall3)           | Testnet               | Contract address       |
| `0x…dEaD`                             | Testnet               | Not registered         |

The one-character variant is the scenario the feature exists for, and it was
caught. Running on both networks also confirms endpoint selection for chain
151 and 153.

**Not yet verified:** the `UNKNOWN` panel, and chain gating (no panel on a
non-Redbelly chain). `UNKNOWN` can no longer be triggered by editing MetaMask's
RPC URL, because the Snap now reaches Redbelly independently of the wallet's
configured endpoint; it needs a build pointed at an unreachable host.

### 7.2 `severity: "critical"` does not raise a modal

We set `severity: SeverityLevel.Critical` on the `NOT_REGISTERED` verdict and
confirmed **no modal appears**, contradicting MetaMask's documentation.

Conditions, chosen to remove the confounds that made two earlier attempts
inconclusive:

- sending account permissioned (`isAllowed == true`) and funded with 94 RBNT,
  so the Confirm button was reachable — an unfunded account wedges the flow
  before any severity handling runs
- the bundle carrying the severity flag verified as loaded, via an unrelated
  visible change shipped in the same build (the fee lines)
- recipient a one-character variant of a registered address, correctly
  reported as unregistered

Untested variable: the transaction came from MetaMask's own send UI rather than
a dapp.

This confirms `FINDINGS.md` §2.3, which reached the same conclusion by reading
the extension source before we could test it, and it means the severity flag
currently buys nothing. It is kept in the code because it is one line, it is
harmless, and it will start working if MetaMask wires the path up.

### 7.3 Fee panel

Verified against the live network: the panel reported `3.7137 RBNT
(US$0.0100)` while MetaMask's own fee row showed ~3.71 RBNT for the same
transaction. The dollar figure lands exactly on the documented one cent for a
21,000-gas transfer, confirming the USD-per-gas constant against the live gas
price.

Unit tests for `verdict.ts` covering all four states, plus `@metamask/snaps-jest` for the
handler. Fixtures are live-verified addresses from our own probes:

| Address                                                          | Expected verdict | Basis                                                                            |
| ---------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af`                     | `REGISTERED`     | live: `isAllowed == true` on both networks                                       |
| `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` (Uniswap V2 router) | `NOT_REGISTERED` | live: no code on Redbelly, `isAllowed == false`                                  |
| `0xcA11bde05977b3631167028862bE2a173976CA11` (Multicall3)        | `CONTRACT`       | live: 3,808 bytes of code on both networks                                       |
| `0x0000000000000000000000000000000000000000`                     | `NOT_REGISTERED` | live: `isAllowed == false`; has absorbed 11.58 RBNT of real mis-sends on mainnet |
| provider throws                                                  | `UNKNOWN`        | injected fake                                                                    |

## 8. Known limitations

1. **Warns, does not block.** By design; see §2.
2. **Checks `to` only.** For an ERC-20 transfer the true recipient sits in calldata and
   the token contract gets the neutral `CONTRACT` panel. Decoding `transfer(address,uint256)`
   is a clean follow-up.
3. **`REGISTERED` does not mean _intended_.** It proves some verified person controls the
   address, not that it is the right one. A typo landing on another permissioned address
   still loses funds, and an attacker could complete IDV on a lookalike address
   (address-poisoning against the allowlist). Pair with an address book and test-sends.
4. **Permission semantics are empirical.** These contracts are unverified and
   undocumented; confirm with the Redbelly team before relying on them in production.

## 9. Follow-on work (no rework required)

- Fee-context panel: read the on-chain `gasfees`/`pricefeed` contracts and render the
  expected RBNT cost, so oracle-pegged gas reads as normal rather than broken (§2.2).
- `onHomePage` (`endowment:page-home`): show a directly-fetched `eth_getBalance` as a
  second opinion when the main UI shows 0 RBNT (§2.1).
- Sender permission check, explaining `-32603` rejections.
