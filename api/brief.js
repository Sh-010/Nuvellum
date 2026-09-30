import { createBriefHandler } from '../scripts/lib/brief/handler.mjs';

const handle = createBriefHandler();

export default { fetch(request) { return handle(request); } };
