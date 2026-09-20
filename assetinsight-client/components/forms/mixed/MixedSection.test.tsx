import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MixedSection from "./MixedSection";
import type { MixedLot } from "./types";

const photo = (name: string, index: number) =>
  new File(["photo-" + index], name, {
    type: "image/jpeg",
    lastModified: index + 1,
  });

function Harness({
  initial = [],
  allowVideo = true,
  maxTotalImages,
  analysisImageLimit,
}: {
  initial?: MixedLot[];
  allowVideo?: boolean;
  maxTotalImages?: number;
  analysisImageLimit?: number;
}) {
  const [lots, setLots] = useState(initial);
  return (
    <>
      <button type="button" onClick={() => setLots([])}>
        Parent reset
      </button>
      <output data-testid="main-count">
        {lots.reduce((sum, lot) => sum + lot.files.length, 0)}
      </output>
      <output data-testid="lot-count">{lots.length}</output>
      <MixedSection
        value={lots}
        onChange={setLots}
        allowVideo={allowVideo}
        maxTotalImages={maxTotalImages}
        analysisImageLimit={analysisImageLimit}
      />
    </>
  );
}

describe("MixedSection workflow", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((file: File) => "blob:test/" + file.name),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("requires a lot and mode before upload actions are enabled", () => {
    render(<Harness />);

    expect(screen.getByText("Create your first lot")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^add photos$/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new lot/i }));
    const addPhotos = screen.getByRole("button", { name: /^add photos$/i });
    expect(addPhotos).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /bundle/i }));
    expect(addPhotos).toBeEnabled();
  });

  it("explains the terminal lot-number card and high-number sampling policy", () => {
    render(
      <Harness
        initial={[
          {
            id: "lot-1",
            files: [photo("asset.jpg", 1), photo("lot-number.jpg", 2)],
            extraFiles: [],
            coverIndex: 0,
            mode: "single_lot",
          },
        ]}
      />
    );

    expect(
      screen.getByText(/lot-number card as the final main photo/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Bundle lots numbered 1000 or higher, only the first 10 main photos are analyzed for asset details/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /If no valid number is found, lots follow their current order; you can edit each number in Preview/i
      )
    ).toBeInTheDocument();
  });

  it("enforces a combined per-lot photo boundary and locks mode after upload", async () => {
    const { container } = render(<Harness maxTotalImages={2} />);
    fireEvent.click(screen.getByRole("button", { name: /new lot/i }));
    fireEvent.click(screen.getByRole("radio", { name: /bundle/i }));

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Add main photos"]'
    );
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: {
        files: [photo("one.jpg", 1), photo("two.jpg", 2), photo("three.jpg", 3)],
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId("main-count")).toHaveTextContent("2")
    );
    expect(screen.getByRole("radio", { name: /per item/i })).toBeDisabled();
  });

  it("hides every video surface for Lot Listing and explains the 50-photo analysis boundary", () => {
    const files = Array.from({ length: 51 }, (_, index) =>
      photo("photo-" + index + ".jpg", index)
    );
    render(
      <Harness
        initial={[
          {
            id: "lot-1",
            files,
            extraFiles: [],
            videoFiles: [new File(["video"], "clip.mp4", { type: "video/mp4" })],
            coverIndex: 0,
            mode: "single_lot",
          },
        ]}
        allowVideo={false}
        analysisImageLimit={50}
      />
    );

    expect(
      screen.getByText(
        /At most the first 50 main photos are analyzed\. All 51 main photos remain included/i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Add report-only videos")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/1 video/i)).not.toBeInTheDocument();
  });

  it("syncs a parent reset and supports the eight-second media undo", async () => {
    const file = photo("undo.jpg", 1);
    render(
      <Harness
        initial={[
          {
            id: "lot-1",
            files: [file],
            extraFiles: [],
            coverIndex: 0,
            mode: "single_lot",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove undo.jpg" }));
    await waitFor(() =>
      expect(screen.getByTestId("main-count")).toHaveTextContent("0")
    );
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() =>
      expect(screen.getByTestId("main-count")).toHaveTextContent("1")
    );

    fireEvent.click(screen.getByRole("button", { name: /parent reset/i }));
    await waitFor(() =>
      expect(screen.getByText("Create your first lot")).toBeInTheDocument()
    );
  });

  it("removes the selected lot after confirmation", async () => {
    render(
      <Harness
        initial={[
          {
            id: "lot-1",
            files: [photo("first.jpg", 1)],
            extraFiles: [],
            coverIndex: 0,
            mode: "single_lot",
          },
          {
            id: "lot-2",
            files: [photo("second.jpg", 2)],
            extraFiles: [],
            coverIndex: 0,
            mode: "single_lot",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for lot 2" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove lot" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove this lot?" });
    expect(dialog.parentElement).toHaveStyle({ zIndex: "120" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove lot" }));

    await waitFor(() =>
      expect(screen.getByTestId("lot-count")).toHaveTextContent("1")
    );
    expect(screen.queryByText("second.jpg")).not.toBeInTheDocument();
  });
});
