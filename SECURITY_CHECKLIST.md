# SeeFixit — Security Checklist
> Last updated: 2026-11-19

## Authentication & Sessions

| Check | Status | File |
|-------|--------|------|
| JWT access tokens expire in 15 minutes | ✅ | `authService.js` |
| Refresh tokens stored as SHA-256 hash | ✅ | `sessionService.js` |
| HttpOnly seefixit_refresh cookie | ✅ | `authRoutes.js` |
| Refresh cookie scoped to /api/auth | ✅ | `authRoutes.js` |
| Secure cookie flag in production | ✅ | `authRoutes.js` |
| Refresh token rotation on each use | ✅ | `sessionService.js` |
| Logout clears DB token | ✅ | `authRoutes.js` |
| Google token verified with google-auth-library | ✅ | `authService.js` |

## API & Transport Security

| Check | Status | File |
|-------|--------|------|
| Helmet HTTP headers | ✅ | `server.js` |
| Exact-origin CORS with credentials | ✅ | `server.js` |
| JSON body size limit | ✅ | `server.js` |
| Auth-specific rate limiting | ✅ | `authRateLimiter.js` |
| Global API rate limiting | ✅ | `rateLimiter.js` |
| Cloudflare IP extraction | ✅ | `clientIpKeyGenerator.js` |
| SQL injection prevention (parameterised queries) | ✅ | All service files use `$1` params |
| Input validation (Joi) | ✅ | `validation/` |

## Media Security

| Check | Status | File |
|-------|--------|------|
| File type whitelist (JPEG/PNG/WebP only) | ✅ | `reportImageUpload.js` |
| 5 MB file size limit | ✅ | `reportImageUpload.js` |
| MIME type verification (actual vs declared) | ✅ | `reportImageProcessor.js` |
| EXIF stripping via Sharp | ✅ | `reportImageProcessor.js` |
| Image dimension / pixel bomb protection | ✅ | `reportImageProcessor.js` |
| Multi-page / animated image rejection | ✅ | `reportImageProcessor.js` |
| Cloudinary upload over HTTPS (`secure: true`) | ✅ | `cloudinary.js` |
| Cloudinary API credentials present | ❌ | `.env` missing API_KEY + API_SECRET |
| Upload rate limiting | ✅ | `reportUploadLimiter.js` |
| Signed/private storage URLs | ❌ | Not implemented — P1.4 |
| Image upload wired to report route | ❌ | Not connected — P1.4 |

## Authorization

| Check | Status | File |
|-------|--------|------|
| RBAC with requireRole middleware | ✅ | `requireRole.js` |
| Report ownership enforced | ✅ | `authorizeReportOwner.js` |
| Citizens cannot change issue status | ✅ | `PATCH /issues/:id/status` requires ADMIN |
| Admin-only evidence upload | ✅ | `POST /issues/:id/evidence` requires ADMIN |
| Citizen cannot see other citizen reports | ✅ | `getMyReportById` checks userId |

## Pending Security Work (Prioritised)

- [ ] **P1.4** — Add Cloudinary API_KEY + API_SECRET to secrets management
- [ ] **P1.4** — Return signed/private URLs instead of public Cloudinary URLs
- [ ] **P1.5** — Audit log for every admin status change and assignment
- [ ] **P2** — CSRF protection review (cookie-based auth with SameSite)
- [ ] **P3** — OWASP ZAP automated scan
- [ ] **P3** — Secret rotation procedure documented
- [ ] **P3** — Data retention and account deletion endpoint
- [ ] **P3** — Privacy policy covering geolocation data
