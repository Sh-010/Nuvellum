// Nuvellum admin API: a single Vercel Function (Node.js runtime) serving /api/admin?action=...
// All logic lives in scripts/lib/admin/ so it is unit-tested with the rest of the repository.
// Secrets come from Vercel environment variables and never leave the server:
//   NUVELLUM_ADMIN_PASSWORD, NUVELLUM_ADMIN_SESSION_SECRET, NUVELLUM_GITHUB_TOKEN
import { createAdminHandler } from '../scripts/lib/admin/handler.mjs';

const handle = createAdminHandler();

export default {
  fetch(request) {
    return handle(request);
  }
};
