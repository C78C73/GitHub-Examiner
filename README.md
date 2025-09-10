# GitHub-Examiner

A client-side GitHub profile analyzer that visualizes repository and commit activity with a modern, glassy UI.

Live demo (GitHub Pages): https://c78c73.github.io/GitHub-Examiner/

Features
- Languages chart (top languages by repo count)
- Top repos by forks / stars
- Activity charts (Most active days, Top active times)
- GitHub-style contribution calendar (commits per day, by year)
- Drag-to-reorder cards and per-chart type controls
- Optional session token support for higher rate limits

Default token behavior
- The app picks a token using this priority:
	1. `#githubToken` input value (if provided by the user)
	2. `sessionStorage` value saved when the user checks "Remember for session" and confirms
	3. `window.__DEFAULT_GH_TOKEN` (must be injected by your hosting page/server before the script runs)

Security note
- Tokens are only sent from the browser to GitHub's API. Session tokens are kept only in `sessionStorage` and are cleared when the tab/window is closed.