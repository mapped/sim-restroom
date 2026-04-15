# Security Policy

## Supported versions

This is a demo simulator, not a production system. Only the current `main` branch is supported.

| Version    | Supported |
| ---------- | --------- |
| `main`     | ✅        |
| older tags | ❌        |

## Reporting a vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

If you believe you've found a vulnerability, report it privately via one of:

- **Email:** [support@mapped.com](mailto:support@mapped.com) — subject line: `sim-restroom security`
- **GitHub Security Advisory:** use the "Report a vulnerability" button under the [Security tab](https://github.com/mapped/sim-restroom/security) of this repo

Please include:

- A description of the issue and the impact you believe it has
- Steps to reproduce (code, screenshots, or a minimal repro)
- The commit SHA you observed it on
- Whether you're willing to be credited in a public acknowledgement

## What to expect

- **Acknowledgement** within 5 business days
- **Initial assessment** within 10 business days
- **Coordinated disclosure** — we follow a 90-day default disclosure window, negotiable based on severity and remediation complexity
- **Credit** in the release notes if you'd like it (opt-in)

## Scope

In scope:

- Vulnerabilities in the simulator code under `src/` or `tests/`
- Vulnerabilities in build tooling or CI configuration in this repository
- Supply-chain issues specific to this repo's dependency pins

Out of scope:

- General vulnerabilities in upstream dependencies (report to the upstream project; if there's a viable path to mitigate downstream, we'll take that as a separate issue)
- Issues in Mapped's hosted platform — for those, contact Mapped directly via [mapped.com](https://mapped.com)
- Social engineering, physical security, or anything unrelated to the code in this repository
