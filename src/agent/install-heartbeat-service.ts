import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { homedir } from 'node:os';

export interface HeartbeatServiceResult {
  success: boolean;
  method: 'systemd' | 'systemd-user' | 'cron' | 'none';
  error?: string;
}

function which(cmd: string): string | null {
  try {
    return execSync(`which ${cmd}`, { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function hasSystemd(): boolean {
  return which('systemctl') !== null;
}

function hasSudo(): boolean {
  try {
    execSync('sudo -n true 2>/dev/null', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function unitFile(miBin: string, user: string, home: string): string {
  return `[Unit]
Description=OS-1 Agent Heartbeat
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
ExecStart=${miBin} agent heartbeat-daemon --quiet
Restart=always
RestartSec=5
Environment=HOME=${home}
WorkingDirectory=${home}

[Install]
WantedBy=multi-user.target
`;
}

const SERVICE_NAME = 'mi-heartbeat';

export function installHeartbeatService(): HeartbeatServiceResult {
  const miBin = which('mi');
  if (!miBin) {
    return { success: false, method: 'none', error: 'mi binary not found on PATH' };
  }

  const user = process.env.USER || 'ubuntu';
  const home = homedir();

  // Try system-level systemd first
  if (hasSystemd()) {
    if (hasSudo()) {
      try {
        const unitPath = `/etc/systemd/system/${SERVICE_NAME}.service`;
        const content = unitFile(miBin, user, home);
        // Write via sudo tee
        execSync(`echo '${content.replace(/'/g, "'\\''")}' | sudo tee ${unitPath} > /dev/null`, {
          encoding: 'utf-8',
        });
        execSync(`sudo systemctl daemon-reload`, { encoding: 'utf-8' });
        execSync(`sudo systemctl enable --now ${SERVICE_NAME}`, { encoding: 'utf-8' });
        return { success: true, method: 'systemd' };
      } catch (err: any) {
        // Fall through to user-level
      }
    }

    // Try user-level systemd
    try {
      const userUnitDir = pathJoin(home, '.config', 'systemd', 'user');
      mkdirSync(userUnitDir, { recursive: true });
      const unitPath = pathJoin(userUnitDir, `${SERVICE_NAME}.service`);
      // User units don't need User= directive
      const content = unitFile(miBin, user, home).replace(/^User=.*\n/m, '');
      writeFileSync(unitPath, content);
      execSync(`systemctl --user daemon-reload`, { encoding: 'utf-8' });
      execSync(`systemctl --user enable --now ${SERVICE_NAME}`, { encoding: 'utf-8' });
      return { success: true, method: 'systemd-user' };
    } catch (err: any) {
      // Fall through to cron
    }
  }

  // Fallback: cron @reboot
  try {
    const existing = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    if (existing.includes('mi agent heartbeat-daemon')) {
      return { success: true, method: 'cron' }; // Already installed
    }
    const newCron = `${existing.trimEnd()}\n@reboot ${miBin} agent heartbeat-daemon --quiet >> ${home}/.mi/daemon.log 2>&1\n`;
    execSync(`echo '${newCron.replace(/'/g, "'\\''")}' | crontab -`, { encoding: 'utf-8' });
    return { success: true, method: 'cron' };
  } catch (err: any) {
    return { success: false, method: 'none', error: err.message };
  }
}

/** Stop and remove the heartbeat service. */
export function removeHeartbeatService(): void {
  if (hasSystemd()) {
    try {
      if (hasSudo()) {
        execSync(`sudo systemctl disable --now ${SERVICE_NAME} 2>/dev/null || true`, { encoding: 'utf-8' });
        execSync(`sudo rm -f /etc/systemd/system/${SERVICE_NAME}.service`, { encoding: 'utf-8' });
        execSync(`sudo systemctl daemon-reload`, { encoding: 'utf-8' });
      }
      execSync(`systemctl --user disable --now ${SERVICE_NAME} 2>/dev/null || true`, { encoding: 'utf-8' });
      const userUnit = pathJoin(homedir(), '.config', 'systemd', 'user', `${SERVICE_NAME}.service`);
      if (existsSync(userUnit)) {
        execSync(`rm -f ${userUnit}`, { encoding: 'utf-8' });
        execSync(`systemctl --user daemon-reload`, { encoding: 'utf-8' });
      }
    } catch { /* best effort */ }
  }

  // Remove cron entry
  try {
    const existing = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    if (existing.includes('mi agent heartbeat-daemon')) {
      const cleaned = existing.split('\n').filter(l => !l.includes('mi agent heartbeat-daemon')).join('\n');
      execSync(`echo '${cleaned.replace(/'/g, "'\\''")}' | crontab -`, { encoding: 'utf-8' });
    }
  } catch { /* best effort */ }
}
