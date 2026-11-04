import React from "react";
import type { AccessoryId } from "../game/animals";

export function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}
export function PlayIcon() {
  return (
    <Svg size={22}>
      <path d="M7 4.5v15c0 .9 1 1.5 1.8 1L21 12.9c.8-.5.8-1.6 0-2.1L8.8 3.5C8 3 7 3.6 7 4.5Z" fill="#5b3a00" />
    </Svg>
  );
}
export function CatIcon() {
  return (
    <Svg size={20}>
      <path d="M4 9.5 4 3l5 3.2a8 8 0 0 1 6 0L20 3v6.5" stroke="#3b2a12" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 10a8 8 0 1 0 16 0" stroke="#3b2a12" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="12" r="1.3" fill="#3b2a12" />
      <circle cx="15" cy="12" r="1.3" fill="#3b2a12" />
      <path d="M12 14.5v1m-2 .5h4" stroke="#3b2a12" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}
export function HatIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 13c0-4 3-7 7-7s7 3 7 7" fill="#ff6fab" stroke="#5b1338" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 13h16" stroke="#5b1338" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 13c2.4 0 4 .6 4 1.4S18.4 16 16 16" fill="#fff" stroke="#5b1338" strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}
export function GearIcon() {
  return (
    <Svg size={20}>
      <circle cx="12" cy="12" r="3.2" stroke="#12314f" strokeWidth="2" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"
        stroke="#12314f"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}
export function StarIcon() {
  return (
    <Svg size={20}>
      <path
        d="m12 3.5 2.6 5.3 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8L3.5 9.6l5.9-.8L12 3.5Z"
        fill="#ffd23f"
        stroke="#6b4100"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function PeopleIcon() {
  return (
    <Svg size={20}>
      <circle cx="9" cy="9" r="3" stroke="#083a66" strokeWidth="2" />
      <circle cx="17" cy="10" r="2.2" stroke="#083a66" strokeWidth="2" />
      <path
        d="M3.5 19c.7-3 3-4.5 5.5-4.5S13.8 16 14.5 19M15 15c2 0 3.8 1.2 4.5 3.4"
        stroke="#083a66"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}
export function HelpIcon() {
  return (
    <Svg size={20}>
      <circle cx="12" cy="12" r="9" stroke="#5a2703" strokeWidth="2" />
      <path
        d="M9.3 9.2c.2-1.4 1.3-2.2 2.8-2.2 1.6 0 2.8 1 2.8 2.4 0 2.2-2.8 2.1-2.8 4.2"
        stroke="#5a2703"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1.2" fill="#5a2703" />
    </Svg>
  );
}
export function BotIcon() {
  return (
    <Svg size={18}>
      <rect x="4" y="7" width="16" height="12" rx="4" stroke="#083a66" strokeWidth="2" />
      <circle cx="9" cy="13" r="1.4" fill="#083a66" />
      <circle cx="15" cy="13" r="1.4" fill="#083a66" />
      <path d="M12 7V4" stroke="#083a66" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.3" fill="#083a66" />
    </Svg>
  );
}
export function SwordsIcon() {
  return (
    <Svg size={18}>
      <path
        d="m4 4 9 9M14 4l6 6-3 3-6-6 3-3ZM4 20l6-6M3 15l6 6M18 20l3-3"
        stroke="#123d14"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function IslandIcon() {
  return (
    <Svg size={30}>
      <circle cx="23" cy="8" r="3.6" fill="#ffd23f" />
      <path d="M4 21c4-3 8-3 12 0s9 3 12 0v6H4v-6Z" fill="#5fd65a" />
      <path d="M4 24h24v3.5c0 1-1.5 1.5-2 1.5H6c-.5 0-2-.5-2-1.5V24Z" fill="#2f9b35" />
      <path d="M11 21V12l3-2 3 2v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
export function AccessoryIcon({ id, size = 20 }: { id: AccessoryId; size?: number }) {
  if (id === "capRed" || id === "capBlue" || id === "capNewRed" || id === "capNewBlue") {
    const isRed = id === "capRed" || id === "capNewRed";
    const isNew = id === "capNewRed" || id === "capNewBlue";
    const main = isRed ? "#e8343c" : "#2f6fe0";
    const dark = isRed ? "#a3121d" : "#1b4496";
    return (
      <Svg size={size}>
        <path d="M4 13c0-4.5 3.5-8 8-8s8 3.5 8 8" fill={isNew ? "#f7f4ee" : main} stroke={dark} strokeWidth="1.8" strokeLinejoin="round" />
        {isNew && <path d="M9 5.6C10.4 5 13.6 5 15 5.6L14.2 13H9.8L9 5.6Z" fill={main} stroke={dark} strokeWidth="1.2" strokeLinejoin="round" />}
        <path d="M3 13h18" stroke={dark} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15 13c2.6 0 5 .7 5 1.6S18.6 16 15 16" fill={isNew ? main : "#fff"} stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="5.4" r="1.1" fill={isNew ? main : "#fff"} stroke={dark} strokeWidth="1.2" />
        {isNew && <path d="m18.6 2.6.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2.7-1.5Z" fill="#ffd23f" stroke="#a36a00" strokeWidth="0.7" strokeLinejoin="round" />}
      </Svg>
    );
  }
  if (id === "dolit") {
    return (
      <Svg size={size}>
        <circle cx="8" cy="11" r="4.4" fill="#fff" stroke="#16141a" strokeWidth="1.8" />
        <circle cx="16" cy="11" r="4.4" fill="#fff" stroke="#16141a" strokeWidth="1.8" />
        <circle cx="8" cy="12" r="1.7" fill="#16141a" />
        <circle cx="16" cy="12" r="1.7" fill="#16141a" />
        <ellipse cx="12" cy="18.4" rx="2.2" ry="1.7" fill="#f2ad94" stroke="#7a3a32" strokeWidth="1.2" />
      </Svg>
    );
  }
  if (id === "helmet") {
    return (
      <Svg size={size}>
        <path d="M5 13a7 7 0 0 1 14 0v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3Z" fill="#ffcc2e" stroke="#7a4a06" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="7.5" y="10.5" width="9" height="4.4" rx="2.2" fill="#9ad8ff" stroke="#7a4a06" strokeWidth="1.4" />
        <path d="M11 6h2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="8" fill="#eef3fb" stroke="#b9c6db" strokeWidth="1.8" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="#b9c6db" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}
export function BombIcon() {
  return (
    <Svg size={22}>
      <circle cx="11" cy="14" r="7.5" fill="#262a35" stroke="#101218" strokeWidth="2" />
      <circle cx="8.5" cy="11.5" r="1.6" fill="#ffffff" opacity="0.7" />
      <rect x="9.4" y="4.6" width="4.4" height="3.4" rx="1.4" fill="#8a8f9c" stroke="#101218" strokeWidth="1.4" />
      <path d="M11.6 4.8C12.5 3 14 2.4 16 3" stroke="#9a6b3f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="m16 0.8.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2.7-1.5Z" fill="#ffd23f" stroke="#a36a00" strokeWidth="0.7" strokeLinejoin="round" />
      <circle cx="9" cy="14" r="1.5" fill="#ffffff" />
      <circle cx="13.4" cy="14" r="1.5" fill="#ffffff" />
      <circle cx="9" cy="14.2" r="0.7" fill="#101218" />
      <circle cx="13.4" cy="14.2" r="0.7" fill="#101218" />
    </Svg>
  );
}
export function ChevronIcon({ dir = 1 }: { dir?: 1 | -1 }) {
  return (
    <Svg size={22}>
      <path
        d={dir === 1 ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}
        stroke="#5b3a00"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
export function CoinIcon() {
  return (
    <Svg size={16}>
      <circle cx="12" cy="12" r="9" fill="#ffd23f" stroke="#a36a00" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.6" fill="none" stroke="#a36a00" strokeWidth="1.6" />
      <path d="M12 8.5v7M9 10.5h4.5a2 2 0 0 1 0 4H9" stroke="#a36a00" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
export function PawIcon() {
  return (
    <Svg size={16}>
      <ellipse cx="12" cy="15" rx="4.4" ry="3.6" fill="#ff8fb3" />
      <circle cx="6.4" cy="10.4" r="1.9" fill="#ff8fb3" />
      <circle cx="10" cy="7.8" r="1.9" fill="#ff8fb3" />
      <circle cx="14" cy="7.8" r="1.9" fill="#ff8fb3" />
      <circle cx="17.6" cy="10.4" r="1.9" fill="#ff8fb3" />
    </Svg>
  );
}
