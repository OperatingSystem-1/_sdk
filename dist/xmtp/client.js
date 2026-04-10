import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Client } from '@xmtp/node-sdk';
// ConsentEntityType and ConsentState are const enums from @xmtp/node-bindings
// — they're erased at runtime, so we inline the values.
const CONSENT_ENTITY_GROUP_ID = 0;
const CONSENT_STATE_ALLOWED = 1;
import { toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const CONFIG_DIR = join(homedir(), '.mi');
const XMTP_DIR = join(CONFIG_DIR, 'xmtp');
const DB_KEY_FILE = join(XMTP_DIR, 'db-key.hex');
const clientCache = new Map();
function normalizePrivateKey(privateKey) {
    return privateKey.startsWith('0x')
        ? privateKey
        : `0x${privateKey}`;
}
function ensureSigningKey(config) {
    if (!config.signingKey) {
        throw new Error('XMTP requires a signing key. Re-run agent onboarding first.');
    }
    return normalizePrivateKey(config.signingKey);
}
function getDbEncryptionKey() {
    mkdirSync(XMTP_DIR, { recursive: true, mode: 0o700 });
    if (existsSync(DB_KEY_FILE)) {
        return readFileSync(DB_KEY_FILE, 'utf-8').trim();
    }
    const key = `0x${randomBytes(32).toString('hex')}`;
    const tmpFile = `${DB_KEY_FILE}.${randomBytes(4).toString('hex')}`;
    writeFileSync(tmpFile, key, { mode: 0o600 });
    renameSync(tmpFile, DB_KEY_FILE);
    return key;
}
export function getXmtpIdentifier(address) {
    return {
        identifier: address.toLowerCase(),
        identifierKind: 0,
    };
}
export function getXmtpAddress(config) {
    const account = privateKeyToAccount(ensureSigningKey(config));
    return account.address.toLowerCase();
}
export async function getXmtpClient(config) {
    const privateKey = ensureSigningKey(config);
    const account = privateKeyToAccount(privateKey);
    const address = account.address.toLowerCase();
    const env = (process.env.MI_XMTP_ENV ?? 'production');
    const cacheKey = `${env}:${address}`;
    const cached = clientCache.get(cacheKey);
    if (cached)
        return cached;
    const createPromise = Client.create({
        type: 'EOA',
        getIdentifier: () => getXmtpIdentifier(address),
        signMessage: async (message) => {
            const signature = await account.signMessage({ message });
            return toBytes(signature);
        },
    }, {
        env,
        dbPath: join(XMTP_DIR, `xmtp-${env}-${address}.db3`),
        dbEncryptionKey: getDbEncryptionKey(),
    });
    clientCache.set(cacheKey, createPromise);
    return createPromise;
}
export async function getGroupConversation(config, conversationId) {
    const client = await getXmtpClient(config);
    let conversation = await client.conversations.getConversationById(conversationId);
    if (!conversation) {
        // Conversation may exist on the network but not yet synced locally.
        // Two issues must be resolved:
        //  1. syncAll() downloads MLS welcome messages for groups we've been added to
        //  2. New group invites default to ConsentState.Unknown — the SDK's
        //     findGroupById silently fails for non-Allowed conversations.
        //     We must explicitly allow the group before it becomes findable.
        for (let attempt = 0; attempt < 4 && !conversation; attempt++) {
            await client.conversations.syncAll();
            // Explicitly consent to this group so findGroupById can locate it
            try {
                await client.preferences.setConsentStates([{
                        entityType: CONSENT_ENTITY_GROUP_ID,
                        state: CONSENT_STATE_ALLOWED,
                        entity: conversationId,
                    }]);
            }
            catch {
                // Consent may already be set or group may not exist yet
            }
            await client.conversations.sync();
            conversation = await client.conversations.getConversationById(conversationId);
            if (!conversation && attempt < 3) {
                await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
        }
    }
    if (!conversation) {
        throw new Error(`XMTP conversation ${conversationId} not found`);
    }
    return conversation;
}
/**
 * Create a new XMTP group conversation.
 * Members are specified as Ethereum addresses and added via identifiers.
 * Returns the group conversation object with its public conversation ID.
 */
export async function createGroupConversation(config, memberAddresses, options) {
    const client = await getXmtpClient(config);
    const identifiers = memberAddresses.map((addr) => getXmtpIdentifier(addr));
    return client.conversations.newGroupWithIdentifiers(identifiers, {
        groupName: options?.name,
        groupDescription: options?.description,
    });
}
export async function getDmConversation(config, peerAddress) {
    const client = await getXmtpClient(config);
    return client.conversations.newDmWithIdentifier(getXmtpIdentifier(peerAddress));
}
//# sourceMappingURL=client.js.map