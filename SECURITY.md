# Security Policy

## Supported version

Only the current production branch (`main`) is supported.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue.

Use GitHub's **Report a vulnerability** / private security advisory flow when it is available for this repository. If that option is unavailable, contact the repository owner privately through their GitHub profile and include:

- the affected URL or file;
- clear reproduction steps;
- impact;
- screenshots or proof of concept that do not expose user data.

Do not test by accessing data that is not yours, degrading availability, or attempting to obtain account credentials.

## Security model

Nuvellum is intentionally static-first. The public site has no public admin panel, database login, or server-side publishing endpoint. Publishing occurs through reviewed GitHub commits and Vercel builds. Secrets must never be committed to this repository.
