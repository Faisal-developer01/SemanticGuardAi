// Device fingerprinting for proctoring integrity.
//
// Collects stable browser/device characteristics and derives a hash used to
// detect impersonation, second devices, and concurrent multi-device logins.
// No third-party libraries and no network calls — everything runs locally.

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  languages: string;
  timezone: string;
  screen: string;
  pixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  touchPoints: number;
  colorDepth: number;
  webglVendor: string | null;
  webglRenderer: string | null;
}

export interface DeviceIdentity {
  fingerprint: string;
  info: DeviceInfo;
}

function readWebGL(): { vendor: string | null; renderer: string | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: null, renderer: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return { vendor: null, renderer: null };
    return {
      vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string,
      renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string,
    };
  } catch {
    return { vendor: null, renderer: null };
  }
}

// A small canvas-render hash contributes device/GPU/font entropy.
function canvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = '#069';
    ctx.fillText('SemanticGuard \u2713 AI', 4, 8);
    ctx.strokeStyle = 'rgba(102,204,0,0.6)';
    ctx.strokeText('proctoring', 4, 30);
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Fallback: simple non-crypto hash if SubtleCrypto is unavailable.
    let h = 0;
    for (let i = 0; i < input.length; i += 1) {
      h = (h << 5) - h + input.charCodeAt(i);
      h |= 0;
    }
    return `fallback${(h >>> 0).toString(16)}`;
  }
}

/** Collect the device profile and derive a stable fingerprint hash. */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const webgl = readWebGL();
  const info: DeviceInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: (navigator.languages || []).join(','),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen: `${window.screen.width}x${window.screen.height}`,
    pixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory ?? null,
    touchPoints: navigator.maxTouchPoints || 0,
    colorDepth: window.screen.colorDepth || 0,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
  };

  // Stable subset (excludes volatile values) plus a canvas entropy signal.
  const stable = [
    info.userAgent,
    info.platform,
    info.timezone,
    info.screen,
    info.colorDepth,
    info.hardwareConcurrency,
    info.deviceMemory,
    info.webglVendor,
    info.webglRenderer,
    canvasHash(),
  ].join('|');

  const fingerprint = await sha256Hex(stable);
  return { fingerprint, info };
}
