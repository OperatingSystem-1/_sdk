// ─── Main Client ─────────────────────────────────────────────────────────────
export { OS1AdminClient } from './client.js';

// ─── Auth ────────────────────────────────────────────────────────────────────
export {
  generateJWT,
  verifyJWT,
  authorizationHeader,
  signRequest,
  verifySignature,
  generateKeyPair,
  publicKeyFromPrivate,
  Keystore,
} from './auth/index.js';

// ─── Transport ───────────────────────────────────────────────────────────────
export { Transport } from './transport.js';

// ─── XMTP ────────────────────────────────────────────────────────────────────
export { XMTPChannel } from './xmtp/channel.js';
export { XMTPSession } from './xmtp/session.js';

// ─── API Modules ─────────────────────────────────────────────────────────────
export { OfficesAPI } from './api/offices.js';
export { EmployeesAPI } from './api/employees.js';
export { TasksAPI } from './api/tasks.js';
export { FilesAPI } from './api/files.js';
export { CreditsAPI } from './api/credits.js';
export { XMTPAPI } from './api/xmtp.js';
export { IntegrationsAPI } from './api/integrations.js';
export { ExtensionsAPI } from './api/extensions.js';
export {
  EventsAPI,
  CallbacksAPI,
  BackupsAPI,
  EnvAPI,
  DelegatesAPI,
  MessagesAPI,
  WorkspaceAPI,
  RolesAPI,
  TransferAPI,
  LLMPingAPI,
  WhatsAppAPI,
  ChromiumAPI,
  CapabilitiesAPI,
  ProxyAPI,
} from './api/events.js';

// ─── Types ───────────────────────────────────────────────────────────────────
export type * from './types/index.js';
export { OS1Error } from './types/index.js';
