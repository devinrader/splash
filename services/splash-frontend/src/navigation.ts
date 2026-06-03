export type NavItemId =
  | "home"
  | "system"
  | "routines"
  | "history"
  | "automation"
  | "alerts"
  | "diagnostics"
  | "water-test-log"
  | "settings";

export type DiagnosticsTabId =
  | "protocol-explorer"
  | "live-data-monitor"
  | "device-inspector"
  | "logs-history"
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
  { id: "system", label: "System", description: "Equipment & sensors", icon: "missing-icon", path: "/system/overview" },
  { id: "routines", label: "Routines", description: "Maintenance and tasks", icon: "missing-icon", path: "/routines" },
  { id: "history", label: "History", description: "Trends & insights", icon: "missing-icon", path: "/history" },
  { id: "automation", label: "Automation", description: "Schedules & rules", icon: "missing-icon", path: "/automation" },
  { id: "alerts", label: "Alerts", description: "Messages & warnings", icon: "missing-icon", path: "/alerts" },
  { id: "diagnostics", label: "Diagnostics", description: "Protocol explorer", icon: "missing-icon", path: "/diagnostics/protocol-explorer" },
  { id: "water-test-log", label: "Water Test Log", description: "Test history & results", icon: "water-test-log", path: "/water-test-log" },
  { id: "settings", label: "Settings", description: "System & preferences", icon: "missing-icon", path: "/settings" }
];

export const PAGE_SUMMARIES: Record<NavItemId, string> = {
  home: "Operational overview and quick entry points for the current Splash milestone shell.",
  system: "Live equipment status, controller circuits, system timing, and protocol-level diagnostics for day-to-day pool operations.",
  routines: "Scheduled maintenance, recurring checklists, and operator workflows will appear here as the broader platform surface expands.",
  history: "Persistence-backed temperature and weather trends now live here for operator review and future analytics surfaces.",
  automation: "Automation now provides a working tabbed surface for schedules, rules, scenes, triggers, and recent activity while live automation APIs mature.",
  alerts: "Warnings, reminders, and equipment-driven attention items will collect here when the notification workflows are delivered.",
  diagnostics: "Advanced tooling stays grouped under Diagnostics so protocol exploration and lower-level operational views remain separate from day-to-day control.",
  "water-test-log": "Manual chemistry logging and later chart context will live here as the chemistry slice is added to the frontend shell.",
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
  { id: "logs-history", label: "Logs & History", path: "/diagnostics/logs-history" },
  { id: "network", label: "Network", path: "/diagnostics/network" }
];

export function getActiveNavItem(pathname: string) {
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
  if (pathname.startsWith("/diagnostics/logs-history")) {
    return "logs-history";
  }
  if (pathname.startsWith("/diagnostics/network")) {
    return "network";
  }
  return "protocol-explorer";
}
