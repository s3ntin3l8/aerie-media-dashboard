/**
 * The fictional media catalogue behind the demo's fake upstream. Every panel
 * (now playing, requests, calendar, queue, history, leaderboard) draws its
 * titles and people from here, so they agree with each other, and nothing is a
 * real title or person. Posters are generated from `palette` (see ./posters.mjs).
 */

/** @typedef {{ tmdbId: number, type: "movie" | "tv", title: string, year: number, genres: string[], overview: string, palette: [string, string], rating: number, runtime: number, studio: string }} Title */

/** @type {Title[]} */
export const CATALOG = [
  { tmdbId: 9101, type: "movie", title: "The Lantern Archive", year: 2024, genres: ["Mystery", "Drama"], overview: "A night-shift archivist finds a ledger that lists lamps lit in a city that was never built.", palette: ["#f2b36b", "#4a2a63"], rating: 7.8, runtime: 118, studio: "Northlight Pictures" },
  { tmdbId: 9102, type: "movie", title: "Salt Meridian", year: 2023, genres: ["Adventure"], overview: "Two surveyors race a rising tide to map the last dry road across a salt flat.", palette: ["#7fd1c7", "#16384a"], rating: 7.1, runtime: 126, studio: "Tidewater Films" },
  { tmdbId: 9103, type: "movie", title: "Hollow Orchard", year: 2022, genres: ["Thriller"], overview: "The apple trees on a family farm start blooming out of season, one row per night.", palette: ["#9bd36b", "#2b3a1f"], rating: 6.9, runtime: 104, studio: "Greywood" },
  { tmdbId: 9104, type: "movie", title: "Night Tram to Veldt", year: 2025, genres: ["Drama", "Romance"], overview: "Strangers share a sleeper tram across a continent with no timetable.", palette: ["#ff8a80", "#2d1b4e"], rating: 8.0, runtime: 131, studio: "Parallel Rail" },
  { tmdbId: 9105, type: "movie", title: "Cobalt Harvest", year: 2021, genres: ["Sci-Fi"], overview: "Miners on a blue moon discover the ore is listening.", palette: ["#5b8dff", "#0b1d4d"], rating: 7.4, runtime: 112, studio: "Deepfield" },
  { tmdbId: 9106, type: "movie", title: "The Cartographer's Daughter", year: 2024, genres: ["Adventure", "Family"], overview: "A girl inherits a half-finished atlas whose coastlines keep changing.", palette: ["#e8c27a", "#6a3b1f"], rating: 7.6, runtime: 109, studio: "Quillbird" },
  { tmdbId: 9107, type: "movie", title: "Ember & Static", year: 2025, genres: ["Sci-Fi", "Thriller"], overview: "A radio engineer decodes a signal that arrives three seconds before it is sent.", palette: ["#ff7a45", "#1a1a2e"], rating: 7.9, runtime: 122, studio: "Static Lane" },
  { tmdbId: 9108, type: "movie", title: "Quiet Machines", year: 2023, genres: ["Drama", "Sci-Fi"], overview: "A repair technician befriends the last factory robot on a retired assembly line.", palette: ["#b0bec5", "#263238"], rating: 7.3, runtime: 99, studio: "Ironwood" },
  { tmdbId: 9109, type: "movie", title: "Glasswing", year: 2022, genres: ["Fantasy"], overview: "A glassblower's apprentice breathes life into a moth that can carry messages.", palette: ["#c4a1ff", "#2a1b5c"], rating: 6.8, runtime: 107, studio: "Lowtide" },
  { tmdbId: 9110, type: "movie", title: "Under the Tin Moon", year: 2026, genres: ["Comedy"], overview: "A failing roadside diner hires a fortune-teller who is only ever right about breakfast.", palette: ["#ffd54f", "#5d4037"], rating: 0, runtime: 96, studio: "Sunday Ruckus" },
  { tmdbId: 9201, type: "tv", title: "Harbor Lights", year: 2024, genres: ["Drama"], overview: "A fishing town's lighthouse keepers keep each other's secrets through three stormy winters.", palette: ["#4fc3f7", "#0d2b45"], rating: 8.3, runtime: 52, studio: "Seagate" },
  { tmdbId: 9202, type: "tv", title: "The Long Thaw", year: 2023, genres: ["Mystery", "Drama"], overview: "When the lake ice finally melts, a village learns what winter was hiding.", palette: ["#cfe9f1", "#33505e"], rating: 8.1, runtime: 48, studio: "Arctic Row" },
  { tmdbId: 9203, type: "tv", title: "Paper Cranes", year: 2025, genres: ["Comedy"], overview: "A struggling origami studio becomes the unlikely center of a small city's gossip.", palette: ["#f48fb1", "#4a1942"], rating: 7.5, runtime: 28, studio: "Foldline" },
  { tmdbId: 9204, type: "tv", title: "Signal Fire", year: 2022, genres: ["Action", "Drama"], overview: "Mountain rescue volunteers fight weather, budget cuts and each other.", palette: ["#ff7043", "#3e1f1a"], rating: 7.7, runtime: 55, studio: "Ridgeline" },
  { tmdbId: 9205, type: "tv", title: "Little Orbit", year: 2024, genres: ["Animation", "Family"], overview: "A tiny satellite and its ground-crew pals explore the quiet corners of the solar system.", palette: ["#80deea", "#1c2b6b"], rating: 8.0, runtime: 22, studio: "Moonbean" },
  { tmdbId: 9206, type: "tv", title: "Midnight Ledger", year: 2023, genres: ["Crime"], overview: "A forensic accountant audits a city whose books only balance after dark.", palette: ["#90a4ae", "#101820"], rating: 8.4, runtime: 50, studio: "Blackpage" },
  { tmdbId: 9207, type: "tv", title: "Brightwater Station", year: 2025, genres: ["Sci-Fi"], overview: "Eight engineers keep an ocean research station alive after the supply ships stop coming.", palette: ["#26c6da", "#012a36"], rating: 7.9, runtime: 46, studio: "Deepfield" },
  { tmdbId: 9208, type: "tv", title: "Dust & Honey", year: 2021, genres: ["Drama", "Western"], overview: "Beekeepers and cattle ranchers share one drought-stricken valley.", palette: ["#ffca28", "#6d4c41"], rating: 7.2, runtime: 54, studio: "Highmesa" },
  { tmdbId: 9209, type: "tv", title: "Copper Hollow", year: 2024, genres: ["Fantasy"], overview: "A mining town's lanterns burn a different color for every lie told underground.", palette: ["#d7855a", "#23140f"], rating: 7.6, runtime: 51, studio: "Ashen" },
  { tmdbId: 9210, type: "tv", title: "The Understudies", year: 2025, genres: ["Comedy", "Drama"], overview: "The backup cast of a touring theatre company keeps the show alive when the stars fall ill.", palette: ["#ba68c8", "#311b44"], rating: 7.8, runtime: 42, studio: "Footlight" },
];

