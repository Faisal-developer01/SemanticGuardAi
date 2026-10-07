const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Execute the existing hooks without installing a browser or a test framework.
// Socket, clock, and media doubles are isolated to these regression tests.
function harness(connected = true, globals = {}) {
  let cursor = 0;
  let nextTimer = 0;
  let slots = [];
  const renders = new Map();
  const effects = [];
  const intervals = new Map();
  const timeouts = new Map();
  const peers = [];
  const errors = [];
  const listeners = new Map();
  const sent = [];
  const socket = {
    connected,
    active: connected,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    off(event, handler) { listeners.get(event)?.delete(handler); },
    emit(event, payload) { sent.push({ event, payload }); },
    connect() { this.active = true; },
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useRef(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: value };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, value: callback };
      }
      return slots[index].value;
    },
    useMemo(factory, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, value: factory() };
      }
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  class MediaStream {
    constructor(tracks = []) { this.tracks = tracks.slice(); }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    addTrack(track) { this.tracks.push(track); }
  }
  class Peer {
    constructor() {
      this.connectionState = 'new';
      this.remoteDescription = null;
      this.tracks = [];
      this.ice = [];
      peers.push(this);
    }
    addTrack(track, stream) { this.tracks.push({ track, stream }); }
    async createOffer() { return { type: 'offer', sdp: 'test-offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'test-answer' }; }
    async setLocalDescription(sdp) { this.localDescription = sdp; }
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; }
    async addIceCandidate(candidate) { this.ice.push(candidate); }
    close() { this.connectionState = 'closed'; }
  }
  const env = {};
  const context = {
    __env: env,
    window: { location: { origin: 'https://assessment.test' }, addEventListener() {}, removeEventListener() {} },
    URL,
    Blob,
    Error,
    console: { info() {}, warn() {}, error(...args) { errors.push(args); } },
    RTCPeerConnection: Peer,
    RTCSessionDescription: class { constructor(sdp) { Object.assign(this, sdp); } },
    MediaStream,
    setInterval(callback) { intervals.set(++nextTimer, callback); return nextTimer; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback) { timeouts.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timeouts.delete(id); },
    ...globals,
  };
  const loadModule = (file, dependencies = {}, extraSource = '') => {
    const source = readFileSync(resolve(__dirname, '..', ...file.split('/')), 'utf8')
      .replaceAll('import.meta.env', '__env') + extraSource;
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const exports = {};
    runInNewContext(compiled, {
      ...context,
      exports,
      require(name) {
        if (name in dependencies) return dependencies[name];
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return require(name);
        if (name === 'socket.io-client') return { io: () => socket };
        if (name === '@/lib/api') return { getAccessToken: () => 'test-token' };
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    return exports;
  };
  const exports = loadModule('src/lib/realtime.ts');
  const renderFunction = (fn, options) => {
    if (!renders.has(fn)) renders.set(fn, []);
    slots = renders.get(fn);
    cursor = 0;
    const result = fn(options);
    while (effects.length) effects.shift()();
    return result;
  };
  return {
    peers, sent, errors, socket, MediaStream, exports, loadModule, renderFunction,
    render(hook, options) {
      return renderFunction(exports[hook], options);
    },
    async receive(event, payload) {
      await Promise.all([...listeners.get(event) ?? []].map(handler => handler(payload)));
    },
    tick() { for (const callback of [...intervals.values()]) callback(); },
    expire() {
      const callbacks = [...timeouts.values()];
      timeouts.clear();
      for (const callback of callbacks) callback();
    },
    cleanup() {
      for (const componentSlots of renders.values()) {
        for (const slot of componentSlots) slot?.cleanup?.();
      }
    },
    count(event) { return sent.filter(item => item.event === event).length; },
  };
}

const videoTrack = () => ({ kind: 'video', readyState: 'live' });
const viewer = { candidateId: 'candidate-1', sessionId: 'session-1', enabled: true };
const offer = { candidateId: viewer.candidateId, sessionId: viewer.sessionId, sdp: { type: 'offer', sdp: 'test' } };
const request = { viewerId: 'recruiter-1', sessionId: 'session-1' };

test('publisher waits for a live webcam, then sends its actual tracks once', async () => {
  const h = harness();
  const options = { enabled: true, sessionId: 'session-1', stream: null };
  h.render('useCandidateWebRTC', options);
  await h.receive('webrtc_request', request);
  assert.equal(h.peers.length, 0);
  const track = videoTrack();
  const endedTrack = { kind: 'video', readyState: 'ended' };
  options.stream = new h.MediaStream([track, endedTrack]);
  h.render('useCandidateWebRTC', options);
  await h.receive('webrtc_request', { ...request, sessionId: 'other-session' });
  assert.equal(h.peers.length, 0);
  await h.receive('webrtc_request', request);
  assert.equal(h.peers.length, 1);
  assert.equal(h.peers[0].tracks.length, 1);
  assert.equal(h.peers[0].tracks[0].track, track);
  assert.equal(h.peers[0].tracks[0].stream, options.stream);
  assert.equal(h.count('webrtc_offer'), 1);
  await h.receive('webrtc_request', request);
  assert.equal(h.peers.length, 1, 'duplicate requests must not reset negotiation');
  h.cleanup();
});

test('publisher queues ICE until the answer and releases peers on camera disable', async () => {
  const h = harness();
  const options = { enabled: true, sessionId: 'session-1', stream: new h.MediaStream([videoTrack()]) };
  h.render('useCandidateWebRTC', options);
  await h.receive('webrtc_request', request);
  const candidate = { candidate: 'test-ice' };
  await h.receive('webrtc_ice', { fromId: request.viewerId, candidate });
  assert.equal(h.peers[0].ice.length, 0);
  await h.receive('webrtc_answer', { viewerId: request.viewerId, sdp: { type: 'answer', sdp: 'test' } });
  assert.equal(h.peers[0].ice[0], candidate);
  h.render('useCandidateWebRTC', { ...options, enabled: false });
  assert.equal(h.peers[0].connectionState, 'closed');
  assert.equal(h.count('webrtc_stop'), 1);
  await h.receive('webrtc_request', request);
  assert.equal(h.peers.length, 1);
  h.cleanup();
});

test('viewer requests immediately on socket connect and does not poll during negotiation', async () => {
  const h = harness(false);
  h.render('useWebRTCViewer', viewer);
  h.tick();
  assert.equal(h.count('webrtc_request'), 0);
  h.socket.connected = true;
  await h.receive('connect');
  assert.equal(h.count('webrtc_request'), 1);
  await h.receive('webrtc_offer', offer);
  assert.equal(h.count('webrtc_answer'), 1);
  h.tick();
  assert.equal(h.count('webrtc_request'), 1, 'a new peer with an SDP must not be replaced by retry polling');
  h.cleanup();
});

test('viewer preserves early ICE and handles remote tracks without an event stream', async () => {
  const h = harness();
  h.render('useWebRTCViewer', viewer);
  const candidate = { candidate: 'early-ice' };
  await h.receive('webrtc_ice', { fromId: viewer.candidateId, candidate });
  await h.receive('webrtc_offer', offer);
  assert.equal(h.peers[0].ice[0], candidate);
  const track = videoTrack();
  h.peers[0].ontrack({ streams: [], track });
  const feed = h.render('useWebRTCViewer', viewer);
  assert.equal(feed.stream.getVideoTracks()[0], track);
  h.peers[0].connectionState = 'connected';
  h.peers[0].onconnectionstatechange();
  assert.equal(h.render('useWebRTCViewer', viewer).state, 'connected');
  h.expire();
  assert.equal(h.peers[0].connectionState, 'connected');
  h.cleanup();
});

test('viewer uses the remote MediaStream and isolates other sessions/candidates', async () => {
  const h = harness();
  h.render('useWebRTCViewer', viewer);
  await h.receive('webrtc_offer', { ...offer, sessionId: 'other-session' });
  await h.receive('webrtc_offer', { ...offer, candidateId: 'other-candidate' });
  assert.equal(h.peers.length, 0);
  await h.receive('webrtc_offer', offer);
  const track = videoTrack();
  const stream = new h.MediaStream([track]);
  h.peers[0].ontrack({ streams: [stream], track });
  assert.equal(h.render('useWebRTCViewer', viewer).stream, stream);
  assert.equal(stream.getTracks().length, 1);
  h.cleanup();
});

test('viewer clears failed streams and retries after timeout, disconnect, and stop', async () => {
  const h = harness();
  h.render('useWebRTCViewer', viewer);
  await h.receive('webrtc_offer', offer);
  h.expire();
  assert.equal(h.peers[0].connectionState, 'closed');
  assert.equal(h.render('useWebRTCViewer', viewer).state, 'failed');
  h.tick();
  assert.equal(h.count('webrtc_request'), 2);
  await h.receive('webrtc_offer', offer);
  h.socket.connected = false;
  await h.receive('disconnect');
  h.tick();
  assert.equal(h.count('webrtc_request'), 2);
  assert.equal(h.render('useWebRTCViewer', viewer).stream, null);
  h.socket.connected = true;
  await h.receive('connect');
  assert.equal(h.count('webrtc_request'), 3);
  await h.receive('webrtc_offer', offer);
  await h.receive('webrtc_stop', { fromId: viewer.candidateId });
  assert.equal(h.peers[2].connectionState, 'closed');
  h.tick();
  assert.equal(h.count('webrtc_request'), 4);
  h.cleanup();
  h.tick();
  await h.receive('connect');
  assert.equal(h.count('webrtc_request'), 4);
});

test('publisher reconnect tears down stale peers and permits a new request', async () => {
  const h = harness();
  h.render('useCandidateWebRTC', { enabled: true, sessionId: 'session-1', stream: new h.MediaStream([videoTrack()]) });
  await h.receive('webrtc_request', request);
  await h.receive('disconnect');
  assert.equal(h.peers[0].connectionState, 'closed');
  await h.receive('webrtc_request', request);
  assert.equal(h.peers.length, 2);
  h.cleanup();
});

test('disposed publisher/viewer negotiations never emit stale SDP', async () => {
  for (const hook of ['useCandidateWebRTC', 'useWebRTCViewer']) {
    const h = harness();
    const isPublisher = hook === 'useCandidateWebRTC';
    h.render(hook, isPublisher
      ? { enabled: true, sessionId: 'session-1', stream: new h.MediaStream([videoTrack()]) }
      : viewer);
    const inFlight = h.receive(isPublisher ? 'webrtc_request' : 'webrtc_offer', isPublisher ? request : offer);
    h.cleanup();
    await inFlight;
    assert.equal(h.count(isPublisher ? 'webrtc_offer' : 'webrtc_answer'), 0);
    assert.equal(h.peers[0].connectionState, 'closed');
  }
});

function monitoringPage(h, sessions) {
  return h.loadModule('src/pages/recruiter/LiveMonitoring.tsx', {
    'react-router-dom': { Link: 'a' },
    '@/components/layouts/AppLayout': { AppLayout: 'main' },
    '@/components/shared/StatusBadges': { RiskBadge: 'span', StatusDot: 'span' },
    '@/lib/api': { sessionsApi: {} },
    '@/lib/useApi': { useAsync: () => ({ data: sessions }) },
    '@/lib/mappers': h.loadModule('src/lib/mappers.ts'),
    '@/lib/realtime': { ...h.exports, useMonitoringFeed: initial => ({ sessions: initial, connected: true }) },
    '@/components/ui/button': { Button: 'button' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    sonner: { toast: {} },
    '@/lib/utils': { cn: (...values) => values.filter(value => typeof value === 'string').join(' ') },
  }, '\nexport { CandidateFeed, CandidateVideo, CandidateCard };\n');
}

function findElements(element, type) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(item => findElements(item, type));
  return [
    ...(element.type === type ? [element] : []),
    ...findElements(element.props?.children, type),
  ];
}

test('grid and detail share one subscription, including selection and filter changes', () => {
  const h = harness();
  const session = {
    sessionId: viewer.sessionId, candidateId: viewer.candidateId, candidateName: 'Test candidate',
    assessmentId: 'assessment-1', assessmentTitle: 'Test assessment', riskScore: 0,
    riskLevel: 'low', tabSwitches: 0, alertCount: 0, isFlagged: false,
  };
  const page = monitoringPage(h, [session]);
  let tree = h.renderFunction(page.default);
  let subscriptions = findElements(tree, page.CandidateFeed);
  assert.equal(subscriptions.length, 1);
  const feed = { stream: new h.MediaStream([videoTrack()]), state: 'connected' };
  subscriptions[0].props.onChange(viewer.sessionId, feed);
  findElements(tree, page.CandidateCard)[0].props.onClick();
  tree = h.renderFunction(page.default);
  subscriptions = findElements(tree, page.CandidateFeed);
  assert.equal(subscriptions.length, 1, 'opening details must not open a second peer');
  const card = findElements(tree, page.CandidateCard)[0];
  const detail = findElements(tree, page.CandidateVideo)[0];
  assert.equal(card.props.feed, feed);
  assert.equal(detail.props.feed, feed);
  const flaggedFilter = findElements(tree, 'button')
    .find(element => element.key === 'flagged');
  assert.ok(flaggedFilter);
  flaggedFilter.props.onClick();
  tree = h.renderFunction(page.default);
  assert.equal(findElements(tree, page.CandidateCard).length, 0);
  assert.equal(findElements(tree, page.CandidateFeed).length, 1);
  assert.equal(findElements(tree, page.CandidateVideo)[0].props.feed, feed);
  h.cleanup();
});

test('remote video attaches srcObject, plays on arrival/metadata, and clears on unmount', async () => {
  const h = harness();
  const page = monitoringPage(h, []);
  const stream = new h.MediaStream([videoTrack()]);
  const feed = { stream: null, state: 'idle' };
  let tree = h.renderFunction(page.CandidateVideo, { feed });
  const events = new Map();
  let plays = 0;
  const video = {
    srcObject: null,
    async play() { plays++; },
    addEventListener(event, callback) { events.set(event, callback); },
    removeEventListener(event) { events.delete(event); },
  };
  findElements(tree, 'video')[0].props.ref.current = video;
  feed.stream = stream;
  tree = h.renderFunction(page.CandidateVideo, { feed });
  assert.equal(video.srcObject, stream);
  assert.equal(plays, 1);
  events.get('loadedmetadata')();
  assert.equal(plays, 2);
  const element = findElements(tree, 'video')[0];
  assert.equal(element.props.autoPlay, true);
  assert.equal(element.props.muted, true);
  assert.equal(element.props.playsInline, true);
  h.cleanup();
  assert.equal(video.srcObject, null);
  assert.equal(events.size, 0);
  await Promise.resolve();
});

test('blocked video playback is logged and shown instead of silently hidden', async () => {
  const h = harness();
  const page = monitoringPage(h, []);
  const feed = { stream: null, state: 'idle' };
  const tree = h.renderFunction(page.CandidateVideo, { feed });
  findElements(tree, 'video')[0].props.ref.current = {
    srcObject: null,
    play: () => Promise.reject(new Error('Autoplay blocked')),
    addEventListener() {},
    removeEventListener() {},
  };
  feed.stream = new h.MediaStream([videoTrack()]);
  h.renderFunction(page.CandidateVideo, { feed });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.errors.length, 1);
  const updated = h.renderFunction(page.CandidateVideo, { feed });
  assert.ok(findElements(updated, 'span').some(element =>
    element.props.children === 'Video playback blocked by browser'));
  h.cleanup();
});

const flush = () => new Promise(resolve => setImmediate(resolve));
const clip = (id, capturedAt) => ({
  id, capturedAt, createdAt: capturedAt, type: 'video', sessionId: 'session-1',
});

function recordingModal(h, state, objectUrl, toast = { error() {}, info() {} }) {
  return h.loadModule('src/pages/recruiter/AIAlertPanel.tsx', {
    'react-router-dom': { Link: 'a' },
    '@/components/layouts/AppLayout': { AppLayout: 'main' },
    '@/components/shared/StatusBadges': { SeverityBadge: 'span' },
    '@/lib/api': { alertsApi: {}, evidenceApi: { objectUrl } },
    '@/lib/useApi': { useAsync: () => state },
    '@/lib/mappers': h.loadModule('src/lib/mappers.ts'),
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/input': { Input: 'input' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    sonner: { toast },
    'date-fns': { format: () => 'recorded-at' },
    '@/lib/utils': { cn: (...values) => values.filter(value => typeof value === 'string').join(' ') },
  }, '\nexport { RecordingModal };\n').RecordingModal;
}

test('recording prefetch never unmounts or reloads the playing clip', async () => {
  const h = harness();
  const deferred = new Map();
  const requests = [];
  const state = {
    data: [clip('clip-1', '2026-10-07T12:00:00Z'), clip('clip-2', '2026-10-07T12:00:30Z'),
      clip('clip-3', '2026-10-07T12:01:00Z')],
    loading: false, error: null, reload() {},
  };
  const modal = recordingModal(h, state, id => {
    requests.push(id);
    return new Promise(resolve => deferred.set(id, resolve));
  });
  const props = { sessionId: 'session-1', candidateName: 'Candidate', onClose() {} };
  h.renderFunction(modal, props);
  deferred.get('clip-1')('blob:clip-1');
  await flush();
  let tree = h.renderFunction(modal, props);
  let video = findElements(tree, 'video')[0];
  assert.ok(video, 'the current video must remain visible during next-clip prefetch');
  let loads = 0;
  let plays = 0;
  video.props.ref.current = { ended: false, load() { loads++; }, play() { plays++; return Promise.resolve(); } };
  deferred.get('clip-2')('blob:clip-2');
  await flush();
  tree = h.renderFunction(modal, props);
  assert.equal(findElements(tree, 'video')[0].props.src, 'blob:clip-1');
  assert.equal(loads, 0, 'prefetch completion must not rewind the current clip');
  assert.equal(plays, 0);
  findElements(tree, 'video')[0].props.onEnded();
  tree = h.renderFunction(modal, props);
  tree = h.renderFunction(modal, props);
  video = findElements(tree, 'video')[0];
  assert.ok(video, 'prefetching clip 3 must not replace the playing clip 2 with a spinner');
  assert.equal(video.props.src, 'blob:clip-2');
  assert.equal(video.props.muted, true);
  assert.equal(video.props.playsInline, true);
  assert.equal(requests.filter(id => id === 'clip-2').length, 1, 'downloads must be deduplicated');
  state.loading = true;
  tree = h.renderFunction(modal, props);
  assert.equal(findElements(tree, 'video')[0].props.src, 'blob:clip-2', 'refresh must not remove the player');
  h.cleanup();
  deferred.get('clip-3')('blob:clip-3');
  await flush();
});

test('recording timeline sorts captures and discovers the final uploaded clip without reopening', async () => {
  const h = harness();
  let refreshes = 0;
  const state = {
    data: [clip('clip-2', '2026-10-07T12:00:30Z'), clip('clip-1', '2026-10-07T12:00:00Z')],
    loading: false, error: null, reload() { refreshes++; },
  };
  const modal = recordingModal(h, state, async id => `blob:${id}`);
  const props = { sessionId: 'session-1', candidateName: 'Candidate', onClose() {} };
  h.renderFunction(modal, props);
  await flush();
  let tree = h.renderFunction(modal, props);
  assert.equal(findElements(tree, 'video')[0].props.src, 'blob:clip-1');
  findElements(tree, 'video')[0].props.onEnded();
  tree = h.renderFunction(modal, props);
  const video = findElements(tree, 'video')[0];
  assert.equal(video.props.src, 'blob:clip-2');
  video.props.ref.current = { ended: true, play: () => Promise.resolve() };
  state.data = [...state.data, clip('clip-3', '2026-10-07T12:01:00Z')];
  h.tick();
  assert.equal(refreshes, 1);
  h.renderFunction(modal, props);
  await flush();
  tree = h.renderFunction(modal, props);
  assert.equal(findElements(tree, 'video')[0].props.src, 'blob:clip-3');
  h.cleanup();
});

test('missing recording shows a retryable error and revokes URLs on close or late completion', async () => {
  const revoked = [];
  const h = harness(true, { URL: Object.assign(class extends URL {}, { revokeObjectURL: url => revoked.push(url) }) });
  let reject = true;
  let resolveLate;
  const state = {
    data: [clip('clip-1', '2026-10-07T12:00:00Z'), clip('clip-2', '2026-10-07T12:00:30Z')],
    loading: false, error: null, reload() {},
  };
  const modal = recordingModal(h, state, id => id === 'clip-2'
    ? new Promise(resolve => { resolveLate = resolve; })
    : reject ? Promise.reject(new Error('Recording no longer available')) : Promise.resolve('blob:clip-1'));
  const props = { sessionId: 'session-1', candidateName: 'Candidate', onClose() {} };
  h.renderFunction(modal, props);
  await flush();
  let tree = h.renderFunction(modal, props);
  assert.ok(findElements(tree, 'span').some(element => element.props.children === 'Recording no longer available'));
  const retry = findElements(tree, 'button').find(element => element.props.children === 'Retry clip');
  assert.ok(retry);
  reject = false;
  retry.props.onClick();
  await flush();
  tree = h.renderFunction(modal, props);
  assert.equal(findElements(tree, 'video')[0].props.src, 'blob:clip-1');
  h.cleanup();
  resolveLate('blob:clip-2');
  await flush();
  assert.deepEqual(revoked.sort(), ['blob:clip-1', 'blob:clip-2']);
});

function recorderHarness(upload, { supported = true, startError } = {}) {
  const recorders = [];
  const track = {
    kind: 'video', readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener() {},
  };
  class Recorder {
    static isTypeSupported() { return supported; }
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = options.mimeType;
      this.state = 'inactive';
      recorders.push(this);
    }
    start() {
      if (startError) throw startError;
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(['small-final-clip'], { type: this.mimeType }) });
        this.onstop();
      });
    }
  }
  const h = harness(true, {
    MediaRecorder: Recorder,
    navigator: { mediaDevices: { getDisplayMedia: async () => new h.MediaStream([track]) } },
  });
  const recorder = h.loadModule('src/lib/screenRecorder.ts', { '@/lib/api': { evidenceApi: { upload } } });
  return { h, recorders, track, useScreenRecorder: recorder.useScreenRecorder };
}

