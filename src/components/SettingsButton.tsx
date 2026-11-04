import { uiBtn } from "./ui";

interface Props {
  onClick: () => void;
}

export default function SettingsButton({ onClick }: Props) {
  return (
    <button
      type="button"
      aria-label="Buka setelan"
      aria-haspopup="dialog"
      title="Setelan"
      onClick={() => {
        uiBtn();
        onClick();
      }}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#c7dded] bg-white text-[#315478] shadow-[0_3px_0_#a5c6e1] transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#f0f8ff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#315478] active:translate-y-0.5 active:scale-95 active:shadow-none motion-reduce:transition-none"
    >
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10 3h4l.65 2.3 1.75 1 2.3-.5 2 3.4-1.7 1.7v2.2l1.7 1.7-2 3.4-2.3-.5-1.75 1L14 21h-4l-.65-2.3-1.75-1-2.3.5-2-3.4L5 13.1v-2.2L3.3 9.2l2-3.4 2.3.5 1.75-1L10 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}