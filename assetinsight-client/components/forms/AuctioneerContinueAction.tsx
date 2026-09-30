import { formClassNames, primaryButtonClass, secondaryButtonClass } from "./ui/FormUI";

export default function AuctioneerContinueAction({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-[var(--app-border)] pt-3">
      <p className="text-xs leading-5 text-[var(--app-text-muted)]">
        Continue adds another lot to this contract and saves your progress. Nothing is sent until you close.
      </p>
      <button
        type="submit"
        className={formClassNames(primaryButtonClass, "w-full sm:w-auto")}
        disabled={disabled}
        title="Send every lot on this contract for processing and close the form"
      >
        Create Lot &amp; Close
      </button>
      <button
        type="button"
        className={formClassNames(secondaryButtonClass, "w-full sm:w-auto")}
        disabled={disabled}
        onClick={onClick}
        title="Add another lot to this contract and save. Nothing is sent until you press Create Lot & Close."
      >
        Create Lot &amp; Continue
      </button>
    </div>
  );
}
