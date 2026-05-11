import * as React from "react";

export type SplashIconName =
  | "add"
  | "air-temperature"
  | "alerts"
  | "automation"
  | "brand-drop"
  | "calcium-hardness"
  | "cancel"
  | "chlorinator"
  | "circuit"
  | "cleaner"
  | "confirm"
  | "critical"
  | "cyanuric-acid"
  | "delete"
  | "desired-state"
  | "diagnostics"
  | "download"
  | "edit"
  | "event-log"
  | "export"
  | "filter"
  | "flow"
  | "good"
  | "heater"
  | "help"
  | "history"
  | "home"
  | "import"
  | "insights"
  | "message"
  | "missing-icon"
  | "notification"
  | "offline"
  | "online"
  | "orp"
  | "pending"
  | "ph"
  | "pool-light"
  | "pressure"
  | "pump"
  | "rain"
  | "recommendation"
  | "routine-task"
  | "routines"
  | "salt"
  | "schedule"
  | "search"
  | "settings"
  | "spa-blower"
  | "stale"
  | "system"
  | "temperature"
  | "unknown"
  | "valve"
  | "warning"
  | "water-balance"
  | "water-feature"
  | "water-test-log"
  | "weather";

export type SplashIconProps = React.SVGProps<SVGSVGElement> & {
  name: SplashIconName;
  size?: number;
};

