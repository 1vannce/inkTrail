# InkTrail

A Manga and Manhwa reading tracker built with React Native, Expo SDK 57, TypeScript, Expo Router, and TanStack Query. Search the public Kitsu catalog, open a title, save it to your library, track chapter progress and reading status, and organize titles into custom lists.

All saved entries and lists are read and written through an external REST API using Fetch. There is no local backend to run. This workspace includes a configured, public Beeceptor demo endpoint so you can try saving immediately. MockAPI is recommended when you want your own free project with more room than the small Beeceptor demo. [API setup and demo limits](docs/API_SETUP.md).

## Run the delivered project

Use Node.js **22.13 or later** and npm. This project follows the [versioned Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/), which targets React Native 0.86 and React 19.2.3. Exact installed versions are recorded in `package-lock.json`.

From the original current directory, enter the new, independent app folder:

```powershell
cd inktrail
npm ci
npm start
```

Open the development URL with a compatible Expo Go client, or use an Android emulator. Keep your phone and development computer on the same network. Platform shortcuts:

```powershell
npm run android
npm run web
```

On macOS with an iOS simulator installed:

```sh
npm run ios
```

The project uses the Expo managed workflow. Native `android/` and `ios/` project directories are not needed to run it. Catalog browsing works immediately with an internet connection. The local `.env` connects the delivered workspace to the demo tracker; a fresh copy without that file can connect through the Connection screen.

## Included demo tracker

A dedicated anonymous Beeceptor endpoint was created on October 11, 2026, with both CRUD routes configured:

