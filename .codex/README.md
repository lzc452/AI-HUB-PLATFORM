# Repository Codex configuration

This directory contains repository-owned Codex skills and agent metadata. It
is intentionally versioned so that a fresh checkout can restore the same
project workflow on Windows, macOS, and Linux.

Keep repository-relative instructions and templates here. Do not add API keys,
tokens, private keys, local caches, personal preferences, or absolute paths.
Machine-local state belongs in `.codex/local/` or the user-level Codex
configuration and is ignored by Git.

Validate the checkout before sharing it with another device:

```sh
corepack pnpm governance:check
```
