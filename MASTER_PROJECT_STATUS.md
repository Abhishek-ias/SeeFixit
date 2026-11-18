# SeeFixit — Master Project Status
> Last updated: 2026-11-19 | Based on verified codebase audit

## Current Phase: P0 (Protect & Verify) → Transitioning to P1

---

## Project Vitals

| Property | Value |
|----------|-------|
| Repository | https://github.com/Abhishek-ias/SeeFixit |
| Latest commit | `1fba4ac` Fix authentication refresh rate limiting |
| Latest migration (local) | 009_create_report_attachments.sql |
| Latest migration (Neon) | 007_create_refresh_tokens.sql (unverified) |
| Backend tests | 106 total (28 pass / 78 fail — env issue, not code regression) |
| Frontend build | ✅ PASSES |
| Frontend lint | ✅ PASSES |

---

## P0 Checklist (Audit & Stabilise)

- [x] Audit completed — 2026-11-19
- [ ] **Commit all Day 83 work** (`git add . && git commit`)
- [ ] **Push to GitHub** (`git push origin main`)
- [ ] **Apply migration 008** to Neon database
- [ ] **Apply migration 009** to Neon database
- [ ] Add `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to .env
- [ ] Verify backend tests pass locally (with PostgreSQL running)
- [ ] Verify frontend build passes

---

## P1 Checklist (Core Civic Product)

### P1.1 — Complete Citizen Reporting
- [ ] Wire image upload middleware into POST /api/reports
- [ ] Connect Cloudinary upload in `issueService.createReport`
- [ ] Store `report_attachments` row after upload
- [ ] Return attachment URL in create report response
- [ ] Install `react-router-dom` in frontend
- [ ] Build `MyReports.jsx` citizen dashboard page
- [ ] Build `IssueDetail.jsx` single issue/report view
- [ ] Add `reportApi.getMyReports()` and `reportApi.getIssueDetail()` to `api.js`
- [ ] Add status timeline component (use `issue_status_history`)
- [ ] Add image preview to `ReportForm.jsx` before submission
- [ ] Add duplicate warning API endpoint `GET /api/issues/nearby`
- [ ] Add duplicate warning UI modal to `ReportForm.jsx`
- [ ] Add end-to-end submission test

### P1.5 — Authority Workflow
- [ ] Migration: `department_members` table
- [ ] Migration: `audit_logs` table
- [ ] Extend status machine: REJECTED, ON_HOLD, REOPENED
- [ ] Add admin routes: list, assign, update with reason, audit
- [ ] Build `AdminDashboard.jsx`
- [ ] Build department issue queue view
- [ ] Build officer assignment UI
- [ ] Build evidence review UI

---

## P2 Checklist (GIS + AI)

- [ ] Enable PostGIS on Neon (`CREATE EXTENSION postgis`)
- [ ] Migration: migrate lat/lon to GEOGRAPHY(Point)
- [ ] Add spatial index
- [ ] Build `MapView.jsx` with Leaflet
- [ ] Add marker clustering
- [ ] Add heatmap toggle
- [ ] Deploy AI inference service
- [ ] Add `ai_assessments` table migration
- [ ] Add BullMQ job queue for AI processing
- [ ] Add AI-suggested category to ReportForm
- [ ] Add AI priority view to AdminDashboard
- [ ] Implement in-app notifications
- [ ] Implement email notifications (SendGrid)

---

## P3 Checklist (Production + Pilot)

- [ ] GitHub Actions CI (lint + test + build)
- [ ] Dockerfile (backend + frontend)
- [ ] Prometheus metrics endpoint
- [ ] Grafana dashboard
- [ ] Automated DB backup to S3/Cloudflare R2
- [ ] OWASP ZAP security scan
- [ ] Load test (k6 or Artillery)
- [ ] Privacy policy + Terms of Service
- [ ] Data retention + account deletion endpoint
- [ ] WCAG 2.1 AA accessibility audit
- [ ] Pilot jurisdiction setup
- [ ] Officer onboarding
- [ ] Citizen beta testing
- [ ] Measure outcomes (resolution time, AI accuracy)

---

## Architecture Decisions (Locked)

| Decision | Choice | Reason |
|----------|--------|--------|
| Backend framework | Express 5 (monolith) | Existing; no microservices needed yet |
| Database | PostgreSQL / Neon | Existing; add PostGIS extension |
| Auth | JWT (15min) + refresh (30d) | Existing — do not change |
| Cookie | HttpOnly seefixit_refresh | Existing — do not change |
| Image storage | Cloudinary (SDK present) | Add credentials |
| Map library | Leaflet + OpenStreetMap | Free; sufficient for pilot |
| AI provider | TBD after P1 complete | Do not decide until P1 done |
| Job queue | BullMQ + Redis | Only when AI processing needed |
| CI/CD | GitHub Actions | P3 |
