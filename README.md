# 🐉 BeastDex

A **BeastDex** for [Loot Survivor](https://lootsurvivor.io/) — browse, track, trade, and analyze all Beast NFTs with rarity filters, collection stats, a marketplace, and player profiles.

Built on [Starknet](https://www.starknet.io/), using the [Cartridge](https://cartridge.gg/) Controller for wallet auth and a self-hosted [Torii](https://book.dojoengine.org/toolchain/torii) indexer for on-chain data.

> This is an independent, community-built project and isn't officially affiliated with Loot Survivor, Provable Games, or Cartridge.

---

## ✨ Features

- 📚 Browse all beast varieties with rarity tabs (Standard, Shiny, Animated, Animated Shiny)
- 🧾 Collection tracking with owned/missing placeholders
- 🔎 Search and filter beasts by attributes
- 🛒 Marketplace: list, buy, sell, and make offers on Beast NFTs
- 📊 Player profiles with collection stats & highlights
- 🏆 Power ranking and K:D ratio tracking

---

## 🛠️ Tech Stack

- ⚡ React 19 + TypeScript + Vite
- 🎨 TailwindCSS + Radix UI
- 🌐 Starknet (`starknet.js`, `@starknet-react/core`) + Cartridge Controller
- 🔍 Torii (Dojo indexer) for on-chain beast and marketplace data
- ✅ Vitest + Testing Library

---

## 🚀 Getting Started

### Prerequisites

- [bun](https://bun.sh/) (preferred) or [npm](https://nodejs.org/)

### Installation

```bash
# Clone the repo
git clone https://github.com/spaghettiOnToast/BeastDex.git
cd BeastDex

# Install dependencies
bun install
# or: npm install
```

### Environment variables

The app works out of the box with no `.env` file — every variable has a public default.
If you need to point at a different RPC, indexer, or contract, copy `.env.example` to
`.env.local` and override what you need:

```bash
cp .env.example .env.local
```

See `.env.example` for the full list of supported variables and their defaults.

### Run the dev server

```bash
bun run dev
# or: npm run dev
```

The app will be available at http://localhost:5173.

### Other scripts

```bash
bun run build   # type-check and build for production
bun run lint    # run eslint
bun run test    # run the test suite once
bun run test:watch
bun run preview # preview a production build locally
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md)
for how to get set up and what to expect from a PR review.

## 📜 License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

Beast artwork in `public/collectables/` is CC0 (public domain).
