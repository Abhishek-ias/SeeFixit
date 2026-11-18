# SeeFixit — Implementation Matrix
> Last updated: 2026-11-19 | Audited from actual codebase

| Module | Feature | Status | Evidence | Migration | API Endpoint | Frontend Component | Tests | Remaining Work |
|---|---|---|---|---|---|---|---|---|
| **Foundation** | Express backend | ✅ IMPLEMENTED | `backend/server.js` | — | — | — | ✓ | — |
| **Foundation** | PostgreSQL / Neon | ✅ IMPLEMENTED | `backend/config/config.js` | 000 | — | — | ✓ | Local & Neon dual connection support |
| **Foundation** | Migration system | ✅ IMPLEMENTED | `backend/db/migrations/` | 000–014 | — | — | ✓ | All 15 migrations verified on local & Neon |
| **Auth** | Email registration | ✅ IMPLEMENTED | `authService.js` | 000, 002 | POST /api/auth/register | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Email login | ✅ IMPLEMENTED | `authService.js` | 000 | POST /api/auth/login | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Google Sign-In | ✅ IMPLEMENTED | `authService.js` | 006 | POST /api/auth/google | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Refresh tokens | ✅ IMPLEMENTED | `sessionService.js` | 007 | POST /api/auth/refresh | `api.js` | ✓ | SHA-256 hashed 30-day rotation |
| **Auth** | Logout | ✅ IMPLEMENTED | `authRoutes.js` | — | POST /api/auth/logout | `App.jsx` | ✓ | Cookie cleared |
| **Security** | RBAC middleware | ✅ IMPLEMENTED | `requireRole.js` | — | (all protected routes) | — | ✓ | CITIZEN, OFFICER, ADMIN |
| **Security** | Report ownership | ✅ IMPLEMENTED | `authorizeReportOwner.js` | — | — | — | ✓ | Enforced |
| **Departments** | Department seeding | ✅ IMPLEMENTED | — | 005, 008 | GET /api/departments | — | ✓ | Roadways, Sanitation, Water, Lighting |
| **Reports** | Create report | ✅ IMPLEMENTED | `issueService.js:createReport` | 000, 011 | POST /api/reports | `ReportForm.jsx` | ✓ | Multi-part + Sharp + Cloudinary + AI triage |
| **Reports** | GPS location capture | ✅ IMPLEMENTED | `ReportForm.jsx` | 011 | — | `ReportForm.jsx` | ✓ | Browser Geolocation API + manual coordinates |
| **Reports** | Image upload | ✅ IMPLEMENTED | `reportImageUpload.js`, `reportImageProcessor.js` | 009 | POST /api/reports | `ReportForm.jsx` | ✓ | Processed to JPEG + Cloudinary |
| **Reports** | Cloudinary storage | ✅ IMPLEMENTED | `cloudinary.js`, `cloudinaryUpload.js` | 009 | POST /api/reports | — | ✓ | Active with environment keys |
| **Reports** | Duplicate warning | ✅ IMPLEMENTED | `issueService.js` spatial radius | 011 | GET /api/issues/nearby | `ReportForm.jsx` modal | ✓ | Distance in meters + warning modal |
| **Reports** | My Reports list | ✅ IMPLEMENTED | `issueService.js:getMyReports` | — | GET /api/my-reports | `MyReports.jsx` | ✓ | Filter tabs + counter badges |
| **Reports** | My Report detail | ✅ IMPLEMENTED | `issueService.js:getMyReportById` | — | GET /api/my-reports/:id | `IssueDetail.jsx` | ✓ | Timeline + OSM map link + rating |
| **Issues** | List all issues | ✅ IMPLEMENTED | `issueService.js:getAllIssues` | — | GET /api/issues | `AdminDashboard.jsx` | ✓ | Filter by category, status, dept |
| **Issues** | Issue detail | ✅ IMPLEMENTED | `issueService.js:getIssueDetails` | — | GET /api/issues/:id | `AdminDashboard.jsx` | ✓ | Reports, history, evidence, assignments, auditLogs |
| **Issues** | Extended status transitions | ✅ IMPLEMENTED | `issueService.js:updateIssueStatus` | 010 | PATCH /api/issues/:id/status | `AdminDashboard.jsx` | ✓ | OPEN, IN_PROGRESS, ON_HOLD, RESOLVED, REJECTED, REOPENED |
| **Issues** | Status history & notes | ✅ IMPLEMENTED | `issue_status_history` table | 010 | GET /api/issues/:id/history | `AdminDashboard.jsx` | ✓ | Includes `note` & `changed_by` |
| **Issues** | Evidence upload | ✅ IMPLEMENTED | `issueService.js:uploadEvidence` | 000 | POST /api/issues/:id/evidence | `AdminDashboard.jsx` | ✓ | Mandatory before resolution |
| **Issues** | Evidence view | ✅ IMPLEMENTED | `issueService.js:getIssueEvidence` | 000 | GET /api/issues/:id/evidence | `AdminDashboard.jsx` | ✓ | Gallery view in management modal |
| **Authority** | Admin dashboard | ✅ IMPLEMENTED | `AdminDashboard.jsx` | — | GET /api/admin/stats | `AdminDashboard.jsx` | ✓ | KPI cards, triage modal, filters |
| **Authority** | Issue assignment | ✅ IMPLEMENTED | `issueService.js:assignIssue` | 010, 013 | POST /api/issues/:id/assign | `AdminDashboard.jsx` | ✓ | Assign to officers with notes & cascade |
| **Authority** | Department members | ✅ IMPLEMENTED | `department_members` table | 010 | GET /api/departments | `AdminDashboard.jsx` | ✓ | Officers mapped to departments |
| **Authority** | Audit logs | ✅ IMPLEMENTED | `audit_logs` table | 010, 013 | GET /api/issues/:id | `AdminDashboard.jsx` | ✓ | Recorded on status change, assignment, feedback |
| **GIS** | PostGIS & Spatial | ✅ IMPLEMENTED | `011_enable_postgis_and_spatial_indexes.sql` | 011 | — | — | ✓ | `cube`, `earthdistance`, PostGIS fallback |
| **GIS** | Spatial geography & GIST | ✅ IMPLEMENTED | `civic_issues.location`, `reports.location` | 011 | — | — | ✓ | GIST & composite B-tree indexes active |
| **GIS** | Spatial API endpoints | ✅ IMPLEMENTED | `reportRoutes.js:GET /api/issues/map` | 011 | GET /api/issues/map, GET /api/issues/nearby | — | ✓ | Viewport & radius queries |
| **GIS** | Interactive Map UI | ✅ IMPLEMENTED | `MapView.jsx`, `MapView.css` | 011 | GET /api/issues/map | `MapView.jsx` (`/map`) | ✓ | Leaflet + OSM tiles + custom pins + GPS locate |
| **AI** | Civic classification | ✅ IMPLEMENTED | `aiService.js:classifyReportText` | 012 | POST /api/ai/analyze | `ReportForm.jsx` | ✓ | Real-time category recommendation & confidence |
| **AI** | Hazard detection | ✅ IMPLEMENTED | `aiService.js:detectSafetyHazards` | 012 | POST /api/ai/analyze | `ReportForm.jsx`, `AdminDashboard.jsx` | ✓ | Critical hazard alerts (electrical, collapse, etc.) |
| **AI** | Severity / priority score | ✅ IMPLEMENTED | `aiService.js:calculateSeverityAndPriority` | 012 | POST /api/ai/analyze | `AdminDashboard.jsx` | ✓ | 1–100 score + explainable triage action |
| **AI** | Officer feedback audit | ✅ IMPLEMENTED | `aiService.js:recordAiFeedback` | 012 | POST /api/issues/:id/ai-feedback | `AdminDashboard.jsx` | ✓ | Human officer override & accuracy tracking (👍/👎) |
| **AI** | Resolution verification | ✅ IMPLEMENTED | `aiService.js:verifyResolutionEvidence` | 012 | POST /api/issues/:id/evidence | — | ✓ | Evaluates resolution evidence completeness |
| **Engagement** | In-app notifications | ✅ IMPLEMENTED | `notificationService.js` | 014 | GET /api/notifications | `NotificationBell.jsx` | ✓ | Bell icon + unread counter + mark-read |
| **Engagement** | Citizen resolution rating | ✅ IMPLEMENTED | `issueService.js:submitResolutionFeedback` | 014 | POST /api/issues/:id/feedback | `IssueDetail.jsx` | ✓ | 1–5 stars + satisfaction toggle + comments |
| **Engagement** | Dispute & reopening | ✅ IMPLEMENTED | `issueService.js:reopenIssueByCitizen` | 014 | POST /api/issues/:id/reopen | `IssueDetail.jsx` | ✓ | Citizen dispute form triggers `REOPENED` status |
| **Integrations** | Open311 GeoReport v2 | ✅ IMPLEMENTED | `open311Routes.js` | — | GET /api/open311/v2/services.json, /requests.json | — | ✓ | Global smart-city interoperability specification |
| **Production** | Containerization | ✅ IMPLEMENTED | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` | — | — | — | ✓ | Production multi-stage Docker build & Compose |
| **Production** | Continuous Integration | ✅ IMPLEMENTED | `.github/workflows/ci.yml` | — | — | — | ✓ | GitHub Actions CI (unit tests, oxlint, vite build) |

**Legend:** ✅ IMPLEMENTED | ⚠️ PARTIAL | ❌ NOT IMPLEMENTED
