# Overview

[Back to README](../README.md)

## Product summary

Splash is a self-hosted pool management platform for individual homeowners. It combines pool equipment connectivity, weather context, water chemistry tracking, and predictive guidance to reduce the time required to manage a residential swimming pool.

The stated SMART objective is to reduce average weekly pool-management time by 75%.

## Vision

Splash is intended to make proactive pool management practical for non-experts by:

- surfacing what needs attention before a problem becomes visible
- combining sensor, weather, and user-entered data into actionable guidance
- helping users replace reactive maintenance with structured routines and automation
- supporting both beginner and experienced pool owners without requiring paid pool service

## Target users

- First-time pool owners who need guided maintenance and confidence-building automation
- Experienced pool owners who want to reduce weekly effort
- Homeowners currently paying for pool service who want to self-manage
- Smart-home-oriented users who expect connected equipment and observability

## Scope

### Initial implementation target

The initial implementation of Splash is a narrow end-to-end vertical slice:

- read and display current air temperature
- read and display current water temperature
- read and display current salt level
- read and display current pump RPM
- change pump-circuit RPM from the browser

This first slice exists to validate the minimum useful closed loop from live
RS-485 traffic through protocol decode, persistence, API delivery, browser
presentation, command encode, serial write, and command-result tracking.

Longer-term platform direction:

- Splash should become the primary scheduling authority for pool equipment
- the operator should not need to rely on EasyTouch scheduling for normal
  operation once Splash scheduling is implemented
- pump-speed scheduling is the most important early scheduling replacement goal

### In scope

- Connectivity and control for pumps, heaters, lights, and related equipment
- Environmental integration for weather, temperature, UV, and rainfall context
- Water chemistry logging, interpretation, and alerts
- Equipment maintenance reminders and service history
- Seasonal opening and closing guidance
- Predictive task generation and suggest-and-approve automation

### Out of scope

- No explicit product features are marked out of scope in the source document
- ASSUMPTION: The lack of out-of-scope items reflects an early design phase, not unlimited implementation commitment

## Business and product posture

- Business model: free to use in v1
- Primary deployment model: self-hosted, local-first
- Core trust model: suggest-and-approve automation in v1, not full autonomy
- Primary delivery surfaces: responsive web app, MagicMirror module, and developer tooling via Protocol Explorer

## User experience direction

- Calm, clear, and trustworthy
- Light mode only in v1
- Responsive by default across desktop, tablet, and mobile
- Minimal friction for common actions like logging chemistry or approving automation
- Status communicated consistently with green, amber, and red indicators

![UI navigation map](./images/ui-navigation-map.png)

Caption: UI navigation map extracted from the source document. It represents the primary and secondary screen structure described for the web app.

## Primary screens

- Dashboard
- Chemistry
- Equipment
- Tasks
- Seasonal
- Notifications
- Cover
- SLAM
- Protocol Explorer
- Settings

## Navigation model

The application uses a persistent left sidebar on desktop and a collapsed or bottom-tab navigation model on smaller screens. Cover, SLAM, and Protocol Explorer are secondary destinations to keep the primary navigation focused on day-to-day pool management.

## Delivery roadmap

### V1 definition of done

- Initial implementation milestone completed:
  - browser UI shows current air temp, water temp, salt level, and pump RPM
- browser UI can change pump-circuit RPM
  - the end-to-end read and write path is proven on real equipment
- Working RS-485 connection that can read status from and send commands to at
  least one connected pool-equipment target
- Chemistry logging plus historical trend charts in the web UI

### Build phases

1. Initial implementation slice: Raspberry Pi hosts, RS-485 communication, protocol decode, minimal API and frontend, persistence or logging for live temperatures, salt, and pump RPM, plus browser pump-circuit RPM control
2. Core platform expansion: chemistry screen, equipment screen, dashboard, notification delivery, and broader normalized equipment coverage
3. Remaining v1 features: maintenance reminders, seasonal checklists, task list, predictive rules, cover tracking, SLAM workflow, Protocol Explorer, and rainfall tracking
4. Future roadmap: dosing recommendations, usage-based maintenance, autonomous automation, predictive fault detection, energy optimization, dark mode, and virtual or mock pool simulation for hardware-free testing and demos

Developer-note:

- narrow Protocol Explorer tooling may still appear earlier than the broader
  product-facing Protocol Explorer screen when that tooling is needed to
  complete reverse-engineering work for the initial milestone

## Primary technical risks

- RS-485 decoding varies by vendor and firmware version
- Chemistry-sensor integrations and InfluxDB ingestion need early validation
- Predictive automation must start with conservative rule logic before any ML-oriented expansion

## Legacy source note

TODO: The source document references wireframes as future work. No wireframe artifacts were embedded in the Word file beyond the navigation diagram.
