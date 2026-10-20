# Demo script: Redbelly Wallet

About 10 minutes. Shows the problem, then each check the wallet adds. Steps
2-5 were rehearsed in a browser against the current build; the expected
results below are what the wallet showed.

## Before the demo

- **Browser:** Chrome with the wallet loaded from the latest release (see
  [user-guide.md](user-guide.md)), other wallet extensions disabled, and a
  password set.
- **Demo account:** an account imported in the wallet. A KYC-registered
  account makes the "Your account" row green; an unregistered one shows the
  sender warning, which is also worth showing. For step 6 (a real send) it
  must be registered and hold some Testnet RBNT.
- **Demo dApp:** serve it locally - extensions do not inject into `file://`
  pages:

  ```sh
  cd docs/demo
  python -m http.server 8000
  ```

  then open <http://localhost:8000>. **On every signing screen press Cancel**
  unless the step says to sign.
- **Window layout:** the dApp tab on the left, room on the right for the
  wallet's signing window.
- **Fallback:** if Redbelly's node is down, the checks show *Could not
  verify*. That is itself step 5, so carry on and say so.

Addresses the dApp uses (public, with known verdicts):

| | Address | Verdict |
| --- | --- | --- |
| Registered account | `0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af` | Registered on both networks |
| Unregistered account | `0x000000000000000000000000000000000000dEaD` | Not registered |
| Contract | `0xcA11bde05977b3631167028862bE2a173976CA11` (Multicall3) | Contract address |
| Token | `0x8201c02d4ab2214471e8c3ad6475c8b0cd9f2d06` (USDC.e, Mainnet) | - |

## 1. The problem (1 min, no screen)

> On Redbelly, only identity-verified accounts can transact. Send funds to an
> unverified address and they are stuck - nobody can move them until that
> address completes KYC, and there is no undo. General wallets don't know
> this. Our MetaMask Snap shows a warning, but a Snap can't stop you signing.
> So we forked Rabby, an open-source wallet, into a Redbelly-only wallet that
> can.

## 2. A wallet that only speaks Redbelly (1.5 min)

1. Open the wallet. Point at the **Redbelly portfolio** card, the **KYC
   chip**, and **Available / Staked + rewards**: everything is read straight
   from a Redbelly node, and RBNT is priced from Redbelly's on-chain feed.
2. Tap the currency chip: **USD -> AUD**. Every figure converts.
3. In the dApp click **Connect** and approve. Log: `chainId 0x97` (151,
   Redbelly Mainnet).
4. Click **Try to switch to Ethereum**. Log: *error 4901 ... This wallet only
   connects to Redbelly Network*.

> A dApp can't drag the user onto another chain or swap in its own network
> settings.

## 3. Who are you paying? (3 min)

Section 2 of the dApp. For each, point at the **Redbelly checks** panel.

1. **To a registered account** -> *Paying*, **Registered** (green). Sign is
   available.
   > Registered means a verified person controls it - not that it's the
   > person you meant. That's why the full address is shown, not 0x12...ab.
2. **To an unregistered account** -> **Not registered** (red), *Signing is
   blocked*, and **Sign stays disabled** - there is no tick box. Cancel.
   > This is the capability a Snap doesn't have: the wallet refuses the
   > signature. An account outside the network can't spend what it is sent,
   > so there is nothing for the user to accept.
3. **Call a contract** -> *Calling*, **Contract address** (grey), and the
   orange note *Only the contract above was checked*.
   > Contracts are never KYC-registered, so a warning there would fire on
   > every dApp and train people to click through. Instead it says plainly
   > what it couldn't check.

## 4. Tokens and approvals (2 min)

Section 3 of the dApp.

1. **Transfer to an unregistered account** -> *Paying (token transfer)*,
   **Not registered**, with the token contract named underneath.
   > The transaction's `to` is the token contract. A naive check says
   > "contract, fine". The wallet reads the real recipient out of the
   > calldata.
2. **Approve an unregistered spender** -> *Approving (can spend your
   tokens)*, Not registered, with an approval-specific warning.
3. **Revoke that approval** -> no warning: revoking takes a permission
   away, so the spender isn't a risk.

## 5. Address poisoning, and when Redbelly is down (1.5 min)

1. Section 4: **Pay a lookalike of my address**. The log shows the fake
   address: same first and last four characters as yours. The panel shows,
   in red, *This address looks like 0x..., which you have used before - but
   it is a different address*, and Sign waits for the tick.
   > Scammers send you a tiny amount from a lookalike so it sits in your
   > history, hoping you copy it next time. This check runs entirely on the
   > wallet's own data - nothing about who you pay is sent anywhere.
2. *(Optional)* If the node is slow or unreachable, the result is **Could
   not verify** (orange). Signing is allowed: Redbelly has one public node,
   and an outage shouldn't brick the wallet. The wallet retries once first.

## 6. A real transaction (1 min, Testnet, only with a funded registered account)

1. In the dApp click **Use Redbelly Testnet (153)**.
2. Click **To a registered account**: Registered, *Your account* registered,
   network fee shown in RBNT and your currency.
3. **Sign**. The log shows `sent 0x...`. Open **Transactions** in the
   wallet, or the hash on `redbelly.testnet.routescan.io`.

> Fees look big in RBNT but Redbelly pegs them to US cents - the wallet shows
> both.

## 7. Wrap-up (30 s)

> - Redbelly only: built-in networks, other chains refused.
> - Every payment checked against Redbelly's KYC list before signing, with
>   the real recipient decoded from token transfers and approvals.
> - Unregistered recipients are refused; address-poisoning lookalikes need
>   an explicit "I understand the risks".
> - No data to third parties.
> - What it doesn't do: no phishing-site warnings or transaction simulation,
>   and funds a contract forwards on aren't checked.

## Likely questions

- **Why block outright instead of warning?** It is what the client asked
  for. Nobody can spend from an account that is not on the permission list,
  so a payment there is lost until its owner registers. A failed check
  (*Could not verify*) is not blocked, so an outage doesn't brick the
  wallet.
- **Why fork Rabby, not MetaMask?** MIT licensed, its signing screen is its
  own code, and it already supports RPC-only networks. MetaMask Snaps can
  annotate a confirmation but not hold it.
- **Where does the KYC data come from?** Redbelly's on-chain permission
  contract (`isAllowed`), found through Redbelly's ContractsRegistry and
  read with a plain `eth_call`.
- **What about hardware wallets?** Hidden until each has been tested on
  Redbelly.