/** Look a title up by its (fake) TMDB id. */
export const titleById = (tmdbId) => CATALOG.find((t) => t.tmdbId === Number(tmdbId));

/**
 * People. `id` doubles as the Overseerr and Plex user id; `email` is what ties a
 * request or stream to a portal member. `color` tints the generated avatar.
 */
export const USERS = [
  { id: 2, name: "Ada Quill", username: "ada", email: "ada@aerie.example", color: "#5b8dff" },
  { id: 3, name: "Ben Marlow", username: "ben", email: "ben@aerie.example", color: "#ff8a65" },
  { id: 4, name: "Cleo Hart", username: "cleo", email: "cleo@aerie.example", color: "#4db6ac" },
  { id: 5, name: "Dev Rao", username: "dev", email: "dev@aerie.example", color: "#ba68c8" },
  { id: 6, name: "Esme Vale", username: "esme", email: "esme@aerie.example", color: "#ffd54f" },
  { id: 7, name: "Finn Okafor", username: "finn", email: "finn@aerie.example", color: "#81c784" },
];

/**
 * The portal admin the capture script signs in as (see instance.mjs). It also exists as an
 * Overseerr/Plex user, so the dashboard shows it as linked, with request quotas.
 */
export const ADMIN = { id: 1, name: "Demo Admin", username: "admin", email: "demo@aerie.invalid", color: "#7e57c2" };

export const userById = (id) => [ADMIN, ...USERS].find((u) => u.id === Number(id));

/** Library sizes (Tautulli `get_libraries`). */
export const LIBRARIES = {
  movies: { name: "Movies", count: 1284 },
  shows: { name: "TV Shows", count: 312, episodes: 9840 },
  music: { name: "Music", artists: 214, albums: 1630, tracks: 18420 },
};

/**
 * Overseerr requests, newest first. `status`: 1 pending, 2 approved, 3 declined;
 * `mediaStatus`: 1 unknown, 2 pending, 3 processing, 4 partial, 5 available.
 * `ageHours` is relative to the demo server's start, so dates always look fresh.
 */
export const REQUESTS = [
  { id: 41, tmdbId: 9110, userId: 5, status: 1, mediaStatus: 2, ageHours: 1 },
  { id: 40, tmdbId: 9207, userId: 3, status: 1, mediaStatus: 2, ageHours: 3 },
  { id: 39, tmdbId: 9107, userId: 2, status: 2, mediaStatus: 3, ageHours: 6 },
  { id: 38, tmdbId: 9210, userId: 6, status: 2, mediaStatus: 3, ageHours: 10 },
  { id: 37, tmdbId: 9104, userId: 4, status: 2, mediaStatus: 5, ageHours: 20 },
  { id: 36, tmdbId: 9203, userId: 7, status: 1, mediaStatus: 2, ageHours: 26 },
  { id: 35, tmdbId: 9205, userId: 2, status: 2, mediaStatus: 5, ageHours: 40 },
  { id: 34, tmdbId: 9106, userId: 6, status: 2, mediaStatus: 5, ageHours: 52 },
  { id: 33, tmdbId: 9209, userId: 3, status: 2, mediaStatus: 3, ageHours: 70 },
  { id: 32, tmdbId: 9102, userId: 5, status: 2, mediaStatus: 5, ageHours: 96 },
  { id: 31, tmdbId: 9206, userId: 4, status: 2, mediaStatus: 5, ageHours: 130 },
  { id: 30, tmdbId: 9109, userId: 7, status: 3, mediaStatus: 1, ageHours: 160 },
  { id: 29, tmdbId: 9208, userId: 2, status: 2, mediaStatus: 5, ageHours: 200 },
  { id: 28, tmdbId: 9108, userId: 6, status: 2, mediaStatus: 5, ageHours: 260 },
];

/**
 * Titles the capture script waits to see rendered. Overseerr enrichment (title and
 * poster) lands on later polls, so seeing the newest requested titles proves the
 * Requests view is populated and not still showing "Request 41".
 */
export const SETTLE_TITLES = REQUESTS.slice(0, 3).map((r) => titleById(r.tmdbId).title);
