# Tracking Notice & Consent Policy

**Last Updated:** July 28, 2026
**Effective Date:** July 28, 2026

## 1. What We Track

This website uses session replay and analytics technology to monitor user behavior, diagnose errors, and improve site performance.

### 1.1 Session Replay (LogRocket)

We use LogRocket, a third-party session replay service, to record your interactions with the Site, including:

- **Page navigation:** Which pages you visit and the order.
- **User interactions:** Clicks, scrolls, form fills (with masking), and keyboard input.
- **Technical data:** Browser type, OS, device type, IP address, and network performance.
- **Errors:** JavaScript errors, network errors, and console logs.

Session replay enables us to understand how users navigate the Site, identify bugs, and debug performance issues.

### 1.2 What Is NOT Recorded

We have configured LogRocket to **not** record:

- Sensitive URL paths like `/admin` login flows (masked or excluded).
- Password fields, credit card data, or other explicitly masked input fields.
- Audio or video content.
- Content from third-party embedded iframes (with limited exceptions).
- **URL query parameters** — query strings are stripped before events are sent to LogRocket.

### 1.3 Cookie & Storage

We use browser storage technologies to track your activity:

- **Consent Identifier Cookie (`tr_uuid`):** A randomly generated identifier cookie is set with a 30-day lifetime. It is `HttpOnly`, so site JavaScript cannot read it. The identifier is recorded by our application only after analytics consent is granted.
- **Cookies:** We store a `sidebar_state` cookie to remember your UI preferences (sidebar open/closed).
- **Session Cookies:** For authenticated admin users, we store session cookies for authentication.

### 1.4 Security & Rate-Limit Logging

The edge and application process an IP address transiently to enforce geographic access controls and an in-memory API rate limit. The application does not store raw IP request logs or link IP addresses to the consent identifier. Operational request logs contain a generated request ID, method, path, status, and duration, but no raw IP address.

### 1.5 Campaign Source Tracking

If you arrive at the Site via a link containing a campaign reference parameter, and you have granted analytics consent, we may record that campaign source in our systems to understand how visitors discover the Site. No personally identifiable information is collected through this mechanism. If you have not granted consent, the parameter is discarded without being recorded.

## 2. Categories of Tracking

We categorize tracking as follows:

### Category 1: Strictly Necessary
- Session authentication and authorization cookies.
- CSRF tokens and security measures.

**Consent Required?** No (necessary for site functionality).

### Category 2: Analytics & Performance
- LogRocket session replay and error tracking.
- Page view and navigation tracking.
- Performance metrics and aggregated analytics.

**Consent Required?** Yes. Non-essential tracking is disabled until explicit opt-in is provided.

### Category 3: Marketing & Profiling
- Tracking for targeted advertising or retargeting.
- Building profiles for third-party use.

**Consent Required?** Yes (and we do not currently implement this).

## 3. Consent Behavior

### 3.1 Global Requirements

- Session replay and analytics are disabled by default.
- A consent interface is presented to visitors and non-essential tracking is enabled only after explicit opt-in.
- Consent remains valid for 12 months unless withdrawn.
- The Site is intended primarily for US traffic and may restrict access from non-US regions.

### 3.2 Consent Storage

When you grant consent, we store:
- **Consent timestamp:** When you accepted tracking.
- **Policy version:** Which version of the privacy policy you accepted.
- **Consent signal:** Whether you accepted or rejected specific categories.

This consent record is retained for 12 months.

## 4. How to Manage Your Preferences

### 4.1 Consent Banner

On first visit, a consent banner appears asking you to accept or reject tracking. You can:

- **Accept All:** Accept all non-essential tracking.
- **Reject All:** Reject all non-essential tracking (only necessary cookies remain active).
- **Manage Preferences:** Customize which categories you accept.

### 4.2 Cookie Management

You can manage browser cookies and storage through your browser settings:

- **Google Chrome:** Settings → Privacy and Security → Cookies and other site data.
- **Mozilla Firefox:** Preferences → Privacy & Security → Cookies and Site Data.
- **Safari:** Preferences → Privacy → Manage Website Data.
- **Microsoft Edge:** Settings → Privacy, search, and services → Clear browsing data.

**Clearing site storage:** Use browser developer tools (F12) → Application to clear this site's cookies, local storage, and session storage.

### 4.3 Browser-Level Controls

- **Do Not Track (DNT):** If your browser sends a DNT signal, we will respect it and disable non-essential tracking.
- **Global Privacy Control (GPC):** If enabled, we will treat it as an opt-out signal.

### 4.4 Opt-Out via Contact

To submit an opt-out request for LogRocket tracking, contact:

**Matthew Tujague**  
Email: matthew@2jog.dev  
Subject: "Opt-Out of Session Replay Tracking"

Response time target: Within 7 days.

## 5. LogRocket Data Processing

LogRocket is a third-party processor that handles session replay data for Site operations.

- **Data Protection Agreement:** A Data Processing Agreement (DPA) with LogRocket is maintained for GDPR/privacy compliance.
- **Data Retention:** LogRocket retains replay data according to their default retention limits; older data is automatically deleted.
- **Data Transfers:** LogRocket processes data in the United States under Standard Contractual Clauses (SCCs) and is certified under appropriate transfer mechanisms.
- **LogRocket's Privacy Policy:** https://logrocket.com/privacy

For details on LogRocket processing, refer to LogRocket's privacy policy or DPA.

## 6. Your Privacy Rights

### 6.1 Access & Deletion

You have the right to:

- **Request Access:** Ask what data we and LogRocket hold about you.
- **Request Deletion:** Ask us to delete your session replay data (subject to retention requirements).
- **Data Portability:** Request your data in a portable format.

Submit requests to: matthew@2jog.dev

**Response Time:** 30 days (or as required by applicable law).

### 6.2 Withdrawal of Consent

If you previously consented to tracking, you may withdraw consent anytime by:

- Adjusting your browser's cookie settings.
- Using the consent banner to change your preferences.
- Contacting us via email.

Withdrawal of consent does not affect the lawfulness of processing before withdrawal.

## 7. Changes to This Policy

This Tracking Notice & Consent Policy may be updated at any time. Continued use of the Site after posted changes constitutes acceptance of the updated policy.

## 8. Contact & Support

For questions about how we track data, your consent options, or to request opt-out, contact:

**Matthew Tujague**  
Email: matthew@2jog.dev  
Phone: +1 (732) 639-3889  
Location: Middletown, NJ, United States

---

**This Tracking Notice & Consent Policy is effective as of the date first written above and is not legal advice. Have licensed counsel in your jurisdiction review this policy to ensure compliance with applicable privacy and tracking laws.**
