import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// HistoryList pulls in @/components/panels, which imports a server action
// (lib/db via "server-only"); stub the server-side deps for jsdom.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "admin", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn() }),
}));

import type { StreamHistoryItem } from "@/lib/types";
import { HistoryList } from "@/components/streams/HistoryList";

// HistoryList reads its rows from `/api/history` (not useData) on mount.
function mockHistory(history: StreamHistoryItem[] | undefined) {
  const fetchMock = vi.fn(async () => ({ json: async () => ({ history }) }) as unknown as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const movie = (id: number, over: Partial<StreamHistoryItem> = {}): StreamHistoryItem => ({
  id,
  title: `Movie ${id}`,
  kind: "movie",
  year: 2010 + (id % 5),
  user: "Ada",
  started: 1_700_000_000 - id * 600,
  duration: 3 * 3600 + 12 * 60,
  watchedStatus: 1,
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryList — loading + empty + error states", () => {
  it("shows the empty state when the feed returns no rows", async () => {
    mockHistory([]);
    render(<HistoryList isAdmin={false} />);
    expect(await screen.findByText("No streams in the last 7 days")).toBeInTheDocument();
  });

  it("shows the empty state when the feed omits a history array", async () => {
    mockHistory(undefined);
    render(<HistoryList isAdmin={false} />);
    expect(await screen.findByText("No streams in the last 7 days")).toBeInTheDocument();
  });

  it("shows an error state when the fetch rejects", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("boom"); });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<HistoryList isAdmin={false} />);
    expect(await screen.findByText("Couldn't load history")).toBeInTheDocument();
  });
});

describe("HistoryList — row rendering", () => {
  it("renders a row per item with title, count, and formatted duration", async () => {
    mockHistory([movie(1), movie(2)]);
    const { container } = render(<HistoryList isAdmin={false} />);

    expect(await screen.findByText("Movie 1")).toBeInTheDocument();
    expect(screen.getByText("Movie 2")).toBeInTheDocument();
    // The panel surfaces the total count (2) in its header chip.
    expect(container.textContent).toContain("2");
    // 3h 12m duration is formatted from seconds.
    expect(screen.getAllByText(/3h 12m/).length).toBeGreaterThan(0);
  });

  it("formats an episode as SxxExx with the series title", async () => {
    mockHistory([
      movie(3, {
        kind: "episode",
        title: "Pilot",
        grandparentTitle: "The Show",
        parentMediaIndex: 1,
        mediaIndex: 4,
      }),
    ]);
    render(<HistoryList isAdmin={false} />);

    expect(await screen.findByText("The Show")).toBeInTheDocument();
    expect(screen.getByText(/S01E04 · Pilot/)).toBeInTheDocument();
  });

  it("renders a transcode badge when a decision is present", async () => {
    mockHistory([movie(4, { transcodeDecision: "transcode" })]);
    render(<HistoryList isAdmin={false} />);
    expect(await screen.findByText("TRANSCODE")).toBeInTheDocument();
  });
});

describe("HistoryList — admin vs user", () => {
  it("hides the watcher's name for non-admins", async () => {
    mockHistory([movie(5, { user: "Bob" })]);
    render(<HistoryList isAdmin={false} />);
    await screen.findByText("Movie 5");
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("shows the watcher's name for admins", async () => {
    mockHistory([movie(6, { user: "Bob" })]);
    render(<HistoryList isAdmin={true} />);
    await screen.findByText("Movie 6");
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});

describe("HistoryList — pagination (25 per page)", () => {
  it("renders only the first 25 of 30 rows, then pages to the rest", async () => {
    const items = Array.from({ length: 30 }, (_, i) => movie(i + 1));
    mockHistory(items);
    render(<HistoryList isAdmin={false} />);

    // First page: rows 1..25 present, 26 not yet.
    await screen.findByText("Movie 1");
    expect(screen.getByText("Movie 25")).toBeInTheDocument();
    expect(screen.queryByText("Movie 26")).toBeNull();

    // Page indicator shows 1 / 2; there are two page controls (prev/next).
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    const controls = screen.getAllByRole("button");
    // The last control is "next page".
    fireEvent.click(controls[controls.length - 1]);

    await waitFor(() => expect(screen.getByText("Movie 26")).toBeInTheDocument());
    expect(screen.getByText("Movie 30")).toBeInTheDocument();
    expect(screen.queryByText("Movie 1")).toBeNull();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    // Page back to the first page.
    fireEvent.click(controls[controls.length - 2]);
    await waitFor(() => expect(screen.getByText("Movie 1")).toBeInTheDocument());
  });

  it("renders no page controls when the list fits on one page", async () => {
    mockHistory([movie(1), movie(2)]);
    render(<HistoryList isAdmin={false} />);
    await screen.findByText("Movie 1");
    // No "n / n" page indicator rendered for a single page.
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
  });
});
