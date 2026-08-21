# Redbelly Address Check

A MetaMask Snap that warns you, before you sign, whether a transaction's
recipient is on Redbelly Network's on-chain KYC permission list.

Redbelly requires every participant to complete identity verification, and
records approved addresses in an on-chain permission contract. That makes it
one of the few blockchains where "does this address belong to a real
participant?" is a question with an answer — so a typo'd recipient can be
caught before funds are sent somewhere unrecoverable.

## What it shows

On any transaction on Redbelly Mainnet (chain 151) or Testnet (153), the
confirmation screen gains an insight panel with one of four verdicts:

| Verdict              | Meaning                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Registered**       | The recipient completed Redbelly identity verification.                                    |
| **Not registered**   | Not on the permission list. Nobody can spend funds sent there.                             |
| **Contract address** | Deployed bytecode. The permission list covers user accounts, so no identity check applies. |
| **Could not verify** | The check did not complete. Explicitly _not_ a pass.                                       |

It also states the network fee in RBNT alongside its US dollar equivalent,
because Redbelly prices gas in USD and the resulting RBNT figures look alarming
to anyone used to Ethereum.

The Snap's home page (click it in MetaMask's Snaps list) shows your balance on
both Redbelly networks, read straight from the chain rather than from
MetaMask's cache.

## Requirements

**MetaMask Flask**, not regular MetaMask. Two reasons: local Snaps can only be
installed in Flask, and this Snap uses `endowment:network-access`, which is a
protected permission requiring MetaMask allowlisting before it can install in
the stable extension.

Flask conflicts with regular MetaMask — use a separate browser profile.

## Running it

Dependencies are installed with the Yarn release vendored in `.yarn/releases`,
so nothing needs to be installed globally:

```bash
node .yarn/releases/yarn-3.2.1.cjs install
```

If that fails at a lifecycle script calling `yarn` by name, the install has
still completed — the failing step is a lint helper, not the dependency graph.

Then, in two terminals:

```bash
# serves the snap on :8080
cd packages/snap
../../node_modules/.bin/mm-snap watch
```

```bash
# the dapp that installs it, on :8000
cd packages/site
../../node_modules/.bin/gatsby develop
```

Open `http://localhost:8000` and click **Connect**. Flask prompts for four
permissions. After changing Snap code, click **Reconnect** — and verify the
change actually landed before drawing conclusions from behaviour, because
MetaMask caches installed Snaps. If a reconnect will not take, remove the Snap
in Flask (Settings → Snaps) and install again.

## Tests

```bash
cd packages/snap
../../node_modules/.bin/jest
```

The suite requires `dist/bundle.js` to exist, because the `@metamask/snaps-jest`
preset starts a server against it. Run `mm-snap build` first if tests fail with
"Did you forget to build your snap?"

## Layout

| File              | Responsibility                                            |
| ----------------- | --------------------------------------------------------- |
| `src/index.tsx`   | The `onTransaction` handler; wires everything together    |
| `src/redbelly.ts` | Registry resolution, `isAllowed`, balances, ABI encoding  |
| `src/verdict.ts`  | Pure decision logic — chain facts to one of four verdicts |
| `src/fees.ts`     | Fee maths, from transaction fields only                   |
| `src/ui.tsx`      | Verdict to panel                                          |
| `src/home.tsx`    | The `onHomePage` balance screen                           |
| `src/format.ts`   | RBNT/USD/address formatting                               |

`verdict.ts` and `fees.ts` are pure and do no I/O, which is what makes every
outcome testable without a wallet or a network.

## The gotcha that will bite you

**Do not use `endowment:ethereum-provider` to read the chain a transaction is
on.** It is not connected to that chain. While confirming a transaction on
Redbelly Testnet (153), the provider answered `eth_chainId` with `0x1` —
Ethereum Mainnet — so every read silently returned answers about the wrong
blockchain. Nothing throws; you simply get confidently wrong results.

The `chainId` argument passed to `onTransaction` is the only authoritative
source for the target chain. This Snap therefore uses
`endowment:network-access` and picks its own endpoint from that argument.

This cost us an afternoon. It is not in MetaMask's documentation.

## Known limitations

1. **It warns; it cannot block.** We set `severity: "critical"`, which
   MetaMask's docs claim raises a modal. Tested against a permissioned, funded
   account with the flag verified present in the running bundle: no modal
   appears. A hard block requires forking the extension.
2. **Only `transaction.to` is checked.** On an ERC-20 transfer that is the
   token contract, not the person being paid, so it shows the neutral contract
   panel. Decoding `transfer(address,uint256)` is the obvious next step.
3. **"Registered" does not mean "intended."** It proves some verified person
   controls the address, not that it is the right one. A typo landing on
   another registered address still loses funds.
4. **Permission and gas-fee contract semantics are empirical.** These contracts
   are unverified and undocumented; their ABIs were recovered from the access
   dApp's bundles and confirmed by live calls. Confirm with Redbelly before
   relying on them.

## Where the USD figure comes from

Redbelly's gas price is pegged to US dollars, and the peg is read live from the
on-chain `gasfees` contract rather than hardcoded:

```
getBaseGasFee() -> (uint256 value, string currency, uint8 decimals)
                =  (10000, "USD", 6)  =  US$0.01
```

That is the price of one **base transaction of 21,000 gas**, not a per-gas
price, so the per-gas figure is `0.01 / 21000`. The signature is undocumented;
it was recovered from the access dApp bundles and verified against both
networks. The currency field is checked rather than assumed — if it ever
reports something other than `USD`, the Snap omits the dollar figure instead of
mislabelling it, and the RBNT amount (which comes from the transaction itself)
is shown alone.

## Before publishing

- `endowment:network-access` needs MetaMask allowlisting for stable MetaMask.
- `mm-snap manifest` runs on `prepublishOnly`; the manifest shasum must match
  the built `dist/bundle.js` at publish time.
