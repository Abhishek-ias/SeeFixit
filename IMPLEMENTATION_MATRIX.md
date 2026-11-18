# SeeFixit — Implementation Matrix
> Last updated: 2026-11-19 | Audited from actual codebase

| Module | Feature | Status | Evidence | Migration | API Endpoint | Frontend Component | Tests | Remaining Work |
|--------|---------|--------|---------|-----------|-------------|-------------------|-------|----------------|
| **Foundation** | Express backend | ✅ IMPLEMENTED | `backend/server.js` | — | — | — | ✓ | — |
| **Foundation** | PostgreSQL/Neon | ✅ IMPLEMENTED | `backend/config/config.js` | 000 | — | — | ✓ | — |
| **Foundation** | Migration system | ✅ IMPLEMENTED | `backend/db/migrations/` | 000–011 | — | — | ✓ | Migrations 000–011 applied to Neon |
| **Auth** | Email registration | ✅ IMPLEMENTED | `authService.js` | 000, 002 | POST /api/auth/register | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Email login | ✅ IMPLEMENTED | `authService.js` | 000 | POST /api/auth/login | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Google Sign-In | ✅ IMPLEMENTED | `authService.js` | 006 | POST /api/auth/google | `AuthPanel.jsx` | ✓ | — |
| **Auth** | Refresh tokens | ✅ IMPLEMENTED | `sessionService.js` | 007 | POST /api/auth/refresh | `api.js` | ✓ | — |
| **Auth** | Logout | ✅ IMPLEMENTED | `authRoutes.js` | — | POST /api/auth/logout | `App.jsx` | ✓ | — |
| **Security** | RBAC middleware | ✅ IMPLEMENTED | `requireRole.js` | — | (all protected routes) | — | ✓ | — |
| **Security** | Report ownership | ✅ IMPLEMENTED | `authorizeReportOwner.js` | — | — | — | ✓ | — |
| **Departments** | Department seeding | ✅ IMPLEMENTED | — | 005, 008 | GET /api/departments | — | ✓ | — |
| **Reports** | Create report | ✅ IMPLEMENTED | `issueService.js:createReport` | 000 | POST /api/reports | `ReportForm.jsx` | ✓ | PostGIS location + Sharp processing |
| **Reports** | GPS location capture | ✅ IMPLEMENTED | `ReportForm.jsx` | — | — | `ReportForm.jsx` | ✓ | Browser Geolocation API |
| **Reports** | Image upload | ✅ IMPLEMENTED | `reportImageUpload.js`, `reportImageProcessor.js` | 009 | POST /api/reports | `ReportForm.jsx` | ✓ | Processed to JPEG + Cloudinary |
| **Reports** | Cloudinary storage | ✅ IMPLEMENTED | `cloudinary.js`, `cloudinaryUpload.js` | 009 | POST /api/reports | — | ✓ | Keys configured & active |
| **Reports** | Duplicate warning | ✅ IMPLEMENTED | `issueService.js` spatial radius | 011 | GET /api/issues/nearby | `ReportForm.jsx` modal | ✓ | Distance in meters + modal alert |
| **Reports** | My Reports list | ✅ IMPLEMENTED | `issueService.js:getMyReports` | — | GET /api/my-reports | `MyReports.jsx` | ✓ | Filter tabs + status badges |
| **Reports** | My Report detail | ✅ IMPLEMENTED | `issueService.js:getMyReportById` | — | GET /api/my-reports/:id | `IssueDetail.jsx` | ✓ | Timeline + OSM map link |
| **Issues** | List all issues | ✅ IMPLEMENTED | `issueService.js:getAllIssues` | — | GET /api/issues | `AdminDashboard.jsx` | ✓ | Filter by category, status, dept |
| **Issues** | Issue detail | ✅ IMPLEMENTED | `issueService.js:getIssueDetails` | — | GET /api/issues/:id | `AdminDashboard.jsx` | ✓ | Reports, history, evidence, assignments, auditLogs |
| **Issues** | Extended status transitions | ✅ IMPLEMENTED | `issueService.js:updateIssueStatus` | 010 | PATCH /api/issues/:id/status | `AdminDashboard.jsx` | ✓ | OPEN, IN_PROGRESS, ON_HOLD, RESOLVED, REJECTED, REOPENED |
| **Issues** | Status history & notes | ✅ IMPLEMENTED | `issue_status_history` table | 010 | GET /api/issues/:id/history | `AdminDashboard.jsx` | ✓ | Includes `note` & `changed_by` |
| **Issues** | Evidence upload | ✅ IMPLEMENTED | `issueService.js:uploadEvidence` | 000 | POST /api/issues/:id/evidence | `AdminDashboard.jsx` | ✓ | Mandatory before resolution |
| **Issues** | Evidence view | ✅ IMPLEMENTED | `issueService.js:getIssueEvidence` | 000 | GET /api/issues/:id/evidence | `AdminDashboard.jsx` | ✓ | Gallery view in management modal |
| **Authority** | Admin dashboard | ✅ IMPLEMENTED | `AdminDashboard.jsx` | — | GET /api/admin/stats | `AdminDashboard.jsx` | ✓ | KPI cards, triage modal, filters |
| **Authority** | Issue assignment | ✅ IMPLEMENTED | `issueService.js:assignIssue` | 010 | POST /api/issues/:id/assign | `AdminDashboard.jsx` | ✓ | Assign to officers with notes |
| **Authority** | Department members | ✅ IMPLEMENTED | `department_members` table | 010 | GET /api/departments | `AdminDashboard.jsx` | ✓ | Schema ready for officer mapping |
| **Authority** | Audit logs | ✅ IMPLEMENTED | `audit_logs` table | 010 | GET /api/issues/:id | `AdminDashboard.jsx` | ✓ | Recorded on status change & assignment |
| **GIS** | PostGIS extension | ✅ IMPLEMENTED | `011_enable_postgis_and_spatial_indexes.sql` | 011 | — | — | ✓ | Active on Neon database |
| **GIS** | Spatial geography & GIST | ✅ IMPLEMENTED | `civic_issues.location`, `reports.location` | 011 | — | — | ✓ | GIST spatial indexes active |
| **GIS** | Spatial API endpoints | ✅ IMPLEMENTED | `reportRoutes.js:GET /api/issues/map` | 011 | GET /api/issues/map, GET /api/issues/nearby | — | ✓ | Viewport & radius queries |
| **GIS** | Interactive Map UI | ✅ IMPLEMENTED | `MapView.jsx`, `MapView.css` | 011 | GET /api/issues/map | `MapView.jsx` (`/map`) | ✓ | Leaflet + OSM tiles + custom pins + GPS |
| **AI** | Image classification | ❌ NOT IMPLEMENTED | — | — | — | — | — | P2.2: AI service pipeline |
| **AI** | Text classification | ❌ NOT IMPLEMENTED | — | — | — | — | — | P2.2 |
| **AI** | Duplicate detection (AI) | ❌ NOT IMPLEMENTED | — | — | — | — | — | P2.2 |
| **AI** | Severity / priority | ❌ NOT IMPLEMENTED | — | — | — | — | — | P2.2 |
| **Notifications** | In-app & Email | ❌ NOT IMPLEMENTED | — | — | — | — | — | P2.4 |
| **Analytics** | Admin analytics | ⚠️ PARTIAL | `getAdminStats()` | 010 | GET /api/admin/stats | `AdminDashboard.jsx` | ✓ | KPI cards implemented; P3 charts |
| **Production** | CI/CD | ❌ NOT IMPLEMENTED | — | — | — | — | — | P3 |
| **Production** | Docker | ❌ NOT IMPLEMENTED | — | — | — | — | — | P3 |
| **Production** | Monitoring | ❌ NOT IMPLEMENTED | — | — | — | — | — | P3 |

**Legend:** ✅ IMPLEMENTED | ⚠️ PARTIAL | ❌ NOT IMPLEMENTED
