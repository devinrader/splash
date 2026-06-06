export type NavItemId =
  | "home"
  | "chemistry"
  | "system"
  | "routines"
  | "history"
  | "automation"
  | "diagnostics"
  | "settings";

export type DiagnosticsTabId =
  | "protocol-explorer"
  | "live-data-monitor"
  | "device-inspector"
  | "event-log"
  | "network";

export type AutomationTabId =
  | "overview"
  | "schedules"
  | "rules"
  | "scenes"
  | "triggers"
  | "logs";

export type SystemTabId =
  | "overview"
  | "hardware"
  | "sensors"
  | "control"
  | "connectivity"
  | "platform";

export type SystemHardwareDetailId = "easytouch8" | "intelliflo" | "intellichlor" | "ultratemp";

export const NAV_ITEMS: Array<{
  id: NavItemId;
  label: string;
  description: string;
  icon: "missing-icon";
  path: string;
}> = [
  { id: "home", label: "Home", description: "Overview & actions", icon: "missing-icon", path: "/" },
  { id: "chemistry", label: "Chemistry", description: "Water testing & treatment", icon: "missing-icon", path: "/chemistry" },
  { id: "system", label: "System", description: "Equipment & sensors", icon: "missing-icon", path: "/system/overview" },
  { id: "routines", label: "Routines", description: "Alerts & guided processes", icon: "missing-icon", path: "/routines" },
  { id: "history", label: "History", description: "Trends & insights", icon: "missing-icon", path: "/history" },
  { id: "automation", label: "Automation", description: "Schedules & rules", icon: "missing-icon", path: "/automation" },
  { id: "diagnostics", label: "Diagnostics", description: "Protocol explorer", icon: "missing-icon", path: "/diagnostics/protocol-explorer" },
  { id: "settings", label: "Settings", description: "System & preferences", icon: "missing-icon", path: "/settings" }
];

export const PAGE_SUMMARIES: Record<NavItemId, string> = {
  home: "Operational overview and quick entry points for the current Splash milestone shell.",
  chemistry: "Chemistry workflows collect water-test readings today and leave room for future treatment actions, status views, and SLAM workflows.",
  system: "Live equipment status, controller circuits, system timing, and protocol-level diagnostics for day-to-day pool operations.",
  routines: "Alerts, reminders, maintenance routines, and later multi-step guided pool-care processes live here.",
  history: "Persistence-backed temperature and weather trends now live here for operator review and future analytics surfaces.",
  automation: "Automation now provides a working tabbed surface for schedules, rules, scenes, triggers, and recent activity while live automation APIs mature.",
  diagnostics: "Advanced tooling stays grouped under Diagnostics so protocol exploration and lower-level operational views remain separate from day-to-day control.",
  settings: "Configuration, operator preferences, and system-level controls will be introduced here as setup and management flows expand."
};

export const AUTOMATION_TABS: Array<{ id: AutomationTabId; label: string; path: string }> = [
  { id: "overview", label: "Overview", path: "/automation/overview" },
  { id: "schedules", label: "Schedules", path: "/automation/schedules" },
  { id: "rules", label: "Rules", path: "/automation/rules" },
  { id: "scenes", label: "Scenes", path: "/automation/scenes" },
  { id: "triggers", label: "Triggers", path: "/automation/triggers" },
  { id: "logs", label: "Logs", path: "/automation/logs" }
];

export const SYSTEM_TABS: Array<{ id: SystemTabId; label: string; path: string }> = [
  { id: "overview", label: "Overview", path: "/system/overview" },
  { id: "hardware", label: "Hardware", path: "/system/hardware" },
  { id: "sensors", label: "Sensors", path: "/system/sensors" },
  { id: "control", label: "Control", path: "/system/control" },
  { id: "connectivity", label: "Connectivity", path: "/system/connectivity" },
  { id: "platform", label: "Platform", path: "/system/platform" }
];

export const DIAGNOSTICS_TABS: Array<{ id: DiagnosticsTabId; label: string; path: string }> = [
  { id: "protocol-explorer", label: "Protocol Explorer", path: "/diagnostics/protocol-explorer" },
  { id: "live-data-monitor", label: "Live Data Monitor", path: "/diagnostics/live-data-monitor" },
  { id: "device-inspector", label: "Device Inspector", path: "/diagnostics/device-inspector" },
  { id: "event-log", label: "Event Log", path: "/diagnostics/event-log" },
  { id: "network", label: "Network", path: "/diagnostics/network" }
];

export function getActiveNavItem(pathname: string) {
  if (pathname.startsWith("/chemistry")) {
    return NAV_ITEMS.find((item) => item.id === "chemistry") ?? NAV_ITEMS[0];
  }
  if (pathname.startsWith("/system")) {
    return NAV_ITEMS.find((item) => item.id === "system") ?? NAV_ITEMS[0];
  }
  if (pathname.startsWith("/automation")) {
    return NAV_ITEMS.find((item) => item.id === "automation") ?? NAV_ITEMS[0];
  }
  if (pathname.startsWith("/diagnostics")) {
    return NAV_ITEMS.find((item) => item.id === "diagnostics") ?? NAV_ITEMS[0];
  }
  return NAV_ITEMS.find((item) => item.path === pathname) ?? NAV_ITEMS[0];
}

export function getActiveAutomationTab(pathname: string): AutomationTabId {
  if (pathname.startsWith("/automation/schedules")) {
    return "schedules";
  }
  if (pathname.startsWith("/automation/rules")) {
    return "rules";
  }
  if (pathname.startsWith("/automation/scenes")) {
    return "scenes";
  }
  if (pathname.startsWith("/automation/triggers")) {
    return "triggers";
  }
  if (pathname.startsWith("/automation/logs")) {
    return "logs";
  }
  return "overview";
}

export function getActiveSystemTab(pathname: string): SystemTabId {
  if (pathname.startsWith("/system/hardware")) {
    return "hardware";
  }
  if (pathname.startsWith("/system/sensors")) {
    return "sensors";
  }
  if (pathname.startsWith("/system/control")) {
    return "control";
  }
  if (pathname.startsWith("/system/connectivity")) {
    return "connectivity";
  }
  if (pathname.startsWith("/system/platform")) {
    return "platform";
  }
  return "overview";
}

export function getActiveDiagnosticsTab(pathname: string): DiagnosticsTabId {
  if (pathname.startsWith("/diagnostics/live-data-monitor")) {
    return "live-data-monitor";
  }
  if (pathname.startsWith("/diagnostics/device-inspector")) {
    return "device-inspector";
  }
  if (pathname.startsWith("/diagnostics/event-log") || pathname.startsWith("/diagnostics/logs-history")) {
    return "event-log";
  }
  if (pathname.startsWith("/diagnostics/network")) {
    return "network";
  }
  return "protocol-explorer";
}