test('recorder starts with the newly created session ID and saves small final clips', async () => {
  const uploads = [];
  const { h, useScreenRecorder, recorders, track } = recorderHarness(async (...args) => uploads.push(args));
  let controls = h.renderFunction(useScreenRecorder, { sessionId: null });
  assert.equal(await controls.start('new-session'), true);
  controls = h.renderFunction(useScreenRecorder, { sessionId: 'different-session' });
  await controls.stop();
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0][0], 'new-session', 'a late final upload must stay tied to its capture session');
  assert.equal(uploads[0][1].size, 16, 'valid clips below 1024 bytes must not be discarded');
  assert.equal(uploads[0][2], 'video');
  assert.equal(recorders[0].state, 'inactive');
  assert.equal(track.readyState, 'ended');
  h.cleanup();
});

test('stop waits for the last upload and segments continue with independent data', async () => {
  const uploads = [];
  let resolveFinal;
  const { h, useScreenRecorder, recorders } = recorderHarness((...args) => {
    uploads.push(args);
    return uploads.length === 1 ? Promise.resolve() : new Promise(resolve => { resolveFinal = resolve; });
  });
  const controls = h.renderFunction(useScreenRecorder, { sessionId: 'session-1' });
  await controls.start();
  h.expire();
  await flush();
  assert.equal(recorders.length, 2);
  assert.equal(uploads.length, 1);
  let stopped = false;
  const pending = controls.stop().then(() => { stopped = true; });
  await flush();
  assert.equal(stopped, false);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0][1].size, uploads[1][1].size, 'segment data must not be concatenated or overwritten');
  resolveFinal();
  await pending;
  assert.equal(stopped, true);
  h.cleanup();
});

test('upload failures are surfaced and unmount stops the capture', async () => {
  const messages = [];
  const { h, useScreenRecorder, track } = recorderHarness(async () => { throw new Error('Upload unavailable'); });
  const controls = h.renderFunction(useScreenRecorder, { sessionId: 'session-1', onError: message => messages.push(message) });
  await controls.start();
  h.cleanup();
  await flush();
  assert.equal(track.readyState, 'ended');
  assert.equal(messages.length, 1);
  assert.ok(messages[0].includes('could not be saved'));
  assert.equal(h.errors.length, 1);
});

test('unsupported codecs or recorder startup failures never report an active recording', async () => {
  for (const options of [{ supported: false }, { startError: new Error('Recorder could not start') }]) {
    const messages = [];
    const { h, useScreenRecorder, track } = recorderHarness(async () => {}, options);
    const props = { sessionId: 'session-1', onError: message => messages.push(message) };
    const controls = h.renderFunction(useScreenRecorder, props);
    assert.equal(await controls.start(), false);
    assert.equal(h.renderFunction(useScreenRecorder, props).active, false);
    assert.equal(track.readyState, 'ended');
    assert.equal(messages.length, 1);
    h.cleanup();
  }
});
