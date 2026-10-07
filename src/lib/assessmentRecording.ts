export interface AssessmentRecording {
  stream: MediaStream;
  setCameraStream: (stream: MediaStream) => Promise<void>;
  stop: () => void;
}

export async function createAssessmentRecording(
  cameraStream: MediaStream,
  onInterrupted: (message: string) => void,
): Promise<AssessmentRecording> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen sharing is required. Use a desktop browser that supports screen sharing.');
  }
  if (!cameraStream.getVideoTracks().some(track => track.readyState === 'live')) {
    throw new Error('A live webcam is required before recording the assessment.');
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.captureStream !== 'function') {
    throw new Error('This browser cannot record the assessment screen with your webcam.');
  }

  // Must be invoked from the Begin/Share button, before any other awaited work.
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 10 },
    audio: false,
  });
  const screen = document.createElement('video');
  screen.muted = true;
  screen.playsInline = true;
  let camera: HTMLVideoElement | null = null;
  let webcam: MediaStream | null = null;
  let output: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    display.getTracks().forEach(track => track.removeEventListener('ended', interrupted));
    webcam?.getTracks().forEach(track => track.removeEventListener('ended', interrupted));
    output?.getTracks().forEach(track => track.stop());
    display.getTracks().forEach(track => track.stop());
    webcam?.getTracks().forEach(track => track.stop());
    screen.pause();
    camera?.pause();
    if (camera) camera.srcObject = null;
    screen.srcObject = null;
  };
  function interrupted() {
    if (stopped) return;
    stop();
    onInterrupted('Screen sharing or webcam capture stopped');
  }
  const play = async (video: HTMLVideoElement) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        video.play(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('The recording source did not produce video frames.')), 10_000);
        }),
      ]);
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('The recording source has no video frames.');
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  const setCameraStream = async (source: MediaStream) => {
    if (stopped || !source.getVideoTracks().some(track => track.readyState === 'live')) {
      throw new Error('A live webcam is required for the assessment recording.');
    }
    const nextStream = source.clone();
    const nextCamera = document.createElement('video');
    nextCamera.muted = true;
    nextCamera.playsInline = true;
    nextCamera.srcObject = nextStream;
    nextStream.getTracks().forEach(track => track.addEventListener('ended', interrupted));
    try {
      await play(nextCamera);
      if (stopped) throw new Error('Assessment recording was cancelled.');
      webcam?.getTracks().forEach(track => {
        track.removeEventListener('ended', interrupted);
        track.stop();
      });
      camera?.pause();
      if (camera) camera.srcObject = null;
      webcam = nextStream;
      camera = nextCamera;
    } catch (error) {
      nextStream.getTracks().forEach(track => {
        track.removeEventListener('ended', interrupted);
        track.stop();
      });
      nextCamera.pause();
      nextCamera.srcObject = null;
      throw error;
    }
  };

  try {
    display.getTracks().forEach(track => track.addEventListener('ended', interrupted));
    screen.srcObject = display;
    await Promise.all([play(screen), setCameraStream(cameraStream)]);
    if (stopped || !display.getVideoTracks().some(track => track.readyState === 'live')) {
      throw new Error('Screen sharing stopped before the assessment could start.');
    }
    const scale = Math.min(1, 1920 / screen.videoWidth, 1080 / screen.videoHeight);
    canvas.width = Math.max(2, Math.floor(screen.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(screen.videoHeight * scale / 2) * 2);
    const draw = () => {
      if (!camera) throw new Error('The webcam overlay is unavailable.');
      context.drawImage(screen, 0, 0, canvas.width, canvas.height);
      const width = Math.min(240, canvas.width * 0.16, canvas.height * 0.2 * camera.videoWidth / camera.videoHeight);
      const height = width * camera.videoHeight / camera.videoWidth;
      const margin = 12;
      const x = canvas.width - width - margin;
      const y = canvas.height - height - margin;
      context.fillStyle = '#000';
      context.fillRect(x - 3, y - 3, width + 6, height + 6);
      context.drawImage(camera, x, y, width, height);
    };
    draw();
    output = canvas.captureStream(10);
    timer = setInterval(() => {
      try {
        draw();
      } catch (error) {
        console.error('[Recording] assessment screen composition failed', error);
        stop();
        onInterrupted('Assessment screen recording failed');
      }
    }, 100);
    return { stream: output, setCameraStream, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
