import type React from "react";

export function AppShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="app-frame">
      <div className="app-shell">
        {sidebar}
        <section className="main-area">
          <div className="content-container">
            <div className="app-main">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
