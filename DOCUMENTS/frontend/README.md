# XahPayroll Frontend

Modern React + TypeScript frontend for the XahPayroll decentralized payroll system.

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **XRPL.js** - Blockchain integration

## Getting Started

### Prerequisites

- Node.js v18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:3000`

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── components/     # Reusable UI components
│   ├── Navbar.tsx
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── HowItWorks.tsx
│   └── Footer.tsx
├── pages/          # Page components
│   └── HomePage.tsx
├── types/          # TypeScript type definitions
│   └── index.ts
├── App.tsx         # Root component
├── main.tsx        # Entry point
└── index.css       # Global styles
```

## Features

- ✅ Fully typed with TypeScript
- ✅ Responsive design (mobile-first)
- ✅ Modern UI with TailwindCSS
- ✅ Component-based architecture
- ✅ Ready for wallet integration
- ✅ Optimized build with Vite

## Next Steps

1. ✅ Wallet connection implemented (Xaman for production, Manual for testing)
2. ✅ Worker dashboard complete
3. ✅ Employer dashboard complete
4. ✅ Connected to backend API
5. ✅ XRPL payment channels integrated

## License

MIT