- API base: [ca491042a4a2e9cd0092.free.beeceptor.com](https://ca491042a4a2e9cd0092.free.beeceptor.com)
- Dashboard: [Inspect requests and manage routes](https://app.beeceptor.com/console/ca491042a4a2e9cd0092)

The local `.env` points to this endpoint. It is public, holds at most **10 total entries and lists**, and allows **50 requests per day**. Older records can be purged when full, and an unclaimed endpoint lasts **30 days from creation**. Use sample reading data. See the provider's [storage behavior](https://beeceptor.com/docs/crud-api/) and [plan limits](https://beeceptor.com/pricing/).

## Connect your own tracker

1. Follow [API_SETUP.md](docs/API_SETUP.md) to create the two resources, `entries` and `lists`, in MockAPI or Beeceptor.
2. Open the app's **Connection** screen and paste your provider's HTTPS base URL.
3. Connect. The app checks GET `/entries` and GET `/lists` before saving the URL preference.
4. Search for a title, open its details, save it, and inspect the new record in your API dashboard.

Alternatively, on a fresh copy without `.env`, configure the URL before starting Expo:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env` using the exact base URL from your provider:

```dotenv
EXPO_PUBLIC_TRACKER_API_URL=https://YOUR_PROJECT.mockapi.io/api/v1
```

Then stop the running Expo process and run `npx expo start --clear` to refresh Metro's transformed environment values. The in-app saved connection takes precedence over this environment value. Disconnecting saves an empty connection; reconnect through the screen to select an endpoint again.

Only the endpoint preference is persisted on the device. Entries and lists come from the API, with temporary in-memory caching for the current session. The app never substitutes local saved records when the API is unavailable.

## Project structure

```text
inktrail/
|-- app/
|   |-- _layout.tsx                 # Providers and root stack
|   |-- (tabs)/
|   |   |-- _layout.tsx             # Discover and Library tabs
|   |   |-- index.tsx               # Home/Search route
|   |   `-- library.tsx             # User Tracker Library route
|   |-- title/[id].tsx              # Title Details route
|   `-- connection.tsx              # External API connection route
|-- src/
|   |-- api/
|   |   |-- http.ts                 # Fetch, JSON/errors, timeouts, retry policy
|   |   |-- catalog.ts              # Kitsu queries and response mapping
|   |   `-- tracker.ts              # Entry/list REST operations and validation
|   |-- components/ui.tsx          # Shared UI primitives
|   |-- hooks/
|   |   |-- useCatalog.ts           # Catalog pagination and title queries
|   |   `-- useTracker.ts           # Remote library/list queries and mutations
|   |-- providers/
|   |   |-- AppProviders.tsx        # Query cache and safe-area context
|   |   `-- ConnectionProvider.tsx  # Endpoint preference and connection state
|   |-- screens/
|   |   |-- HomeScreen.tsx
|   |   |-- TitleDetailsScreen.tsx
|   |   |-- LibraryScreen.tsx
|   |   `-- ConnectionScreen.tsx
|   |-- config.ts                  # Endpoint normalization and storage key
|   |-- theme.ts                   # Shared visual tokens
|   `-- types.ts                   # Catalog, tracker, and reading-list models
|-- tests/api.test.ts              # API contract and validation tests
|-- docs/API_SETUP.md              # Provider setup, schema, requests, walkthrough
|-- .env.example
|-- app.json
|-- expo-env.d.ts
|-- package.json
|-- package-lock.json
`-- tsconfig.json
```

## Implementation walkthrough

### 1. Define the models and API boundary

Start with [src/types.ts](src/types.ts). `Manga` is a normalized catalog title, `TrackerEntry` adds the provider's record ID, status, chapter progress, and optional list membership, and `ReadingList` is a named collection.

The tracker uses these reading statuses:

| Stored value | Display label |
| --- | --- |
| `reading` | Reading |
| `planned` | Want to read |
| `completed` | Completed |
| `on_hold` | On hold |
| `dropped` | Dropped |

Chapter progress must be a nonnegative whole number. If a total is known, progress cannot exceed it. Unknown totals stay `null`, so ongoing titles can continue to gain chapters. A custom list is independent of reading status; a title has at most one custom list.

[src/api/http.ts](src/api/http.ts) centralizes Fetch. It checks HTTP status, parses JSON, supports abort signals, limits request time, and returns readable errors. GET requests may retry once for temporary failures. Writes are never retried automatically because an interrupted response can hide a successful server write.

[src/api/catalog.ts](src/api/catalog.ts) reads Kitsu JSON:API data from `https://kitsu.app/api/edge`, sending `Accept: application/vnd.api+json`. Search uses `/manga` with `filter[text]`, `filter[subtype]`, offset pagination, and `include=categories`; details use `/manga/:id?include=categories`. The All filter merges manga and manhwa requests with separate cursors, promoting exact title matches before prefix and contained matches. Requests are spaced about 1.05 seconds apart as a courtesy, without assuming a provider rate-limit guarantee. IDs in routes and saved entries are numeric Kitsu manga IDs. [Kitsu API reference](https://kitsu.docs.apiary.io/).

[src/api/tracker.ts](src/api/tracker.ts) handles all persistent data operations against the connected base URL. Create uses POST, reads use GET, edits use PUT with the full record, and removal uses DELETE. Both `/entries` and `/lists` have complete CRUD support. Exact payloads and endpoint examples are in [the API guide](docs/API_SETUP.md#rest-contract).

### 2. Add providers and query hooks

[AppProviders.tsx](src/providers/AppProviders.tsx) owns one QueryClient and the safe-area provider. [ConnectionProvider.tsx](src/providers/ConnectionProvider.tsx) loads the endpoint preference and exposes connection state. No secret credentials are bundled into the app.

[useCatalog.ts](src/hooks/useCatalog.ts) exposes `useCatalog` for paginated results and `useTitle` for a selected title. [useTracker.ts](src/hooks/useTracker.ts) exposes `useEntries`, `useLists`, and `useTrackerMutations`. Screens read server state from these hooks rather than copying it into a second global store. Local React state is reserved for search inputs, filters, and form drafts.

Settled mutations invalidate the affected remote queries, including failures that may have partially committed remotely. Pending actions are disabled, and failures remain visible instead of displaying false success. Endpoint-specific query keys keep one connection's data separate from another's.

### 3. Build Home / Search

Route: [app/(tabs)/index.tsx](app/%28tabs%29/index.tsx). Complete component: [HomeScreen.tsx](src/screens/HomeScreen.tsx).

1. Keep the search text and All/Manga/Manhwa filter in component state.
2. Debounce input before passing it to `useCatalog`.
3. Display popular catalog titles before a search and matching results afterward.
4. Render covers and metadata in a responsive catalog grid. Expose loading, empty-result, pagination, and retry states.
5. Navigate to `/title/{id}` when a title is selected. Keep IDs in the route and retrieve current details through the catalog API.

### 4. Build Title Details

Route: [app/title/[id].tsx](app/title/%5Bid%5D.tsx). Complete component: [TitleDetailsScreen.tsx](src/screens/TitleDetailsScreen.tsx).

1. Read and validate the route's title ID, then request details with `useTitle`.
2. Show its cover, format, score, chapter count when known, genres, and synopsis. Author information is optional; the current Kitsu adapter leaves it empty when not supplied.
3. Check `useEntries` for an existing entry matching the catalog ID.
4. Save a new entry through POST `/entries`, or edit the existing entry's chapters, reading status, and custom list through PUT `/entries/:id`.
5. Offer a link to the library, where saved titles can be removed. If the tracker is not configured, direct the reader to Connection.

The external tracker stores a small title snapshot so library cards remain useful without requesting full catalog details for every saved entry.

### 5. Build User Tracker Library

Route: [app/(tabs)/library.tsx](app/%28tabs%29/library.tsx). Complete component: [LibraryScreen.tsx](src/screens/LibraryScreen.tsx).

1. Fetch entries and custom lists with `useEntries` and `useLists`.
2. Derive visible entries from the selected status, custom list, and local search/filter state.
3. Display progress, offer quick chapter updates and an edit dialog, and confirm title removal before DELETE `/entries/:id`. Open details for catalog information and the full editor.
4. Create and rename custom lists through POST/PUT `/lists`.
5. Delete a custom list by first clearing its entries' `listId`, then deleting the list. Saved titles remain in the library.
6. Provide refresh, loading, empty-library, and API-error states so an unavailable service is distinguishable from an empty library.

List deletion spans multiple REST calls. It is not atomic on these mock services; partially completed changes can be refreshed and retried. The guide explains this limitation and the API requirements for a production service.

### 6. Connect navigation and shared UI

[app/_layout.tsx](app/_layout.tsx) wraps the stack with providers. The tab layout keeps discovery and library access available, while details and connection have their own stack routes. [theme.ts](src/theme.ts) and [ui.tsx](src/components/ui.tsx) keep colors, spacing, typography, buttons, inputs, cards, and feedback consistent across screens.

The UI uses safe areas, scrollable content, visible pending/error states, and descriptive action labels. The catalog and library are separate screens so a slow catalog response does not prevent access to the tracker controls.

## Checks

Run these from `inktrail`:

```powershell
npm run typecheck
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform all
```

Verified on October 11, 2026: TypeScript passes, all 14 API tests pass, Expo dependency validation passes, and Expo Doctor passes all 21 checks. Production exports succeed for Android, iOS, and web. A phone-sized browser check verified live catalog search, title details, saving a title, chapter updates, and confirmed removal with no runtime console errors. A separate real Beeceptor check verified entry and list CRUD, including preserving titles when deleting a list; all temporary verification records were removed.

The automated API tests use controlled Fetch responses and do not touch the public endpoint. Android/iOS bundles were compiled; interaction on a physical native device or simulator was not verified here. Follow [the manual verification sequence](docs/API_SETUP.md#manual-verification) for device testing or a replacement provider.

## Recreate the dependency setup

The delivered project is ready to use with `npm ci`. For a separate fresh implementation, create an Expo TypeScript project with [create-expo-app](https://docs.expo.dev/more/create-expo/), then target SDK 57 and install compatible managed libraries:

```powershell
npx create-expo-app@latest inktrail-fresh --template expo-template-blank-typescript@57.0.29
cd inktrail-fresh
npm install expo@~57.0.27
npx expo install --fix
npx expo install expo-router expo-constants expo-font expo-linking expo-status-bar react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated react-native-worklets @react-native-async-storage/async-storage @expo/vector-icons react-dom react-native-web
npm install @tanstack/react-query@^5
npm install --save-dev typescript@~6.0.3 @types/react tsx @types/node
```

Copy this project's `app/`, `src/`, `tests/`, `app.json`, `tsconfig.json`, `expo-env.d.ts`, and `.env.example` into that new project. Set `package.json`'s `main` to `expo-router/entry` and copy its scripts from this project. The blank template's `App.tsx` and `index.ts` are no longer entry points and can be removed. Run the checks above. For identical dependency versions, use this project's `package.json` and lockfile together, followed by `npm ci`.

## Demo scope

The free tracker endpoint is a shared public demo library, not an authenticated user account. Keep it dedicated to this project and use non-sensitive test data. The app guards form inputs and ordinary duplicate saves, but a real multi-user service must enforce authentication, ownership, uniqueness, concurrent updates, and list transactions on its external API. The included Beeceptor endpoint is a public demonstration; no private account or paid service was created.
