import { secondaryButtonClass } from "./ui/FormUI";

export default function AuctioneerContinueAction({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-[var(--app-border)] pt-3">
      <p className="text-xs leading-5 text-[var(--app-text-muted)]">
        Review the preview before file generation.
      </p>
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={disabled}
        onClick={onClick}
        title="Submit for processing, then open a fresh lot for this contract"
      >
        Generate files &amp; new lot
      </button>
    </div>
  );
}
