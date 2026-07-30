# CourseForge Frontend

[简体中文](README.zh-CN.md) | English

CourseForge is an AI-assisted learning-material workspace. Starting with a subject name, it helps users browse a generated curriculum, expand courses into subcategories, create lecture outlines and learning materials, and practise with generated multiple-choice exams.

This repository contains the Vue frontend. It requires the companion FastAPI service to create and persist content.

## Features

- Create one or several subjects from names
- Browse subjects, courses, and subcategories
- Generate outlines, full learning materials, and exams individually or in batches
- Track long-running generation jobs without blocking navigation
- Regenerate outlines, materials, and questions
- Read generated material in a chapter-oriented interface
- Complete multiple-choice exams and view scores and explanations

## Tech stack

- Vue 3 with Composition API
- Pinia
- Vite 5
- Native Fetch API

## Requirements

- Node.js 18 or later
- npm 9 or later
- A running CourseForge API, MongoDB instance, Redis instance, and ARQ worker

## Quick start

```bash
git clone <your-frontend-repository-url>
cd <your-frontend-repository-directory>
npm install
```

Copy the example environment file and update the API URL when necessary:

```bash
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead.

Start the development server:

```bash
npm run dev
```

Open <http://localhost:5173>. The default API base URL is `http://localhost:8000/api`.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000/api` | Base URL of the CourseForge API |

Values prefixed with `VITE_` are embedded in the browser bundle. Never place API keys or other secrets in them.

## Available scripts

```bash
npm run dev      # Start the local development server
npm run build    # Create a production build in dist/
npm run preview  # Preview the production build locally
```

## Project structure

```text
src/
├── api/
│   └── index.js        # HTTP client and task polling
├── stores/
│   └── course.js       # Course data and generation state
├── App.vue             # Current application UI and interaction logic
└── main.js             # Vue and Pinia bootstrap
```

## How generation works

1. The frontend sends a subject name to the API.
2. The API creates the curriculum skeleton and stores it in MongoDB.
3. Outline, material, exam, and expansion jobs are placed on Redis.
4. An ARQ worker performs LLM calls and persists the result.
5. The frontend polls one or many job IDs and updates each item as it completes.

## Production notes

- Set `VITE_API_URL` to the public HTTPS address of the backend before building.
- Configure the backend CORS allowlist for the deployed frontend origin.
- Serve the generated `dist/` directory from a static host or CDN.
- Do not commit `.env`, `node_modules/`, `.vite/`, or `dist/`.
- Generated content is model output and should be reviewed before it is used for high-stakes learning or assessment.

## Current status

The project is an early-stage application. The current UI is concentrated in one large component, and automated frontend tests, linting, authentication, and user-facing global error handling have not yet been added.

## Contributing

Issues and pull requests are welcome. For substantial changes, please open an issue first to discuss the intended behaviour. Keep generated files and credentials out of commits, and verify changes with `npm run build`.

## License

No open-source license has been selected yet. Add a `LICENSE` file before a public release; without one, the code is not automatically open for reuse.

