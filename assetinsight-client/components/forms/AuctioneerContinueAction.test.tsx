import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuctioneerContinueAction from "./AuctioneerContinueAction";

describe("imported lot creation actions", () => {
  it("keeps close as form submission and continuation as a separate explicit intent", () => {
    const close = vi.fn();
    const next = vi.fn();
    render(<form onSubmit={(event) => { event.preventDefault(); close(); }}>
      <AuctioneerContinueAction disabled={false} onClick={next} />
    </form>);
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Close" }));
    expect(close).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));
    expect(next).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    /*
       The copy states the new division of labour. Continue used to submit the
       report and open a successor form — "Continue opens a fresh lot after
       upload acceptance" — so the person could not tell that pressing it sent
       anything. Now nothing leaves until Close, and both controls say so.
    */
    expect(screen.getByText(/adds another lot to this contract/i)).toHaveTextContent(
      /nothing is sent until you close/i
    );
    expect(screen.getByRole("button", { name: "Create Lot & Close" })).toHaveAttribute(
      "title",
      expect.stringContaining("Send every lot on this contract")
    );
    expect(screen.getByRole("button", { name: "Create Lot & Continue" })).toHaveAttribute(
      "title",
      expect.stringContaining("Nothing is sent")
    );
  });

  it("disables both creation intents during an upload or draft save", () => {
    render(<AuctioneerContinueAction disabled onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Create Lot & Close" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Lot & Continue" })).toBeDisabled();
  });
});