const paths: Record<SplashIconName, React.ReactNode> = {
  add: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  "air-temperature": <><path d="M7 18h9a4 4 0 0 0 .6-8A6 6 0 0 0 5.5 8.8 4.6 4.6 0 0 0 7 18Z" /></>,
  alerts: <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  automation: (
    <>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="3" />
      <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  "brand-drop": <><path d="M12 2.5C8.6 7.2 6 10.8 6 14a6 6 0 0 0 12 0c0-3.2-2.6-6.8-6-11.5Z" /><path d="M8.5 14.2a3.6 3.6 0 0 0 5.3 3.2" /></>,
  "calcium-hardness": <><path d="M12 3 4 8v8l8 5 8-5V8l-8-5Z" /><path d="M12 3v18" /><path d="m4 8 8 5 8-5" /><path d="m4 16 8-5 8 5" /></>,
  cancel: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chlorinator: <><path d="M12 3c-3 4-5 6.8-5 9.3a5 5 0 0 0 10 0C17 9.8 15 7 12 3Z" /><path d="M8 17c2.3 1.5 5.7 1.5 8 0" /><path d="M9.5 11h5" /><path d="M12 8.5v5" /></>,
  circuit: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12h8" /><path d="M12 8v8" /><circle cx="12" cy="12" r="1" /></>,
  cleaner: <><path d="M7 16h10l-1 4H8l-1-4Z" /><path d="M9 16V8a3 3 0 0 1 6 0v8" /><path d="M8 20v2M16 20v2" /><path d="M10 12h4" /></>,
  confirm: <><path d="m4 12 5 5L20 6" /></>,
  critical: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 17h.01" /></>,
  "cyanuric-acid": <><path d="M8 5a4 4 0 0 1 8 0c0 3-4 4-4 7" /><path d="M12 17h.01" /><path d="M5 21h14" /></>,
  delete: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></>,
  "desired-state": <><path d="M4 12h12" /><path d="m12 8 4 4-4 4" /><circle cx="18" cy="12" r="2" /></>,
  diagnostics: <><path d="M4 16.5 16.5 4" /><path d="m14 4 6 6-4 4-6-6 4-4Z" /><path d="M5 19h6" /><path d="M7 17v4" /><path d="M3 21h8" /><path d="M18 12l3 3" /><path d="M15 15l3 3" /></>,
  download: <><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M5 21h14" /></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  "event-log": <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  export: <><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 14v5h14v-5" /></>,
  filter: <><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /></>,
  flow: <><path d="M3 12c4-5 8 5 12 0 2-2.5 4-2.5 6 0" /><path d="M3 17c4-5 8 5 12 0 2-2.5 4-2.5 6 0" /><path d="m16 6 3 3-3 3" /></>,
  good: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></>,
  heater: <><path d="M7 20h10" /><path d="M8 17h8a3 3 0 0 0 2.4-4.8L12 3 5.6 12.2A3 3 0 0 0 8 17Z" /><path d="M12 14c1.3-1.1 2-2.1 2-3.1 0-1.2-.8-2.1-2-3.6-1.2 1.5-2 2.4-2 3.6 0 1 .7 2 2 3.1Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4" /><path d="M12 17h.01" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 5v5h5" /><path d="M12 7v5l3 2" /></>,
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-5h5v5" /></>,
  import: <><path d="M12 15V3" /><path d="m8 11 4 4 4-4" /><path d="M5 14v5h14v-5" /></>,
  insights: <><path d="M4 19h16" /><path d="M6 16v-4" /><path d="M11 16V7" /><path d="M16 16v-7" /><path d="m6 10 5-5 5 3" /></>,
  message: <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8M8 13h5" /></>,
  "missing-icon": (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m7 17 3.5-3.5 2.5 2.5 2.5-3 1.5 2" />
      <path d="M10 3h4" />
    </>
  ),
  notification: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>,
  offline: <><circle cx="12" cy="12" r="9" /><path d="m8.5 8.5 7 7M15.5 8.5l-7 7" /></>,
  online: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5 10.5 15 16 9.5" /></>,
  orp: <><path d="M13 2 5 13h6l-1 9 8-12h-6l1-8Z" /></>,
  pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M7 12a5 5 0 0 1 5-5" /></>,
  ph: <><path d="M9 2h6" /><path d="M10 2v6l-5 8a4 4 0 0 0 3.4 6h7.2A4 4 0 0 0 19 16l-5-8V2" /><path d="M8 15h8" /><path d="M9 18h6" /></>,
  "pool-light": <><path d="M9 18h6" /><path d="M10 21h4" /><path d="M8 11a4 4 0 1 1 8 0c0 1.5-.8 2.3-1.6 3.2-.5.6-.9 1.1-.9 1.8h-3c0-.7-.4-1.2-.9-1.8C8.8 13.3 8 12.5 8 11Z" /><path d="M12 2v2M4.9 4.9l1.4 1.4M19.1 4.9l-1.4 1.4" /></>,
  pressure: <><path d="M5 16a7 7 0 1 1 14 0" /><path d="M12 16l4-5" /><path d="M8 20h8" /><path d="M7 16h10" /></>,
  pump: <><circle cx="10" cy="12" r="4" /><path d="M14 12h5a2 2 0 0 1 0 4h-2" /><path d="M6 12H3v5h4" /><path d="M10 8V5h4v3" /><path d="M8 16v3h8v-3" /><path d="M10 10.5v3l2.5 1.3" /></>,
  rain: <><path d="M12 3c-3 4-5 6.8-5 9.3a5 5 0 0 0 10 0C17 9.8 15 7 12 3Z" /><path d="M8 19c2.3 1.5 5.7 1.5 8 0" /></>,
  recommendation: <><path d="M9 18h6" /><path d="M10 21h4" /><path d="M8 10a4 4 0 1 1 8 0c0 1.5-.8 2.4-1.6 3.2-.5.5-.9 1.1-.9 1.8h-3c0-.7-.4-1.3-.9-1.8C8.8 12.4 8 11.5 8 10Z" /></>,
  "routine-task": <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4" /><path d="m8 13 2 2 5-5" /><path d="M8 18h8" /></>,
  routines: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /><path d="M8 3.8 6.5 2.5M16 3.8l1.5-1.3" /></>,
  salt: <><circle cx="7" cy="16" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="17" cy="16" r="1" /><circle cx="9" cy="7" r="1" /><circle cx="15" cy="7" r="1" /><path d="M4 21h16" /></>,
  schedule: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M9 15h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-3v-.7a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L6.6 17l.1-.1A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.6-1H4v-3h1.4A1.7 1.7 0 0 0 7 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h3v1.7a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L20 8l-.1.1A1.7 1.7 0 0 0 19.6 10a1.7 1.7 0 0 0 1.6 1H22v3h-.8a1.7 1.7 0 0 0-1.8 1Z" /></>,
  "spa-blower": <><path d="M5 17c2 1.5 4 1.5 6 0s4-1.5 6 0" /><path d="M4 20c2 1.5 4 1.5 6 0s4-1.5 6 0" /><circle cx="8" cy="9" r="2" /><circle cx="13" cy="6" r="1.5" /><circle cx="16" cy="11" r="1.8" /></>,
  stale: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /><path d="M16.8 7.2 7.2 16.8" /></>,
  system: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /><path d="M10 7h4M7 10v4M17 10v4M10 17h4" /></>,
  temperature: <><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z" /><path d="M12 6v8" /><path d="M9 19h6" /></>,
  unknown: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4" /><path d="M12 17h.01" /></>,
  valve: <><path d="M5 8h14" /><path d="M12 8V4" /><path d="M9 4h6" /><path d="M7 8v8a5 5 0 0 0 10 0V8" /><path d="M9 16h6" /></>,
  warning: <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  "water-balance": <><path d="M4 18h16" /><path d="M6 18 12 5l6 13" /><path d="M9 12h6" /><path d="M8 21h8" /></>,
  "water-feature": <><path d="M4 19c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0" /><path d="M12 4v11" /><path d="M8 8c0-2 2-4 4-4s4 2 4 4" /><path d="M9 11c.8-1 1.8-1.5 3-1.5s2.2.5 3 1.5" /></>,
  "water-test-log": <><path d="M9 2h6" /><path d="M10 2v6l-5 8a4 4 0 0 0 3.4 6h7.2A4 4 0 0 0 19 16l-5-8V2" /><path d="M8 14h8" /><path d="M10 18h4" /></>,
  weather: <><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 8.6 4.8 4.8 0 0 0 7 18Z" /><path d="M18 4v2M21 7l-1.4 1.4M15 7l1.4 1.4" /><path d="M18 9a3 3 0 0 0-3-3" /></>
};

export function SplashIcon({ name, size = 24, ...props }: SplashIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
