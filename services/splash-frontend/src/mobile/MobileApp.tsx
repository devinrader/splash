import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { MobileAlertsPage } from "./MobileAlertsPage";
import { MobileChemistryEntryPage } from "./MobileChemistryEntryPage";
import { MobileCoverPage } from "./MobileCoverPage";
import { MobileHomePage } from "./MobileHomePage";
import { MobileNotificationSettingsPage } from "./MobileNotificationSettingsPage";

const MOBILE_NAV_ITEMS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/mobile", label: "Home", end: true },
  { to: "/mobile/chemistry/new", label: "Test" },
  { to: "/mobile/cover", label: "Cover" },
  { to: "/mobile/alerts", label: "Alerts" }
];

export function MobileApp() {
  return (
    <main className="mobile-shell">
      <header className="mobile-topbar">
        <div>
          <strong>Splash Mobile</strong>
          <span>Pool-side essentials</span>
        </div>
      </header>

      <section className="mobile-content">
        <Routes>
          <Route path="/mobile" element={<MobileHomePage />} />
          <Route path="/mobile/chemistry/new" element={<MobileChemistryEntryPage />} />
          <Route path="/mobile/cover" element={<MobileCoverPage />} />
          <Route path="/mobile/alerts" element={<MobileAlertsPage />} />
          <Route path="/mobile/settings/notifications" element={<MobileNotificationSettingsPage />} />
          <Route path="*" element={<Navigate to="/mobile" replace />} />
        </Routes>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {MOBILE_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-nav-link ${isActive ? "mobile-nav-link-active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </main>
  );
}
