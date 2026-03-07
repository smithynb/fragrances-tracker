# 🌸 Fragrances Tracker

A web app to manage your fragrance collection and usage.

---

## Tech Stack

| Layer                     | Technology                        |
| ------------------------- | --------------------------------- |
| Framework                 | [Next.js](https://nextjs.org/)    |
| Database                  | [Convex](https://www.convex.dev/) |
| Runtime & Package Manager | [Bun](https://bun.sh/)            |
| Auth                      | [Convex Auth](https://labs.convex.dev/auth) |

---

## Prerequisites

Make sure you have the following installed before setting up the project:

- **[Bun](https://bun.sh/)** >= 1.0 — used as the package manager and runtime
- **Node.js** >= 20 — required by some Next.js internals

---

## Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/your-username/fragrances-tracker.git
cd fragrances-tracker
```

**2. Install dependencies**

```bash
cd my-app
bun install
```

**3. Start the development server**

```bash
bun dev
```

Before using Google sign-in, configure Convex Auth for your deployment:

- `SITE_URL`
- `JWT_PRIVATE_KEY`
- `JWKS`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

Then register your Google OAuth redirect URI as:

```text
https://<your-convex-deployment>.convex.site/api/auth/callback/google
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

---

## Available Scripts

All scripts should be run from inside the `my-app/` directory.

| Script        | Description                           |
| ------------- | ------------------------------------- |
| `bun dev`     | Starts the local development server   |
| `bun run build` | Creates an optimized production build |
| `bun run start` | Runs the production build locally     |
| `bun run lint`  | Runs ESLint across the project        |

---

## License

This project is licensed under the [MIT License](LICENSE).
