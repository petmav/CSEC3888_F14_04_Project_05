# Redbelly Wallet user guide

Redbelly Wallet is a browser-extension wallet for Redbelly Network. It works
like other Ethereum-style wallets, with one difference that matters on
Redbelly: before you sign, it checks whether the address you are paying is a
verified (KYC-registered) Redbelly participant, and warns you if it is not.

It only works with Redbelly Mainnet and Redbelly Testnet. It is not a
general-purpose wallet.

## 1. Install

Redbelly Wallet is not in the Chrome Web Store. Install it from a release:

1. Download `redbelly-wallet-<version>.zip` from the project's
   [GitHub Releases](https://github.com/petmav/CSEC3888_F14_04_Project_05/releases)
   page and unzip it into a folder you will keep.
2. Open `chrome://extensions` (Chrome, Brave or Edge).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. Pin the extension from the puzzle-piece menu so its icon stays visible.

To update, unzip the new release over the same folder and click the reload
icon on the extension's card. Your accounts are kept.

If you also have MetaMask or another wallet installed, dApps may pick that
one instead. Disable the other wallet while using Redbelly Wallet.

## 2. Set up

Open the extension and choose one of:

- **Create New Address** - makes a new wallet. Write the seed phrase down on
  paper and keep it offline; it is the only way to recover the wallet.
- **Import Seed Phrase** or **Import Private Key** - for an account you
  already have, for example from MetaMask.
- **Watch-only Address** - shows an address's balances without being able to
  sign. Useful for keeping an eye on another account.

You then set a password, which unlocks the wallet on this computer.

Hardware wallets, WalletConnect and Safe are not offered yet; they will be
added once each has been tested on Redbelly.

**To send on Redbelly your account must be KYC-registered.** Complete
identity verification at <https://access.redbelly.network>. Until then you
can receive and view funds, but the network rejects transactions you send.

## 3. The home screen

- **Redbelly portfolio** - the value of everything the account holds on
  Mainnet: available RBNT, staked RBNT and rewards, and priced tokens.
- **Currency chip** (e.g. `USD ⇄`) - tap to cycle USD, AUD, EUR, GBP, SGD
  and JPY. Settings > Currency has the full list. Every value in the wallet
  follows this choice.
- **KYC chip** - *KYC registered* or *NOT registered*: whether this account
  can send on Redbelly.
- **Available / Staked + rewards** - spendable RBNT, and RBNT staked in
  Reddex's pools.
- **Price bar** - the RBNT price from Redbelly's on-chain price feed, and
  the current fee for a simple transfer.

Tap the portfolio card to see each network's RBNT, your tokens and your
stake. **Staking** shows your Reddex pool positions; staking and claiming are
done on [Reddex](https://www.reddex.io/stake). **Transactions** shows your
Mainnet activity, incoming included.

If a figure shows as *Unavailable*, the Redbelly node did not answer. It is
never shown as 0 when it could not be read.

## 4. Sending

1. Tap **Send**, choose the token and enter the recipient and amount.
2. Under the recipient the wallet shows the **Redbelly check** for that
   address (see section 6), your own KYC status and the network fee.
3. If the recipient is not registered, the wallet will not send to it: the
   address is outside the Redbelly Network, and nobody can spend funds sent
   there. If it looks like an address you have used before, you must tick
   **I understand the risks and want to continue** before you can send.
4. Confirm on the signing screen.

**About fees.** Redbelly prices gas in US dollars and converts it to RBNT,
so fees look large in RBNT (several RBNT for a transfer) but are about a cent.
The fee shown is exactly what you pay.

## 5. Using dApps

1. On the dApp, choose to connect a wallet and approve the connection in
   Redbelly Wallet. New sites start on Redbelly Mainnet.
2. When the dApp asks you to sign, the signing screen opens with a
   **Redbelly checks** panel at the top.

A dApp cannot move the wallet to another network: requests to switch to
Ethereum or any other chain are refused, and a dApp cannot replace
Redbelly's network settings.

## 6. What the checks mean

The panel names the address it checked, **in full**. Compare it character by
character with the address you meant - a shortened address hides exactly the
characters a typo or a scam changes.

**What is being checked**

| Label | Meaning |
| --- | --- |
| Paying | A plain RBNT payment to this address |
| Paying (token transfer) | A token payment; the wallet read the real recipient out of the transaction, and also shows the token contract |
| Approving (can spend your tokens) | You are allowing this address to spend your tokens. Signing lets it move them later |
| Calling | A call to a contract (a swap, a mint). Only the contract was checked |

**The result**

| Result | Meaning | What to do |
| --- | --- | --- |
| Registered (green) | A verified Redbelly participant | Still check it is the *right* address - registered does not mean intended |
| Not registered (red) | Not on Redbelly's permission list. Funds sent there cannot be moved until its owner registers | The wallet refuses to sign. Check the address with whoever gave it to you; they must register at access.redbelly.network first |
| Contract address (grey) | A smart contract. Contracts are never KYC-registered, so this is normal for dApps | Check it is the dApp's real contract |
| Could not verify (orange) | The Redbelly node did not answer, so the address was not checked | Wait and retry, or verify the address another way |

**Extra notes under the result**

- *You have not paid this address from this wallet before* - a first-time
  payee. Not a warning, a prompt to double-check.
- **This address looks like 0x..., which you have used before** (red) - a
  lookalike. Scammers create addresses that share the first and last
  characters of ones you use, and send you tiny amounts so the fake appears
  in your history, hoping you copy it next time. Signing waits for "I
  understand the risks". **Use the address it names instead, from a source you
  trust.**
- *Only the contract above was checked* - for a contract call. If the
  contract passes your funds on to someone else, that address is not
  checked.
- *Your transaction history could not be read* - the lookalike check could
  only use your own accounts and address book this time.

**Your account** shows whether *you* are registered. If not, the network will
reject the transaction - complete KYC first.

## 7. Privacy

The wallet talks to Redbelly's network, Redbelly's block explorer (Routescan,
for history and token discovery) and one currency-rate list. It does not use
analytics, crash reporting, or DeBank's and Rabby's servers, and it does not
send them anything about you.

## 8. What it does not do

- **No phishing-site warnings and no transaction preview.** The wallet does
  not tell you a website is a scam or simulate what a transaction will do.
  Only use dApps you trust, and read the signing screen.
- **Contract calls are only partly checked** (see *Calling* above).
- English only.
- Testnet history shows only what this wallet sent.

## 9. Troubleshooting

| You see | Why | Fix |
| --- | --- | --- |
| *NOT registered* on your own account | Your account has not completed Redbelly KYC | Verify at access.redbelly.network |
| Transaction rejected with -32603 | The sending account is not registered | As above |
| *Could not verify* / *Unavailable* | Redbelly's public node did not answer | Wait a minute and retry |
| "Chain ... is not supported" in a dApp | The dApp asked for a non-Redbelly network | Use the dApp's Redbelly option |
| The dApp opens MetaMask instead | Another wallet extension took over | Disable the other wallet |
| Fee looks huge in RBNT | Redbelly fees are pegged to US cents | Check the dollar figure next to it |
