const SESSION_TAB_ID_KEY = 'auth:tab-id';
const SESSION_LEADER_KEY = 'auth:session-leader';
export const SESSION_LEASE_MS = 30 * 60 * 1000;
const SESSION_HEARTBEAT_MS = 5 * 60 * 1000;

type SessionLeader = {
  tabId: string;
  userId: string | null;
  updatedAt: number;
  expiresAt: number;
};

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function generateTabId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getTabId() {
  if (typeof window === 'undefined') return 'server';

  const existing = window.sessionStorage.getItem(SESSION_TAB_ID_KEY);
  if (existing) return existing;

  const tabId = generateTabId();
  window.sessionStorage.setItem(SESSION_TAB_ID_KEY, tabId);
  return tabId;
}

function readLeader(): SessionLeader | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(SESSION_LEADER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionLeader>;
    if (
      typeof parsed.tabId !== 'string' ||
      typeof parsed.updatedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }

    return {
      tabId: parsed.tabId,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      updatedAt: parsed.updatedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getActiveLeader() {
  const leader = readLeader();
  if (!leader) return null;

  if (leader.expiresAt <= Date.now()) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_LEADER_KEY);
    }
    return null;
  }

  return leader;
}

export function isCurrentTabLeader() {
  const leader = getActiveLeader();
  return Boolean(leader && leader.tabId === getTabId());
}

export function hasActiveLeaderFromAnotherTab() {
  const leader = getActiveLeader();
  return Boolean(leader && leader.tabId !== getTabId());
}

export function claimSessionLeadership(userId: string | null = null) {
  if (typeof window === 'undefined') return;

  const sessionLeader: SessionLeader = {
    tabId: getTabId(),
    userId,
    updatedAt: Date.now(),
    expiresAt: Date.now() + SESSION_LEASE_MS,
  };

  window.localStorage.setItem(SESSION_LEADER_KEY, JSON.stringify(sessionLeader));
}

export function releaseSessionLeadership() {
  if (typeof window === 'undefined') return;

  const leader = readLeader();
  if (leader && leader.tabId === getTabId()) {
    window.localStorage.removeItem(SESSION_LEADER_KEY);
  }
}

export function startSessionHeartbeat(userId: string | null = null) {
  stopSessionHeartbeat();
  claimSessionLeadership(userId);

  if (typeof window === 'undefined') return;

  heartbeatTimer = window.setInterval(() => {
    if (isCurrentTabLeader()) {
      claimSessionLeadership(userId);
    }
  }, SESSION_HEARTBEAT_MS);
}

export function stopSessionHeartbeat() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}